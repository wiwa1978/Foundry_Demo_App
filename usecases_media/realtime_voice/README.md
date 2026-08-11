# Realtime Speech In / Speech Out

Connects the browser to a Foundry realtime voice deployment for low-latency speech interaction.

| Layer | Location |
| --- | --- |
| Marketplace module | [`module.ts`](module.ts) |
| Frontend entry point | [`frontend.ts`](frontend.ts) |
| Shared backend package | [`../shared/voice/backend`](../shared/voice/backend) |
| Frontend voice code | [`frontend/src/features/voice`](../../frontend/src/features/voice) |
| Backend voice API | [`../shared/voice/backend/router.py`](../shared/voice/backend/router.py) |
| Realtime provider | [`app/providers/realtime.py`](../../app/providers/realtime.py) |
| Frontend test | [`frontend/src/features/voice/useRealtimeVoice.test.tsx`](../../frontend/src/features/voice/useRealtimeVoice.test.tsx) |
