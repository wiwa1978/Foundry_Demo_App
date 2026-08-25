# pip install youtube-transcript-api openai azure-identity

from youtube_transcript_api import YouTubeTranscriptApi
from openai import AzureOpenAI
from azure.identity import DefaultAzureCredential, get_bearer_token_provider

ENDPOINT = "https://<resource-name>.openai.azure.com"
CHAT_MODEL = "gpt-4o-mini"
VIDEO_ID = "dQw4w9WgXcQ"  # the 11-character id from a youtube.com/watch?v=... URL

# 1. Fetch the caption track for the video (manual captions, falling back to auto-generated)
transcript_list = YouTubeTranscriptApi().list(VIDEO_ID)
snippets = transcript_list.find_transcript(["en"]).fetch()
transcript = "\n".join(snippet.text for snippet in snippets)

# 2. Authenticate with Entra ID (no API keys) and build a chat client
token_provider = get_bearer_token_provider(
    DefaultAzureCredential(),
    "https://cognitiveservices.azure.com/.default",
)
client = AzureOpenAI(
    azure_endpoint=ENDPOINT,
    api_version="2025-04-01-preview",
    azure_ad_token_provider=token_provider,
)

# 3. Ask the chat model to summarize the transcript
response = client.chat.completions.create(
    model=CHAT_MODEL,
    messages=[
        {"role": "system", "content": "Summarize the video captions concisely."},
        {"role": "user", "content": transcript},
    ],
)

# 4. Print the summary
print(response.choices[0].message.content)
