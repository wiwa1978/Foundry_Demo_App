import type { UseCaseModule } from "@/app/types";

export const transcribeUseCase: UseCaseModule = {
  id: "transcribe",
  title: "Recorded Audio Transcription",
  shortTitle: "Recorded Audio Transcription",
  description:
    "Record or upload completed audio and return a finalized speech-to-text transcript.",
  badge: "Audio",
  typeLabel: "Transcription",
  icon: "voiceWave",
  modalities: ["audio"],
  implementation: [
    "The browser records microphone audio or accepts an uploaded audio file.",
    "Audio is converted to 16 kHz mono PCM WAV and sent to the backend.",
    "The backend sends the completed audio to the API required by the selected transcription model and returns the finalized transcript.",
    "Supported deployments include GPT-transcribe, GPT-4o-transcribe, GPT-4o-mini-transcribe, and MAI-Transcribe-1.5.",
  ],
  codeSnippet: {
    title: "Recorded audio transcription",
    language: "python",
    code: [
      "with open(audio_path, 'rb') as audio_file:",
      "    result = client.audio.transcriptions.create(",
      "        model=deployment_name,",
      "        file=audio_file,",
      "    )",
      "print(result.text)",
    ].join("\n"),
  },
  workspace: "transcribe",
};
