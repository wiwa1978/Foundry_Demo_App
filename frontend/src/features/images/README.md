# Image implementations

- [`api.ts`](./api.ts): text-to-image and image-editing browser contracts.
- [Image FastAPI router](../../../../app/features/images/router.py)
- [Foundry image clients](../../../../app/foundry_client.py)
- [Route tests](../../../../tests/test_image_routes.py)
- Existing provider tests: [`test_image_generation.py`](../../../../tests/test_image_generation.py)

Text-to-image and image comparison call the same generation endpoint. Image-to-image uses the
multipart editing endpoint and is restricted to compatible GPT Image deployments.
