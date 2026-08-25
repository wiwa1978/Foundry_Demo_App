# Getting Started: Language Detection with Microsoft Foundry

Language detection identifies which language a piece of text is written in — useful for routing content, picking a translation target, or tagging user input before further processing. In this post we'll build the simplest possible version: send text, get back the detected language and a confidence score.

## What you need

1. A **Foundry / Azure AI Services resource** with Azure AI Language enabled.
2. **Azure CLI login** (`az login`) with a role that can call it (e.g. *Cognitive Services User*) — or any identity `DefaultAzureCredential` picks up. No API keys required.
3. Two Python packages:

```bash
pip install azure-identity requests
```

## The core idea

Every Azure AI Language capability goes through the same `:analyze-text` endpoint; only the `kind` and parameters change:

1. **Authenticate** — get a bearer token Azure trusts.
2. **Describe the request** — set `kind` to `LanguageDetection` and pass the text as a document.
3. **POST to the Language endpoint** and read the detected language back out of the response.

```python
import requests
from azure.identity import DefaultAzureCredential

token = DefaultAzureCredential().get_token("https://cognitiveservices.azure.com/.default").token
headers = {"Authorization": f"******", "Content-Type": "application/json"}

url = f"{ENDPOINT}/language/:analyze-text?api-version=2026-05-01"
body = {
    "kind": "LanguageDetection",
    "analysisInput": {"documents": [{"id": "1", "text": "Ce restaurant offre un service excellent."}]},
}

response = requests.post(url, headers=headers, json=body)
document = response.json()["results"]["documents"][0]
print(document["detectedLanguage"])
```

That's the whole flow — one REST call, no chat model involved.

## The full script

The attached [`language_detection.py`](Code/language_detection.py) runs this end-to-end:

```bash
python Code/language_detection.py
```

Set `ENDPOINT` and `TEXT` at the top of the file to point it at your resource and your own input.

## What we intentionally left out

The production Language Detection use case in this repo shares one workspace and set of controls with translation, PII redaction, and text analytics for health — same request builder, same output panel, same error handling — plus request/response tracing and guardrail policies layered on top. None of that changes the fundamentals above: it's the exact same `kind: "LanguageDetection"` call against the same `:analyze-text` endpoint.

## Try it yourself

Point `Code/language_detection.py` at your own Language-enabled resource, swap in text in a few different languages, and watch the detected language and confidence score change.
