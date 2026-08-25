import { useEffect, useRef, useState } from "react";

import type { FetchClient } from "@/api/types";

import { streamInvestmentPlanner } from "./api";
import type {
  InvestmentPlannerRunConfig,
  InvestmentPlannerStep,
  InvestmentPlannerStreamEvent,
} from "./types";

type State = {
  question: string;
  answer: string;
  steps: InvestmentPlannerStep[];
  runConfig: InvestmentPlannerRunConfig | null;
  isRunning: boolean;
  error: string;
};

const initialState: State = {
  question: "",
  answer: "",
  steps: [],
  runConfig: null,
  isRunning: false,
  error: "",
};

export function useInvestmentPlannerStream({
  fetchClient,
}: {
  fetchClient: FetchClient;
}) {
  const [state, setState] = useState(initialState);
  const controllerRef = useRef<AbortController | null>(null);
  const runSequenceRef = useRef(0);

  useEffect(() => () => controllerRef.current?.abort(), []);

  function reset() {
    controllerRef.current?.abort();
    runSequenceRef.current += 1;
    setState(initialState);
  }

  function upsertStep(
    event: Extract<InvestmentPlannerStreamEvent, { type: "step" }>,
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
    const question = state.question.trim();
    if (!question || state.isRunning) return;

    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const runSequence = ++runSequenceRef.current;
    setState((current) => ({
      ...current,
      question: "",
      answer: "",
      steps: [],
      runConfig: null,
      isRunning: true,
      error: "",
    }));

    try {
      await streamInvestmentPlanner({
        fetchClient,
        question,
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
        error:
          error instanceof Error
            ? error.message
            : "Investment planner agent failed.",
      }));
    } finally {
      if (runSequence === runSequenceRef.current) {
        setState((current) => ({ ...current, isRunning: false }));
      }
    }
  }

  return {
    ...state,
    setQuestion: (question: string) =>
      setState((current) => ({ ...current, question })),
    submit,
    cancel: () => controllerRef.current?.abort(),
    reset,
  };
}
