import { useEffect, useRef, useState } from "react";

import type { FetchClient } from "@/api/types";

import { streamRetailAgent } from "./api";
import type {
  RetailAgentRunConfig,
  RetailAgentStep,
  RetailCartItem,
  RetailProduct,
  RetailAgentStreamEvent,
} from "./types";

type State = {
  message: string;
  submittedMessage: string;
  answer: string;
  steps: RetailAgentStep[];
  products: RetailProduct[];
  cart: RetailCartItem[];
  sessionId: string | null;
  runConfig: RetailAgentRunConfig | null;
  isRunning: boolean;
  error: string;
};

const initialState: State = {
  message: "",
  submittedMessage: "",
  answer: "",
  steps: [],
  products: [],
  cart: [],
  sessionId: null,
  runConfig: null,
  isRunning: false,
  error: "",
};

export function useRetailAgentStream({
  fetchClient,
}: {
  fetchClient: FetchClient;
}) {
  const [state, setState] = useState(initialState);
  const controllerRef = useRef<AbortController | null>(null);
  const sequenceRef = useRef(0);
  useEffect(() => () => controllerRef.current?.abort(), []);

  function reset() {
    controllerRef.current?.abort();
    sequenceRef.current += 1;
    setState(initialState);
  }

  async function submit() {
    const message = state.message.trim();
    if (!message || state.isRunning) return;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const sequence = ++sequenceRef.current;
    setState((current) => ({
      ...current,
      message: "",
      submittedMessage: message,
      answer: "",
      products: [],
      steps: [],
      isRunning: true,
      error: "",
    }));
    try {
      await streamRetailAgent({
        fetchClient,
        message,
        sessionId: state.sessionId,
        cart: state.cart,
        signal: controller.signal,
        onEvent: (event: RetailAgentStreamEvent) => {
          if (sequence !== sequenceRef.current) return;
          if (event.type === "start") {
            setState((current) => ({
              ...current,
              sessionId: event.session_id,
              runConfig: {
                agentName: event.agent_name,
                projectEndpoint: event.project_endpoint,
                sessionId: event.session_id,
              },
            }));
          } else if (event.type === "agent_selected") {
            setState((current) => ({
              ...current,
              runConfig: current.runConfig
                ? { ...current.runConfig, agentName: event.agent_name }
                : current.runConfig,
            }));
            setState((current) => {
              const step = {
                id: "Selected agent",
                label: "Selected agent",
                status: "done" as const,
                detail: `${event.agent_type} (${event.confidence.toFixed(2)} confidence)`,
              };
              const steps = [...current.steps];
              const index = steps.findIndex((item) => item.id === step.id);
              if (index >= 0) steps[index] = step;
              else steps.push(step);
              return { ...current, steps };
            });
          } else if (event.type === "step") {
            setState((current) => {
              const step = { id: event.label, ...event };
              const steps = [...current.steps];
              const index = steps.findIndex((item) => item.id === step.id);
              if (index >= 0) steps[index] = step;
              else steps.push(step);
              return { ...current, steps };
            });
          } else if (event.type === "products") {
            setState((current) => ({ ...current, products: event.products }));
          } else if (event.type === "delta") {
            setState((current) => ({
              ...current,
              answer: current.answer + event.delta,
            }));
          } else if (event.type === "completed") {
            setState((current) => ({
              ...current,
              answer: event.answer || current.answer,
              cart: event.cart,
              products: event.products,
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
      if (sequence !== sequenceRef.current) return;
      if (error instanceof DOMException && error.name === "AbortError") return;
      setState((current) => ({
        ...current,
        isRunning: false,
        error:
          error instanceof Error ? error.message : "Retail assistant failed.",
      }));
    } finally {
      if (sequence === sequenceRef.current) {
        setState((current) => ({ ...current, isRunning: false }));
      }
    }
  }

  return {
    ...state,
    setMessage: (message: string) =>
      setState((current) => ({ ...current, message })),
    submit,
    cancel: () => controllerRef.current?.abort(),
    reset,
  };
}
