import { ImageIcon, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";

import type { ContentExtractorResult } from "./types";

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

  useEffect(() => {
    if (!file || !file.type.startsWith("image/")) {
      setPreviewUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

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
              : "Upload an image from the left pane, then extract text and fields."}
          </p>
        </div>

        <div className="grid flex-1 gap-5 overflow-auto p-5">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-[#3f3f46] dark:bg-[#2b2b30]">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
              <ImageIcon className="h-4 w-4" />
              Original image
            </div>
            {previewUrl ? (
              <img
                src={previewUrl}
                alt={
                  file?.name ? `Uploaded image ${file.name}` : "Uploaded image"
                }
                className="max-h-[34rem] w-full rounded-xl object-contain"
              />
            ) : (
              <div className="flex min-h-72 items-center justify-center rounded-xl border border-dashed border-slate-300 text-sm text-slate-400 dark:border-[#55555a] dark:text-slate-500">
                No image uploaded yet.
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
              <pre className="whitespace-pre-wrap text-sm leading-7 text-slate-900 dark:text-slate-50">
                {extractedText}
              </pre>
            ) : (
              <span className="text-sm text-slate-400 dark:text-slate-500">
                Extracted text appears here.
              </span>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
