# Getting Started: Text Translation with Microsoft Foundry

Azure Translator turns text from one language into another (with automatic source-language detection) via a single REST call — no model prompting required. In this post we'll build the simplest possible translation client: send text and a target language, print the result.

## What you need

1. A **Foundry / Azure AI Services resource** with the Translator service enabled.
2. **Azure CLI login** (`az login`) with a role that can call it (e.g. *Cognitive Services User*) — or any identity `DefaultAzureCredential` picks up. No API keys required (a subscription key via `Ocp-Apim-Subscription-Key` also works if you have one).
3. Two Python packages:

```bash
pip install azure-identity requests
```

## The core idea

Translation is a single, synchronous REST call:

1. **Authenticate** — get a bearer token Azure trusts.
2. **Describe the input and target language(s)** — one `Text` field, one or more `targets`.
3. **POST to the Translator endpoint** and read back the detected source language and translation(s).

```python
import requests
from azure.identity import DefaultAzureCredential

token = DefaultAzureCredential().get_token("https://cognitiveservices.azure.com/.default").token
headers = {"Authorization": f"******", "Content-Type": "application/json"}

url = f"{ENDPOINT}/translator/text/translate?api-version=2025-10-01-preview"
body = {"inputs": [{"Text": "Good morning, how are you today?", "targets": [{"language": "fr"}]}]}

response = requests.post(url, headers=headers, json=body)
result = response.json()["value"][0]
print(result["translations"][0]["text"])
```

That's the whole flow — no SDK, just a token and one REST call. Add more entries to `targets` to translate into several languages in a single request.

## The full script

The attached [`text_translation.py`](Code/text_translation.py) runs this end-to-end:

```bash
python Code/text_translation.py
```

Set `ENDPOINT`, `TEXT`, and `TARGET_LANGUAGE` at the top of the file to point it at your resource.

## What we intentionally left out

The production Text Translation use case in this repo shares one workspace with language detection, PII redaction, and text analytics for health, plus an alternative LLM-based translation mode (translating via a chat model instead of the dedicated Translator engine), document-mode translation, request/response tracing, and guardrail policies. None of that changes the fundamentals above — it's all built around the same single POST to the Translator endpoint.

## Try it yourself

Point `Code/text_translation.py` at your own Translator-enabled resource, change `TEXT` and `TARGET_LANGUAGE`, and you have working translation in under a minute.
