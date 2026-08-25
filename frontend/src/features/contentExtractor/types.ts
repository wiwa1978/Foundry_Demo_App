export type ContentExtractorMode = "image" | "document" | "audio";

export type ContentExtractorDocumentAnalyzer =
  "layout" | "invoice" | "tax_us" | "fields" | "read";

export type ContentExtractorResult = {
  mode: ContentExtractorMode;
  filename: string;
  mime_type: string;
  analyzer_id: string;
  operation_id?: string | null;
  status: string;
  extracted_text: string;
  fields: Record<string, unknown>;
  warnings: Array<Record<string, unknown>>;
};

export type ContentExtractorSample = {
  id: string;
  name: string;
  description: string;
  sample_url: string;
};

export const contentExtractorModes: Array<{
  value: ContentExtractorMode;
  label: string;
}> = [
  { value: "image", label: "Image" },
  { value: "document", label: "Document" },
  { value: "audio", label: "Audio" },
];

export const contentExtractorDocumentAnalyzers: Array<{
  value: ContentExtractorDocumentAnalyzer;
  label: string;
  description: string;
}> = [
  {
    value: "layout",
    label: "Document Layout",
    description: "Markdown structure, tables, and headings.",
  },
  {
    value: "invoice",
    label: "Invoice",
    description: "Vendor, totals, and line items from invoices.",
  },
  {
    value: "tax_us",
    label: "Tax (US)",
    description: "Fields from common US tax forms (1040, W-2, and more).",
  },
  {
    value: "fields",
    label: "Document Fields",
    description: "General key-value pairs from any document.",
  },
  {
    value: "read",
    label: "OCR Read",
    description: "Plain text via optical character recognition.",
  },
];

export const contentExtractorDefaultDocumentAnalyzer: ContentExtractorDocumentAnalyzer =
  "layout";
