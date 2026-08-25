import { LoaderCircle, Upload, Video } from "lucide-react";

import { ComposerSelect } from "@/app/workspace/WorkspacePrimitives";
import { Button } from "@/components/ui/button";

import type { VideoTranslationResult } from "./api";

export function VideoTranslationWorkspace(p: {
  file: File | null; sourceLanguage: string; targetLanguage: string; voice: string;
  transcriptionModel: string; result: VideoTranslationResult | null; loading: boolean; error: string;
  onFileChange: (file: File | null) => void; onSourceLanguageChange: (v: string) => void;
  onTargetLanguageChange: (v: string) => void; onVoiceChange: (v: string) => void;
  onTranscriptionModelChange: (v: string) => void; onTranslate: () => void;
  transcriptionModels: string[];
}) {
  const languages = [{ value: "en", label: "English" }, { value: "es", label: "Spanish" },
    { value: "fr", label: "French" }, { value: "de", label: "German" }, { value: "nl", label: "Dutch" },
    { value: "it", label: "Italian" }, { value: "ja", label: "Japanese" }, { value: "zh", label: "Chinese" }];
  const voices = [{ value: "es-ES-ElviraNeural", label: "Elvira (Spanish)" }, { value: "en-US-Ava:DragonHDLatestNeural", label: "Ava (English)" },
    { value: "fr-FR-DeniseNeural", label: "Denise (French)" }, { value: "de-DE-KatjaNeural", label: "Katja (German)" },
    { value: "nl-NL-ColetteNeural", label: "Colette (Dutch)" }];
  const url = p.result ? `data:${p.result.video_mime_type};base64,${p.result.video_base64}` : "";
  return <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-5">
    <section className="rounded-3xl border bg-white p-6 shadow-sm dark:border-[#606066] dark:bg-[#39393d]">
      <div className="flex items-center gap-3"><Video className="h-7 w-7 text-blue-600" /><div><h2 className="text-xl font-semibold">Translate and dub your video</h2><p className="text-sm text-slate-500">Translate spoken content and apply AI voice dubbing across languages.</p></div></div>
      <label className="mt-5 flex cursor-pointer items-center justify-center rounded-2xl border-2 border-dashed p-8 text-sm"><Upload className="mr-2 h-5 w-5" />{p.file?.name ?? "Upload a video (MP4, MOV, WebM, MKV, AVI; max 100 MB)"}<input className="hidden" type="file" accept="video/*" onChange={e => p.onFileChange(e.target.files?.[0] ?? null)} /></label>
      <div className="mt-4 grid gap-3 md:grid-cols-4"><ComposerSelect id="video-source-language" ariaLabel="Source language" value={p.sourceLanguage} onChange={p.onSourceLanguageChange} options={[{ value: "auto", label: "Auto detect" }, ...languages]} /><ComposerSelect id="video-target-language" ariaLabel="Target language" value={p.targetLanguage} onChange={p.onTargetLanguageChange} options={languages} /><ComposerSelect id="video-voice" ariaLabel="Dubbing voice" value={p.voice} onChange={p.onVoiceChange} options={voices} />{p.transcriptionModels.length ? <ComposerSelect id="video-transcription-model" ariaLabel="Transcription model" value={p.transcriptionModel} onChange={p.onTranscriptionModelChange} options={p.transcriptionModels.map(v => ({ value: v, label: v }))} /> : null}</div>
      <Button className="mt-4" disabled={!p.file || p.loading} onClick={p.onTranslate}>{p.loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Video className="h-4 w-4" />}{p.loading ? "Translating..." : "Start video translation"}</Button>
      {p.error ? <p className="mt-3 text-sm text-red-600">{p.error}</p> : null}
    </section>
    {p.result ? <div className="grid gap-4 lg:grid-cols-2"><section className="rounded-3xl border bg-white p-5 dark:border-[#606066] dark:bg-[#39393d]"><h3 className="font-semibold">Transcript</h3><p className="mt-3 whitespace-pre-wrap text-sm">{p.result.transcript}</p><h3 className="mt-5 font-semibold">Translated text</h3><p className="mt-3 whitespace-pre-wrap text-sm">{p.result.translated_text}</p></section><section className="rounded-3xl border bg-white p-5 dark:border-[#606066] dark:bg-[#39393d]"><h3 className="font-semibold">Dubbed video</h3><video className="mt-3 w-full rounded-xl" controls src={url}><track kind="captions" label="Translated captions" srcLang={p.result.target_language} src="data:text/vtt,WEBVTT" /></video><a className="mt-3 inline-block text-sm text-blue-600 underline" download="translated-video.mp4" href={url}>Download dubbed video</a></section></div> : null}
  </div>;
}
