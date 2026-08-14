export type ContentExtractorMode = "image" | "document" | "audio";

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

export const contentExtractorModes: Array<{
  value: ContentExtractorMode;
  label: string;
}> = [
  { value: "image", label: "Image" },
  { value: "document", label: "Document" },
  { value: "audio", label: "Audio" },
];
