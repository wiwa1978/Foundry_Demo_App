import { Download, Loader2, Play, Settings2, Square, Video } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import type {
  TextToSpeechAvatarStatus,
  TextToSpeechAvatarType,
  TextToSpeechAvatarViewModel,
} from "./useTextToSpeechAvatar";

const statusLabels: Record<TextToSpeechAvatarStatus, string> = {
  idle: "Ready",
  submitting: "Submitting batch job",
  running: "Generating video",
  succeeded: "Video ready",
  failed: "Generation failed",
};
const controlClass =
  "h-10 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:border-violet-500 dark:border-[#606066] dark:bg-[#29292c]";

export function TextToSpeechAvatarWorkspace({
  configured,
  avatarType,
  character,
  style,
  voice,
  language,
  customVoiceEndpointId,
  customized,
  useBuiltInVoice,
  backgroundColor,
  backgroundImage,
  text,
  jobId,
  jobStatus,
  videoUrl,
  summaryUrl,
  status,
  error,
  setText,
  setAvatarType,
  setCharacter,
  setStyle,
  setVoice,
  setLanguage,
  setCustomVoiceEndpointId,
  setCustomized,
  setUseBuiltInVoice,
  setBackgroundColor,
  setBackgroundImage,
  start,
  stop,
}: TextToSpeechAvatarViewModel) {
  const busy = status === "submitting" || status === "running";

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-slate-100/70 dark:bg-[#303033]">
      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        <div className="mx-auto grid max-w-6xl gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(20rem,0.65fr)]">
          <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-[#606066] dark:bg-[#39393d]">
            <div className="border-b border-slate-200 px-6 py-5 dark:border-[#606066]">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Badge>Azure Speech</Badge>
                    <Badge variant="outline">Batch Avatar</Badge>
                  </div>
                  <h2 className="mt-3 text-2xl font-semibold tracking-tight">
                    Text to Speech Avatar
                  </h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">
                    Submit a script to Azure Speech and download the generated
                    talking-avatar video. This is the scripted content flow,
                    separate from conversational Voice Live.
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${
                      status === "succeeded"
                        ? "bg-emerald-500"
                        : busy
                          ? "bg-amber-500"
                          : status === "failed"
                            ? "bg-red-500"
                            : "bg-slate-300 dark:bg-slate-600"
                    }`}
                  />
                  {statusLabels[status]}
                </div>
              </div>
            </div>
            <div className="p-6">
              <div className="relative aspect-video overflow-hidden rounded-2xl bg-slate-950 shadow-inner">
                {videoUrl ? (
                  <video
                    className="h-full w-full object-contain"
                    controls
                    playsInline
                    src={videoUrl}
                    aria-label="Generated Azure Speech Text to Speech Avatar video"
                  >
                    <track
                      kind="captions"
                      src="data:text/vtt,WEBVTT%0A%0A"
                      srcLang={language || "en"}
                      label="Embedded captions"
                    />
                  </video>
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center text-slate-300">
                    {busy ? (
                      <Loader2 className="h-12 w-12 animate-spin text-violet-300" />
                    ) : (
                      <Video className="h-12 w-12 text-slate-500" />
                    )}
                    <p className="mt-4 text-sm">
                      {busy
                        ? `Azure Speech status: ${jobStatus || "Running"}`
                        : "Generate a video to preview the avatar here."}
                    </p>
                  </div>
                )}
              </div>
              {jobId ? (
                <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                  Batch job: <span className="font-mono">{jobId}</span>
                </p>
              ) : null}
              {videoUrl ? (
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <a
                    className="text-sm font-medium text-violet-700 hover:underline dark:text-violet-300"
                    href={videoUrl}
                    download="azure-speech-avatar.mp4"
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Download className="mr-1 inline h-4 w-4" />
                    Download MP4
                  </a>
                  {summaryUrl ? (
                    <a
                      className="text-xs text-slate-500 hover:underline dark:text-slate-400"
                      href={summaryUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      View synthesis summary
                    </a>
                  ) : null}
                </div>
              ) : null}
              {error ? (
                <p className="mt-3 text-xs text-red-600 dark:text-red-300">
                  {error}
                </p>
              ) : null}
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-[#606066] dark:bg-[#39393d]">
            <div className="flex items-center gap-2">
              <Settings2 className="h-4 w-4 text-violet-600 dark:text-violet-300" />
              <h3 className="font-semibold">Avatar configuration</h3>
            </div>
            <div className="mt-5 grid gap-4">
              <Field label="Avatar type">
                <select
                  aria-label="Avatar type"
                  className={controlClass}
                  value={avatarType}
                  disabled={busy}
                  onChange={(event) =>
                    setAvatarType(event.target.value as TextToSpeechAvatarType)
                  }
                >
                  <option value="video">Standard video avatar</option>
                  <option value="photo">Photo avatar</option>
                </select>
              </Field>
              <Field label="Character">
                <input
                  aria-label="Avatar character"
                  className={controlClass}
                  value={character}
                  disabled={busy}
                  onChange={(event) => setCharacter(event.target.value)}
                  placeholder={avatarType === "photo" ? "anika" : "lisa"}
                />
              </Field>
              {avatarType === "video" ? (
                <Field label="Style">
                  <input
                    aria-label="Avatar style"
                    className={controlClass}
                    value={style}
                    disabled={busy}
                    onChange={(event) => setStyle(event.target.value)}
                    placeholder="graceful-sitting"
                  />
                </Field>
              ) : null}
              <Field label="Speech voice">
                <input
                  aria-label="Speech voice"
                  className={controlClass}
                  value={voice}
                  disabled={busy}
                  onChange={(event) => setVoice(event.target.value)}
                  placeholder="en-US-Ava:DragonHDLatestNeural"
                />
              </Field>
              <Field label="Language">
                <input
                  aria-label="Speech language"
                  className={controlClass}
                  value={language}
                  disabled={busy}
                  onChange={(event) => setLanguage(event.target.value)}
                  placeholder="en-US"
                />
              </Field>
              <Field label="Custom voice deployment ID">
                <input
                  aria-label="Custom voice deployment ID"
                  className={controlClass}
                  value={customVoiceEndpointId}
                  disabled={busy}
                  onChange={(event) => setCustomVoiceEndpointId(event.target.value)}
                  placeholder="Optional limited-access custom voice"
                />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Background color">
                  <input
                    aria-label="Background color"
                    className={controlClass}
                    value={backgroundColor}
                    disabled={busy}
                    onChange={(event) => setBackgroundColor(event.target.value)}
                    placeholder="#FFFFFFFF"
                  />
                </Field>
                <Field label="Background image URL">
                  <input
                    aria-label="Background image URL"
                    className={controlClass}
                    value={backgroundImage}
                    disabled={busy}
                    onChange={(event) => setBackgroundImage(event.target.value)}
                    placeholder="Optional HTTPS image URL"
                  />
                </Field>
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                <input
                  type="checkbox"
                  checked={customized}
                  disabled={busy}
                  onChange={(event) => setCustomized(event.target.checked)}
                />
                Use a custom avatar deployment
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                <input
                  type="checkbox"
                  checked={useBuiltInVoice}
                  disabled={!customized || busy}
                  onChange={(event) => setUseBuiltInVoice(event.target.checked)}
                />
                Use the custom avatar&apos;s built-in voice
              </label>
            </div>
          </section>
        </div>
      </div>

      <div className="border-t bg-slate-50 px-4 py-3 dark:border-[#55555a] dark:bg-[#29292c]">
        <div className="palette-focus mx-auto flex max-w-6xl flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_1px_4px_rgba(15,23,42,0.16)] dark:border-[#606066] dark:bg-[#2f2f33] dark:shadow-none">
          <textarea
            aria-label="Avatar script"
            className="min-h-12 min-w-60 flex-1 resize-y rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-violet-500 dark:border-[#606066] dark:bg-[#29292c]"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Enter the script for the avatar..."
            rows={3}
          />
          {busy ? (
            <Button
              type="button"
              variant="outline"
              onClick={stop}
              className="shrink-0 rounded-full"
            >
              <Square className="h-4 w-4" /> Cancel job
            </Button>
          ) : (
            <Button
              type="button"
              onClick={() => void start()}
              disabled={!configured || !text.trim()}
              className="shrink-0 rounded-full"
            >
              <Play className="h-4 w-4" /> Generate video
            </Button>
          )}
        </div>
        {!configured ? (
          <p className="mx-auto mt-2 max-w-6xl text-xs text-amber-700 dark:text-amber-300">
            Configure AZURE_SPEECH_ENDPOINT to enable Text to Speech Avatar.
          </p>
        ) : null}
        <p className="mt-2 text-center text-xs text-slate-500 dark:text-slate-400">
          Batch avatar synthesis is available in supported paid Speech regions.
        </p>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="font-medium text-slate-700 dark:text-slate-200">
        {label}
      </span>
      {children}
    </label>
  );
}
