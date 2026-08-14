import { LoaderCircle, Square, Video } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";

import { formatModelName } from "@/app/workspace/formatters";
import { ComposerSelect } from "@/app/workspace/WorkspacePrimitives";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type {
  RealtimeStatus,
  RealtimeTranscriptionDelay,
} from "@/features/voice/types";

function youtubeEmbedUrl(url: string, videoId: string | null) {
  const trimmedUrl = url.trim();
  const origin = window.location.origin;
  const embedFor = (id: string) => {
    const embed = new URL(`https://www.youtube.com/embed/${id}`);
    embed.searchParams.set("enablejsapi", "1");
    embed.searchParams.set("origin", origin);
    return embed.toString();
  };
  if (videoId) return embedFor(videoId);
  try {
    const parsed = new URL(trimmedUrl);
    if (parsed.hostname === "youtu.be") {
      const id = parsed.pathname.split("/").filter(Boolean)[0];
      return id ? embedFor(id) : "";
    }
    const id = parsed.searchParams.get("v");
    return id ? embedFor(id) : "";
  } catch {
    return "";
  }
}

export function YouTubeRealtimeTranscriptionWorkspace({
  url,
  model,
  models,
  language,
  delay,
  status,
  statusMessage,
  error,
  transcript,
  videoId,
  configured,
  onUrlChange,
  onModelChange,
  onLanguageChange,
  onDelayChange,
  onStart,
  onStop,
}: {
  url: string;
  model: string;
  models: string[];
  language: string;
  delay: RealtimeTranscriptionDelay;
  status: RealtimeStatus;
  statusMessage: string;
  error: string;
  transcript: string;
  videoId: string | null;
  configured: boolean;
  onUrlChange: (value: string) => void;
  onModelChange: (value: string) => void;
  onLanguageChange: (value: string) => void;
  onDelayChange: (value: RealtimeTranscriptionDelay) => void;
  onStart: () => void;
  onStop: () => void;
}) {
  const isConnecting = status === "connecting";
  const active = status !== "idle";
  const canStart =
    configured && models.length > 0 && Boolean(url.trim()) && Boolean(model);
  const embedUrl = youtubeEmbedUrl(url, videoId);
  const playerRef = useRef<HTMLIFrameElement | null>(null);
  const startFromPlayerInteraction = useCallback(() => {
    if (!active && canStart) {
      onStart();
    }
  }, [active, canStart, onStart]);

  useEffect(() => {
    if (!embedUrl || active || !canStart) {
      return;
    }
    const handlePlayerMessage = (event: MessageEvent) => {
      if (event.source !== playerRef.current?.contentWindow) {
        return;
      }
      let data: { event?: string; info?: number } | null = null;
      try {
        data =
          typeof event.data === "string"
            ? (JSON.parse(event.data) as { event?: string; info?: number })
            : event.data;
      } catch {
        return;
      }
      if (data?.event === "onStateChange" && data.info === 1) {
        startFromPlayerInteraction();
      }
    };
    const handleWindowBlur = () => {
      window.setTimeout(() => {
        if (document.activeElement === playerRef.current) {
          startFromPlayerInteraction();
        }
      }, 0);
    };
    window.addEventListener("message", handlePlayerMessage);
    window.addEventListener("blur", handleWindowBlur);
    return () => {
      window.removeEventListener("message", handlePlayerMessage);
      window.removeEventListener("blur", handleWindowBlur);
    };
  }, [active, canStart, embedUrl, startFromPlayerInteraction]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 overflow-auto p-5">
        <div className="mx-auto grid h-full max-w-6xl gap-4 lg:grid-cols-[0.9fr_1.1fr]">
          <section className="flex min-h-[28rem] flex-col rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-[#606066] dark:bg-[#39393d]">
            <Badge variant="outline">Realtime YouTube audio</Badge>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight">
              Transcribe a public video with realtime STT
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-500 dark:text-slate-400">
              Play the video here while the backend streams the source audio
              directly into the realtime transcription deployment. The server no
              longer waits for a full audio download before transcription
              starts.
            </p>
            <div className="mt-5 aspect-video overflow-hidden rounded-2xl border border-slate-200 bg-slate-950 dark:border-[#606066]">
              {embedUrl ? (
                <iframe
                  ref={playerRef}
                  onFocus={startFromPlayerInteraction}
                  className="h-full w-full"
                  src={embedUrl}
                  title="YouTube video player"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                />
              ) : (
                <div className="flex h-full items-center justify-center px-4 text-center text-sm text-slate-300">
                  Enter a YouTube URL below to preview the video here.
                </div>
              )}
            </div>
            <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm dark:border-[#606066] dark:bg-[#45454a]">
              <p className="font-medium text-slate-700 dark:text-slate-100">
                Supported models
              </p>
              <p className="mt-2 text-slate-500 dark:text-slate-300">
                Use realtime transcription deployments such as
                <span className="font-medium"> gpt-live-transcribe</span> and
                <span className="font-medium"> gpt-realtime-whisper</span>.
                Recorded transcription models stay in the summary use case.
              </p>
            </div>
            {videoId ? (
              <a
                className="palette-accent-text mt-5 text-sm font-medium"
                href={`https://www.youtube.com/watch?v=${videoId}`}
                target="_blank"
                rel="noreferrer"
              >
                Open source video
              </a>
            ) : null}
            {!configured ? (
              <p className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
                Set FOUNDRY_PROJECT_ENDPOINT or FOUNDRY_REALTIME_ENDPOINT, plus
                a realtime transcription deployment, before using this scenario.
              </p>
            ) : null}
          </section>

          <section
            aria-label="Realtime transcript"
            className="flex min-h-[28rem] min-w-0 flex-col rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-[#606066] dark:bg-[#39393d]"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge>Transcript</Badge>
                {model ? (
                  <Badge variant="outline">{formatModelName(model)}</Badge>
                ) : null}
              </div>
              {active ? (
                <span className="inline-flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> Live
                </span>
              ) : null}
            </div>
            <div className="mt-5 flex-1 overflow-auto whitespace-pre-wrap rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-7 text-slate-700 dark:border-[#606066] dark:bg-[#45454a] dark:text-slate-100">
              {transcript ||
                "Start transcription to stream the video transcript here."}
            </div>
            {statusMessage ? (
              <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                {statusMessage}
              </p>
            ) : null}
          </section>
        </div>
      </div>

      <div className="border-t bg-slate-50 px-4 py-3 dark:border-[#55555a] dark:bg-[#29292c]">
        <form
          className="palette-focus mx-auto flex max-w-6xl flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-[#606066] dark:bg-[#2f2f33] sm:flex-row sm:items-center"
          onSubmit={(event) => {
            event.preventDefault();
            if (active) onStop();
            else onStart();
          }}
        >
          <Input
            type="url"
            aria-label="YouTube video URL"
            placeholder="https://www.youtube.com/watch?v=..."
            value={url}
            disabled={active}
            onChange={(event) => onUrlChange(event.target.value)}
            className="h-10 min-w-0 flex-1"
          />
          <ComposerSelect
            id="youtube-realtime-model"
            ariaLabel="Realtime transcription model"
            value={model}
            onChange={onModelChange}
            disabled={active || models.length === 0}
            options={models.map((value) => ({
              value,
              label: formatModelName(value),
            }))}
          />
          <ComposerSelect
            id="youtube-realtime-language"
            ariaLabel="Transcription language"
            value={language}
            onChange={onLanguageChange}
            disabled={active}
            options={[
              { value: "auto", label: "Auto language" },
              { value: "en", label: "English" },
              { value: "nl", label: "Dutch" },
              { value: "fr", label: "French" },
              { value: "de", label: "German" },
              { value: "es", label: "Spanish" },
            ]}
          />
          <ComposerSelect
            id="youtube-realtime-delay"
            ariaLabel="Transcription delay"
            value={delay}
            onChange={(value) =>
              onDelayChange(value as RealtimeTranscriptionDelay)
            }
            disabled={active}
            options={[
              { value: "default", label: "Default delay" },
              { value: "minimal", label: "Minimal delay" },
              { value: "low", label: "Low delay" },
              { value: "medium", label: "Medium delay" },
              { value: "high", label: "High delay" },
              { value: "xhigh", label: "Extra high delay" },
            ]}
          />
          <Button
            type="submit"
            disabled={active ? false : !canStart}
            variant={active ? "destructive" : "default"}
          >
            {isConnecting ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : active ? (
              <Square className="h-4 w-4" />
            ) : (
              <Video className="h-4 w-4" />
            )}
            {isConnecting ? "Starting" : active ? "Stop" : "Transcribe"}
          </Button>
        </form>
        {error ? (
          <p className="mt-2 text-center text-xs text-red-600 dark:text-red-300">
            {error}
          </p>
        ) : null}
        <p className="mt-2 text-center text-xs text-slate-500 dark:text-slate-400">
          Public videos up to 30 minutes. YouTube may block cloud requests.
        </p>
      </div>
    </div>
  );
}
