import json
import unittest
from unittest.mock import MagicMock, patch
from app.foundry_client import FoundrySettings, edit_image, generate_image
from app.main import ImageGenerationRequest
from pydantic import ValidationError


class ImageGenerationTests(unittest.TestCase):
    def test_generation_request_rejects_excessive_pixel_count(self) -> None:
        with self.assertRaises(ValidationError):
            ImageGenerationRequest(
                model="MAI-Image-2.5",
                prompt="A red fox",
                width=2000,
            )

    @patch("app.foundry_client.urlopen")
    @patch("app.foundry_client.get_azure_credential")
    @patch("app.foundry_client.load_settings")
    def test_generate_image_uses_mai_endpoint_and_entra_token(
        self,
        load_settings: MagicMock,
        get_credential: MagicMock,
        urlopen: MagicMock,
    ) -> None:
        load_settings.return_value = FoundrySettings(
            endpoint="https://demo.services.ai.azure.com/api/projects/demo",
            models=["MAI-Image-2.5"],
            realtime_endpoint=None,
            realtime_model="",
            embedding_model="",
            transcription_model="",
            tts_model="",
            tts_voice="",
            speech_endpoint=None,
            speech_key=None,
            speech_transcription_model="MAI-Transcribe-1.5",
        )
        get_credential.return_value.get_token.return_value.token = "test-token"
        response = MagicMock()
        response.read.return_value = json.dumps(
            {"data": [{"b64_json": "aW1hZ2U="}]}
        ).encode()
        urlopen.return_value.__enter__.return_value = response

        result = generate_image(
            model="MAI-Image-2.5",
            prompt="A red fox",
            width=1024,
            height=1024,
        )

        request = urlopen.call_args.args[0]
        self.assertEqual(
            request.full_url,
            "https://demo.services.ai.azure.com/mai/v1/images/generations",
        )
        self.assertEqual(request.get_header("Authorization"), "Bearer test-token")
        self.assertEqual(json.loads(request.data)["model"], "MAI-Image-2.5")
        self.assertEqual(result["image_base64"], "aW1hZ2U=")
        get_credential.return_value.get_token.assert_called_once_with(
            "https://cognitiveservices.azure.com/.default"
        )

    @patch("app.foundry_client.urlopen")
    @patch("app.foundry_client.get_azure_credential")
    @patch("app.foundry_client.load_settings")
    def test_generate_image_uses_openai_endpoint_for_gpt_image(
        self,
        load_settings: MagicMock,
        get_credential: MagicMock,
        urlopen: MagicMock,
    ) -> None:
        load_settings.return_value = FoundrySettings(
            endpoint="https://demo.services.ai.azure.com/api/projects/demo",
            models=["gpt-image-2"],
            realtime_endpoint=None,
            realtime_model="",
            embedding_model="",
            transcription_model="",
            tts_model="",
            tts_voice="",
            speech_endpoint=None,
            speech_key=None,
            speech_transcription_model="MAI-Transcribe-1.5",
        )
        get_credential.return_value.get_token.return_value.token = "test-token"
        response = MagicMock()
        response.read.return_value = json.dumps(
            {"data": [{"b64_json": "aW1hZ2U="}]}
        ).encode()
        urlopen.return_value.__enter__.return_value = response

        result = generate_image(
            model="gpt-image-2",
            prompt="A red fox",
            width=1024,
            height=1024,
        )

        request = urlopen.call_args.args[0]
        payload = json.loads(request.data)
        self.assertEqual(
            request.full_url,
            "https://demo.services.ai.azure.com/openai/v1/images/generations",
        )
        self.assertEqual(request.get_header("Authorization"), "Bearer test-token")
        self.assertEqual(payload["model"], "gpt-image-2")
        self.assertEqual(payload["size"], "1024x1024")
        self.assertNotIn("width", payload)
        self.assertEqual(result["image_base64"], "aW1hZ2U=")
        get_credential.return_value.get_token.assert_called_once_with(
            "https://ai.azure.com/.default"
        )

    @patch("app.foundry_client.urlopen")
    @patch("app.foundry_client.get_azure_credential")
    @patch("app.foundry_client.load_settings")
    def test_generate_image_uses_bfl_endpoint_for_flux(
        self,
        load_settings: MagicMock,
        get_credential: MagicMock,
        urlopen: MagicMock,
    ) -> None:
        load_settings.return_value = FoundrySettings(
            endpoint="https://demo.services.ai.azure.com/api/projects/demo",
            models=["FLUX.2-pro"],
            realtime_endpoint=None,
            realtime_model="",
            embedding_model="",
            transcription_model="",
            tts_model="",
            tts_voice="",
            speech_endpoint=None,
            speech_key=None,
            speech_transcription_model="MAI-Transcribe-1.5",
        )
        get_credential.return_value.get_token.return_value.token = "test-token"
        response = MagicMock()
        response.read.return_value = json.dumps(
            {"data": [{"b64_json": "Zmx1eC1pbWFnZQ=="}]}
        ).encode()
        urlopen.return_value.__enter__.return_value = response

        result = generate_image(
            model="FLUX.2-pro",
            prompt="A red fox",
            width=1024,
            height=1024,
        )

        request = urlopen.call_args.args[0]
        payload = json.loads(request.data)
        self.assertEqual(
            request.full_url,
            "https://demo.api.cognitive.microsoft.com/providers/blackforestlabs/v1/flux-2-pro?api-version=preview",
        )
        self.assertEqual(request.get_header("Authorization"), "Bearer test-token")
        self.assertEqual(payload["model"], "flux.2-pro")
        self.assertEqual(payload["n"], 1)
        self.assertEqual(payload["output_format"], "jpeg")
        self.assertEqual(result["image_base64"], "Zmx1eC1pbWFnZQ==")
        self.assertEqual(result["mime_type"], "image/jpeg")
        get_credential.return_value.get_token.assert_called_once_with(
            "https://cognitiveservices.azure.com/.default"
        )

    @patch("app.foundry_client.urlopen")
    @patch("app.foundry_client.get_azure_credential")
    @patch("app.foundry_client.load_settings")
    def test_edit_image_uses_openai_multipart_endpoint(
        self,
        load_settings: MagicMock,
        get_credential: MagicMock,
        urlopen: MagicMock,
    ) -> None:
        load_settings.return_value = FoundrySettings(
            endpoint="https://demo.services.ai.azure.com/api/projects/demo",
            models=["gpt-image-2"],
            realtime_endpoint=None,
            realtime_model="",
            embedding_model="",
            transcription_model="",
            tts_model="",
            tts_voice="",
            speech_endpoint=None,
            speech_key=None,
            speech_transcription_model="MAI-Transcribe-1.5",
        )
        get_credential.return_value.get_token.return_value.token = "test-token"
        response = MagicMock()
        response.read.return_value = json.dumps(
            {"data": [{"b64_json": "ZWRpdGVk"}]}
        ).encode()
        urlopen.return_value.__enter__.return_value = response

        result = edit_image(
            model="gpt-image-2",
            prompt="Use golden-hour lighting",
            image=b"source-image-bytes",
            image_content_type="image/png",
            width=1024,
            height=768,
        )

        request = urlopen.call_args.args[0]
        self.assertEqual(
            request.full_url,
            "https://demo.services.ai.azure.com/openai/v1/images/edits",
        )
        self.assertIn(b'name="model"', request.data)
        self.assertIn(b"gpt-image-2", request.data)
        self.assertIn(b'name="image"', request.data)
        self.assertIn(b"source-image-bytes", request.data)
        self.assertIn(b"1536x1024", request.data)
        self.assertEqual(result["image_base64"], "ZWRpdGVk")
        get_credential.return_value.get_token.assert_called_once_with(
            "https://ai.azure.com/.default"
        )


if __name__ == "__main__":
    unittest.main()
