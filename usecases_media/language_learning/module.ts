import type { UseCaseModule } from "@/app/types";

export const languageLearningUseCase: UseCaseModule = {
  id: "language_learning",
  title: "Language Learning",
  shortTitle: "Language Learning",
  description:
    "Practice spoken language with an AI tutor and receive pronunciation, fluency, grammar, and vocabulary feedback.",
  badge: "Speech AI",
  icon: "voiceWave",
  modalities: ["audio"],
  implementation: [
    "Record a spoken response and transcribe it with the configured Foundry speech model.",
    "Assess pronunciation, fluency, completeness, and prosody with Azure Speech Pronunciation Assessment.",
    "Ask the selected chat model to respond as a supportive language tutor, then synthesize the correction and next exercise.",
  ],
  documentation: [
    {
      title: "Azure Speech Pronunciation Assessment",
      url: "https://learn.microsoft.com/azure/ai-services/speech-service/how-to-pronunciation-assessment",
      description: "Official SDK guidance for pronunciation scoring.",
    },
  ],
  codeSnippet: {
    title: "Language tutor with pronunciation assessment",
    language: "python",
    code: [
      "transcription = transcribe_audio(audio)",
      "assessment = assess_pronunciation(audio, transcription['text'], 'en-US')",
      "tutor_prompt = f\"Learner said: {transcription['text']}\\nAssessment: {assessment}\"",
      "reply = complete_chat(model=model, prompt=tutor_prompt,",
      "    system_prompt='You are a patient language teacher...')",
      "speech = synthesize_speech(reply['content'])",
    ].join("\n"),
  },
  workspace: "traditionalVoice",
};
