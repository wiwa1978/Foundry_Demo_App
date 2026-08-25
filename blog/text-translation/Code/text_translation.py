# pip install azure-identity requests

import requests
from azure.identity import DefaultAzureCredential

ENDPOINT = "https://<resource-name>.services.ai.azure.com"
API_VERSION = "2025-10-01-preview"
TEXT = "Good morning, how are you today?"
TARGET_LANGUAGE = "fr"

# Authenticate (uses your `az login` session, a managed identity, etc.)
token = DefaultAzureCredential().get_token("https://cognitiveservices.azure.com/.default").token
headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

# 1. Build the translate request: one input, one or more target languages.
url = f"{ENDPOINT}/translator/text/translate?api-version={API_VERSION}"
body = {"inputs": [{"Text": TEXT, "targets": [{"language": TARGET_LANGUAGE}]}]}

# 2. Call the Translator API.
response = requests.post(url, headers=headers, json=body)
response.raise_for_status()
result = response.json()["value"][0]

# 3. Print the detected source language and the translation.
detected = result.get("detectedLanguage", {})
translation = result["translations"][0]
print(f"Detected source language: {detected.get('language')} (confidence {detected.get('score')})")
print(f"Translated ({translation['language']}): {translation['text']}")
