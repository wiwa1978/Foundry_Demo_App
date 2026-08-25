# Getting Started: Document Q&A with Microsoft Foundry

Document Q&A lets you ask natural-language questions over your own files instead of manually searching through them. In this post we'll build the simplest possible version of retrieval-augmented generation (RAG): embed a document's chunks, find the ones most relevant to a question, and ask a chat model to answer using only that context.

## What you need

1. A **Foundry project** with a chat model deployment (e.g. `gpt-4o-mini`) and an embedding model deployment (e.g. `text-embedding-3-small`).
2. **Azure CLI login** (`az login`) with the *Azure AI User* role on the project, or any identity `DefaultAzureCredential` picks up. No API keys.
3. Three Python packages:

```bash
pip install azure-ai-projects azure-identity numpy
```

## The core idea

Real RAG systems use a vector database; for a single short document you don't need one — plain cosine similarity in memory does the job:

1. **Chunk the document** — split it into small, naive pieces (paragraphs work fine for a demo).
2. **Embed every chunk** — one call to the embeddings API turns each chunk into a vector.
3. **Embed the question** and compare it to every chunk vector with cosine similarity to find the most relevant ones.
4. **Stuff the top chunks into a chat prompt** and ask the model to answer using only that context.

```python
chunk_vectors = openai_client.embeddings.create(model=EMBEDDING_MODEL, input=chunks).data
question_vector = openai_client.embeddings.create(model=EMBEDDING_MODEL, input=[QUESTION]).data[0].embedding

top_chunks = pick_most_similar(question_vector, chunk_vectors, chunks)

context = "\n\n".join(top_chunks)
prompt = f"Answer the question using only the context below.\n\n<context>\n{context}\n</context>\n\nQuestion: {QUESTION}"
response = openai_client.chat.completions.create(model=CHAT_MODEL, messages=[{"role": "user", "content": prompt}])
```

Both the embeddings call and the chat completion go through the same `openai_client` you get from `AIProjectClient` — there's no separate SDK to learn for embeddings.

## The full script

The attached [`document_qa.py`](Code/document_qa.py) runs the whole flow against a local text file:

```bash
python Code/document_qa.py
```

Set `ENDPOINT`, `CHAT_MODEL`, `EMBEDDING_MODEL`, and `DOC_PATH` at the top of the file, drop a `.txt` file with paragraph breaks (`\n\n`) next to the script, and ask it a question.

## What we intentionally left out

The production Document Q&A use case in this repo stores uploaded files in Blob Storage, indexes chunk embeddings in Azure AI Search for real vector search at scale, tracks per-user document ownership, supports PDF/DOCX/CSV extraction, streams answers with guardrail comparison across model variants, and persists conversation history. None of that changes the fundamentals shown here — it's the same embed-chunks → find-nearest → ground-the-prompt pattern, just backed by a real vector index instead of an in-memory list once your documents get too large or numerous for that to scale.

## Try it yourself

Point `Code/document_qa.py` at your own Foundry project and a short text file, ask it a question about the content, and you have working RAG in under a minute.
