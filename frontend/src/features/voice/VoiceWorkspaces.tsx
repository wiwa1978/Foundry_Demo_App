import {
  Copy,
  Download,
  LoaderCircle,
  Mic,
  MicOff,
  UploadCloud,
  Volume2,
} from "lucide-react";
import { type RefObject, useEffect, useRef, useState } from "react";

import {
  liveTranslationLanguages,
  liveTranslationSourceLanguages,
} from "@/app/workspace/constants";
import type {
  TraditionalVoiceResult,
  TraditionalVoiceStatus,
  TranscriptionResult,
} from "@/app/workspace/contracts";
import { formatModelName } from "@/app/workspace/formatters";
import { mapStoredMessage } from "@/app/workspace/messageUtils";
import { ComposerSelect } from "@/app/workspace/WorkspacePrimitives";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SoundWaveIcon } from "@/features/shared/SoundWaveIcon";
import { ChatBubble } from "@/features/textChat/ChatMessages";
import { downloadText } from "@/features/voice/audioUtils";
import type {
  LiveTranslationMode,
  RealtimeStatus,
  RealtimeTranscriptEntry,
} from "@/features/voice/types";
import { cn } from "@/lib/utils";

function formatVttTime(durationMs: number) {
  const totalSeconds = Math.max(1, Math.ceil(durationMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.000`;
}

export function TraditionalVoiceWorkspace({
  configured,
  activeModel,
  chatModels,
  onChatModelChange,
  transcriptionModels,
  transcriptionModel,
  onTranscriptionModelChange,
  ttsModels,
  ttsModel,
  onTtsModelChange,
  ttsVoice,
  ttsVoices,
  onTtsVoiceChange,
  status,
  error,
  result,
  onStart,
  onStop,
}: {
  configured: boolean;
  activeModel: string;
  chatModels: string[];
  onChatModelChange: (model: string) => void;
  transcriptionModels: string[];
  transcriptionModel: string;
  onTranscriptionModelChange: (model: string) => void;
  ttsModels: string[];
  ttsModel: string;
  onTtsModelChange: (model: string) => void;
  ttsVoice: string;
  ttsVoices: string[];
  onTtsVoiceChange: (voice: string) => void;
  status: TraditionalVoiceStatus;
  error: string;
  result: TraditionalVoiceResult | null;
  onStart: () => void;
  onStop: () => void;
}) {
  const isRecording = status === "recording";
  const isProcessing = status === "processing";
  const playingAudioRef = useRef<HTMLAudioElement | null>(null);
  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null);
  const actionLabel = isRecording
    ? "Stop recording"
    : isProcessing
      ? "Processing..."
      : result
        ? "Record again"
        : "Record voice prompt";

  useEffect(
    () => () => {
      playingAudioRef.current?.pause();
      playingAudioRef.current = null;
    },
    [],
  );

  function playSpeech(messageId: string, audioUrl: string) {
    if (playingAudioRef.current) {
      return;
    }
    const audio = new Audio(audioUrl);
    playingAudioRef.current = audio;
    setPlayingMessageId(messageId);
    const finish = () => {
      if (playingAudioRef.current === audio) {
        playingAudioRef.current = null;
        setPlayingMessageId(null);
      }
    };
    audio.addEventListener("ended", finish, { once: true });
    audio.addEventListener("error", finish, { once: true });
    void audio.play().catch(finish);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-slate-100/70 dark:bg-[#303033]">
      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        {!result ? (
          <div className="flex min-h-full items-center justify-center">
            <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-[#606066] dark:bg-[#39393d]">
              <DictationHero active={isRecording || isProcessing} />
              <h3 className="mt-4 text-2xl font-semibold tracking-tight">
                Start a voice conversation
              </h3>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500 dark:text-slate-400">
                Record a prompt, transcribe it with{" "}
                {formatModelName(transcriptionModel)}, ask{" "}
                {formatModelName(activeModel)}, and hear the answer in the{" "}
                {formatModelName(ttsVoice)} voice.
              </p>
            </div>
          </div>
        ) : (
          <div className="mx-auto grid max-w-4xl gap-6 py-4">
            <ChatBubble
              message={{
                ...mapStoredMessage(result.user_message),
                content: result.transcription.text,
              }}
            />
            {result.results.map((variant) => {
              const audioUrl = variant.speech
                ? `data:${variant.speech.audio_mime_type};base64,${variant.speech.audio_base64}`
                : "";
              return (
                <div key={variant.assistant_message.id} className="grid gap-2">
                  <ChatBubble
                    message={mapStoredMessage(variant.assistant_message)}
                  />
                  <div className="ml-11 flex flex-wrap items-center gap-2">
                    {audioUrl ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="rounded-full"
                        disabled={playingMessageId !== null}
                        onClick={() =>
                          playSpeech(variant.assistant_message.id, audioUrl)
                        }
                      >
                        <Volume2 className="h-4 w-4" />{" "}
                        {playingMessageId === variant.assistant_message.id
                          ? "Playing..."
                          : "Play TTS"}
                      </Button>
                    ) : variant.speech_error ? (
                      <p className="text-xs text-red-600 dark:text-red-300">
                        {variant.speech_error}
                      </p>
                    ) : null}
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {variant.duration_ms ?? 0} ms chat
                      {variant.speech
                        ? ` · ${variant.speech.duration_ms} ms TTS`
                        : ""}
                    </span>
                  </div>
                  {variant.speech?.spoken_transcript &&
                  variant.speech.spoken_transcript !== variant.content ? (
                    <p className="ml-11 text-xs text-amber-700 dark:text-amber-300">
                      Spoken transcript: {variant.speech.spoken_transcript}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="border-t bg-slate-50 px-4 py-3 dark:border-[#55555a] dark:bg-[#29292c]">
        <div className="palette-focus mx-auto max-w-5xl rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_1px_4px_rgba(15,23,42,0.16)] dark:border-[#606066] dark:bg-[#2f2f33] dark:shadow-none">
          <div className="flex flex-wrap items-center gap-2">
            <ComposerSelect
              id="voice-stt"
              ariaLabel="STT model"
              value={transcriptionModel}
              onChange={onTranscriptionModelChange}
              options={transcriptionModels.map((model) => ({
                value: model,
                label: `STT · ${formatModelName(model)}`,
              }))}
              disabled={isRecording || isProcessing}
            />
            <ComposerSelect
              id="voice-chat"
              ariaLabel="Chat model"
              value={activeModel}
              onChange={onChatModelChange}
              options={chatModels.map((model) => ({
                value: model,
                label: `Chat · ${formatModelName(model)}`,
              }))}
              disabled={isRecording || isProcessing}
            />
            <ComposerSelect
              id="voice-tts"
              ariaLabel="TTS model"
              value={ttsModel}
              onChange={onTtsModelChange}
              options={ttsModels.map((model) => ({
                value: model,
                label: `TTS · ${formatModelName(model)}`,
              }))}
              disabled={isRecording || isProcessing}
            />
            <ComposerSelect
              id="voice-name"
              ariaLabel="TTS voice"
              value={ttsVoice}
              onChange={onTtsVoiceChange}
              options={ttsVoices.map((voice) => ({
                value: voice,
                label: `Voice · ${formatModelName(voice)}`,
              }))}
              disabled={isRecording || isProcessing}
            />
            <Button
              type="button"
              onClick={isRecording ? onStop : onStart}
              disabled={
                !configured ||
                isProcessing ||
                !activeModel ||
                !transcriptionModel ||
                !ttsModel
              }
              variant={isRecording ? "destructive" : "default"}
              className="ml-auto rounded-full px-5"
            >
              {isRecording ? (
                <MicOff className="h-4 w-4" />
              ) : (
                <Mic className="h-4 w-4" />
              )}{" "}
              {actionLabel}
            </Button>
          </div>
          {!configured ? (
            <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
              Configure Foundry STT and TTS deployments to enable recording.
            </p>
          ) : null}
          {error ? (
            <p className="mt-2 text-xs text-red-600 dark:text-red-300">
              {error}
            </p>
          ) : null}
        </div>
        <p className="mt-2 text-center text-xs text-slate-500 dark:text-slate-400">
          AI-generated content may be incorrect
        </p>
      </div>
    </div>
  );
}

export function SidebarPipelineSelect({
  label,
  value,
  models,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  models: string[];
  onChange: (model: string) => void;
  disabled: boolean;
}) {
  const id = `traditional-${label.toLowerCase().replace(/ /g, "-")}`;
  return (
    <div className="grid gap-2">
      <Label htmlFor={id} className="palette-heading">
        {label}
      </Label>
      <Select
        value={value}
        onValueChange={onChange}
        disabled={disabled || models.length === 0}
      >
        <SelectTrigger
          id={id}
          className="h-9 w-full dark:border-[#606066] dark:bg-[#29292c]"
        >
          <SelectValue placeholder={`No ${label.toLowerCase()} deployments`} />
        </SelectTrigger>
        <SelectContent position="popper" align="start">
          {models.map((model) => (
            <SelectItem key={model} value={model}>
              {formatModelName(model)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function TranscriptionWorkspace({
  configured,
  model,
  status,
  error,
  result,
  language,
  sourceName,
  audioUrl,
  fileInputRef,
  onLanguageChange,
  onStart,
  onStop,
  onFileSelected,
}: {
  configured: boolean;
  model: string;
  status: TraditionalVoiceStatus;
  error: string;
  result: TranscriptionResult | null;
  language: string;
  sourceName: string;
  audioUrl: string;
  fileInputRef: RefObject<HTMLInputElement>;
  onLanguageChange: (value: string) => void;
  onStart: () => void;
  onStop: () => void;
  onFileSelected: (file: File | undefined) => void;
}) {
  const isRecording = status === "recording";
  const isProcessing = status === "processing";
  const usesAzureSpeech = model.toLowerCase().startsWith("mai-transcribe");

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 overflow-auto p-5">
        {result ? (
          <div className="mx-auto grid max-w-4xl gap-3">
            <div className="ml-auto w-full max-w-2xl rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm dark:border-[#606066] dark:bg-[#45454a]">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  {sourceName}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {result.language} · {result.duration_ms} ms
                </div>
              </div>
              {audioUrl ? (
                <audio
                  className="w-full"
                  controls
                  preload="metadata"
                  src={audioUrl}
                >
                  <track
                    default
                    kind="captions"
                    label="Transcription"
                    src={`data:text/vtt;charset=utf-8,${encodeURIComponent(
                      `WEBVTT\n\n00:00:00.000 --> ${formatVttTime(result.duration_ms)}\n${result.text}`,
                    )}`}
                    srcLang={result.language}
                  />
                </audio>
              ) : null}
              <div className="mt-4 border-t border-slate-200 pt-4 dark:border-[#606066]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Transcription
                  </span>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        void navigator.clipboard.writeText(result.text)
                      }
                    >
                      <Copy className="h-4 w-4" /> Copy
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        downloadText(result.text, "transcript.txt")
                      }
                    >
                      <Download className="h-4 w-4" /> Download
                    </Button>
                  </div>
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-800 dark:text-slate-100">
                  {result.text}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center">
            <div className="max-w-lg rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-[#606066] dark:bg-[#39393d]">
              <DictationHero active={isRecording || isProcessing} />
              <Badge variant="outline">
                {usesAzureSpeech ? "Azure Speech" : "Foundry Audio"}
              </Badge>
              <h3 className="mt-3 text-2xl font-semibold tracking-tight">
                Recorded audio transcription
              </h3>
              <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
                Record or upload audio below to transcribe it with{" "}
                <span className="font-medium text-slate-700 dark:text-slate-200">
                  {formatModelName(model)}
                </span>
                .
              </p>
              {isProcessing ? (
                <div className="mt-5 flex items-center justify-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                  <LoaderCircle className="h-4 w-4 animate-spin" /> Transcribing{" "}
                  {sourceName}...
                </div>
              ) : null}
            </div>
          </div>
        )}
      </div>

      <div className="border-t bg-slate-50 px-4 py-3 dark:border-[#55555a] dark:bg-[#29292c]">
        <div className="palette-focus mx-auto flex max-w-5xl flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_1px_4px_rgba(15,23,42,0.16)] dark:border-[#606066] dark:bg-[#2f2f33] dark:shadow-none sm:flex-row sm:items-end">
          <Label className="grid min-w-0 flex-1 gap-2 text-xs text-slate-500 dark:text-slate-400">
            Recognition language
            <select
              value={language}
              onChange={(event) => onLanguageChange(event.target.value)}
              disabled={isRecording || isProcessing}
              className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 dark:border-[#606066] dark:bg-[#29292c] dark:text-slate-100"
            >
              <option value="en-US">English (United States)</option>
              <option value="en-GB">English (United Kingdom)</option>
              <option value="nl-NL">Dutch (Netherlands)</option>
              <option value="nl-BE">Dutch (Belgium)</option>
              <option value="fr-BE">French (Belgium)</option>
              <option value="fr-FR">French (France)</option>
              <option value="de-DE">German (Germany)</option>
              <option value="es-ES">Spanish (Spain)</option>
            </select>
          </Label>
          <Button
            type="button"
            onClick={isRecording ? onStop : onStart}
            disabled={!configured || isProcessing}
            variant={isRecording ? "destructive" : "default"}
          >
            {isRecording ? (
              <MicOff className="h-4 w-4" />
            ) : (
              <Mic className="h-4 w-4" />
            )}
            {isRecording
              ? "Stop recording"
              : isProcessing
                ? "Transcribing..."
                : "Record audio"}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!configured || isRecording || isProcessing}
            onClick={() => fileInputRef.current?.click()}
          >
            <UploadCloud className="h-4 w-4" /> Upload audio
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*,.mp3,.wav,.ogg,.webm,.m4a"
            className="hidden"
            onChange={(event) => {
              onFileSelected(event.target.files?.[0]);
              event.currentTarget.value = "";
            }}
          />
        </div>
        {!configured ? (
          <p className="mt-2 text-center text-xs text-amber-700 dark:text-amber-300">
            {usesAzureSpeech
              ? "Set AZURE_SPEECH_ENDPOINT and grant the app identity Cognitive Services Speech User access."
              : "Configure the Foundry project endpoint and grant the app identity access to the selected deployment."}
          </p>
        ) : null}
        {error ? (
          <p className="mt-2 text-center text-xs text-red-600 dark:text-red-300">
            {error}
          </p>
        ) : null}
        <p className="mt-2 text-center text-xs text-slate-500 dark:text-slate-400">
          Audio is processed by{" "}
          {usesAzureSpeech ? "Azure Speech" : formatModelName(model)} to
          generate the transcription
        </p>
      </div>
    </div>
  );
}

export function TranscriptionComparisonWorkspace({
  configured,
  models,
  status,
  error,
  results,
  modelErrors,
  pendingModels,
  language,
  sourceName,
  audioUrl,
  fileInputRef,
  onLanguageChange,
  onStart,
  onStop,
  onFileSelected,
}: {
  configured: boolean;
  models: string[];
  status: TraditionalVoiceStatus;
  error: string;
  results: Record<string, TranscriptionResult[]>;
  modelErrors: Record<string, string>;
  pendingModels: Set<string>;
  language: string;
  sourceName: string;
  audioUrl: string;
  fileInputRef: RefObject<HTMLInputElement>;
  onLanguageChange: (value: string) => void;
  onStart: () => void;
  onStop: () => void;
  onFileSelected: (file: File | undefined) => void;
}) {
  const isRecording = status === "recording";
  const isProcessing = status === "processing";
  const captionResult = Object.values(results)[0]?.at(-1);

  if (!models.length) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-center">
        <div className="max-w-md">
          <SoundWaveIcon className="mx-auto mb-4 h-10 gap-1 text-slate-300 dark:text-[#77777d]" />
          <h3 className="text-lg font-semibold">
            Select transcription models to compare
          </h3>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            Turn on two or more transcription deployments in the comparison
            list.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-slate-100/70 dark:bg-[#303033]">
      <div className="flex-1 overflow-x-auto p-4">
        <div
          className="grid h-full min-w-[44rem] gap-4"
          style={{
            gridTemplateColumns: `repeat(${models.length}, minmax(20rem, 1fr))`,
          }}
        >
          {models.map((model) => {
            const modelResults = results[model] ?? [];
            const latestResult = modelResults.at(-1);
            const modelError = modelErrors[model];
            const isModelPending = pendingModels.has(model);
            return (
              <article
                key={model}
                className="flex min-h-0 flex-col overflow-hidden rounded-2xl border bg-white shadow-sm dark:border-[#606066] dark:bg-[#39393d]"
              >
                <header className="flex h-16 items-center justify-between gap-3 border-b px-4 dark:border-[#55555a]">
                  <h3 className="truncate text-sm font-semibold" title={model}>
                    {formatModelName(model)}
                  </h3>
                  {latestResult ? (
                    <Badge variant="outline" className="shrink-0">
                      {latestResult.duration_ms} ms
                    </Badge>
                  ) : null}
                </header>
                <div className="flex min-h-0 flex-1 overflow-auto bg-slate-50 p-5 dark:bg-[#303033]">
                  {modelResults.length ? (
                    <div className="grid w-full content-start gap-4">
                      {isModelPending ? (
                        <div className="flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-700 dark:border-violet-500/30 dark:bg-violet-950/20 dark:text-violet-200">
                          <LoaderCircle className="h-4 w-4 animate-spin" />
                          Transcribing {sourceName}...
                        </div>
                      ) : null}
                      {modelResults.map((result, index) => (
                        <section
                          key={`${model}-${index}-${result.duration_ms}`}
                          className="rounded-2xl border bg-white p-4 shadow-sm dark:border-[#606066] dark:bg-[#29292c]"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                              Transcription {index + 1}
                            </span>
                            <div className="flex gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  void navigator.clipboard.writeText(
                                    result.text,
                                  )
                                }
                              >
                                <Copy className="h-4 w-4" /> Copy
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  downloadText(
                                    result.text,
                                    `${model}-transcript-${index + 1}.txt`,
                                  )
                                }
                              >
                                <Download className="h-4 w-4" /> Download
                              </Button>
                            </div>
                          </div>
                          <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-slate-800 dark:text-slate-100">
                            {result.text}
                          </p>
                          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                            {result.duration_ms} ms
                          </p>
                        </section>
                      ))}
                    </div>
                  ) : modelError ? (
                    <div className="m-auto max-w-xs text-center">
                      <SoundWaveIcon className="mx-auto mb-3 h-8 gap-1 text-red-400" />
                      <h4 className="text-sm font-semibold text-red-700 dark:text-red-300">
                        Transcription failed
                      </h4>
                      <p className="mt-2 text-xs leading-5 text-red-600 dark:text-red-300">
                        {modelError}
                      </p>
                    </div>
                  ) : isModelPending ? (
                    <div className="m-auto max-w-xs text-center">
                      <LoaderCircle className="mx-auto mb-3 h-8 w-8 animate-spin text-violet-500" />
                      <h4 className="text-sm font-semibold">
                        Transcribing with {formatModelName(model)}
                      </h4>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        Processing {sourceName}...
                      </p>
                    </div>
                  ) : (
                    <div className="m-auto max-w-xs text-center">
                      <SoundWaveIcon className="mx-auto mb-3 h-8 gap-1 text-slate-300 dark:text-[#77777d]" />
                      <h4 className="text-sm font-semibold">
                        Ready for {formatModelName(model)}
                      </h4>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        The same recording will be submitted to every selected
                        model.
                      </p>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </div>
      {audioUrl ? (
        <div className="border-t bg-white px-4 py-3 dark:border-[#55555a] dark:bg-[#29292c]">
          <div className="mx-auto flex max-w-5xl items-center gap-4">
            <span
              className="max-w-48 truncate text-xs font-medium"
              title={sourceName}
            >
              {sourceName}
            </span>
            <audio
              className="h-9 min-w-0 flex-1"
              controls
              preload="metadata"
              src={audioUrl}
            >
              <track
                default
                kind="captions"
                label="Transcription"
                src={`data:text/vtt;charset=utf-8,${encodeURIComponent(
                  captionResult
                    ? `WEBVTT\n\n00:00:00.000 --> ${formatVttTime(captionResult.duration_ms)}\n${captionResult.text}`
                    : "WEBVTT\n",
                )}`}
                srcLang={captionResult?.language ?? language}
              />
            </audio>
          </div>
        </div>
      ) : null}
      <div className="border-t bg-slate-50 px-4 py-3 dark:border-[#55555a] dark:bg-[#29292c]">
        <div className="palette-focus mx-auto flex max-w-5xl flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_1px_4px_rgba(15,23,42,0.16)] dark:border-[#606066] dark:bg-[#2f2f33] sm:flex-row sm:items-end">
          <Label className="grid min-w-0 flex-1 gap-2 text-xs text-slate-500 dark:text-slate-400">
            Recognition language
            <select
              value={language}
              onChange={(event) => onLanguageChange(event.target.value)}
              disabled={isRecording || isProcessing}
              className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 dark:border-[#606066] dark:bg-[#29292c] dark:text-slate-100"
            >
              <option value="en-US">English (United States)</option>
              <option value="en-GB">English (United Kingdom)</option>
              <option value="nl-NL">Dutch (Netherlands)</option>
              <option value="nl-BE">Dutch (Belgium)</option>
              <option value="fr-BE">French (Belgium)</option>
              <option value="fr-FR">French (France)</option>
              <option value="de-DE">German (Germany)</option>
              <option value="es-ES">Spanish (Spain)</option>
            </select>
          </Label>
          <Button
            type="button"
            onClick={isRecording ? onStop : onStart}
            disabled={!configured || isProcessing || models.length === 0}
            variant={isRecording ? "destructive" : "default"}
          >
            {isRecording ? (
              <MicOff className="h-4 w-4" />
            ) : (
              <Mic className="h-4 w-4" />
            )}
            {isRecording
              ? "Stop recording"
              : isProcessing
                ? "Transcribing..."
                : "Record audio"}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={
              !configured || isRecording || isProcessing || models.length === 0
            }
            onClick={() => fileInputRef.current?.click()}
          >
            <UploadCloud className="h-4 w-4" /> Upload audio
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*,.mp3,.wav,.ogg,.webm,.m4a"
            className="hidden"
            onChange={(event) => {
              onFileSelected(event.target.files?.[0]);
              event.currentTarget.value = "";
            }}
          />
        </div>
        {error ? (
          <p className="mt-2 text-center text-xs text-red-600 dark:text-red-300">
            {error}
          </p>
        ) : null}
        {!configured ? (
          <p className="mt-2 text-center text-xs text-amber-700 dark:text-amber-300">
            Select at least one configured transcription deployment.
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function RealtimeVoiceHero({
  configured,
  model,
  status,
  error,
  guardrailStatus,
  transcript,
  onStart,
  onStop,
}: {
  configured: boolean;
  model: string;
  status: RealtimeStatus;
  error: string;
  guardrailStatus: string;
  transcript: RealtimeTranscriptEntry[];
  onStart: () => void;
  onStop: () => void;
}) {
  const isActive = status !== "idle";
  const actionLabel =
    status === "connecting"
      ? "Connecting..."
      : status === "live"
        ? "End voice demo"
        : "Let's talk";

  return (
    <div className="w-full rounded-3xl border border-slate-200 bg-white p-6 text-center shadow-sm dark:border-[#606066] dark:bg-[#39393d]">
      <DictationHero active={isActive} />
      <Badge variant="outline">Realtime pipeline</Badge>
      {guardrailStatus ? (
        <p className="mx-auto mt-3 max-w-2xl rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
          {guardrailStatus}
        </p>
      ) : null}
      <h3 className="mt-3 text-2xl font-semibold tracking-tight">
        Realtime speech-in/out
      </h3>
      <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
        Demo Foundry Realtime speech-in/speech-out with{" "}
        <span className="font-medium text-slate-700 dark:text-slate-200">
          {formatModelName(model)}
        </span>
        . This sends microphone audio directly over WebRTC, separate from the
        text chat bubbles.
      </p>
      <div className="mt-5 flex justify-center">
        <Button
          type="button"
          onClick={isActive ? onStop : onStart}
          disabled={!configured && !isActive}
          variant={isActive ? "destructive" : "default"}
          className="rounded-full px-5"
        >
          {isActive ? (
            <MicOff className="h-4 w-4" />
          ) : (
            <Mic className="h-4 w-4" />
          )}
          {actionLabel}
        </Button>
      </div>
      {!configured ? (
        <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
          Set FOUNDRY_REALTIME_ENDPOINT or FOUNDRY_PROJECT_ENDPOINT so the
          backend can mint short-lived Realtime client secrets for Foundry
          Realtime.
        </p>
      ) : null}
      {error ? (
        <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs leading-5 text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-100">
          {error}
        </p>
      ) : null}
      {transcript.length ? (
        <div className="mt-5 grid gap-2 text-left">
          {transcript.map((entry) => (
            <div
              key={entry.id}
              className={cn(
                "rounded-2xl px-3 py-2 text-sm leading-5",
                entry.source === "user" &&
                  "ml-auto max-w-[85%] bg-blue-600 text-white dark:bg-violet-600",
                entry.source === "assistant" &&
                  "mr-auto max-w-[85%] border bg-slate-50 text-slate-800 dark:border-[#606066] dark:bg-[#29292c] dark:text-slate-100",
                entry.source === "system" &&
                  "mx-auto bg-slate-100 text-xs text-slate-500 dark:bg-[#45454a] dark:text-slate-300",
              )}
            >
              {entry.text}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function DictationHero({ active }: { active: boolean }) {
  return (
    <div
      className={cn(
        "mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full",
        active
          ? "bg-red-50 text-red-600 shadow-[0_0_0_10px_rgba(239,68,68,0.08)] dark:bg-red-950/30 dark:text-red-200"
          : "bg-violet-50 text-violet-600 shadow-[0_0_0_8px_rgba(124,58,237,0.08)] dark:bg-violet-500/15 dark:text-violet-200",
      )}
    >
      <SoundWaveIcon className="h-7 gap-1" />
    </div>
  );
}

export function VoiceLiveHero({
  configured,
  model,
  voice,
  status,
  error,
  transcript,
  onStart,
  onStop,
}: {
  configured: boolean;
  model: string;
  voice: string;
  status: RealtimeStatus;
  error: string;
  transcript: RealtimeTranscriptEntry[];
  onStart: () => void;
  onStop: () => void;
}) {
  const isActive = status !== "idle";
  return (
    <div className="w-full overflow-hidden rounded-3xl border border-violet-200 bg-gradient-to-br from-white via-violet-50/60 to-sky-50 p-6 text-center shadow-sm dark:border-violet-500/30 dark:from-[#39393d] dark:via-violet-950/20 dark:to-sky-950/20">
      <DictationHero active={isActive} />
      <div className="flex flex-wrap justify-center gap-2">
        <Badge>Voice Live API</Badge>
        <Badge variant="outline">Multilingual VAD</Badge>
        <Badge variant="outline">Barge-in</Badge>
        <Badge variant="outline">Noise + echo control</Badge>
      </div>
      <h3 className="mt-4 text-2xl font-semibold tracking-tight">
        Meet Ava, your travel concierge
      </h3>
      <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">
        Plan a trip in natural conversation. Pause to think, switch language, or
        interrupt Ava while she is speaking. Voice Live combines{" "}
        <span className="font-medium">{formatModelName(model)}</span> with the
        Azure HD voice <span className="font-medium">{voice}</span>.
      </p>
      <div className="mt-5 flex justify-center">
        <Button
          type="button"
          onClick={isActive ? onStop : onStart}
          disabled={!configured && !isActive}
          variant={isActive ? "destructive" : "default"}
          className="rounded-full px-5"
        >
          {isActive ? (
            <MicOff className="h-4 w-4" />
          ) : (
            <Mic className="h-4 w-4" />
          )}
          {status === "connecting"
            ? "Connecting..."
            : status === "live"
              ? "End concierge call"
              : "Call the concierge"}
        </Button>
      </div>
      {!configured ? (
        <p className="mt-4 text-xs text-amber-700 dark:text-amber-300">
          Set AZURE_VOICELIVE_ENDPOINT and grant the app identity Cognitive
          Services User and Foundry User access.
        </p>
      ) : null}
      {error ? (
        <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-100">
          {error}
        </p>
      ) : null}
      {transcript.length ? (
        <div className="mt-5 grid gap-2 text-left">
          {transcript.map((entry) => (
            <div
              key={entry.id}
              className={cn(
                "rounded-2xl px-3 py-2 text-sm leading-5",
                entry.source === "user" &&
                  "ml-auto max-w-[85%] bg-blue-600 text-white dark:bg-violet-600",
                entry.source === "assistant" &&
                  "mr-auto max-w-[85%] border bg-white/80 dark:border-[#606066] dark:bg-[#29292c]",
                entry.source === "system" &&
                  "mx-auto bg-white/70 text-xs text-slate-500 dark:bg-[#45454a] dark:text-slate-300",
              )}
            >
              {entry.text}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function LiveTranslationHero({
  configured,
  status,
  error,
  mode,
  sourceLanguage,
  targetLanguage,
  transcript,
  onModeChange,
  onSourceLanguageChange,
  onTargetLanguageChange,
  onStart,
  onStop,
}: {
  configured: boolean;
  status: RealtimeStatus;
  error: string;
  mode: LiveTranslationMode;
  sourceLanguage: string;
  targetLanguage: string;
  transcript: RealtimeTranscriptEntry[];
  onModeChange: (mode: LiveTranslationMode) => void;
  onSourceLanguageChange: (language: string) => void;
  onTargetLanguageChange: (language: string) => void;
  onStart: () => void;
  onStop: () => void;
}) {
  const isActive = status !== "idle";
  return (
    <div className="w-full overflow-hidden rounded-3xl border border-cyan-200 bg-gradient-to-br from-white via-cyan-50/70 to-emerald-50 p-6 text-center shadow-sm dark:border-cyan-500/30 dark:from-[#39393d] dark:via-cyan-950/20 dark:to-emerald-950/20">
      <DictationHero active={isActive} />
      <div className="flex flex-wrap justify-center gap-2">
        <Badge>Speech translation</Badge>
        <Badge variant="outline">
          {mode === "standard" ? "Standard neural voice" : "Personal Voice"}
        </Badge>
      </div>
      <h3 className="mt-4 text-2xl font-semibold tracking-tight">
        One room, many languages
      </h3>
      <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">
        {mode === "standard"
          ? "Translate a selected source language into text and a standard Azure neural voice in real time."
          : "Automatically detect changing source languages and preserve the speaker's style and tone with Live Interpreter."}
      </p>
      <div className="mx-auto mt-5 grid max-w-xl gap-4 text-left sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label htmlFor="live-translation-mode">Voice mode</Label>
          <Select
            value={mode}
            onValueChange={(value) =>
              onModeChange(value as LiveTranslationMode)
            }
            disabled={isActive}
          >
            <SelectTrigger
              id="live-translation-mode"
              className="mt-2 bg-white/80 dark:bg-[#29292c]"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="standard">Standard neural voice</SelectItem>
              <SelectItem value="personal">
                Personal Voice (Live Interpreter)
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        {mode === "standard" ? (
          <div>
            <Label htmlFor="live-translation-source">Speak in</Label>
            <Select
              value={sourceLanguage}
              onValueChange={onSourceLanguageChange}
              disabled={isActive}
            >
              <SelectTrigger
                id="live-translation-source"
                className="mt-2 bg-white/80 dark:bg-[#29292c]"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {liveTranslationSourceLanguages.map(([code, name]) => (
                  <SelectItem key={code} value={code}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
        <div className={mode === "personal" ? "sm:col-span-2" : ""}>
          <Label htmlFor="live-translation-target">Translate everyone to</Label>
          <Select
            value={targetLanguage}
            onValueChange={onTargetLanguageChange}
            disabled={isActive}
          >
            <SelectTrigger
              id="live-translation-target"
              className="mt-2 bg-white/80 dark:bg-[#29292c]"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {liveTranslationLanguages.map(([code, name]) => (
                <SelectItem key={code} value={code}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="mt-5 flex justify-center">
        <Button
          type="button"
          onClick={isActive ? onStop : onStart}
          disabled={!configured && !isActive}
          variant={isActive ? "destructive" : "default"}
          className="rounded-full px-5"
        >
          {isActive ? (
            <MicOff className="h-4 w-4" />
          ) : (
            <Mic className="h-4 w-4" />
          )}
          {status === "connecting"
            ? "Connecting..."
            : status === "live"
              ? "Stop interpreting"
              : "Start interpreting"}
        </Button>
      </div>
      {!configured ? (
        <p className="mt-4 text-xs text-amber-700 dark:text-amber-300">
          Map this use case to a configured Foundry binding.
        </p>
      ) : null}
      {error ? (
        <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-100">
          {error}
        </p>
      ) : null}
      {transcript.length ? (
        <div className="mt-5 grid gap-2 text-left">
          {transcript.map((entry) => (
            <div
              key={entry.id}
              className="mr-auto max-w-[90%] rounded-2xl border bg-white/80 px-3 py-2 text-sm leading-5 dark:border-[#606066] dark:bg-[#29292c]"
            >
              {entry.text}
            </div>
          ))}
        </div>
      ) : null}
      <p className="mt-5 text-xs text-slate-500 dark:text-slate-400">
        {mode === "personal"
          ? "Personal Voice requires Microsoft approval for the mapped resource. "
          : ""}
        Use headphones to prevent translated audio from being captured by the
        microphone.
      </p>
    </div>
  );
}
