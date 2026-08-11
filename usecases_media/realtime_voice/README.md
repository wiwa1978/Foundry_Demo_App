# Realtime Speech In / Speech Out

Connects the browser to a Foundry realtime voice deployment for low-latency speech interaction.

| Layer | Location |
| --- | --- |
| Marketplace module | [`module.ts`](module.ts) |
| Frontend entry point | [`frontend.ts`](frontend.ts) |
| Backend entry point | [`backend.py`](backend.py) |
| Frontend voice code | [`frontend/src/features/voice`](../../frontend/src/features/voice) |
| Backend voice API | [`app/features/voice`](../../app/features/voice) |
| Realtime provider | [`app/providers/realtime.py`](../../app/providers/realtime.py) |
| Frontend test | [`frontend/src/features/voice/useRealtimeVoice.test.tsx`](../../frontend/src/features/voice/useRealtimeVoice.test.tsx) |
