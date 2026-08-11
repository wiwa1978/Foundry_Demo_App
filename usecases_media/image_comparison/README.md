# Side by Side - Text Image

Runs one image prompt against multiple Foundry image deployments for comparison.

| Layer | Location |
| --- | --- |
| Marketplace module | [`module.ts`](module.ts) |
| Frontend entry point | [`frontend.ts`](frontend.ts) |
| Shared backend package | [`../shared/images/backend`](../shared/images/backend) |
| Frontend image code | [`frontend/src/features/images`](../../frontend/src/features/images) |
| Backend image API | [`../shared/images/backend/router.py`](../shared/images/backend/router.py) |
| Image provider | [`app/providers/images.py`](../../app/providers/images.py) |
| Frontend tests | [`frontend/src/features/images/useImageWorkspace.test.tsx`](../../frontend/src/features/images/useImageWorkspace.test.tsx) |
