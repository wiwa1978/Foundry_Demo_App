import { FileAudio, FileText, ImageIcon, LoaderCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import type { ContentExtractorResult } from "./types";

const markdownPlugins = [remarkGfm];

const markdownComponents: Components = {
  h1: ({ children }) => (
    <h1 className="text-xl font-semibold tracking-tight text-slate-950 dark:text-white">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-lg font-semibold tracking-tight text-slate-950 dark:text-white">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-base font-semibold tracking-tight text-slate-950 dark:text-white">
      {children}
    </h3>
  ),
  hr: () => <hr className="border-slate-200 dark:border-[#606066]" />,
  li: ({ children }) => <li className="pl-1">{children}</li>,
  ol: ({ children }) => (
    <ol className="list-decimal space-y-2 pl-5">{children}</ol>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-slate-950 dark:text-white">
      {children}
    </strong>
  ),
  table: ({ children }) => (
    <div className="overflow-x-auto">
      <table className="min-w-full border-collapse text-left text-sm">
        {children}
      </table>
    </div>
  ),
  td: ({ children }) => (
    <td className="border border-slate-200 px-3 py-2 align-top dark:border-[#606066]">
      {children}
    </td>
  ),
  th: ({ children }) => (
    <th className="border border-slate-200 bg-slate-50 px-3 py-2 align-top font-semibold dark:border-[#606066] dark:bg-[#45454a]">
      {children}
    </th>
  ),
  ul: ({ children }) => (
    <ul className="list-disc space-y-2 pl-5">{children}</ul>
  ),
};

// Analyzers whose extracted text is Content Understanding markdown (tables,
// headings) rather than plain prose, so it's worth rendering as markdown.
const MARKDOWN_ANALYZER_IDS = new Set([
  "prebuilt-layout",
  "prebuilt-invoice",
  "prebuilt-tax.us",
  "prebuilt-documentFields",
]);

function previewKind(file: File | null): "image" | "audio" | "document" {
  if (!file) {
    return "document";
  }
  if (file.type.startsWith("image/")) {
    return "image";
  }
  if (file.type.startsWith("audio/")) {
    return "audio";
  }
  return "document";
}

const FIELD_VALUE_KEYS = [
  "valueString",
  "valueNumber",
  "valueInteger",
  "valueBoolean",
  "valueDate",
  "valueTime",
] as const;

// Content Understanding field entries are descriptor objects
// (e.g. { type: "string", valueString: "..." }); unwrap the actual value
// before rendering it in the table.
function flattenFieldValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of FIELD_VALUE_KEYS) {
      if (key in record) {
        return flattenFieldValue(record[key]);
      }
    }
  }
  return JSON.stringify(value);
}

export function ContentExtractorWorkspace({
  file,
  result,
  loading,
}: {
  file: File | null;
  result: ContentExtractorResult | null;
  loading: boolean;
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const extractedText = result?.extracted_text.trim() ?? "";
  const kind = previewKind(file);
  const fieldEntries = useMemo(
    () => Object.entries(result?.fields ?? {}),
    [result],
  );
  const renderAsMarkdown = Boolean(
    result?.analyzer_id && MARKDOWN_ANALYZER_IDS.has(result.analyzer_id),
  );

  useEffect(() => {
    if (!file || kind === "document") {
      setPreviewUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file, kind]);

  return (
    <div className="flex flex-1 overflow-auto p-5">
      <section className="flex min-h-full flex-1 flex-col rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-[#3f3f46] dark:bg-[#202025]">
        <div className="border-b border-slate-200 px-5 py-4 dark:border-[#3f3f46]">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50">
            Extracted data
          </h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {result
              ? `${result.analyzer_id} • ${result.status}`
              : "Upload an image, document, or audio file from the left pane, then extract text and fields."}
          </p>
        </div>

        <div className="grid flex-1 gap-5 overflow-auto p-5">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-[#3f3f46] dark:bg-[#2b2b30]">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
              {kind === "audio" ? (
                <FileAudio className="h-4 w-4" />
              ) : kind === "document" ? (
                <FileText className="h-4 w-4" />
              ) : (
                <ImageIcon className="h-4 w-4" />
              )}
              {kind === "audio"
                ? "Original audio"
                : kind === "document"
                  ? "Original document"
                  : "Original image"}
            </div>
            {kind === "image" && previewUrl ? (
              <img
                src={previewUrl}
                alt={
                  file?.name ? `Uploaded image ${file.name}` : "Uploaded image"
                }
                className="max-h-[34rem] w-full rounded-xl object-contain"
              />
            ) : kind === "audio" && previewUrl ? (
              <div className="flex flex-col gap-3 rounded-xl border border-dashed border-slate-300 p-4 dark:border-[#55555a]">
                <span className="truncate text-sm text-slate-600 dark:text-slate-300">
                  {file?.name}
                </span>
                <audio controls src={previewUrl} className="w-full">
                  <track
                    default
                    kind="captions"
                    label="Transcript"
                    src={`data:text/vtt;charset=utf-8,${encodeURIComponent(
                      `WEBVTT\n\n00:00:00.000 --> 99:59:59.000\n${extractedText || "No transcript available."}`,
                    )}`}
                  />
                </audio>
              </div>
            ) : kind === "document" && file ? (
              <div className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 p-6 text-center dark:border-[#55555a]">
                <FileText className="h-8 w-8 text-slate-400 dark:text-slate-500" />
                <span className="truncate text-sm font-medium text-slate-700 dark:text-slate-200">
                  {file.name}
                </span>
                <span className="text-xs text-slate-400 dark:text-slate-500">
                  Preview isn&apos;t available for this file type; see the
                  extracted content on the right.
                </span>
              </div>
            ) : (
              <div className="flex min-h-72 items-center justify-center rounded-xl border border-dashed border-slate-300 text-sm text-slate-400 dark:border-[#55555a] dark:text-slate-500">
                No file uploaded yet.
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-[#3f3f46] dark:bg-[#202025]">
            <div className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
              Extracted text
            </div>
            {loading ? (
              <span className="inline-flex items-center gap-2 text-slate-500 dark:text-slate-400">
                <LoaderCircle className="h-4 w-4 animate-spin" />
                Extracting content...
              </span>
            ) : extractedText ? (
              renderAsMarkdown ? (
                <div className="space-y-3 text-sm leading-7 text-slate-900 dark:text-slate-50">
                  <ReactMarkdown
                    components={markdownComponents}
                    remarkPlugins={markdownPlugins}
                  >
                    {extractedText}
                  </ReactMarkdown>
                </div>
              ) : (
                <pre className="whitespace-pre-wrap text-sm leading-7 text-slate-900 dark:text-slate-50">
                  {extractedText}
                </pre>
              )
            ) : (
              <span className="text-sm text-slate-400 dark:text-slate-500">
                Extracted text appears here.
              </span>
            )}
          </div>

          {fieldEntries.length ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-[#3f3f46] dark:bg-[#202025]">
              <div className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
                Structured fields
              </div>
              <div className="overflow-auto rounded-xl border border-slate-200 dark:border-[#3f3f46]">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-[#2b2b30] dark:text-slate-400">
                    <tr>
                      <th className="px-3 py-2 font-medium">Field</th>
                      <th className="px-3 py-2 font-medium">Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-[#3f3f46]">
                    {fieldEntries.map(([key, value]) => (
                      <tr key={key}>
                        <td className="whitespace-nowrap px-3 py-2 font-medium text-slate-600 dark:text-slate-300">
                          {key}
                        </td>
                        <td className="px-3 py-2 text-slate-900 dark:text-slate-50">
                          {flattenFieldValue(value)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
