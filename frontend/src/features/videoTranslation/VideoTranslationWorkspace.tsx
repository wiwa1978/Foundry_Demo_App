/* eslint-disable jsx-a11y/media-has-caption */
import { Video } from "lucide-react";

import { ComposerSelect } from "@/app/workspace/WorkspacePrimitives";

import type { VideoTranslationResult } from "./api";
import { MediaBottomComposer } from "./MediaTranslationWorkspaces";

export function VideoTranslationWorkspace(p: {
  file: File | null;
  sourceLanguage: string;
  targetLanguage: string;
  voice: string;
  transcriptionModel: string;
  result: VideoTranslationResult | null;
  loading: boolean;
  error: string;
  onFileChange: (file: File | null) => void;
  onSourceLanguageChange: (v: string) => void;
  onTargetLanguageChange: (v: string) => void;
  onVoiceChange: (v: string) => void;
  onTranscriptionModelChange: (v: string) => void;
  onTranslate: () => void;
  transcriptionModels: string[];
}) {
  const languages = [
    { value: "en", label: "English" },
    { value: "es", label: "Spanish" },
    { value: "fr", label: "French" },
    { value: "de", label: "German" },
    { value: "nl", label: "Dutch" },
    { value: "it", label: "Italian" },
    { value: "ja", label: "Japanese" },
    { value: "zh", label: "Chinese" },
  ];
  const voices = [
    { value: "es-ES-ElviraNeural", label: "Elvira (Spanish)" },
    { value: "en-US-Ava:DragonHDLatestNeural", label: "Ava (English)" },
    { value: "fr-FR-DeniseNeural", label: "Denise (French)" },
    { value: "de-DE-KatjaNeural", label: "Katja (German)" },
    { value: "nl-NL-ColetteNeural", label: "Colette (Dutch)" },
  ];
  const url = p.result
    ? `data:${p.result.video_mime_type};base64,${p.result.video_base64}`
    : "";
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 overflow-auto p-5">
        <div className="mx-auto grid max-w-5xl gap-4">
          <section className="rounded-3xl border bg-white p-6 shadow-sm dark:border-[#606066] dark:bg-[#39393d]">
            <div className="flex items-center gap-3">
              <Video className="h-7 w-7 text-blue-600" />
              <div>
                <h2 className="text-xl font-semibold">Video Translation</h2>
                <p className="text-sm text-slate-500">
                  Prototype custom pipeline: translate speech, synthesize a
                  dubbed track, and mux it into the video.
                </p>
              </div>
            </div>
            <p className="mt-4 text-xs text-slate-500">
              This workspace does not use the dedicated Azure Video Translation
              API; it uses the app&apos;s custom prototype pipeline.
            </p>
          </section>
          {p.result ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <section className="rounded-3xl border bg-white p-5 dark:border-[#606066] dark:bg-[#39393d]">
                <h3 className="font-semibold">Transcript</h3>
                <p className="mt-3 whitespace-pre-wrap text-sm">
                  {p.result.transcript}
                </p>
                <h3 className="mt-5 font-semibold">Translated text</h3>
                <p className="mt-3 whitespace-pre-wrap text-sm">
                  {p.result.translated_text}
                </p>
              </section>
              <section className="rounded-3xl border bg-white p-5 dark:border-[#606066] dark:bg-[#39393d]">
                <h3 className="font-semibold">Custom dubbed video</h3>
                <video className="mt-3 w-full rounded-xl" controls src={url} />
                <a
                  className="mt-3 inline-block text-sm text-blue-600 underline"
                  download="translated-video.mp4"
                  href={url}
                >
                  Download translated video
                </a>
              </section>
            </div>
          ) : null}
        </div>
      </div>
      <MediaBottomComposer
        file={p.file}
        loading={p.loading}
        disabled={!p.file || p.loading}
        error={p.error}
        accept="video/*"
        uploadIdleLabel="Upload a video (MP4, MOV, WebM, MKV, AVI; max 100 MB)"
        actionLabel="Create translated video"
        loadingLabel="Creating translated video..."
        onFileChange={p.onFileChange}
        onAction={p.onTranslate}
      >
        <ComposerSelect
          id="video-source-language"
          ariaLabel="Source language"
          value={p.sourceLanguage}
          onChange={p.onSourceLanguageChange}
          options={[{ value: "auto", label: "Auto detect" }, ...languages]}
        />
        <ComposerSelect
          id="video-target-language"
          ariaLabel="Target language"
          value={p.targetLanguage}
          onChange={p.onTargetLanguageChange}
          options={languages}
        />
        <ComposerSelect
          id="video-voice"
          ariaLabel="Dubbing voice"
          value={p.voice}
          onChange={p.onVoiceChange}
          options={voices}
        />
        {p.transcriptionModels.length ? (
          <ComposerSelect
            id="video-transcription-model"
            ariaLabel="Transcription model"
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
