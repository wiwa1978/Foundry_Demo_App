/* eslint-disable jsx-a11y/media-has-caption */
import { Download, FileAudio, LoaderCircle, Upload, Video } from "lucide-react";
import { type ReactNode } from "react";

import { ComposerSelect } from "@/app/workspace/WorkspacePrimitives";
import { Button } from "@/components/ui/button";

import type { CaptioningResult, DubbingResult } from "./api";

const languages = [
  { value: "en-US", label: "English" },
  { value: "es-ES", label: "Spanish" },
  { value: "fr-FR", label: "French" },
  { value: "de-DE", label: "German" },
  { value: "nl-NL", label: "Dutch" },
  { value: "it-IT", label: "Italian" },
  { value: "ja-JP", label: "Japanese" },
  { value: "zh-CN", label: "Chinese" },
];

const voices = [
  { value: "es-ES-ElviraNeural", label: "Elvira (Spanish)" },
  { value: "en-US-Ava:DragonHDLatestNeural", label: "Ava (English)" },
  { value: "fr-FR-DeniseNeural", label: "Denise (French)" },
  { value: "de-DE-KatjaNeural", label: "Katja (German)" },
  { value: "nl-NL-ColetteNeural", label: "Colette (Dutch)" },
];

const sourceLanguages = [{ value: "auto", label: "Auto detect" }, ...languages];

function downloadUrl(content: string, mimeType: string) {
  return `data:${mimeType};charset=utf-8,${encodeURIComponent(content)}`;
}

export function MediaBottomComposer(p: {
  file: File | null;
  loading: boolean;
  disabled: boolean;
  error: string;
  accept: string;
  uploadIdleLabel: string;
  actionLabel: string;
  loadingLabel: string;
  onFileChange: (file: File | null) => void;
  onAction: () => void;
  children: ReactNode;
}) {
  return (
    <div className="border-t bg-slate-50 px-4 py-3 dark:border-[#55555a] dark:bg-[#29292c]">
      <div className="palette-focus mx-auto max-w-5xl rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_1px_4px_rgba(15,23,42,0.16)] transition dark:border-[#606066] dark:bg-[#2f2f33] dark:shadow-none">
        <label className="flex cursor-pointer items-center justify-center rounded-2xl border border-dashed border-slate-300 px-4 py-3 text-sm text-slate-600 dark:border-[#606066] dark:text-slate-300">
          <Upload className="mr-2 h-4 w-4" />
          {p.file?.name ?? p.uploadIdleLabel}
          <input
            className="hidden"
            type="file"
            accept={p.accept}
            onChange={(event) =>
              p.onFileChange(event.target.files?.[0] ?? null)
            }
          />
        </label>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
            {p.children}
          </div>
          <Button
            type="button"
            disabled={p.disabled}
            onClick={p.onAction}
            className="rounded-full"
          >
            {p.loading ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <FileAudio className="h-4 w-4" />
            )}
            {p.loading ? p.loadingLabel : p.actionLabel}
          </Button>
        </div>
      </div>
      {p.error ? (
        <p className="mt-2 text-center text-xs text-red-600 dark:text-red-300">
          {p.error}
        </p>
      ) : null}
    </div>
  );
}

export function CaptioningWorkspace(p: {
  file: File | null;
  language: string;
  transcriptionModel: string;
  result: CaptioningResult | null;
  loading: boolean;
  error: string;
  onFileChange: (file: File | null) => void;
  onLanguageChange: (value: string) => void;
  onTranscriptionModelChange: (value: string) => void;
  onCaption: () => void;
  transcriptionModels: string[];
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 overflow-auto p-5">
        <div className="mx-auto grid max-w-5xl gap-4">
          <section className="rounded-3xl border bg-white p-6 shadow-sm dark:border-[#606066] dark:bg-[#39393d]">
            <div className="flex items-center gap-3">
              <Video className="h-7 w-7 text-blue-600" />
              <div>
                <h2 className="text-xl font-semibold">Captioning</h2>
                <p className="text-sm text-slate-500">
                  Create real timed captions with Azure Speech.
                </p>
              </div>
            </div>
          </section>
          {p.result ? (
            <section className="rounded-3xl border bg-white p-5 dark:border-[#606066] dark:bg-[#39393d]">
              <h3 className="font-semibold">Timed caption files</h3>
              <p className="mt-2 whitespace-pre-wrap text-sm">
                {p.result.transcript}
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <a
                  className="inline-flex items-center gap-2 text-sm text-blue-600 underline"
                  download="captions.vtt"
                  href={downloadUrl(p.result.webvtt, "text/vtt")}
                >
                  <Download className="h-4 w-4" />
                  Download WebVTT
                </a>
                <a
                  className="inline-flex items-center gap-2 text-sm text-blue-600 underline"
                  download="captions.srt"
                  href={downloadUrl(p.result.srt, "application/x-subrip")}
                >
                  <Download className="h-4 w-4" />
                  Download SRT
                </a>
              </div>
              <pre className="mt-4 max-h-72 overflow-auto rounded-xl bg-slate-100 p-3 text-xs dark:bg-slate-800">
                {p.result.webvtt}
              </pre>
            </section>
          ) : null}
        </div>
      </div>
      <MediaBottomComposer
        file={p.file}
        loading={p.loading}
        disabled={!p.file || p.loading}
        error={p.error}
        accept="audio/*,video/*"
        uploadIdleLabel="Upload audio or video (max 100 MB)"
        actionLabel="Create captions"
        loadingLabel="Creating captions..."
        onFileChange={p.onFileChange}
        onAction={p.onCaption}
      >
        <ComposerSelect
          id="captioning-language"
          ariaLabel="Caption language"
          value={p.language}
          onChange={p.onLanguageChange}
          options={languages}
        />
        {p.transcriptionModels.length ? (
          <ComposerSelect
            id="captioning-model"
            ariaLabel="Caption transcription model"
            value={p.transcriptionModel}
            onChange={p.onTranscriptionModelChange}
            options={p.transcriptionModels.map((value) => ({
              value,
              label: value,
            }))}
          />
        ) : null}
      </MediaBottomComposer>
    </div>
  );
}

export function DubbingWorkspace(p: {
  file: File | null;
  sourceLanguage: string;
  targetLanguage: string;
  voice: string;
  transcriptionModel: string;
  result: DubbingResult | null;
  loading: boolean;
  error: string;
  onFileChange: (file: File | null) => void;
  onSourceLanguageChange: (value: string) => void;
  onTargetLanguageChange: (value: string) => void;
  onVoiceChange: (value: string) => void;
  onTranscriptionModelChange: (value: string) => void;
  onDub: () => void;
  transcriptionModels: string[];
}) {
  const audioUrl = p.result
    ? `data:${p.result.audio_mime_type};base64,${p.result.audio_base64}`
    : "";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 overflow-auto p-5">
        <div className="mx-auto grid max-w-5xl gap-4">
          <section className="rounded-3xl border bg-white p-6 shadow-sm dark:border-[#606066] dark:bg-[#39393d]">
            <div className="flex items-center gap-3">
              <FileAudio className="h-7 w-7 text-blue-600" />
              <div>
                <h2 className="text-xl font-semibold">Dubbing</h2>
                <p className="text-sm text-slate-500">
                  Translate speech and create a separate dubbed audio track. No
                  captions are generated.
                </p>
              </div>
            </div>
          </section>
          {p.result ? (
            <section className="rounded-3xl border bg-white p-5 dark:border-[#606066] dark:bg-[#39393d]">
              <h3 className="font-semibold">Translated audio</h3>
              <p className="mt-3 whitespace-pre-wrap text-sm">
                {p.result.translated_text}
              </p>
              <audio className="mt-4 w-full" controls src={audioUrl} />
              <a
                className="mt-3 inline-flex items-center gap-2 text-sm text-blue-600 underline"
                download="dubbed-audio.mp3"
                href={audioUrl}
              >
                <Download className="h-4 w-4" />
                Download dubbed audio
              </a>
            </section>
          ) : null}
        </div>
      </div>
      <MediaBottomComposer
        file={p.file}
        loading={p.loading}
        disabled={!p.file || p.loading}
        error={p.error}
        accept="audio/*,video/*"
        uploadIdleLabel="Upload audio or video (max 100 MB)"
        actionLabel="Create dubbed audio"
        loadingLabel="Creating dubbed audio..."
        onFileChange={p.onFileChange}
        onAction={p.onDub}
      >
        <ComposerSelect
          id="dubbing-source-language"
          ariaLabel="Dubbing source language"
          value={p.sourceLanguage}
          onChange={p.onSourceLanguageChange}
          options={sourceLanguages}
        />
        <ComposerSelect
          id="dubbing-target-language"
          ariaLabel="Dubbing target language"
          value={p.targetLanguage}
          onChange={p.onTargetLanguageChange}
          options={languages}
        />
        <ComposerSelect
          id="dubbing-voice"
          ariaLabel="Dubbing voice"
          value={p.voice}
          onChange={p.onVoiceChange}
          options={voices}
        />
        {p.transcriptionModels.length ? (
          <ComposerSelect
            id="dubbing-model"
            ariaLabel="Dubbing transcription model"
            value={p.transcriptionModel}
            onChange={p.onTranscriptionModelChange}
            options={p.transcriptionModels.map((value) => ({
              value,
              label: value,
            }))}
          />
        ) : null}
      </MediaBottomComposer>
    </div>
  );
}
