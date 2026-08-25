import { useEffect, useRef, useState } from "react";

import type { FetchClient } from "@/api/types";

import { getAzureArchitectAgentTrace, streamAzureArchitectAgent } from "./api";
import type {
  AzureArchitectAgentCitation,
  AzureArchitectAgentRunConfig,
  AzureArchitectAgentStep,
  AzureArchitectAgentStreamEvent,
  AzureArchitectAgentTrace,
} from "./types";

const tracePollAttempts = 6;
const tracePollDelayMs = 2000;

type AzureArchitectAgentState = {
  question: string;
  answer: string;
  steps: AzureArchitectAgentStep[];
  citations: AzureArchitectAgentCitation[];
  runConfig: AzureArchitectAgentRunConfig | null;
  isRunning: boolean;
  error: string;
  trace: AzureArchitectAgentTrace | null;
  traceLoading: boolean;
  traceError: string;
};

const initialState: AzureArchitectAgentState = {
  question: "",
  answer: "",
  steps: [],
  citations: [],
  runConfig: null,
  isRunning: false,
  error: "",
  trace: null,
  traceLoading: false,
  traceError: "",
};

export function useAzureArchitectAgentStream({
  fetchClient,
}: {
  fetchClient: FetchClient;
}) {
  const [state, setState] = useState<AzureArchitectAgentState>(initialState);
  const controllerRef = useRef<AbortController | null>(null);
  const runSequenceRef = useRef(0);

  async function loadTrace(
    responseId: string,
    runSequence: number,
    signal: AbortSignal,
  ) {
    setState((current) => ({ ...current, traceLoading: true, traceError: "" }));
    try {
      for (let attempt = 0; attempt < tracePollAttempts; attempt += 1) {
        const trace = await getAzureArchitectAgentTrace({
          fetchClient,
          responseId,
          signal,
        });
        if (runSequence !== runSequenceRef.current) return;
        if (trace.status === "ready") {
          setState((current) => ({ ...current, trace, traceLoading: false }));
          return;
        }
        setState((current) => ({ ...current, trace }));
        await delay(tracePollDelayMs, signal);
      }
      setState((current) => ({
        ...current,
        traceLoading: false,
        traceError: "Trace ingestion is still pending. Check Foundry later.",
      }));
    } catch (error) {
      if (signal.aborted || runSequence !== runSequenceRef.current) return;
      setState((current) => ({
        ...current,
        traceLoading: false,
        traceError:
          error instanceof Error
            ? error.message
            : "Foundry trace retrieval failed.",
      }));
    }
  }

  useEffect(() => () => controllerRef.current?.abort(), []);

  function reset() {
    controllerRef.current?.abort();
    setState(initialState);
  }

  function upsertStep(
    event: Extract<AzureArchitectAgentStreamEvent, { type: "step" }>,
  ) {
    setState((current) => {
      const nextSteps = [...current.steps];
      const index = nextSteps.findIndex((step) => step.id === event.label);
      const nextStep = {
        id: event.label,
        label: event.label,
        status: event.status,
        detail: event.detail ?? null,
      };
      if (index >= 0) {
        nextSteps[index] = nextStep;
      } else {
        nextSteps.push(nextStep);
      }
      return {
        ...current,
        steps: nextSteps,
      };
    });
  }

  async function submit() {
    const question = state.question.trim();
    if (!question || state.isRunning) {
      return;
    }

    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    runSequenceRef.current += 1;
    const runSequence = runSequenceRef.current;

    setState((current) => ({
      ...current,
      question: "",
      answer: "",
      steps: [],
      citations: [],
      runConfig: null,
      isRunning: true,
      error: "",
      trace: null,
      traceLoading: false,
      traceError: "",
    }));

    try {
      await streamAzureArchitectAgent({
        fetchClient,
        question,
        signal: controller.signal,
        onEvent: (event) => {
          if (runSequence !== runSequenceRef.current) {
            return;
          }

          switch (event.type) {
            case "start":
              setState((current) => ({
                ...current,
                runConfig: {
                  agentName: event.agent_name,
                  projectEndpoint: event.project_endpoint,
                  tracingEnabled: event.tracing_enabled,
                },
              }));
              return;
            case "step":
              upsertStep(event);
              return;
            case "delta":
              setState((current) => ({
                ...current,
                answer: current.answer + event.delta,
              }));
              return;
            case "citation":
              setState((current) => ({
                ...current,
                citations: [...current.citations, event.citation],
              }));
              return;
            case "completed":
              setState((current) => ({
                ...current,
                answer: event.answer || current.answer,
                citations: event.citations,
                isRunning: false,
              }));
              if (event.response_id && event.tracing_enabled) {
                void loadTrace(
                  event.response_id,
                  runSequence,
                  controller.signal,
                );
              }
              return;
            case "error":
              setState((current) => ({
                ...current,
                isRunning: false,
                error: event.error,
              }));
          }
        },
      });
    } catch (error) {
      if (runSequence !== runSequenceRef.current) {
        return;
      }
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      setState((current) => ({
        ...current,
        isRunning: false,
        error:
          error instanceof Error ? error.message : "Azure Architect Agent failed.",
      }));
    } finally {
      if (runSequence === runSequenceRef.current) {
        setState((current) => ({
          ...current,
          isRunning: false,
        }));
      }
    }
  }

  return {
    question: state.question,
    answer: state.answer,
    steps: state.steps,
    citations: state.citations,
    runConfig: state.runConfig,
    isRunning: state.isRunning,
    error: state.error,
    trace: state.trace,
    traceLoading: state.traceLoading,
    traceError: state.traceError,
    canSubmit: Boolean(state.question.trim()) && !state.isRunning,
    setQuestion: (value: string) =>
      setState((current) => ({ ...current, question: value })),
    submit,
    cancel: () => controllerRef.current?.abort(),
    reset,
  };
}

function delay(milliseconds: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(resolve, milliseconds);
    signal.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}
