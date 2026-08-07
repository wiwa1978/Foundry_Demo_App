import type { UseCaseModule } from "@/app/types";

export const documentQaUseCase: UseCaseModule = {
  id: "document_qa",
  title: "Document Q&A",
  shortTitle: "Documents",
  description:
    "Upload documents, retrieve relevant chunks with Azure AI Search, and ask grounded questions.",
  badge: "RAG",
  icon: "documents",
  modalities: ["text"],
  implementation: [
    "The browser uploads documents to the FastAPI backend, which extracts text and chunks it for retrieval.",
    "The backend creates Foundry embeddings for each chunk and stores the text plus vectors in Azure AI Search.",
    "Questions are embedded with the same Foundry embedding deployment, retrieved with hybrid Azure AI Search, then answered by the selected Foundry chat model with citations.",
  ],
  codeSnippet: {
    title: "Azure AI Search + Foundry embeddings RAG flow",
    language: "python",
    code: [
      "embedding = create_embeddings(inputs=[question], model=settings.embedding_model)",
      "vector_query = VectorizedQuery(",
      "    vector=embedding['vectors'][0],",
      "    k_nearest_neighbors=6,",
      "    fields='content_vector',",
      ")",
      "results = search_client.search(",
      "    search_text=question,",
      "    vector_queries=[vector_query],",
      "    select=['filename', 'chunk_index', 'content'],",
      "    top=6,",
      ")",
      "grounded_prompt = build_grounded_prompt(question, list(results))",
      "answer = stream_chat(model=chat_model, prompt=grounded_prompt, ...)",
    ].join("\n"),
  },
  workspace: "chat",
  showDocumentControls: true,
  showChatComposer: true,
};
