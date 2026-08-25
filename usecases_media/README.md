# Media use cases

Each media marketplace use case has a dedicated executable module containing:

- `module.ts` for marketplace registration and behavior metadata.
- `frontend.ts` as the public frontend entry point.
- `backend/` for backend code owned by the use case when it has a server component.

Voice and image implementations remain single-source under `shared/voice/backend` and `shared/images/backend`, avoiding duplicated runtimes across cards.

| Modality | Use case                                    | Implementation map                                                               |
| -------- | ------------------------------------------- | -------------------------------------------------------------------------------- |
| Text     | Text Chat                                   | [`text_chat`](text_chat/README.md)                                               |
| Text     | Document Q&A                                | [`document_qa`](document_qa/README.md)                                           |
| Text     | Side by Side - Text Chat                    | [`text_chat_comparison`](text_chat_comparison/README.md)                         |
| Text     | Azure Translator                            | [`text_translation`](text_translation/)                                          |
| Text     | Azure Language - Language Detection         | [`language_detection`](language_detection/)                                      |
| Text     | Azure Language - PII Redaction              | [`pii_redaction`](pii_redaction/)                                                |
| Text     | Azure Language - Text Analytics for Health  | [`text_analytics_health`](text_analytics_health/)                                |
| Text     | Content Extractor                           | [`content_extractor`](content_extractor/)                                        |
| Audio    | Browser based voice                         | [`browser_voice`](browser_voice/README.md)                                       |
| Audio    | STT -> Chat -> TTS                          | [`stt_chat_tts`](stt_chat_tts/README.md)                                         |
| Audio    | Language Learning                           | [`language_learning`](language_learning/)                                       |
| Video    | Text to Speech Avatar                       | [`text_to_speech_avatar`](text_to_speech_avatar/README.md)                       |
| Audio    | Recorded Audio Transcription                | [`recorded_transcription`](recorded_transcription/README.md)                     |
| Audio    | Side by Side - Recorded Audio Transcription | [`transcription_comparison`](transcription_comparison/README.md)                 |
| Audio    | Realtime transcription - WebRTC             | [`realtime_transcription_webrtc`](realtime_transcription_webrtc/README.md)       |
| Audio    | Realtime transcription - WebSockets         | [`realtime_transcription_websocket`](realtime_transcription_websocket/README.md) |
| Audio    | GPT Realtime Translation - WebRTC           | [`realtime_translation_webrtc`](realtime_translation_webrtc/README.md)           |
| Audio    | Realtime translation - GPT Realtime         | [`realtime_translation_websocket`](realtime_translation_websocket/README.md)     |
| Audio    | Realtime Speech in / Speech out             | [`realtime_voice`](realtime_voice/README.md)                                     |
| Audio    | Voice Live travel concierge                 | [`voice_live`](voice_live/README.md)                                             |
| Audio    | Live translation                            | [`live_translation`](live_translation/README.md)                                 |
| Image    | Text to Image                               | [`text_to_image`](text_to_image/README.md)                                       |
| Image    | Image to Image                              | [`image_to_image`](image_to_image/README.md)                                     |
| Image    | Side by Side - Text Image                   | [`image_comparison`](image_comparison/README.md)                                 |
| Video    | YouTube Video Summarization                 | [`youtube_summary`](youtube_summary/README.md)                                   |
