# Getting Started: Text Analytics for Health with Microsoft Foundry

Text Analytics for Health extracts clinical entities — medications, dosages, diagnoses, symptoms — from unstructured medical text, and links them to standard vocabularies. In this post we'll build the simplest possible version: send clinical text, get back a list of detected entities.

## What you need

1. A **Foundry / Azure AI Services resource** with Azure AI Language enabled.
2. **Azure CLI login** (`az login`) with a role that can call it (e.g. *Cognitive Services User*) — or any identity `DefaultAzureCredential` picks up. No API keys required.
3. Two Python packages:

```bash
pip install azure-identity requests
```

## The core idea

Text Analytics for Health is just another `kind` on the same `:analyze-text` endpoint used for language detection and PII redaction:

1. **Authenticate** — get a bearer token Azure trusts.
2. **Describe the request** — set `kind` to `Healthcare` and pass the clinical text as a document.
3. **POST to the Language endpoint** and read the `entities` array back out of the response.

```python
import requests
from azure.identity import DefaultAzureCredential

token = DefaultAzureCredential().get_token("https://cognitiveservices.azure.com/.default").token
headers = {"Authorization": f"******", "Content-Type": "application/json"}

url = f"{ENDPOINT}/language/:analyze-text?api-version=2026-05-01"
body = {
    "kind": "Healthcare",
    "analysisInput": {"documents": [{"id": "1", "text": "Prescribed 500mg of Ibuprofen twice daily."}]},
}

response = requests.post(url, headers=headers, json=body)
document = response.json()["results"]["documents"][0]
for entity in document["entities"]:
    print(entity["category"], entity["text"])
```

One REST call returns every clinical entity found, each tagged with a category (`MedicationName`, `Dosage`, `Diagnosis`, `SymptomOrSign`, and more) and a confidence score.

## The full script

The attached [`text_analytics_health.py`](Code/text_analytics_health.py) runs this end-to-end:

```bash
python Code/text_analytics_health.py
```

Set `ENDPOINT` and `TEXT` at the top of the file to point it at your resource and your own clinical text.

## What we intentionally left out

The production Text Analytics for Health use case in this repo runs inside the same shared Language Services workspace as translation, language detection, and PII redaction — same request builder, same tracing, same guardrail policies — with a dedicated non-chat analysis view for reviewing entities and their relations. None of that changes the fundamentals above: it's the same single `kind: "Healthcare"` call against `:analyze-text`.

## Try it yourself

Point `Code/text_analytics_health.py` at your own Language-enabled resource, paste in a clinical note or prescription text, and see the medications, dosages, and conditions extracted automatically.
