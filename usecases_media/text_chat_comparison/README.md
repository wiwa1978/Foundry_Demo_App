# Side by Side - Text Chat

Runs one prompt against multiple Foundry model deployments for side-by-side comparison.

| Layer | Location |
| --- | --- |
| Marketplace module | [`module.ts`](module.ts) |
| Frontend entry point | [`frontend.ts`](frontend.ts) |
| Backend entry point | [`backend.py`](backend.py) |
| Frontend | [`frontend/src/features/comparison`](../../frontend/src/features/comparison) |
| Backend API | [`app/features/comparison`](../../app/features/comparison) |
| Shared chat service | [`app/services/chat.py`](../../app/services/chat.py) |
| Backend tests | [`tests/test_comparison_api.py`](../../tests/test_comparison_api.py) |
