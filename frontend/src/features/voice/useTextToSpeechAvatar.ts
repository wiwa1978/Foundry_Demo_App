import { useEffect, useRef, useState } from "react";

import type { FetchClient } from "@/api/types";

import { getTextToSpeechAvatarJob, submitTextToSpeechAvatar } from "./api";

export type TextToSpeechAvatarType = "video" | "photo";
export type TextToSpeechAvatarStatus =
  "idle" | "submitting" | "running" | "succeeded" | "failed";

export type TextToSpeechAvatarSettings = {
  avatarType: TextToSpeechAvatarType;
  character: string;
  style: string;
  voice: string;
  language: string;
  customVoiceEndpointId: string;
  customized: boolean;
  useBuiltInVoice: boolean;
  backgroundColor: string;
  backgroundImage: string;
};

export const defaultTextToSpeechAvatarSettings: TextToSpeechAvatarSettings = {
  avatarType: "video",
  character: "lisa",
  style: "graceful-sitting",
  voice: "en-US-Ava:DragonHDLatestNeural",
  language: "en-US",
  customVoiceEndpointId: "",
  customized: false,
  useBuiltInVoice: false,
  backgroundColor: "#FFFFFFFF",
  backgroundImage: "",
};

export function useTextToSpeechAvatar({
  configured,
  fetchClient,
}: {
  configured: boolean;
  fetchClient: FetchClient;
}) {
  const [settings, setSettings] = useState(defaultTextToSpeechAvatarSettings);
  const [text, setText] = useState(
    "Welcome to Azure Speech Text to Speech Avatar.",
  );
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState("");
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [summaryUrl, setSummaryUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<TextToSpeechAvatarStatus>("idle");
  const [error, setError] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);

  function setSetting<Key extends keyof TextToSpeechAvatarSettings>(
    key: Key,
    value: TextToSpeechAvatarSettings[Key],
  ) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  async function start(textOverride?: string) {
    if (status === "submitting" || status === "running") return;
    if (!configured) {
      setError(
        "Configure AZURE_SPEECH_ENDPOINT to enable Text to Speech Avatar.",
      );
      return;
    }
    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    setStatus("submitting");
    setJobStatus("Submitting");
    setJobId(null);
    setVideoUrl(null);
    setSummaryUrl(null);
    setError("");

    try {
      const submitted = await submitTextToSpeechAvatar(
        fetchClient,
        {
          text: textOverride ?? text,
          avatar_type: settings.avatarType,
          character: settings.character,
          style: settings.style,
          voice: settings.voice,
          language: settings.language,
          custom_voice_endpoint_id: settings.customVoiceEndpointId,
          customized: settings.customized,
          use_built_in_voice: settings.useBuiltInVoice,
          background_color: settings.backgroundColor,
          background_image: settings.backgroundImage,
        },
        controller.signal,
      );
      if (generation !== generationRef.current) return;
      setJobId(submitted.id);
      setJobStatus(submitted.status);
      const submittedStatus = submitted.status.toLowerCase();
      if (submittedStatus === "succeeded") {
        setStatus("succeeded");
      } else if (
        submittedStatus === "failed" ||
        submittedStatus === "canceled"
      ) {
        setStatus("failed");
        setError(
          submitted.error ||
            `Avatar synthesis ${submitted.status.toLowerCase()}.`,
        );
      } else {
        setStatus("running");
      }
      if (submitted.output_url) setVideoUrl(submitted.output_url);
      if (submitted.summary_url) setSummaryUrl(submitted.summary_url);
      if (
        submittedStatus === "succeeded" ||
        submittedStatus === "failed" ||
        submittedStatus === "canceled"
      ) {
        return;
      }

      for (;;) {
        await new Promise<void>((resolve, reject) => {
          const timeoutId = window.setTimeout(() => {
            controller.signal.removeEventListener("abort", onAbort);
            resolve();
          }, 2000);
          function onAbort() {
            window.clearTimeout(timeoutId);
            reject(
              new DOMException("The operation was aborted.", "AbortError"),
            );
          }
          controller.signal.addEventListener("abort", onAbort, { once: true });
        });
        if (generation !== generationRef.current) return;
        const job = await getTextToSpeechAvatarJob(
          fetchClient,
          submitted.id,
          controller.signal,
        );
        if (generation !== generationRef.current) return;
        setJobStatus(job.status);
        if (job.output_url) setVideoUrl(job.output_url);
        if (job.summary_url) setSummaryUrl(job.summary_url);
        const normalizedStatus = job.status.toLowerCase();
        if (normalizedStatus === "succeeded") {
          setStatus("succeeded");
          return;
        }
        if (normalizedStatus === "failed" || normalizedStatus === "canceled") {
          setStatus("failed");
          setError(
            job.error || `Avatar synthesis ${job.status.toLowerCase()}.`,
          );
          return;
        }
      }
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError")
        return;
      if (generation !== generationRef.current) return;
      setStatus("failed");
      setError(
        caught instanceof Error ? caught.message : "Avatar synthesis failed.",
      );
    } finally {
      if (generation === generationRef.current) abortRef.current = null;
    }
  }

  function stop() {
    generationRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    setStatus("idle");
    setJobStatus("");
  }

  useEffect(
    () => () => {
      abortRef.current?.abort();
    },
    [],
  );

  return {
    configured,
    ...settings,
    text,
    jobId,
    jobStatus,
    videoUrl,
    summaryUrl,
    status,
    error,
    setText,
    setAvatarType: (value: TextToSpeechAvatarType) =>
      setSetting("avatarType", value),
    setCharacter: (value: string) => setSetting("character", value),
    setStyle: (value: string) => setSetting("style", value),
    setVoice: (value: string) => setSetting("voice", value),
    setLanguage: (value: string) => setSetting("language", value),
    setCustomVoiceEndpointId: (value: string) =>
      setSetting("customVoiceEndpointId", value),
    setCustomized: (value: boolean) => setSetting("customized", value),
    setUseBuiltInVoice: (value: boolean) =>
      setSetting("useBuiltInVoice", value),
    setBackgroundColor: (value: string) => setSetting("backgroundColor", value),
    setBackgroundImage: (value: string) => setSetting("backgroundImage", value),
    start,
    stop,
  };
}

export type TextToSpeechAvatarViewModel = ReturnType<
  typeof useTextToSpeechAvatar
>;
