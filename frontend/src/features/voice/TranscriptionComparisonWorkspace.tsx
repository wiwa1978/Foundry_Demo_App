import {
  Copy,
  Download,
  LoaderCircle,
  Mic,
  MicOff,
  UploadCloud,
} from "lucide-react";
import type { RefObject } from "react";

import type { TranscriptionResult } from "@/api/types";
import type { TraditionalVoiceStatus } from "@/app/workspace/contracts";
import { formatModelName } from "@/app/workspace/formatters";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SoundWaveIcon } from "@/features/shared/SoundWaveIcon";
import { downloadText } from "@/features/voice/audioUtils";

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

  if (!models.length) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-center">
        <div>
          <SoundWaveIcon className="mx-auto mb-4 h-10 gap-1 text-slate-300" />
          <h3 className="text-lg font-semibold">
            Select transcription models to compare
          </h3>
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
            const history = results[model] ?? [];
            const pending = pendingModels.has(model);
            return (
              <article
                key={model}
                className="flex min-h-0 flex-col overflow-hidden rounded-2xl border bg-white dark:border-[#606066] dark:bg-[#39393d]"
              >
                <header className="flex h-16 items-center justify-between border-b px-4 dark:border-[#55555a]">
                  <h3 className="truncate text-sm font-semibold">
                    {formatModelName(model)}
                  </h3>
                  {history.at(-1) ? (
                    <Badge variant="outline">
                      {history.at(-1)?.duration_ms} ms
                    </Badge>
                  ) : null}
                </header>
                <div className="flex min-h-0 flex-1 overflow-auto bg-slate-50 p-5 dark:bg-[#303033]">
                  {history.length ? (
                    <div className="grid w-full content-start gap-4">
                      {pending ? (
                        <div className="flex items-center gap-2 text-xs">
                          <LoaderCircle className="h-4 w-4 animate-spin" />{" "}
                          Transcribing {sourceName}...
                        </div>
                      ) : null}
                      {history.map((item, index) => (
                        <section
                          key={`${index}-${item.duration_ms}`}
                          className="rounded-2xl border bg-white p-4 dark:border-[#606066] dark:bg-[#29292c]"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-semibold uppercase text-slate-500">
                              Transcription {index + 1}
                            </span>
                            <div className="flex gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  void navigator.clipboard.writeText(item.text)
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
                                    item.text,
                                    `${model}-transcript-${index + 1}.txt`,
                                  )
                                }
                              >
                                <Download className="h-4 w-4" /> Download
                              </Button>
                            </div>
                          </div>
                          <p className="mt-4 whitespace-pre-wrap text-sm leading-7">
                            {item.text}
                          </p>
                        </section>
                      ))}
                    </div>
                  ) : pending ? (
                    <div className="m-auto text-center">
                      <LoaderCircle className="mx-auto mb-3 h-8 w-8 animate-spin" />
                      Transcribing with {formatModelName(model)}
                    </div>
                  ) : modelErrors[model] ? (
                    <p className="m-auto text-sm text-red-600">
                      {modelErrors[model]}
                    </p>
                  ) : (
                    <div className="m-auto text-center">
                      <SoundWaveIcon className="mx-auto mb-3 h-8 gap-1 text-slate-300" />
                      Ready for {formatModelName(model)}
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </div>
      <div className="border-t bg-slate-50 px-4 py-3 dark:border-[#55555a] dark:bg-[#29292c]">
        <div className="mx-auto flex max-w-5xl gap-3 rounded-2xl border bg-white p-3 dark:border-[#606066] dark:bg-[#2f2f33]">
          <Label className="grid min-w-0 flex-1 gap-2 text-xs">
            Recognition language
            <select
              value={language}
              onChange={(event) => onLanguageChange(event.target.value)}
              disabled={isRecording || isProcessing}
              className="h-10 rounded-md border bg-white px-3 dark:bg-[#29292c]"
            >
              <option value="en-US">English (United States)</option>
              <option value="en-GB">English (United Kingdom)</option>
              <option value="nl-NL">Dutch (Netherlands)</option>
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
        {error ? (
          <p className="mt-2 text-center text-xs text-red-600">{error}</p>
        ) : null}
      </div>
    </div>
  );
}
