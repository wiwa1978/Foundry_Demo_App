import { act, renderHook, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { FetchClient } from "@/api/types";

import { listDocuments, removeDocument, uploadDocuments } from "./api";
import type { DocumentSummary, DocumentUploadResponse } from "./types";
import { useDocumentLibrary } from "./useDocumentLibrary";

vi.mock("./api", async (importOriginal) => {
  const original = await importOriginal<typeof import("./api")>();
  return {
    ...original,
    listDocuments: vi.fn(),
    uploadDocuments: vi.fn(),
    removeDocument: vi.fn(),
  };
});

const fetchClient = vi.fn<FetchClient>();
const documentOne: DocumentSummary = {
  id: "doc-1",
  filename: "one.pdf",
  content_type: "application/pdf",
  byte_size: 10,
  chunk_count: 1,
  blob_name: null,
  blob_url: null,
  created_at: "2026-01-01T00:00:00Z",
};
const documentTwo: DocumentSummary = {
  ...documentOne,
  id: "doc-2",
  filename: "two.pdf",
};

function fileList(...files: File[]) {
  return Object.assign(files, {
    item: (index: number) => files[index] ?? null,
  }) as unknown as FileList;
}

function setup(enabled = true) {
  const callbacks = {
    appendFoundryTrace: vi.fn(),
    appendFoundryResponseTrace: vi.fn(),
    appendApiResponseTrace: vi.fn(),
  };
  const hook = renderHook(
    ({ active }) =>
      useDocumentLibrary({
        fetchClient,
        enabled: active,
        ...callbacks,
      }),
    { initialProps: { active: enabled } },
  );
  return { ...hook, callbacks };
}

describe("useDocumentLibrary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listDocuments).mockResolvedValue({ documents: [documentOne] });
    vi.mocked(removeDocument).mockResolvedValue(undefined);
  });

  it("refreshes exactly once when enabled and clears documents when disabled", async () => {
    const { result, rerender } = setup(false);
    expect(listDocuments).not.toHaveBeenCalled();

    rerender({ active: true });
    await waitFor(() =>
      expect(result.current.documents).toEqual([documentOne]),
    );
    expect(listDocuments).toHaveBeenCalledOnce();
    rerender({ active: false });
    expect(result.current.documents).toEqual([]);
  });

  it("remains usable across Strict Mode effect replay", async () => {
    const { result } = renderHook(
      () =>
        useDocumentLibrary({
          fetchClient,
          enabled: true,
          appendFoundryTrace: vi.fn(),
          appendFoundryResponseTrace: vi.fn(),
          appendApiResponseTrace: vi.fn(),
        }),
      { wrapper: StrictMode },
    );

    await waitFor(() =>
      expect(result.current.documents).toEqual([documentOne]),
    );
  });

  it("ignores a stale refresh and keeps loading accurate across overlap", async () => {
    let resolveFirst: (value: { documents: DocumentSummary[] }) => void = () =>
      undefined;
    let resolveSecond: (value: { documents: DocumentSummary[] }) => void = () =>
      undefined;
    vi.mocked(listDocuments)
      .mockImplementationOnce(
        () => new Promise((resolve) => (resolveFirst = resolve)),
      )
      .mockImplementationOnce(
        () => new Promise((resolve) => (resolveSecond = resolve)),
      );
    const { result } = setup();
    await waitFor(() => expect(listDocuments).toHaveBeenCalledOnce());
    const firstSignal = vi.mocked(listDocuments).mock.calls[0][1];

    act(() => void result.current.refresh());
    await waitFor(() => expect(listDocuments).toHaveBeenCalledTimes(2));
    expect(firstSignal?.aborted).toBe(true);
    await act(async () => resolveSecond({ documents: [documentTwo] }));
    expect(result.current.documents).toEqual([documentTwo]);
    expect(result.current.loading).toBe(false);
    await act(async () => resolveFirst({ documents: [documentOne] }));
    expect(result.current.documents).toEqual([documentTwo]);
    expect(result.current.loading).toBe(false);
  });

  it("uploads documents, emits traces, resets input, and preserves messages", async () => {
    const body: DocumentUploadResponse = {
      documents: [documentTwo],
      embedding_traces: [
        {
          foundry_request: {
            api_surface: "embeddings",
            method: "POST",
            path: "/embeddings",
            payload: { input: "private" },
          },
          foundry_response: {
            api_surface: "embeddings",
            payload: { dimensions: 2 },
          },
        },
      ],
    };
    vi.mocked(uploadDocuments).mockResolvedValue({
      response: new Response(null, { status: 200 }),
      body,
    });
    const { result, callbacks } = setup();
    await waitFor(() =>
      expect(result.current.documents).toEqual([documentOne]),
    );
    const input = document.createElement("input");
    input.value = "placeholder";
    Object.defineProperty(result.current.inputRef, "current", {
      configurable: true,
      value: input,
    });

    await act(async () =>
      result.current.upload(fileList(new File(["pdf"], "two.pdf"))),
    );

    expect(result.current.documents).toEqual([documentTwo]);
    expect(result.current.message?.text).toBe(
      "Indexed 1 document in Azure AI Search.",
    );
    expect(callbacks.appendFoundryTrace).toHaveBeenCalledOnce();
    expect(callbacks.appendFoundryResponseTrace).toHaveBeenCalledOnce();
    expect(callbacks.appendApiResponseTrace).toHaveBeenCalledWith(
      expect.objectContaining({ status: 200, response: body }),
    );
    expect(input.value).toBe("");
  });

  it("removes documents and reports operation failures", async () => {
    const { result } = setup();
    await waitFor(() =>
      expect(result.current.documents).toEqual([documentOne]),
    );

    await act(async () => result.current.remove(documentOne));
    expect(result.current.documents).toEqual([]);
    expect(result.current.message?.text).toBe(
      "Removed one.pdf from Azure AI Search.",
    );

    vi.mocked(removeDocument).mockRejectedValueOnce("offline");
    await act(async () => result.current.remove(documentTwo));
    expect(result.current.message).toEqual({
      type: "error",
      text: "Failed to delete document.",
    });
  });
});
