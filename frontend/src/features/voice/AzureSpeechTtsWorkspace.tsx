import {
  Download,
  Loader2,
  Pause,
  Play,
  Sparkles,
  Volume2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { PromptExamples } from "@/components/PromptExamples";
import { formatModelName } from "@/app/workspace/formatters";

export const azureSpeechVoiceNames = [
  { value: "Ava", label: "Ava", gender: "Female" },
  { value: "Andrew", label: "Andrew", gender: "Male" },
  { value: "Adam", label: "Adam", gender: "Male" },
];
export const gptAudioVoices = [
  "alloy",
  "ash",
  "coral",
  "echo",
  "sage",
  "shimmer",
];
export const azureSpeechEmotions = [
  "neutral",
  "cheerful",
  "sad",
  "angry",
  "fearful",
  "calm",
];
export const azureSpeechModels = [
  { value: "DragonHDLatestNeural", label: "Dragon HD Latest" },
  { value: "DragonHDOmniLatestNeural", label: "Dragon HD Omni Latest" },
  { value: "MultilingualNeural", label: "Neural Multilingual" },
  { value: "Neural", label: "Neural" },
];
export const azureSpeechLanguageSkills = [
  { value: "auto", label: "Auto detect" },
  { value: "en-US", label: "English (United States)" },
  { value: "en-GB", label: "English (United Kingdom)" },
  { value: "nl-NL", label: "Dutch (Netherlands)" },
  { value: "fr-FR", label: "French (France)" },
  { value: "de-DE", label: "German (Germany)" },
];
const speechPromptGallery = [
  {
    id: "milestone-update",
    title: "Milestone update",
    prompt:
      "We just achieved a major milestone ahead of schedule. The team worked incredibly hard, and the results exceeded our expectations. I'm excited to share what this means for our customers and partners.",
    description: "Excited announcement for customers and partners.",
  },
  {
    id: "customer-reassurance",
    title: "Customer reassurance",
    prompt:
      "I understand that unexpected changes can be frustrating. Please know that we're working closely with you to find the best possible solution. Thank you for your patience and trust throughout this process.",
    description: "Calm, empathetic customer communication.",
  },
  {
    id: "operational-normal",
    title: "Operational normal",
    prompt:
      "Everything is operating normally, and there is no action required at this time. Our monitoring systems continue to perform as expected. We will keep you informed if anything changes.",
    description: "Neutral status update with no action needed.",
  },
  {
    id: "urgent-incident",
    title: "Urgent incident",
    prompt:
      "We've identified an issue that requires immediate attention. Our engineering team is actively investigating and working on a resolution. We recommend following the guidance provided until the issue is resolved.",
    description: "Serious incident message requiring attention.",
  },
  {
    id: "vision-pitch",
    title: "Vision pitch",
    prompt:
      "Imagine if your employees could spend less time searching for information and more time creating value. What opportunities would that unlock for your organization? Let's explore what might be possible together.",
    description: "Consultative pitch for business value.",
  },
  {
    id: "strategy-results",
    title: "Strategy results",
    prompt:
      "Our strategy is delivering measurable results across the business. We've improved efficiency, strengthened security, and accelerated innovation. The next phase will focus on scaling these successes across the organization.",
    description: "Executive summary of business progress.",
  },
];

export function buildAzureSpeechVoice(
  voiceName: string,
  voiceModel: string,
  languageSkill: string,
) {
  const language = languageSkill === "auto" ? "en-US" : languageSkill;
  if (voiceModel === "Neural") {
    return `${language}-${voiceName}Neural`;
  }
  if (voiceModel === "MultilingualNeural") {
    return `${language}-${voiceName}MultilingualNeural`;
  }
  return `${language}-${voiceName}:${voiceModel}`;
}

export type TextToSpeechSettings = {
  azureSpeechModel: string;
  azureVoiceName: string;
  languageSkill: string;
  emotion: string;
  pitch: number;
  rate: number;
  volume: number;
  gptAudioModel: string;
  gptAudioVoice: string;
};

type Props = {
  configured: boolean;
  mode?: "azure" | "gptAudio";
  settings: TextToSpeechSettings;
};

export function AzureSpeechTtsWorkspace({
  configured,
  settings,
  mode = "azure",
}: Props) {
  const isGptAudio = mode === "gptAudio";
  const defaultText = isGptAudio
    ? "Welcome to the Foundry GPT Audio demonstration."
    : "Welcome to the Azure Speech text to speech demonstration.";
  const [text, setText] = useState(defaultText);
  const [generatedText, setGeneratedText] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const playerRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(
    () => () => {
      playerRef.current?.pause();
      if (playerRef.current?.src) {
        URL.revokeObjectURL(playerRef.current.src);
      }
      playerRef.current = null;
    },
    [],
  );

  async function synthesize() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/text-to-speech", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          model: isGptAudio ? settings.gptAudioModel : "azure-speech",
          voice: isGptAudio
            ? settings.gptAudioVoice
            : buildAzureSpeechVoice(
                settings.azureVoiceName,
                settings.azureSpeechModel,
                settings.languageSkill,
              ),
          language:
            settings.languageSkill === "auto"
              ? "en-US"
              : settings.languageSkill,
          emotion: settings.emotion,
          pitch: `${settings.pitch}%`,
          rate: `${settings.rate}%`,
          volume: `${settings.volume}%`,
        }),
      });
      const payload = (await response.json()) as {
        audio_base64?: string;
        detail?: string;
      };
      if (!response.ok || !payload.audio_base64) {
        throw new Error(payload.detail || "Azure Speech synthesis failed.");
      }
      const binary = Uint8Array.from(atob(payload.audio_base64), (character) =>
        character.charCodeAt(0),
      );
      const nextAudioUrl = URL.createObjectURL(
        new Blob([binary], { type: "audio/mpeg" }),
      );
      playerRef.current?.pause();
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      const player = new Audio(nextAudioUrl);
      player.onplay = () => setIsPlaying(true);
      player.onpause = () => setIsPlaying(false);
      player.onended = () => setIsPlaying(false);
      playerRef.current = player;
      setAudioUrl(nextAudioUrl);
      setGeneratedText(text);
      setText("");
      await player.play();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Synthesis failed.");
    } finally {
      setBusy(false);
    }
  }

  async function togglePlayback() {
    const player = playerRef.current;
    if (!player) return;
    if (player.paused) {
      await player.play();
    } else {
      player.pause();
    }
  }

  function selectPrompt(textValue: string) {
    playerRef.current?.pause();
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(null);
    setIsPlaying(false);
    setError("");
    setGeneratedText(null);
    setText(textValue);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-slate-100/70 dark:bg-[#303033]">
      <PromptExamples
        title="Speech prompt gallery"
        description="Choose an example to load it into the speech composer."
        icon={<Sparkles className="h-4 w-4" />}
        examples={speechPromptGallery}
        value={text}
        onSelect={selectPrompt}
      />
      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        <div className="flex min-h-full items-center justify-center">
          <div className="w-full max-w-2xl rounded-3xl border border-slate-200 bg-white p-8 shadow-sm dark:border-[#606066] dark:bg-[#39393d]">
            <div className="text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-200">
                <Volume2 className="h-7 w-7" />
              </div>
              <h3 className="mt-4 text-2xl font-semibold tracking-tight">
                {isGptAudio
                  ? "Generate speech with GPT Audio"
                  : "Generate speech with Azure Speech"}
              </h3>
              <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-500 dark:text-slate-400">
                Enter text below and play the generated speech using{" "}
                {isGptAudio
                  ? formatModelName(settings.gptAudioModel)
                  : "Azure Speech"}
                .
              </p>
            </div>
            {generatedText ? (
              <div className="mt-6 min-h-40 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 dark:border-[#606066] dark:bg-[#29292c]">
                {generatedText}
              </div>
            ) : (
              <div className="mt-6 flex min-h-40 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-center text-sm text-slate-500 dark:border-[#606066] dark:bg-[#29292c] dark:text-slate-400">
                Choose a prompt or enter text below, then select Play speech.
              </div>
            )}
            {error ? (
              <p className="mt-3 text-xs text-red-600 dark:text-red-300">
                {error}
              </p>
            ) : null}
            {audioUrl ? (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-full"
                  onClick={() => void togglePlayback()}
                >
                  {isPlaying ? (
                    <Pause className="h-4 w-4" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                  {isPlaying ? "Pause" : "Play"}
                </Button>
                <a
                  className="text-xs font-medium text-violet-700 hover:underline dark:text-violet-300"
                  download="speech.mp3"
                  href={audioUrl}
                >
                  <Download className="mr-1 inline h-3.5 w-3.5" /> Download MP3
                </a>
              </div>
            ) : null}
          </div>
        </div>
      </div>
      <div className="border-t bg-slate-50 px-4 py-3 dark:border-[#55555a] dark:bg-[#29292c]">
        <div className="palette-focus mx-auto flex max-w-5xl items-end gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_1px_4px_rgba(15,23,42,0.16)] dark:border-[#606066] dark:bg-[#2f2f33] dark:shadow-none">
          <textarea
            id="azure-speech-text"
            className="min-h-12 flex-1 resize-y rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-violet-500 dark:border-[#606066] dark:bg-[#29292c]"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Enter the text you want to read..."
            rows={2}
          />
          <Button
            type="button"
            onClick={() => void synthesize()}
            disabled={!configured || busy || !text.trim()}
            className="shrink-0 rounded-full px-5"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            {busy ? "Generating..." : "Play speech"}
          </Button>
        </div>
        {!configured ? (
          <p className="mx-auto mt-2 max-w-5xl text-xs text-amber-700 dark:text-amber-300">
            {isGptAudio
              ? "Configure a Foundry audio deployment to enable speech."
              : "Configure Azure Speech to enable speech."}
          </p>
        ) : null}
        <p className="mt-2 text-center text-xs text-slate-500 dark:text-slate-400">
          AI-generated content may be incorrect
        </p>
      </div>
    </div>
  );
}
