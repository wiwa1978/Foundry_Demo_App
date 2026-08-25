import type { UseCaseModule } from "@/app/types";

export const azureSpeechTtsUseCase: UseCaseModule = {
  id: "azure_speech_tts",
  title: "Azure Speech Text to Speech",
  shortTitle: "Speech TTS",
  description:
    "Turn text into expressive MP3 audio with Azure Speech voices, prosody, and emotion controls.",
  badge: "Audio",
  icon: "voiceWave",
  modalities: ["audio", "text"],
  implementation: [
    "Text is sent to the backend and synthesized with the Azure Speech SDK.",
    "SSML applies the selected voice, emotion, pitch, rate, and volume settings.",
    "The generated MP3 can be played in the browser or downloaded.",
  ],
  documentation: [
    {
      title: "Synthesize speech with the Python SDK",
      url: "https://learn.microsoft.com/en-us/azure/ai-services/speech-service/how-to-speech-synthesis",
      description: "SpeechConfig, SpeechSynthesizer, output formats, and SSML synthesis patterns.",
    },
    {
      title: "Customize voice and sound with SSML",
      url: "https://learn.microsoft.com/en-us/azure/ai-services/speech-service/speech-synthesis-markup-voice#use-speaking-styles-paralinguistics-and-roles",
      description: "Voice styles, mstts:express-as, roles, pitch, rate, and volume controls.",
    },
  ],
  codeSnippet: {
    title: "Azure Speech SDK: expressive synthesis",
    language: "python",
    code: [
      "speech_config = speechsdk.SpeechConfig(",
      "    endpoint=settings.speech_endpoint,",
      "    token_credential=get_azure_credential(),",
      ")",
      "speech_config.set_speech_synthesis_output_format(",
      "    speechsdk.SpeechSynthesisOutputFormat.Audio16Khz128KBitRateMonoMp3",
      ")",
      "result = synthesizer.speak_ssml_async(ssml).get()",
    ].join("\n"),
  },
  workspace: "azureSpeechTts",
};
