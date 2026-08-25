# Getting Started: PII Redaction with Microsoft Foundry

PII redaction finds and masks personally identifiable information — names, phone numbers, emails, addresses — in free text before it's stored, logged, or shown elsewhere. In this post we'll build the simplest possible version: send text, get back a redacted copy plus the list of entities that were found.

## What you need

1. A **Foundry / Azure AI Services resource** with Azure AI Language enabled.
2. **Azure CLI login** (`az login`) with a role that can call it (e.g. *Cognitive Services User*) — or any identity `DefaultAzureCredential` picks up. No API keys required.
3. Two Python packages:

```bash
pip install azure-identity requests
```

## The core idea

PII redaction uses the same `:analyze-text` endpoint as language detection and text analytics for health — only the `kind` changes:

1. **Authenticate** — get a bearer token Azure trusts.
2. **Describe the request** — set `kind` to `PiiEntityRecognition` and pass the text as a document.
3. **POST to the Language endpoint** and read back `redactedText` plus the detected `entities`.

```python
import requests
from azure.identity import DefaultAzureCredential

token = DefaultAzureCredential().get_token("https://cognitiveservices.azure.com/.default").token
headers = {"Authorization": f"******", "Content-Type": "application/json"}

url = f"{ENDPOINT}/language/:analyze-text?api-version=2026-05-01"
body = {
    "kind": "PiiEntityRecognition",
    "analysisInput": {"documents": [{"id": "1", "text": "Call John Smith at 555-123-4567."}]},
}

response = requests.post(url, headers=headers, json=body)
document = response.json()["results"]["documents"][0]
print(document["redactedText"])   # "Call ******** at ************."
print(document["entities"])       # category, offset, text, confidence per entity
```

One REST call, no chat model involved — the redaction happens entirely inside the Language service.

## The full script

The attached [`pii_redaction.py`](Code/pii_redaction.py) runs this end-to-end:

```bash
python Code/pii_redaction.py
```

Set `ENDPOINT` and `TEXT` at the top of the file to point it at your resource and your own input.

## What we intentionally left out

The production PII Redaction use case in this repo exposes three modes from one workspace — plain text, uploaded documents, and multi-turn conversations — sharing the same underlying request builder and output rendering as translation and language detection, plus tracing and guardrail policies. None of that changes the fundamentals above: text and conversation modes both call `PiiEntityRecognition` on the same endpoint; document mode adds file upload before the same call.

## Try it yourself

Point `Code/pii_redaction.py` at your own Language-enabled resource, paste in text containing names, emails, or phone numbers, and see them redacted automatically.
