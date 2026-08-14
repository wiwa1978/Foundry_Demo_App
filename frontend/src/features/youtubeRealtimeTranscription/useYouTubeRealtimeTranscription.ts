import { useCallback, useEffect, useRef, useState } from "react";

import type {
  RealtimeServerEvent,
  RealtimeStatus,
  RealtimeTranscriptionDelay,
} from "@/features/voice/types";

import { youtubeRealtimeTranscriptionWebSocketUrl } from "./api";

type Resources = {
  socket: WebSocket | null;
  closed: boolean;
};

type YouTubeRealtimeEvent = RealtimeServerEvent & {
  status?: string;
  video_id?: string;
};

const YOUTUBE_REALTIME_OPEN_TIMEOUT_MS = 20_000;

export function useYouTubeRealtimeTranscription({
  models,
  defaultModel,
}: {
  models: string[];
  defaultModel: string;
}) {
  const [url, setUrl] = useState("");
  const [model, setModel] = useState(defaultModel);
  const [language, setLanguage] = useState("auto");
  const [delay, setDelay] = useState<RealtimeTranscriptionDelay>("default");
  const [status, setStatus] = useState<RealtimeStatus>("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const [error, setError] = useState("");
  const [transcript, setTranscript] = useState("");
  const [videoId, setVideoId] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const generationRef = useRef(0);
  const statusRef = useRef<RealtimeStatus>("idle");
  const resourcesRef = useRef<Resources | null>(null);
  const transcriptItemsRef = useRef(
    new Map<string, { text: string; sequence: number; completed: boolean }>(),
  );
  const fallbackSequenceRef = useRef(0);

  function isCurrent(generation: number) {
    return mountedRef.current && generationRef.current === generation;
  }

  function updateStatus(next: RealtimeStatus) {
    statusRef.current = next;
    if (mountedRef.current) setStatus(next);
  }

  function renderTranscript() {
    setTranscript(
      [...transcriptItemsRef.current.values()]
        .sort((left, right) => left.sequence - right.sequence)
        .map((item) => item.text)
        .filter((text) => text.trim())
        .join(" "),
    );
  }

  function resetTranscript() {
    transcriptItemsRef.current.clear();
    fallbackSequenceRef.current = 0;
    setTranscript("");
    setVideoId(null);
  }

  function handleEvent(generation: number, event: YouTubeRealtimeEvent) {
    if (!isCurrent(generation)) return;
    if (event.type === "youtube.status") {
      setStatusMessage(event.status ?? "Preparing YouTube audio...");
      return;
    }
    if (event.type === "ready") {
      if (event.model) setModel(event.model);
      if (event.video_id) setVideoId(event.video_id);
      setStatusMessage(
        "Streaming YouTube audio into realtime transcription...",
      );
      updateStatus("live");
      return;
    }
    if (event.type === "youtube.completed") {
      setStatusMessage("Transcription complete.");
      updateStatus("idle");
      resourcesRef.current?.socket?.close();
      return;
    }
    const itemId = event.item_id ?? "current";
    const existing = transcriptItemsRef.current.get(itemId);
    const sequence =
      event.sequence ??
      existing?.sequence ??
      (fallbackSequenceRef.current += 1);
    if (
      event.type === "conversation.item.input_audio_transcription.delta" &&
      event.delta
    ) {
      transcriptItemsRef.current.set(itemId, {
        text: `${existing?.text ?? ""}${event.delta}`,
        sequence,
        completed: false,
      });
      renderTranscript();
      return;
    }
    if (
      event.type === "conversation.item.input_audio_transcription.completed" &&
      event.transcript
    ) {
      transcriptItemsRef.current.set(itemId, {
        text: event.transcript.trim(),
        sequence,
        completed: true,
      });
      renderTranscript();
      return;
    }
    if (event.type === "response.text.done" && event.text) {
      transcriptItemsRef.current.set(itemId, {
        text: event.text.trim(),
        sequence,
        completed: true,
      });
      renderTranscript();
      return;
    }
    if (event.type === "conversation.item.input_audio_transcription.failed") {
      setError(event.error?.message ?? "YouTube audio transcription failed.");
      return;
    }
    if (event.type === "error" || event.type === "session.error") {
      setError(
        event.error?.message ??
          "YouTube realtime transcription reported an error.",
      );
      updateStatus("idle");
    }
  }

  function waitForSocketOpen(socket: WebSocket) {
    if (socket.readyState === WebSocket.OPEN) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        cleanup();
        reject(
          new Error(
            "YouTube realtime transcription did not connect within 20 seconds.",
          ),
        );
      }, YOUTUBE_REALTIME_OPEN_TIMEOUT_MS);
      const cleanup = () => {
        window.clearTimeout(timeout);
        socket.removeEventListener("open", onOpen);
        socket.removeEventListener("error", onError);
        socket.removeEventListener("close", onClose);
      };
      const onOpen = () => {
        cleanup();
        resolve();
      };
      const onError = () => {
        cleanup();
        reject(new Error("YouTube realtime transcription WebSocket failed."));
      };
      const onClose = (event: CloseEvent) => {
        cleanup();
        reject(
          new Error(
            event.reason ||
              "YouTube realtime transcription closed before it was ready.",
          ),
        );
      };
      socket.addEventListener("open", onOpen, { once: true });
      socket.addEventListener("error", onError, { once: true });
      socket.addEventListener("close", onClose, { once: true });
    });
  }

  const closeResources = useCallback((resources: Resources | null) => {
    if (!resources || resources.closed) return;
    resources.closed = true;
    resources.socket?.close();
  }, []);

  const closeCurrentResources = useCallback(() => {
    closeResources(resourcesRef.current);
    resourcesRef.current = null;
  }, [closeResources]);

  function stop() {
    generationRef.current += 1;
    updateStatus("stopping");
    closeCurrentResources();
    updateStatus("idle");
    setStatusMessage("Transcription stopped.");
  }

  async function start() {
    const normalizedUrl = url.trim();
    const selectedModel = model.trim();
    if (!normalizedUrl || !selectedModel || statusRef.current !== "idle")
      return;
    closeCurrentResources();
    resetTranscript();
    setError("");
    setStatusMessage("Connecting...");
    updateStatus("connecting");
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    const resources: Resources = { socket: null, closed: false };
    resourcesRef.current = resources;
    try {
      const socket = new WebSocket(
        youtubeRealtimeTranscriptionWebSocketUrl({
          url: normalizedUrl,
          model: selectedModel,
          language: language === "auto" ? null : language,
          delay: delay === "default" ? null : delay,
        }),
      );
      resources.socket = socket;
      socket.addEventListener("message", (message) => {
        try {
          handleEvent(generation, JSON.parse(String(message.data)));
        } catch {
          if (isCurrent(generation))
            setError("Received an unreadable realtime transcription event.");
        }
      });
      socket.addEventListener("close", () => {
        if (!isCurrent(generation)) return;
        closeCurrentResources();
        if (statusRef.current !== "idle") {
          if (statusRef.current === "connecting") {
            setError(
              "YouTube realtime transcription connection closed before it was ready.",
            );
          }
          updateStatus("idle");
        }
      });
      await waitForSocketOpen(socket);
    } catch (caught) {
      if (isCurrent(generation)) {
        setError(
          caught instanceof Error
            ? caught.message
            : "Unable to start YouTube realtime transcription.",
        );
        updateStatus("idle");
      }
      closeResources(resources);
    }
  }

  useEffect(() => {
    if (!models.length) return;
    if (!models.includes(model)) setModel(models[0]);
  }, [defaultModel, model, models]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      generationRef.current += 1;
      closeCurrentResources();
    };
  }, [closeCurrentResources]);

  return {
    url,
    setUrl,
    model,
    setModel,
    models,
    language,
    setLanguage,
    delay,
    setDelay,
    status,
    statusMessage,
    error,
    transcript,
    videoId,
    start,
    stop,
  };
}
