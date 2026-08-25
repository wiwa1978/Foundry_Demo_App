export type GuardrailBatchOutcome = "blocked" | "flagged" | "allowed" | "error";

export type GuardrailBatchRequest = {
  model: string;
  statements: string[];
  concurrency?: number;
};

export type GuardrailBatchPolicyResult = {
  policy_name: string;
  outcome: GuardrailBatchOutcome;
  blocked: boolean;
  triggered_filters: string[];
  response: string;
  response_preview: string;
  message: string;
  duration_ms?: number | null;
  guardrail_results?: Record<string, unknown> | null;
};

export type GuardrailBatchStatementResult = {
  index: number;
  statement: string;
  results: GuardrailBatchPolicyResult[];
};

export type GuardrailBatchEvent =
  | {
      type: "start";
      model: string;
      total: number;
      policy_names: string[];
      deployment_default_guardrail: string;
    }
  | { type: "statement_completed"; result: GuardrailBatchStatementResult }
  | { type: "completed"; total: number };
