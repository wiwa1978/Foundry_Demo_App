# pip install openai azure-identity

from openai import AzureOpenAI
from azure.identity import DefaultAzureCredential, get_bearer_token_provider

ENDPOINT = "https://<resource-name>.openai.azure.com"
TRANSCRIPTION_MODEL = "gpt-4o-transcribe"
AUDIO_FILE_PATH = "meeting.wav"

# 1. Authenticate with Entra ID (no API keys) and build an audio-capable client
token_provider = get_bearer_token_provider(
    DefaultAzureCredential(),
    "https://cognitiveservices.azure.com/.default",
)
client = AzureOpenAI(
    azure_endpoint=ENDPOINT,
    api_version="2025-04-01-preview",
    azure_ad_token_provider=token_provider,
)

# 2. Send the local audio file to the transcription deployment
with open(AUDIO_FILE_PATH, "rb") as audio_file:
    response = client.audio.transcriptions.create(
        model=TRANSCRIPTION_MODEL,
        file=audio_file,
    )

# 3. Print the finalized transcript
print(response.text)
