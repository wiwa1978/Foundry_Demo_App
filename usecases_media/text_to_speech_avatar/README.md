# Text to Speech Avatar

Submits a typed script to Azure Speech batch avatar synthesis and previews or
downloads the generated video.

| Layer | Location |
| --- | --- |
| Marketplace module | [`module.ts`](module.ts) |
| Frontend entry point | [`frontend.ts`](frontend.ts) |
| Workspace | [`frontend/src/features/voice/TextToSpeechAvatarWorkspace.tsx`](../../frontend/src/features/voice/TextToSpeechAvatarWorkspace.tsx) |
| Batch job hook | [`frontend/src/features/voice/useTextToSpeechAvatar.ts`](../../frontend/src/features/voice/useTextToSpeechAvatar.ts) |
| Batch job API | [`../shared/voice/backend/router.py`](../shared/voice/backend/router.py) |
| Azure Speech integration | [`app/infrastructure/azure/foundry/speech.py`](../../app/infrastructure/azure/foundry/speech.py) |

The backend submits a `PUT /avatar/batchsyntheses/{id}` request, polls
`GET /avatar/batchsyntheses/{id}`, and returns the signed output URL after Azure
Speech reports `Succeeded`. The browser never receives a Speech resource key or
Entra token.

Batch avatar synthesis is asynchronous, supports plain text or SSML, and has
limits on payload size, output duration, and concurrent jobs. It is available in
supported paid Speech regions; custom avatars and custom voices require the
appropriate Limited Access approval.
