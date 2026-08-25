# pip install azure-identity requests

import requests
from azure.identity import DefaultAzureCredential

ENDPOINT = "https://<resource-name>.services.ai.azure.com"
API_VERSION = "2026-05-01"
TEXT = "The patient was prescribed 500mg of Ibuprofen twice daily for chronic back pain."

# Authenticate (uses your `az login` session, a managed identity, etc.)
token = DefaultAzureCredential().get_token("https://cognitiveservices.azure.com/.default").token
headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

# 1. Build the analyze-text request: kind=Healthcare, one document.
url = f"{ENDPOINT}/language/:analyze-text?api-version={API_VERSION}"
body = {
    "kind": "Healthcare",
    "analysisInput": {"documents": [{"id": "1", "text": TEXT}]},
}

# 2. Call Azure AI Language.
response = requests.post(url, headers=headers, json=body)
response.raise_for_status()
result = response.json()

# 3. Print the clinical entities that were found.
document = result["results"]["documents"][0]
for entity in document["entities"]:
    print(f"  - {entity['category']}: {entity['text']} (confidence {entity['confidenceScore']:.2f})")
