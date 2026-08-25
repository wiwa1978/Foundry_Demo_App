# pip install azure-identity requests

import base64
import time

import requests
from azure.identity import DefaultAzureCredential

ENDPOINT = "https://<resource-name>.services.ai.azure.com"
ANALYZER = "prebuilt-layout"  # extracts text/tables/markdown from documents & images
FILE_PATH = "invoice.pdf"

# Authenticate (uses your `az login` session, a managed identity, etc.)
token = DefaultAzureCredential().get_token("https://cognitiveservices.azure.com/.default").token
headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

# 1. Submit the file to the analyzer
with open(FILE_PATH, "rb") as f:
    file_bytes = f.read()

analyze_url = f"{ENDPOINT}/contentunderstanding/analyzers/{ANALYZER}:analyze?api-version=2025-11-01"
body = {"inputs": [{"name": FILE_PATH, "data": base64.b64encode(file_bytes).decode()}]}
submitted = requests.post(analyze_url, headers=headers, json=body)
submitted.raise_for_status()
operation_url = submitted.headers["Operation-Location"]

# 2. Poll until the analysis is done
while True:
    result = requests.get(operation_url, headers=headers).json()
    if result["status"] == "Succeeded":
        break
    if result["status"] in {"Failed", "Cancelled"}:
        raise RuntimeError(f"Analysis failed: {result}")
    time.sleep(1)

# 3. Print the extracted content
markdown = result["result"]["contents"][0]["markdown"]
print(markdown)
