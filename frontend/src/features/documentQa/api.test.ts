import { describe, expect, it, vi } from "vitest";

import { listDocuments, removeDocument } from "./api";

describe("Document Q&A API", () => {
  it("lists documents", async () => {
    const fetchClient = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ documents: [{ id: "doc-1", filename: "demo.pdf" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const result = await listDocuments(fetchClient);
    expect(result.documents[0].id).toBe("doc-1");
  });

  it("surfaces delete failures", async () => {
    const fetchClient = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ detail: "Document not found." }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      }),
    );
    await expect(removeDocument(fetchClient, "missing")).rejects.toThrow("Document not found.");
  });
});
