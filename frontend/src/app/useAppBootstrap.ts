import { useCallback, useEffect, useRef, useState } from "react";

import { loadCurrentUser } from "@/api/auth";
import { loadConfig } from "@/api/config";
import type { AuthResponse, ConfigResponse, FetchClient } from "@/api/types";
import type { ViewMode } from "@/app/workspace/contracts";

const apiUnavailableRetryMs = 3_000;

type BootstrapState =
  | {
      fetchClient: FetchClient;
      ready: false;
      config: null;
      auth: null;
      apiUnavailableReason: null;
    }
  | {
      fetchClient: FetchClient;
      ready: true;
      config: ConfigResponse;
      auth: AuthResponse;
      apiUnavailableReason: string | null;
    };

function configFailure(error: unknown): ConfigResponse {
  return {
    is_configured: false,
    entra_auth_enabled: false,
    endpoint:
      error instanceof Error ? error.message : "Failed to load configuration.",
    models: [],
    is_realtime_configured: false,
    realtime_endpoint: null,
    realtime_model: null,
    embedding_model: null,
    is_document_rag_configured: false,
    search_endpoint: null,
    search_index_name: null,
    storage_account_url: null,
    storage_container_name: null,
    is_traditional_voice_configured: false,
    transcription_model: null,
    tts_model: null,
    tts_voice: null,
    is_speech_transcription_configured: false,
    speech_transcription_model: null,
    is_voice_live_configured: false,
    voice_live_model: null,
    voice_live_voice: null,
    is_live_interpreter_configured: false,
    is_text_translation_configured: false,
    is_content_extractor_configured: false,
  };
}

function authFailure(): AuthResponse {
  return { authenticated: false, entra_auth_enabled: false };
}

function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Failed to load configuration.";
}

export function useAppBootstrap(fetchClient: FetchClient) {
  const [state, setState] = useState<BootstrapState>({
    fetchClient,
    ready: false,
    config: null,
    auth: null,
    apiUnavailableReason: null,
  });
  const [retryNonce, setRetryNonce] = useState(0);
  const generationRef = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    generationRef.current += 1;
    const generation = generationRef.current;

    void loadConfig(fetchClient, controller.signal)
      .then(async (config) => {
        if (controller.signal.aborted || generation !== generationRef.current) {
          return;
        }
        if (!config.entra_auth_enabled) {
          setState({
            fetchClient,
            ready: true,
            config,
            auth: authFailure(),
            apiUnavailableReason: null,
          });
          return;
        }
        const auth = await loadCurrentUser(
          fetchClient,
          controller.signal,
        ).catch(authFailure);
        if (controller.signal.aborted || generation !== generationRef.current) {
          return;
        }
        setState({
          fetchClient,
          ready: true,
          config,
          auth,
          apiUnavailableReason: null,
        });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || generation !== generationRef.current) {
          return;
        }
        const reason = errorMessage(error);
        setState({
          fetchClient,
          ready: true,
          config: configFailure(new Error(reason)),
          auth: authFailure(),
          apiUnavailableReason: reason,
        });
      });

    return () => controller.abort();
  }, [fetchClient, retryNonce]);

  useEffect(() => {
    if (!state.ready || state.apiUnavailableReason === null) {
      return;
    }
    const retryTimer = window.setInterval(
      () => setRetryNonce((current) => current + 1),
      apiUnavailableRetryMs,
    );
    return () => window.clearInterval(retryTimer);
  }, [state.ready, state.apiUnavailableReason]);

  const retryApiConnection = useCallback(() => {
    setRetryNonce((current) => current + 1);
  }, []);

  const snapshot =
    state.fetchClient === fetchClient && state.ready ? state : null;
  const config = snapshot?.config ?? null;
  const auth = snapshot?.auth ?? null;
  const apiUnavailableReason = snapshot?.apiUnavailableReason ?? null;
  const apiUnavailable = apiUnavailableReason !== null;
  const entraAuthEnabled = config?.entra_auth_enabled ?? false;
  const canUseProtectedApis =
    snapshot !== null &&
    !apiUnavailable &&
    (!entraAuthEnabled || snapshot.auth.authenticated === true);
  const authGateActive =
    !apiUnavailable &&
    (snapshot === null ||
      (entraAuthEnabled && snapshot.auth.authenticated !== true));
  const workspaceLocked = useCallback(
    (activeView: ViewMode) => authGateActive && activeView !== "settings",
    [authGateActive],
  );

  return {
    config,
    auth,
    entraAuthEnabled,
    canUseProtectedApis,
    authGateActive,
    apiUnavailable,
    apiUnavailableReason,
    workspaceLocked,
    retryApiConnection,
  };
}
