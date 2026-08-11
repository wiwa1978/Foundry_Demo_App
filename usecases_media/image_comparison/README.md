# Side by Side - Text Image

Runs one image prompt against multiple Foundry image deployments for comparison.

| Layer | Location |
| --- | --- |
| Marketplace module | [`module.ts`](module.ts) |
| Frontend entry point | [`frontend.ts`](frontend.ts) |
| Backend entry point | [`backend.py`](backend.py) |
| Frontend image code | [`frontend/src/features/images`](../../frontend/src/features/images) |
| Backend image API | [`app/features/images`](../../app/features/images) |
| Image provider | [`app/providers/images.py`](../../app/providers/images.py) |
| Frontend tests | [`frontend/src/features/images/useImageWorkspace.test.tsx`](../../frontend/src/features/images/useImageWorkspace.test.tsx) |
