import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { ContentExtractorWorkspace } from "./ContentExtractorWorkspace";
import type { ContentExtractorResult } from "./types";

beforeAll(() => {
  URL.createObjectURL = vi.fn(() => "blob:preview");
  URL.revokeObjectURL = vi.fn();
});

const result: ContentExtractorResult = {
  mode: "image",
  filename: "chart.png",
  mime_type: "image/png",
  analyzer_id: "prebuilt-imageSearch",
  operation_id: "op-1",
  status: "Succeeded",
  extracted_text: "A pie chart showing sales by region.",
  fields: {},
  warnings: [],
};

function renderWorkspace({
  loading = false,
  nextResult = result,
  nextFile = new File(["image"], "chart.png", { type: "image/png" }),
}: {
  loading?: boolean;
  nextResult?: ContentExtractorResult | null;
  nextFile?: File | null;
} = {}) {
  return render(
    <ContentExtractorWorkspace
      file={nextFile}
      result={nextResult}
      loading={loading}
    />,
  );
}

describe("ContentExtractorWorkspace", () => {
  it("renders the original image above extracted text", () => {
    renderWorkspace();

    const image = screen.getByRole("img", { name: "Uploaded image chart.png" });
    const extracted = screen.getByText("A pie chart showing sales by region.");

    expect(image).toHaveAttribute("src", "blob:preview");
    expect(
      image.compareDocumentPosition(extracted) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("prompts for an upload before a file is selected", () => {
    renderWorkspace({ nextFile: null, nextResult: null });

    expect(screen.getByText("No file uploaded yet.")).toBeInTheDocument();
    expect(
      screen.getByText("Extracted text appears here."),
    ).toBeInTheDocument();
  });

  it("shows progress while extraction runs", () => {
    renderWorkspace({ loading: true, nextResult: null });

    expect(screen.getByText("Extracting content...")).toBeInTheDocument();
  });

  it("renders an audio player for audio results", () => {
    const audioResult: ContentExtractorResult = {
      mode: "audio",
      filename: "call.wav",
      mime_type: "audio/wav",
      analyzer_id: "prebuilt-callCenter",
      operation_id: "op-2",
      status: "Succeeded",
      extracted_text: "Customer called about a billing issue.",
      fields: {},
      warnings: [],
    };
    renderWorkspace({
      nextFile: new File(["audio"], "call.wav", { type: "audio/wav" }),
      nextResult: audioResult,
    });

    expect(screen.getByText("call.wav")).toBeInTheDocument();
    expect(
      screen.getByText("Customer called about a billing issue."),
    ).toBeInTheDocument();
  });

  it("renders a placeholder for document files without an inline preview", () => {
    const documentResult: ContentExtractorResult = {
      mode: "document",
      filename: "invoice.pdf",
      mime_type: "application/pdf",
      analyzer_id: "prebuilt-invoice",
      operation_id: "op-3",
      status: "Succeeded",
      extracted_text: "# Invoice\n\nSee structured fields below.",
      fields: { Total: { valueString: "$100.00" } },
      warnings: [],
    };
    renderWorkspace({
      nextFile: new File(["pdf"], "invoice.pdf", {
        type: "application/pdf",
      }),
      nextResult: documentResult,
    });

    expect(screen.getByText("invoice.pdf")).toBeInTheDocument();
    expect(screen.getByText("Structured fields")).toBeInTheDocument();
    expect(screen.getByText("Total")).toBeInTheDocument();
    expect(screen.getByText("$100.00")).toBeInTheDocument();
  });
});
