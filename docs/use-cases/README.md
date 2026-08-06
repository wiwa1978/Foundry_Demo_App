# Use case implementation index

Use this index to navigate from a customer demo to the code that implements it.

| Use case | Implementation |
| --- | --- |
| Text Chat | [Frontend and backend walkthrough](../../frontend/src/features/textChat/README.md) |
| Document Q&A | Metadata currently in [`documentQa.ts`](../../frontend/src/features/useCases/documentQa.ts); executable slice extraction is next. |
| Side-by-side comparison | Metadata currently in [`comparison.ts`](../../frontend/src/features/useCases/comparison.ts). |
| Browser voice | Metadata currently in [`browserVoice.ts`](../../frontend/src/features/useCases/browserVoice.ts). |
| STT → Chat → TTS | Metadata currently in [`traditionalVoice.ts`](../../frontend/src/features/useCases/traditionalVoice.ts). |
| Recorded transcription | Metadata currently in [`transcribe.ts`](../../frontend/src/features/useCases/transcribe.ts). |
| Realtime voice | Metadata currently in [`realtimeVoice.ts`](../../frontend/src/features/useCases/realtimeVoice.ts). |
| Voice Live | Metadata currently in [`voiceLive.ts`](../../frontend/src/features/useCases/voiceLive.ts). |
| Live translation | Metadata currently in [`liveTranslation.ts`](../../frontend/src/features/useCases/liveTranslation.ts). |
| Text to image | Metadata currently in [`textToImage.ts`](../../frontend/src/features/useCases/textToImage.ts). |
| Image to image | Metadata currently in [`imageToImage.ts`](../../frontend/src/features/useCases/imageToImage.ts). |
| Image comparison | Metadata currently in [`imageComparison.ts`](../../frontend/src/features/useCases/imageComparison.ts). |

Text Chat is the reference feature structure. Other use cases will be migrated incrementally without
breaking the runnable demo.
