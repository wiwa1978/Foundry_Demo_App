# Text to Image

Generates images from text prompts using a selected Foundry image deployment.

| Layer | Location |
| --- | --- |
| Marketplace module | [`module.ts`](module.ts) |
| Frontend entry point | [`frontend.ts`](frontend.ts) |
| Shared backend package | [`../shared/images/backend`](../shared/images/backend) |
| Prompt examples | [`prompts.ts`](prompts.ts) |
| Frontend image code | [`frontend/src/features/images`](../../frontend/src/features/images) |
| Backend image API | [`../shared/images/backend/router.py`](../shared/images/backend/router.py) |
| Image provider | [`app/providers/images.py`](../../app/providers/images.py) |
| Backend tests | [`tests/test_image_routes.py`](../../tests/test_image_routes.py) |
