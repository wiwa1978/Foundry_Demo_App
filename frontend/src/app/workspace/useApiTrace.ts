import { useCallback, useMemo, useRef, useState } from "react";

import { createTracedFetch } from "@/api/client";
import type { ApiTraceEntry, ApiTraceFilter } from "@/app/workspace/contracts";
import {
  formatApiSurface,
  redactTracePayload,
} from "@/app/workspace/traceUtils";
import type {
  FoundryRequestTrace,
  FoundryResponseTrace,
} from "@/features/textChat/types";

const maxTraceEntries = 100;

type NewApiTraceEntry = Omit<ApiTraceEntry, "id" | "timestamp">;

export type ApiResponseTrace = {
  label: string;
  method: string;
  url: string;
  status?: number;
  durationMs?: number;
  response: unknown;
  afterId?: string;
};

export function useApiTrace() {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<ApiTraceFilter>("all");
  const [entries, setEntries] = useState<ApiTraceEntry[]>([]);
  const sequenceRef = useRef(0);

  const createEntry = useCallback((entry: NewApiTraceEntry): ApiTraceEntry => {
    sequenceRef.current += 1;
    return {
      ...entry,
      request: redactTracePayload(entry.request),
      response: redactTracePayload(entry.response),
      id: `trace-${sequenceRef.current}`,
      timestamp: new Date().toISOString(),
    };
  }, []);

  const append = useCallback(
    (entry: NewApiTraceEntry) => {
      const tracedEntry = createEntry(entry);
      setEntries((current) =>
        [...current, tracedEntry].slice(-maxTraceEntries),
      );
      return tracedEntry.id;
    },
    [createEntry],
  );

  const insertAfter = useCallback(
    (afterId: string, entry: NewApiTraceEntry) => {
      const tracedEntry = createEntry(entry);
      setEntries((current) => {
        const index = current.findIndex((item) => item.id === afterId);
        if (index === -1) {
          return [...current, tracedEntry].slice(-maxTraceEntries);
        }
        return [
          ...current.slice(0, index + 1),
          tracedEntry,
          ...current.slice(index + 1),
        ].slice(-maxTraceEntries);
      });
      return tracedEntry.id;
    },
    [createEntry],
  );

  const update = useCallback((id: string, patch: Partial<ApiTraceEntry>) => {
    const redactedPatch = {
      ...patch,
      ...(!Object.prototype.hasOwnProperty.call(patch, "request")
        ? {}
        : { request: redactTracePayload(patch.request) }),
      ...(!Object.prototype.hasOwnProperty.call(patch, "response")
        ? {}
        : { response: redactTracePayload(patch.response) }),
    };
    setEntries((current) =>
      current.map((entry) =>
        entry.id === id ? { ...entry, ...redactedPatch } : entry,
      ),
    );
  }, []);

  const appendFoundryTrace = useCallback(
    (request: FoundryRequestTrace, label?: string) => {
      append({
        direction: "api_foundry",
        label: label ?? `Foundry ${formatApiSurface(request.api_surface)}`,
        method: request.method,
        url: request.path,
        request: request.payload,
      });
    },
    [append],
  );

  const appendFoundryResponseTrace = useCallback(
    (response: FoundryResponseTrace, label?: string) => {
      append({
        direction: "foundry_api",
        label:
          label ?? `Foundry ${formatApiSurface(response.api_surface)} response`,
        method: "RECV",
        url: response.events ? "stream" : "response",
        response: response.events ?? response.payload,
      });
    },
    [append],
  );

  const appendApiResponseTrace = useCallback(
    ({ afterId, ...trace }: ApiResponseTrace) => {
      const entry = {
        direction: "api_frontend",
        ...trace,
      } satisfies NewApiTraceEntry;
      if (afterId) {
        insertAfter(afterId, entry);
        return;
      }
      append(entry);
    },
    [append, insertAfter],
  );

  const tracedFetch = useMemo(
    () =>
      createTracedFetch({
        appendRequest: (trace) =>
          append({ direction: "frontend_api", ...trace }),
        updateRequest: update,
        appendResponse: appendApiResponseTrace,
      }),
    [append, appendApiResponseTrace, update],
  );

  const clear = useCallback(() => setEntries([]), []);
  const close = useCallback(() => setOpen(false), []);
  const show = useCallback(() => setOpen(true), []);

  return {
    open,
    filter,
    entries,
    tracedFetch,
    createEntry,
    append,
    insertAfter,
    update,
    appendFoundryTrace,
    appendFoundryResponseTrace,
    appendApiResponseTrace,
    setOpen,
    show,
    close,
    setFilter,
    clear,
  };
}
