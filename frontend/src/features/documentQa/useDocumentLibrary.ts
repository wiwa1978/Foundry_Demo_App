import { useCallback, useEffect, useRef, useState } from "react";

import type { FetchClient } from "@/api/types";
import type { StatusMessage } from "@/app/workspace/contracts";
import type {
  FoundryRequestTrace,
  FoundryResponseTrace,
} from "@/features/textChat/types";

import {
  documentsEndpoint,
  listDocuments,
  removeDocument,
  uploadDocuments,
} from "./api";
import type { DocumentSummary } from "./types";

type ApiResponseTrace = {
  label: string;
  method: string;
  url: string;
  status?: number;
  response: unknown;
};

type DocumentLibraryOptions = {
  fetchClient: FetchClient;
  enabled: boolean;
  appendFoundryTrace: (request: FoundryRequestTrace, label?: string) => void;
  appendFoundryResponseTrace: (
    response: FoundryResponseTrace,
    label?: string,
  ) => void;
  appendApiResponseTrace: (trace: ApiResponseTrace) => void;
};

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

export function useDocumentLibrary({
  fetchClient,
  enabled,
  appendFoundryTrace,
  appendFoundryResponseTrace,
  appendApiResponseTrace,
}: DocumentLibraryOptions) {
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<StatusMessage | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);
  const mountedRef = useRef(true);

  const startOperation = useCallback(() => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    generationRef.current += 1;
    setLoading(true);
    setMessage(null);
    return { controller, generation: generationRef.current };
  }, []);

  const isCurrent = useCallback(
    (generation: number, controller: AbortController) =>
      mountedRef.current &&
      generation === generationRef.current &&
      !controller.signal.aborted,
    [],
  );

  const refresh = useCallback(async () => {
    if (!enabled) {
      return;
    }
    const { controller, generation } = startOperation();
    try {
      const data = await listDocuments(fetchClient, controller.signal);
      if (!isCurrent(generation, controller)) {
        return;
      }
      setDocuments((current) => [
        ...data.documents,
        ...current.filter(
          (document) =>
            !data.documents.some((uploaded) => uploaded.id === document.id),
        ),
      ]);
    } catch (refreshError) {
      if (isCurrent(generation, controller) && !isAbortError(refreshError)) {
        setMessage({
          type: "error",
          text:
            refreshError instanceof Error
              ? refreshError.message
              : "Failed to load documents.",
        });
      }
    } finally {
      if (isCurrent(generation, controller)) {
        setLoading(false);
      }
    }
  }, [enabled, fetchClient, isCurrent, startOperation]);

  const upload = useCallback(
    async (files: FileList | null) => {
      if (!enabled || !files?.length) {
        return;
      }
      const { controller, generation } = startOperation();
      try {
        const { response, body } = await uploadDocuments(
          fetchClient,
          files,
          controller.signal,
        );
        if (!isCurrent(generation, controller)) {
          return;
        }
        for (const trace of body.embedding_traces ?? []) {
          if (trace.foundry_request) {
            appendFoundryTrace(
              trace.foundry_request,
              "Foundry embeddings for uploaded documents",
            );
          }
          if (trace.foundry_response) {
            appendFoundryResponseTrace(
              trace.foundry_response,
              "Foundry embeddings response",
            );
          }
        }
        appendApiResponseTrace({
          label: "Upload RAG documents response",
          method: "RECV",
          url: documentsEndpoint,
          status: response.status,
          response: body,
        });
        const uploaded = body.documents ?? [];
        setDocuments(uploaded);
        setMessage({
          type: "success",
          text: `Indexed ${uploaded.length} document${uploaded.length === 1 ? "" : "s"} in Azure AI Search.`,
        });
      } catch (uploadError) {
        if (isCurrent(generation, controller) && !isAbortError(uploadError)) {
          setMessage({
            type: "error",
            text:
              uploadError instanceof Error
                ? uploadError.message
                : "Failed to upload documents.",
          });
        }
      } finally {
        if (isCurrent(generation, controller)) {
          setLoading(false);
        }
        if (inputRef.current) {
          inputRef.current.value = "";
        }
      }
    },
    [
      appendApiResponseTrace,
      appendFoundryResponseTrace,
      appendFoundryTrace,
      enabled,
      fetchClient,
      isCurrent,
      startOperation,
    ],
  );

  const remove = useCallback(
    async (document: DocumentSummary) => {
      if (!enabled) {
        return;
      }
      const { controller, generation } = startOperation();
      try {
        await removeDocument(fetchClient, document.id, controller.signal);
        if (!isCurrent(generation, controller)) {
          return;
        }
        setDocuments((current) =>
          current.filter((item) => item.id !== document.id),
        );
        setMessage({
          type: "success",
          text: `Removed ${document.filename} from Azure AI Search.`,
        });
      } catch (removeError) {
        if (isCurrent(generation, controller) && !isAbortError(removeError)) {
          setMessage({
            type: "error",
            text:
              removeError instanceof Error
                ? removeError.message
                : "Failed to delete document.",
          });
        }
      } finally {
        if (isCurrent(generation, controller)) {
          setLoading(false);
        }
      }
    },
    [enabled, fetchClient, isCurrent, startOperation],
  );

  useEffect(() => {
    if (!enabled) {
      generationRef.current += 1;
      controllerRef.current?.abort();
      controllerRef.current = null;
      setLoading(false);
      setDocuments([]);
      setMessage(null);
      return;
    }
    void refresh();
  }, [enabled, refresh]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      generationRef.current += 1;
      controllerRef.current?.abort();
    };
  }, []);

  return {
    documents,
    loading,
    message,
    inputRef,
    refresh,
    upload,
    remove,
  };
}
