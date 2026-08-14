import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AuthResponse, ConfigResponse, FetchClient } from "@/api/types";

import { useAppBootstrap } from "./useAppBootstrap";

function config(overrides: Partial<ConfigResponse> = {}): ConfigResponse {
  return {
    entra_auth_enabled: false,
    is_configured: true,
    endpoint: "https://example.openai.azure.com",
    models: ["gpt-4o-mini"],
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
    ...overrides,
  };
}

function auth(overrides: Partial<AuthResponse> = {}): AuthResponse {
  return {
    authenticated: false,
    entra_auth_enabled: false,
    ...overrides,
  };
}

function immediateClient(configValue: ConfigResponse, authValue: AuthResponse) {
  return vi.fn<FetchClient>(async (url) => {
    if (url === "/api/config") {
      return Response.json(configValue);
    }
    if (url === "/api/auth/me") {
      return Response.json(authValue);
    }
    throw new Error(`Unexpected request: ${url}`);
  });
}

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  let reject: (reason?: unknown) => void = () => undefined;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

async function flushPromises() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

afterEach(() => {
  vi.useRealTimers();
});

describe("useAppBootstrap", () => {
  it("unlocks the local demo when authentication is disabled", async () => {
    const fetchClient = immediateClient(config(), auth());
    const { result } = renderHook(() => useAppBootstrap(fetchClient));

    expect(result.current.canUseProtectedApis).toBe(false);
    expect(result.current.authGateActive).toBe(true);
    await waitFor(() => expect(result.current.config).not.toBeNull());

    expect(result.current.entraAuthEnabled).toBe(false);
    expect(result.current.canUseProtectedApis).toBe(true);
    expect(result.current.authGateActive).toBe(false);
    expect(result.current.workspaceLocked("chat")).toBe(false);
    expect(fetchClient).not.toHaveBeenCalledWith(
      "/api/auth/me",
      expect.any(Object),
      expect.any(Object),
    );
  });

  it("unlocks an authenticated Entra workspace", async () => {
    const configValue = config({ entra_auth_enabled: true });
    const authValue = auth({
      authenticated: true,
      entra_auth_enabled: true,
      name: "Test User",
    });
    const fetchClient = immediateClient(configValue, authValue);
    const { result } = renderHook(() => useAppBootstrap(fetchClient));

    await waitFor(() => expect(result.current.auth).toEqual(authValue));
    expect(result.current.entraAuthEnabled).toBe(true);
    expect(result.current.canUseProtectedApis).toBe(true);
    expect(result.current.authGateActive).toBe(false);
  });

  it("locks an unauthenticated Entra workspace except for settings", async () => {
    const fetchClient = immediateClient(
      config({ entra_auth_enabled: true }),
      auth({ entra_auth_enabled: true }),
    );
    const { result } = renderHook(() => useAppBootstrap(fetchClient));

    await waitFor(() => expect(result.current.auth).not.toBeNull());
    expect(result.current.canUseProtectedApis).toBe(false);
    expect(result.current.authGateActive).toBe(true);
    expect(result.current.workspaceLocked("chat")).toBe(true);
    expect(result.current.workspaceLocked("settings")).toBe(false);
  });

  it("waits for config before checking the current user", async () => {
    const configResponse = deferred<Response>();
    const authResponse = deferred<Response>();
    const fetchClient = vi.fn<FetchClient>((url) =>
      url === "/api/config" ? configResponse.promise : authResponse.promise,
    );
    const { result } = renderHook(() => useAppBootstrap(fetchClient));

    expect(fetchClient).toHaveBeenCalledTimes(1);
    expect(fetchClient).toHaveBeenCalledWith(
      "/api/config",
      expect.any(Object),
      expect.any(Object),
    );
    expect(result.current.config).toBeNull();
    expect(result.current.auth).toBeNull();
    expect(result.current.canUseProtectedApis).toBe(false);

    await act(async () => {
      configResponse.resolve(
        Response.json(config({ entra_auth_enabled: true })),
      );
    });
    expect(fetchClient).toHaveBeenCalledWith(
      "/api/auth/me",
      expect.any(Object),
      expect.any(Object),
    );

    await act(async () => {
      authResponse.resolve(
        Response.json(auth({ authenticated: true, entra_auth_enabled: true })),
      );
    });
    expect(result.current.canUseProtectedApis).toBe(true);
    expect(result.current.authGateActive).toBe(false);
  });

  it("reports API unavailability when config cannot be loaded", async () => {
    const fetchClient = vi.fn<FetchClient>((url) => {
      if (url === "/api/config") {
        return Promise.reject(new Error("config unavailable"));
      }
      return Promise.resolve(Response.json(auth({ entra_auth_enabled: true })));
    });
    const { result } = renderHook(() => useAppBootstrap(fetchClient));

    await waitFor(() => expect(result.current.config).not.toBeNull());
    expect(result.current.config).toEqual(
      expect.objectContaining({
        is_configured: false,
        entra_auth_enabled: false,
        endpoint: "config unavailable",
      }),
    );
    expect(result.current.apiUnavailable).toBe(true);
    expect(result.current.apiUnavailableReason).toBe("config unavailable");
    expect(result.current.canUseProtectedApis).toBe(false);
    expect(result.current.authGateActive).toBe(false);
  });

  it("automatically retries config while the API is unavailable", async () => {
    vi.useFakeTimers();
    let configAttempts = 0;
    const fetchClient = vi.fn<FetchClient>((url) => {
      if (url === "/api/config") {
        configAttempts += 1;
        return configAttempts === 1
          ? Promise.reject(new Error("api offline"))
          : Promise.resolve(Response.json(config({ endpoint: "online" })));
      }
      return Promise.resolve(Response.json(auth()));
    });
    const { result } = renderHook(() => useAppBootstrap(fetchClient));

    await flushPromises();
    expect(result.current.apiUnavailable).toBe(true);

    await act(async () => {
      vi.advanceTimersByTime(3_000);
    });
    await flushPromises();

    expect(result.current.apiUnavailable).toBe(false);
    expect(result.current.config?.endpoint).toBe("online");
    expect(configAttempts).toBe(2);
  });

  it("uses the unauthenticated fallback when auth fails", async () => {
    const fetchClient = vi.fn<FetchClient>((url) => {
      if (url === "/api/config") {
        return Promise.resolve(
          Response.json(config({ entra_auth_enabled: true })),
        );
      }
      return Promise.reject(new Error("auth unavailable"));
    });
    const { result } = renderHook(() => useAppBootstrap(fetchClient));

    await waitFor(() => expect(result.current.auth).not.toBeNull());
    expect(result.current.auth).toEqual(auth());
    expect(result.current.canUseProtectedApis).toBe(false);
    expect(result.current.authGateActive).toBe(true);
  });

  it("aborts the pending config request when unmounted", () => {
    const fetchClient = vi.fn<FetchClient>(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        }),
    );
    const { unmount } = renderHook(() => useAppBootstrap(fetchClient));
    const configSignal = fetchClient.mock.calls.find(
      ([url]) => url === "/api/config",
    )?.[1]?.signal;

    expect(configSignal?.aborted).toBe(false);
    expect(fetchClient).not.toHaveBeenCalledWith(
      "/api/auth/me",
      expect.any(Object),
      expect.any(Object),
    );
    unmount();
    expect(configSignal?.aborted).toBe(true);
  });

  it("ignores stale completions after the fetch client changes", async () => {
    const staleConfig = deferred<Response>();
    const staleAuth = deferred<Response>();
    const staleClient = vi.fn<FetchClient>((url) =>
      url === "/api/config" ? staleConfig.promise : staleAuth.promise,
    );
    const freshConfig = config({ endpoint: "https://fresh.example.test" });
    const freshClient = immediateClient(freshConfig, auth());
    const { result, rerender } = renderHook(
      ({ fetchClient }: { fetchClient: FetchClient }) =>
        useAppBootstrap(fetchClient),
      { initialProps: { fetchClient: staleClient } },
    );

    rerender({ fetchClient: freshClient });
    await waitFor(() => expect(result.current.config).toEqual(freshConfig));
    await act(async () => {
      staleConfig.resolve(Response.json(config({ endpoint: "stale" })));
      staleAuth.resolve(Response.json(auth()));
    });

    expect(result.current.config).toEqual(freshConfig);
    expect(result.current.canUseProtectedApis).toBe(true);
  });
});
