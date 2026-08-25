# Getting Started: Content Extractor with Microsoft Foundry

Content Understanding (part of Microsoft Foundry) turns unstructured files — PDFs, scanned documents, images, even audio calls — into structured, usable data: markdown text, tables, and named fields, ready for search or downstream processing. In this post we'll build the simplest possible version: submit a document, wait for the result, print the extracted text. No polling frameworks, no multi-mode routing.

## What you need

1. A **Foundry / Azure AI Services resource** with Content Understanding enabled.
2. **Azure CLI login** (`az login`) with a role that can call Content Understanding (e.g. *Cognitive Services User*) — or any identity `DefaultAzureCredential` picks up. No API keys required.
3. Two Python packages:

```bash
pip install azure-identity requests
```

## The core idea

Content Understanding is asynchronous: you submit a file, then poll a status URL until it's done. Three steps:

1. **Authenticate** — get a bearer token Azure trusts.
2. **Submit the file** — POST it (base64-encoded) to a *prebuilt analyzer*, e.g. `prebuilt-layout` for general documents, `prebuilt-invoice` for invoices, `prebuilt-callCenter` for audio.
3. **Poll and read the result** — the submit call returns an `Operation-Location` header; `GET` it repeatedly until `status` is `Succeeded`, then read the extracted markdown.

```python
import base64, time, requests
from azure.identity import DefaultAzureCredential

token = DefaultAzureCredential().get_token("https://cognitiveservices.azure.com/.default").token
headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

with open("invoice.pdf", "rb") as f:
    file_bytes = f.read()

analyze_url = f"{ENDPOINT}/contentunderstanding/analyzers/prebuilt-layout:analyze?api-version=2025-11-01"
body = {"inputs": [{"name": "invoice.pdf", "data": base64.b64encode(file_bytes).decode()}]}

submitted = requests.post(analyze_url, headers=headers, json=body)
operation_url = submitted.headers["Operation-Location"]

while True:
    result = requests.get(operation_url, headers=headers).json()
    if result["status"] == "Succeeded":
        break
    time.sleep(1)

print(result["result"]["contents"][0]["markdown"])
```

That's the whole flow — no SDK, just two REST calls and a token. `DefaultAzureCredential` means no API key sitting in a config file.

## Picking an analyzer

The analyzer ID controls what you get back:

| Analyzer | Best for |
| --- | --- |
| `prebuilt-layout` | General documents — markdown, tables, structure |
| `prebuilt-invoice` | Invoices — structured fields like totals, vendor, line items |
| `prebuilt-read` | Plain OCR text |
| `prebuilt-tax.us` | US tax forms |
| `prebuilt-imageSearch` | Photos and general images |
| `prebuilt-callCenter` | Audio recordings — transcript + call summary fields |

Swap `ANALYZER` in the script and the same submit/poll/read loop works for all of them. Field-based analyzers (invoice, tax, call center) return a `fields` dictionary alongside — or instead of — markdown.

## The full script

The attached [`content_extractor.py`](Code/content_extractor.py) runs this end-to-end against a local file:

```bash
python Code/content_extractor.py
```

Set `ENDPOINT`, `ANALYZER`, and `FILE_PATH` at the top of the file to point it at your resource and document.

## What we intentionally left out

The production Content Extractor use case in this repo adds file-type/size validation, three separate modes (image, document, audio) behind one API, structured field parsing for every analyzer shape, sample file browsing, warning surfacing, and consistent error handling across the marketplace. None of that changes the fundamentals above — it's all built around the same submit → poll → read pattern. Once you're comfortable with this minimal version, handling `fields` (for invoice/tax/call-center analyzers) is just reading a different key from the same result.

## Try it yourself

Point `Code/content_extractor.py` at your own Content Understanding endpoint and a PDF or image on disk, and you have working document extraction in under a minute.
