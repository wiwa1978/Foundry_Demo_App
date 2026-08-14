import type { UseCaseModule } from "@/app/types";

export const liveTranslationUseCase: UseCaseModule = {
  id: "live_translation",
  title: "Azure Speech Live Translation",
  shortTitle: "Azure Speech Live Translation",
  description:
    "Translate live speech with Azure Speech SDK standard neural voices or approved Live Interpreter Personal Voice.",
  badge: "Audio",
  typeLabel: "Azure Speech Translation",
  icon: "voiceWave",
  modalities: ["audio"],
  implementation: [
    "The browser resamples microphone input to raw 16 kHz mono PCM and streams it to an authenticated FastAPI WebSocket.",
    "Standard mode follows the documented Python Speech SDK flow with an explicit source locale and target-language neural voice.",
    "Personal Voice mode uses Live Interpreter open-range detection when the mapped resource has restricted-feature approval.",
  ],
  codeSnippet: {
    title: "Azure Speech SDK: configure Live Interpreter",
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
