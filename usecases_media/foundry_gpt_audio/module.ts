import type { UseCaseModule } from "@/app/types";

export const foundryGptAudioUseCase: UseCaseModule = {
  id: "foundry_gpt_audio",
  title: "Foundry GPT Audio",
  shortTitle: "GPT Audio",
  description:
    "Generate spoken audio with deployed GPT Audio models through Foundry audio completions.",
  badge: "Audio",
  icon: "voiceWave",
  modalities: ["audio", "text"],
  implementation: [
    "Text is sent to a deployed GPT Audio model through the Foundry audio completions API.",
    "Choose a GPT Audio deployment and one of its supported voices.",
    "Play or download the generated MP3 response.",
  ],
  documentation: [
    {
      title: "Azure OpenAI audio concepts",
      url: "https://learn.microsoft.com/en-us/azure/foundry-classic/openai/concepts/audio",
      description: "Overview of audio-capable Azure OpenAI models in Microsoft Foundry.",
    },
    {
      title: "Azure OpenAI chat completions",
      url: "https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/chatgpt",
      description: "Chat completions API pattern used for text and audio response generation.",
    },
  ],
  codeSnippet: {
    title: "Foundry audio completions",
    language: "python",
    code: [
      "response = client.chat.completions.create(",
      "    model=settings.tts_model,",
      "    modalities=['text', 'audio'],",
      "    audio={'voice': settings.tts_voice, 'format': 'mp3'},",
      "    messages=[{'role': 'user', 'content': text}],",
      ")",
    ].join("\n"),
  },
  workspace: "foundryGptAudio",
};
