import type { UseCaseModule } from "@/app/types";

export const liveTranslationUseCase: UseCaseModule = {
  id: "live_translation",
  title: "Live translation",
  shortTitle: "Live translation",
  description:
    "Translate a multilingual conversation to one target language in real time while preserving each speaker's voice and speaking style.",
  badge: "Azure Speech",
  icon: "voiceWave",
  modalities: ["audio"],
  implementation: [
    "The browser resamples microphone input to raw 16 kHz mono PCM and streams it to an authenticated FastAPI WebSocket.",
    "Azure Speech Live Interpreter uses open-range language detection, so speakers can switch languages without restarting the session.",
    "The Speech v2 translation endpoint streams final target-language text and Personal Voice audio back to the browser.",
  ],
  codeSnippet: {
    title: "Speech SDK: configure Live Interpreter",
    language: "python",
    code: [
      "config = speechsdk.translation.SpeechTranslationConfig(",
      "    endpoint=live_interpreter_endpoint,",
      "    token_credential=credential,",
      ")",
      "config.add_target_language(target_language)",
      "config.voice_name = 'personal-voice'",
      "source_languages = speechsdk.languageconfig.AutoDetectSourceLanguageConfig()",
      "recognizer = speechsdk.translation.TranslationRecognizer(",
      "    translation_config=config,",
      "    auto_detect_source_language_config=source_languages,",
      "    audio_config=audio_config,",
      ")",
    ].join("\n"),
  },
  workspace: "liveTranslation",
};
