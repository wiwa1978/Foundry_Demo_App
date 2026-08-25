import { useEffect, useRef, useState } from "react";

import type { FetchClient } from "@/api/types";

import { streamHostedAgent } from "./api";
import type {
  HostedAgentRunConfig,
  HostedAgentStep,
  HostedAgentStreamEvent,
  HostedAgentVariant,
} from "./types";

type State = {
  message: string;
  answer: string;
  steps: HostedAgentStep[];
  runConfig: HostedAgentRunConfig | null;
  isRunning: boolean;
  error: string;
};

const initialState: State = {
  message: "",
  answer: "",
  steps: [],
  runConfig: null,
  isRunning: false,
  error: "",
};

export function useHostedAgentStream({
  fetchClient,
  variants = [],
}: {
  fetchClient: FetchClient;
  variants?: HostedAgentVariant[];
}) {
  const [state, setState] = useState(initialState);
  const [variantKey, setVariantKey] = useState<string>(
    variants[0]?.key ?? "",
  );
  const controllerRef = useRef<AbortController | null>(null);
  const runSequenceRef = useRef(0);

  useEffect(() => () => controllerRef.current?.abort(), []);

  useEffect(() => {
    if (!variants.length) return;
    if (!variants.some((variant) => variant.key === variantKey)) {
      setVariantKey(variants[0].key);
    }
  }, [variants, variantKey]);

  function reset() {
    controllerRef.current?.abort();
    runSequenceRef.current += 1;
    setState(initialState);
  }

  function upsertStep(
    event: Extract<HostedAgentStreamEvent, { type: "step" }>,
  ) {
    setState((current) => {
      const step = {
        id: event.label,
        label: event.label,
        status: event.status,
        detail: event.detail ?? null,
      };
      const existing = current.steps.findIndex((item) => item.id === step.id);
      const steps = [...current.steps];
      if (existing >= 0) steps[existing] = step;
      else steps.push(step);
      return { ...current, steps };
    });
  }

  async function submit() {
    const message = state.message.trim();
    if (!message || state.isRunning) return;

    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const runSequence = ++runSequenceRef.current;
    setState((current) => ({
      ...current,
      message: "",
      answer: "",
      steps: [],
      runConfig: null,
      isRunning: true,
      error: "",
    }));

    try {
      await streamHostedAgent({
        fetchClient,
        message,
        agentKey: variantKey || undefined,
        signal: controller.signal,
        onEvent: (event) => {
          if (runSequence !== runSequenceRef.current) return;
          if (event.type === "start") {
            setState((current) => ({
              ...current,
              runConfig: {
                agentName: event.agent_name,
                projectEndpoint: event.project_endpoint,
              },
            }));
          } else if (event.type === "step") upsertStep(event);
          else if (event.type === "delta") {
            setState((current) => ({
              ...current,
              answer: current.answer + event.delta,
            }));
          } else if (event.type === "completed") {
            setState((current) => ({
              ...current,
              answer: event.answer || current.answer,
              isRunning: false,
            }));
          } else {
            setState((current) => ({
              ...current,
              error: event.error,
              isRunning: false,
            }));
          }
        },
      });
    } catch (error) {
      if (runSequence !== runSequenceRef.current) return;
      if (error instanceof DOMException && error.name === "AbortError") return;
      setState((current) => ({
        ...current,
        isRunning: false,
        error: error instanceof Error ? error.message : "Hosted agent failed.",
      }));
    } finally {
      if (runSequence === runSequenceRef.current) {
        setState((current) => ({ ...current, isRunning: false }));
      }
    }
  }

  return {
    ...state,
    setMessage: (message: string) =>
      setState((current) => ({ ...current, message })),
    variantKey,
    setVariantKey,
    submit,
    cancel: () => controllerRef.current?.abort(),
    reset,
  };
}
