import { useCallback, useEffect, useRef, useState } from "react";

import type { FetchClient } from "@/api/types";

import { streamGuardrailBatch } from "./batchApi";
import type {
  GuardrailBatchPolicyResult,
  GuardrailBatchStatementResult,
} from "./batchTypes";

export type GuardrailBatchState = {
  model: string;
  fileName: string;
  statements: string[];
  results: GuardrailBatchStatementResult[];
  policyNames: string[];
  isRunning: boolean;
  completed: number;
  total: number;
  error: string;
};

const emptyState: GuardrailBatchState = {
  model: "",
  fileName: "",
  statements: [],
  results: [],
  policyNames: [],
  isRunning: false,
  completed: 0,
  total: 0,
  error: "",
};

export function useGuardrailBatch({
  fetchClient,
  activeModel,
}: {
  fetchClient: FetchClient;
  activeModel: string;
}) {
  const [state, setState] = useState<GuardrailBatchState>(emptyState);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const cancel = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setState((current) => ({ ...current, isRunning: false }));
  }, []);

  const loadStatements = useCallback(
    (fileName: string, statements: string[]) => {
      controllerRef.current?.abort();
      controllerRef.current = null;
      setState({
        ...emptyState,
        fileName,
        statements,
        total: statements.length,
        error: statements.length ? "" : "No statements found in that file.",
      });
    },
    [],
  );

  const clear = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setState(emptyState);
  }, []);

  const run = useCallback(async () => {
    if (!state.statements.length) {
      return;
    }
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setState((current) => ({
      ...current,
      model: activeModel,
      isRunning: true,
      error: "",
      results: [],
      completed: 0,
      total: current.statements.length,
    }));

    try {
      await streamGuardrailBatch({
        request: { model: activeModel, statements: state.statements },
        fetchClient,
        signal: controller.signal,
        onEvent: (event) => {
          if (event.type === "start") {
            setState((current) => ({
              ...current,
              model: event.model,
              policyNames: event.policy_names,
              total: event.total,
            }));
            return;
          }
          if (event.type === "statement_completed") {
            setState((current) => ({
              ...current,
              completed: current.completed + 1,
              results: [...current.results, event.result].sort(
                (left, right) => left.index - right.index,
              ),
            }));
            return;
          }
          if (event.type === "completed") {
            setState((current) => ({ ...current, isRunning: false }));
          }
        },
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      setState((current) => ({
        ...current,
        isRunning: false,
        error:
          error instanceof Error
            ? error.message
            : "Guardrail batch evaluation failed.",
      }));
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null;
        setState((current) => ({ ...current, isRunning: false }));
      }
    }
  }, [activeModel, fetchClient, state.statements]);

  return { ...state, loadStatements, run, cancel, clear };
}

export function summarizeBatch(results: GuardrailBatchStatementResult[]) {
  const counts = (position: number) =>
    results.reduce(
      (totals, entry) => {
        const result: GuardrailBatchPolicyResult | undefined =
          entry.results[position];
        if (!result) {
          return totals;
        }
        totals[result.outcome] += 1;
        return totals;
      },
      { blocked: 0, flagged: 0, allowed: 0, error: 0 },
    );

  const differences = results.filter(
    (entry) =>
      entry.results.length === 2 &&
      entry.results[0].blocked !== entry.results[1].blocked,
  ).length;

  return { policy1: counts(0), policy2: counts(1), differences };
}
