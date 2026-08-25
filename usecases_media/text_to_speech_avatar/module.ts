import type { UseCaseModule } from "@/app/types";

export const textToSpeechAvatarUseCase: UseCaseModule = {
  id: "text_to_speech_avatar",
  title: "Azure Speech Text to Speech Avatar",
  shortTitle: "Speech Avatar",
  description:
    "Render scripted text as synchronized Azure Speech avatar video and audio without a conversational model.",
  badge: "Video",
  typeLabel: "Text to Speech Avatar",
  icon: "video",
  modalities: ["text", "audio", "video"],
  implementation: [
    "The backend submits an asynchronous Azure Speech batch avatar synthesis job using Entra ID or a Speech resource key without exposing credentials to the browser.",
    "The app polls the job status until Azure Speech produces the generated video URL or reports a failure.",
    "The generated MP4 can be previewed and downloaded, using a standard or approved custom avatar and voice.",
  ],
  documentation: [
    {
      title: "Text to speech avatar batch synthesis",
      url: "https://learn.microsoft.com/en-us/azure/ai-services/speech-service/text-to-speech-avatar/batch-synthesis-avatar",
      description:
        "Submit, poll, and download an asynchronous avatar video synthesis job.",
    },
    {
      title: "Text to speech avatar overview",
      url: "https://learn.microsoft.com/en-us/azure/ai-services/speech-service/text-to-speech-avatar/what-is-text-to-speech-avatar",
      description:
        "Avatar types, standard/custom voices, and batch or real-time output options.",
    },
  ],
  codeSnippet: {
    title: "Azure Speech REST: submit a batch avatar job",
    language: "python",
    code: [
      "payload = {",
      "    'synthesisConfig': {'voice': 'en-US-Ava:DragonHDLatestNeural'},",
      "    'inputKind': 'PlainText',",
      "    'inputs': [{'content': script}],",
      "    'avatarConfig': {",
      "        'talkingAvatarCharacter': 'lisa',",
      "        'talkingAvatarStyle': 'graceful-sitting',",
      "        'videoFormat': 'mp4',",
      "        'videoCodec': 'h264',",
      "    },",
      "}",
      "requests.put(",
      "    f'{endpoint}/avatar/batchsyntheses/{job_id}?api-version=2024-08-01',",
      "    json=payload,",
      ")",
    ].join("\n"),
  },
  workspace: "textToSpeechAvatar",
};
