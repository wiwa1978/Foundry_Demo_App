import { Copy, ExternalLink, LoaderCircle, Video } from "lucide-react";

import { formatModelName } from "@/app/workspace/formatters";
import { ComposerSelect } from "@/app/workspace/WorkspacePrimitives";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import type { YouTubeSummaryResult } from "./types";

export function YouTubeSummaryWorkspace({
  url,
  language,
  model,
  models,
  transcriptionModel,
  transcriptionModels,
  result,
  loading,
  error,
  onUrlChange,
  onLanguageChange,
  onModelChange,
  onTranscriptionModelChange,
  onSummarize,
}: {
  url: string;
  language: string;
  model: string;
  models: string[];
  transcriptionModel: string;
  transcriptionModels: string[];
  result: YouTubeSummaryResult | null;
  loading: boolean;
  error: string;
  onUrlChange: (value: string) => void;
  onLanguageChange: (value: string) => void;
  onModelChange: (value: string) => void;
  onTranscriptionModelChange: (value: string) => void;
  onSummarize: () => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 overflow-auto p-5">
        {result ? (
          <div className="mx-auto grid max-w-5xl gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-[#606066] dark:bg-[#39393d]">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Badge>Summary</Badge>
                  <Badge variant="outline">
                    {formatModelName(result.model)}
                  </Badge>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    void navigator.clipboard.writeText(result.summary)
                  }
                >
                  <Copy className="h-4 w-4" /> Copy
                </Button>
              </div>
              <div className="mt-5 whitespace-pre-wrap text-sm leading-7 text-slate-800 dark:text-slate-100">
                {result.summary}
              </div>
            </article>
            <aside className="grid content-start gap-4">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-[#606066] dark:bg-[#45454a]">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Source
                </div>
                <p className="mt-2 text-sm font-medium">
                  {result.source === "manual_captions"
                    ? "Creator captions"
                    : result.source === "generated_captions"
                      ? "Auto-generated captions"
                      : `Audio transcription (${formatModelName(result.transcription_model ?? "")})`}
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Language: {result.language} · {result.duration_ms} ms
                </p>
                <a
                  className="palette-accent-text mt-3 inline-flex items-center gap-1 text-sm font-medium"
                  href={`https://www.youtube.com/watch?v=${result.video_id}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open video <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
              <details className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-[#606066] dark:bg-[#39393d]">
                <summary className="cursor-pointer text-sm font-semibold">
                  View transcript
                </summary>
                <div className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap text-xs leading-6 text-slate-600 dark:text-slate-300">
                  {result.transcript}
                </div>
              </details>
            </aside>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center">
            <div className="max-w-xl text-center">
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-[2rem] bg-red-50 text-red-600 shadow-sm dark:bg-red-500/10 dark:text-red-300">
                <Video className="h-9 w-9" />
              </div>
              <Badge variant="outline" className="mt-5">
                Captions + audio fallback
              </Badge>
              <h3 className="mt-3 text-3xl font-semibold tracking-tight">
                Turn a video into the essentials
              </h3>
              <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-slate-500 dark:text-slate-400">
                Paste a public YouTube URL. The app uses available captions
                first, then downloads and transcribes the audio when captions
                are unavailable.
              </p>
              {loading ? (
                <div className="mt-6 flex items-center justify-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                  <LoaderCircle className="h-4 w-4 animate-spin" /> Retrieving
                  or transcribing audio, then summarizing...
                </div>
              ) : null}
            </div>
          </div>
        )}
      </div>
      <div className="border-t bg-slate-50 px-4 py-3 dark:border-[#55555a] dark:bg-[#29292c]">
        <form
          className="palette-focus mx-auto flex max-w-5xl flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-[#606066] dark:bg-[#2f2f33] sm:flex-row sm:items-center"
          onSubmit={(event) => {
            event.preventDefault();
            onSummarize();
          }}
        >
          <Input
            type="url"
            aria-label="YouTube video URL"
            placeholder="https://www.youtube.com/watch?v=..."
            value={url}
            disabled={loading}
            onChange={(event) => onUrlChange(event.target.value)}
            className="h-10 min-w-0 flex-1"
          />
          {transcriptionModels.length ? (
            <ComposerSelect
              id="youtube-transcription-model"
              ariaLabel="Audio transcription model"
              value={transcriptionModel}
              onChange={onTranscriptionModelChange}
              disabled={loading}
              options={transcriptionModels.map((value) => ({
                value,
                label: formatModelName(value),
              }))}
            />
          ) : (
            <span className="px-2 text-xs text-amber-700 dark:text-amber-300">
              Captions only: configure a transcription model for audio fallback
            </span>
          )}
          <ComposerSelect
            id="youtube-language"
            ariaLabel="Caption language"
            value={language}
            onChange={onLanguageChange}
            disabled={loading}
            options={[
              { value: "en", label: "English captions" },
              { value: "nl", label: "Dutch captions" },
              { value: "fr", label: "French captions" },
              { value: "de", label: "German captions" },
              { value: "es", label: "Spanish captions" },
            ]}
          />
          <ComposerSelect
            id="youtube-model"
            ariaLabel="Summary model"
            value={model}
            onChange={onModelChange}
            disabled={loading}
            options={models.map((value) => ({
              value,
              label: formatModelName(value),
            }))}
          />
          <Button type="submit" disabled={!url.trim() || !model || loading}>
            {loading ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <Video className="h-4 w-4" />
            )}
            {loading ? "Summarizing" : "Summarize"}
          </Button>
        </form>
        {error ? (
          <p className="mt-2 text-center text-xs text-red-600 dark:text-red-300">
            {error}
          </p>
        ) : null}
        <p className="mt-2 text-center text-xs text-slate-500 dark:text-slate-400">
          Public videos up to 30 minutes. Audio transcription is attempted when
          captions are unavailable; YouTube may still block cloud requests.
        </p>
      </div>
    </div>
  );
}
