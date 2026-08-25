# pip install azure-identity requests

import requests
from azure.identity import DefaultAzureCredential

ENDPOINT = "https://<resource-name>.services.ai.azure.com"
API_VERSION = "2026-05-01"
TEXT = "Please call John Smith at 555-123-4567 or email john.smith@example.com to confirm."

# Authenticate (uses your `az login` session, a managed identity, etc.)
token = DefaultAzureCredential().get_token("https://cognitiveservices.azure.com/.default").token
headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

# 1. Build the analyze-text request: kind=PiiEntityRecognition, one document.
url = f"{ENDPOINT}/language/:analyze-text?api-version={API_VERSION}"
body = {
    "kind": "PiiEntityRecognition",
    "analysisInput": {"documents": [{"id": "1", "text": TEXT}]},
}

# 2. Call Azure AI Language.
response = requests.post(url, headers=headers, json=body)
response.raise_for_status()
result = response.json()

# 3. Print the redacted text and the detected PII entities.
document = result["results"]["documents"][0]
print("Redacted text:", document["redactedText"])
for entity in document["entities"]:
    print(f"  - {entity['category']}: {entity['text']} (confidence {entity['confidenceScore']:.2f})")
