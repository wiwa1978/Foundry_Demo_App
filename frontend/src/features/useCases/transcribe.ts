import type { UseCaseModule } from "@/app/types";

export const transcribeUseCase: UseCaseModule = {
  id: "transcribe",
  title: "Transcribe",
  shortTitle: "Transcribe",
  description: "Record or upload audio and transcribe it with MAI-Transcribe-1.5.",
  badge: "Azure Speech",
  icon: "voiceWave",
  implementation: [
    "The browser records microphone audio or accepts an uploaded audio file.",
    "Audio is converted to 16 kHz mono PCM WAV and sent to the backend.",
    "The backend uses the Azure AI Speech SDK with the configured Foundry Speech endpoint and returns the finalized transcript.",
  ],
  codeSnippet: {
    title: "Azure AI Speech: continuous transcription",
    language: "python",
    code: [
      "speech_config = speechsdk.SpeechConfig(",
      "    subscription=os.environ['AZURE_SPEECH_KEY'],",
      "    endpoint=os.environ['AZURE_SPEECH_ENDPOINT'],",
      ")",
      "audio_config = speechsdk.audio.AudioConfig(filename=audio_path)",
      "recognizer = speechsdk.SpeechRecognizer(",
      "    speech_config=speech_config,",
      "    audio_config=audio_config,",
      ")",
      "recognizer.recognized.connect(recognized_handler)",
      "recognizer.start_continuous_recognition()",
    ].join("\n"),
  },
  workspace: "transcribe",
};
