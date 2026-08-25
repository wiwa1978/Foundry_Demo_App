# pip install azure-ai-projects azure-identity numpy

import numpy as np
from azure.ai.projects import AIProjectClient
from azure.identity import DefaultAzureCredential

ENDPOINT = "https://<resource-name>.services.ai.azure.com/api/projects/<project-name>"
CHAT_MODEL = "gpt-4o-mini"
EMBEDDING_MODEL = "text-embedding-3-small"
DOC_PATH = "policy.txt"
QUESTION = "How many vacation days do employees get?"

# Authenticate once and get an OpenAI-compatible client for the project.
project_client = AIProjectClient(endpoint=ENDPOINT, credential=DefaultAzureCredential())
openai_client = project_client.get_openai_client()

# 1. Load the document and split it into small, naive chunks.
with open(DOC_PATH, encoding="utf-8") as f:
    text = f.read()
chunks = [p.strip() for p in text.split("\n\n") if p.strip()]

# 2. Embed every chunk plus the question with the same embedding model.
chunk_vectors = openai_client.embeddings.create(model=EMBEDDING_MODEL, input=chunks).data
question_vector = openai_client.embeddings.create(model=EMBEDDING_MODEL, input=[QUESTION]).data[0].embedding

# 3. Find the most similar chunks via cosine similarity (in-memory, no vector DB).
def cosine_similarity(a, b):
    a, b = np.array(a), np.array(b)
    return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b)))

scored = sorted(
    ((cosine_similarity(question_vector, item.embedding), chunk) for item, chunk in zip(chunk_vectors, chunks)),
    key=lambda pair: pair[0],
    reverse=True,
)
top_chunks = [chunk for _, chunk in scored[:3]]

# 4. Ground the chat completion with the retrieved chunks and ask the question.
context = "\n\n".join(top_chunks)
prompt = f"Answer the question using only the context below.\n\n<context>\n{context}\n</context>\n\nQuestion: {QUESTION}"
response = openai_client.chat.completions.create(
    model=CHAT_MODEL,
    messages=[{"role": "user", "content": prompt}],
)
print(response.choices[0].message.content)
