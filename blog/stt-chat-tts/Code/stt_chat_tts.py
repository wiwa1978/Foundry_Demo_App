# pip install openai azure-identity

from openai import AzureOpenAI
from azure.identity import DefaultAzureCredential, get_bearer_token_provider

ENDPOINT = "https://<resource-name>.openai.azure.com"
CHAT_MODEL = "gpt-4o-mini"
TRANSCRIPTION_MODEL = "gpt-4o-mini-transcribe"
TTS_MODEL = "gpt-4o-mini-tts"
TTS_VOICE = "alloy"
INPUT_AUDIO_PATH = "question.wav"
OUTPUT_AUDIO_PATH = "reply.mp3"

# Authenticate once with Entra ID (no API keys) and reuse the client for all three calls
token_provider = get_bearer_token_provider(
    DefaultAzureCredential(),
    "https://cognitiveservices.azure.com/.default",
)
client = AzureOpenAI(
    azure_endpoint=ENDPOINT,
    api_version="2025-04-01-preview",
    azure_ad_token_provider=token_provider,
)

# 1. Speech-to-text: turn the recorded question into a transcript
with open(INPUT_AUDIO_PATH, "rb") as audio_file:
    transcription = client.audio.transcriptions.create(
        model=TRANSCRIPTION_MODEL,
        file=audio_file,
    )
transcript = transcription.text
print(f"You said: {transcript}")

# 2. Chat: send the transcript to the model and get a text reply
chat_response = client.chat.completions.create(
    model=CHAT_MODEL,
    messages=[{"role": "user", "content": transcript}],
)
reply_text = chat_response.choices[0].message.content
print(f"Assistant: {reply_text}")

# 3. Text-to-speech: convert the reply back into spoken audio
speech_response = client.audio.speech.create(
    model=TTS_MODEL,
    voice=TTS_VOICE,
    input=reply_text,
    response_format="mp3",
)
speech_response.write_to_file(OUTPUT_AUDIO_PATH)
print(f"Saved spoken reply to {OUTPUT_AUDIO_PATH}")
