import { Copy, ExternalLink, LoaderCircle, Video } from "lucide-react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import { formatModelName } from "@/app/workspace/formatters";
import { ComposerSelect } from "@/app/workspace/WorkspacePrimitives";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import type { YouTubeSummaryResult } from "./types";

const markdownComponents: Components = {
  a: ({ children, href, title }) => {
    const isAnchor = href?.startsWith("#") ?? false;
    return (
      <a
        className="palette-accent-text font-medium underline underline-offset-4"
        href={href}
        rel={isAnchor ? undefined : "noreferrer"}
        target={isAnchor ? undefined : "_blank"}
        title={title}
      >
        {children}
      </a>
    );
  },
  blockquote: ({ children }) => (
    <blockquote className="border-l-4 border-slate-300 pl-4 italic text-slate-600 dark:border-[#606066] dark:text-slate-300">
      {children}
    </blockquote>
  ),
  code: ({ children }) => (
    <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[0.85em] text-slate-900 dark:bg-[#29292c] dark:text-slate-100">
      {children}
    </code>
  ),
  h1: ({ children }) => (
    <h1 className="text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-xl font-semibold tracking-tight text-slate-950 dark:text-white">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-lg font-semibold tracking-tight text-slate-950 dark:text-white">
      {children}
    </h3>
  ),
  hr: () => <hr className="border-slate-200 dark:border-[#606066]" />,
  li: ({ children }) => <li className="pl-1">{children}</li>,
  ol: ({ children }) => (
    <ol className="list-decimal space-y-2 pl-5">{children}</ol>
  ),
  p: ({ children }) => <p>{children}</p>,
  pre: ({ children }) => (
    <pre className="overflow-x-auto rounded-xl bg-slate-950 p-4 text-xs leading-6 text-slate-100">
      {children}
    </pre>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-slate-950 dark:text-white">
      {children}
    </strong>
  ),
  table: ({ children }) => (
    <div className="overflow-x-auto">
      <table className="min-w-full border-collapse text-left text-sm">
        {children}
      </table>
    </div>
  ),
  tbody: ({ children }) => <tbody>{children}</tbody>,
  td: ({ children }) => (
    <td className="border border-slate-200 px-3 py-2 align-top dark:border-[#606066]">
      {children}
    </td>
  ),
  th: ({ children }) => (
    <th className="border border-slate-200 bg-slate-50 px-3 py-2 align-top font-semibold dark:border-[#606066] dark:bg-[#45454a]">
      {children}
    </th>
  ),
  thead: ({ children }) => <thead>{children}</thead>,
  ul: ({ children }) => (
    <ul className="list-disc space-y-2 pl-5">{children}</ul>
  ),
};

const markdownPlugins = [remarkGfm];

function MarkdownContent({
  className,
  value,
}: {
  className?: string;
  value: string;
}) {
  return (
    <div
      className={cn(
        "space-y-4 text-sm leading-7 text-slate-800 dark:text-slate-100",
        className,
      )}
    >
      <ReactMarkdown
        components={markdownComponents}
        remarkPlugins={markdownPlugins}
      >
        {value}
      </ReactMarkdown>
    </div>
  );
}

function formatSourceLabel(result: YouTubeSummaryResult) {
  if (result.source === "manual_captions") {
    return "Creator captions";
  }
  if (result.source === "generated_captions") {
    return "Auto-generated captions";
  }
  return `Audio transcription (${formatModelName(result.transcription_model ?? "")})`;
}

function formatTranscriptModelLabel(result: YouTubeSummaryResult) {
  const model = result.transcription_model?.trim();
  return model ? formatModelName(model) : "Not used (captions)";
}

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
          <div className="mx-auto grid h-full max-w-6xl gap-4 lg:grid-cols-2">
            <section
              aria-labelledby="youtube-transcript-heading"
              className="flex min-h-[28rem] min-w-0 flex-col rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-[#606066] dark:bg-[#39393d]"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge>Transcript</Badge>
                    <Badge variant="outline">
                      Transcription model: {formatTranscriptModelLabel(result)}
                    </Badge>
                  </div>
                  <h2
                    id="youtube-transcript-heading"
                    className="mt-3 text-2xl font-semibold tracking-tight"
                  >
                    Full transcript
                  </h2>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Language: {result.language} · {result.duration_ms} ms
                  </p>
                </div>
                <a
                  className="palette-accent-text inline-flex items-center gap-1 text-sm font-medium"
                  href={`https://www.youtube.com/watch?v=${result.video_id}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open video <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
              <div className="mt-5 flex-1 overflow-auto whitespace-pre-wrap rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-7 text-slate-700 dark:border-[#606066] dark:bg-[#45454a] dark:text-slate-100">
                {result.transcript}
              </div>
              <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                Source: {formatSourceLabel(result)}
              </p>
            </section>
            <section
              aria-labelledby="youtube-summary-heading"
              className="flex min-h-[28rem] min-w-0 flex-col rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-[#606066] dark:bg-[#39393d]"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
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
                  <Copy className="h-4 w-4" /> Copy Markdown
                </Button>
              </div>
              <h2
                id="youtube-summary-heading"
                className="mt-3 text-2xl font-semibold tracking-tight"
              >
                Summary
              </h2>
              <MarkdownContent
                className="mt-5 flex-1 overflow-auto"
                value={result.summary}
              />
            </section>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center">
            <div className="max-w-xl text-center">
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-[2rem] bg-red-50 text-red-600 shadow-sm dark:bg-red-500/10 dark:text-red-300">
                <Video className={cn("h-9 w-9", loading && "animate-spin")} />
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
                <div className="mt-6 flex items-center justify-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-300">
                  <LoaderCircle className="h-4 w-4 animate-spin" /> Work in
                  progress....Transcribing and Summarization almost ready
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
