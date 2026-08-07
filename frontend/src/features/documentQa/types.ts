import type {
  FoundryRequestTrace,
  FoundryResponseTrace,
} from "@/features/textChat/types";

export type DocumentSummary = {
  id: string;
  filename: string;
  content_type: string | null;
  byte_size: number;
  chunk_count: number;
  blob_name: string | null;
  blob_url: string | null;
  created_at: string;
};

export type DocumentUploadResponse = {
  documents: DocumentSummary[];
  embedding_traces: Array<{
    foundry_request?: FoundryRequestTrace;
    foundry_response?: FoundryResponseTrace;
  }>;
};
