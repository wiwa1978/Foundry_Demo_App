# pip install azure-identity requests

import requests
from azure.identity import DefaultAzureCredential

ENDPOINT = "https://<resource-name>.services.ai.azure.com"
API_VERSION = "2026-05-01"
TEXT = "Ce restaurant offre un service excellent et une ambiance chaleureuse."

# Authenticate (uses your `az login` session, a managed identity, etc.)
token = DefaultAzureCredential().get_token("https://cognitiveservices.azure.com/.default").token
headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

# 1. Build the analyze-text request: kind=LanguageDetection, one document.
url = f"{ENDPOINT}/language/:analyze-text?api-version={API_VERSION}"
body = {
    "kind": "LanguageDetection",
    "analysisInput": {"documents": [{"id": "1", "text": TEXT}]},
}

# 2. Call Azure AI Language.
response = requests.post(url, headers=headers, json=body)
response.raise_for_status()
result = response.json()

# 3. Print the detected language for the document.
document = result["results"]["documents"][0]
detected = document["detectedLanguage"]
print(f"Detected language: {detected['name']} ({detected['iso6391Name']}), confidence {detected['confidenceScore']:.2f}")
