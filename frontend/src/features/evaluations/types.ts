export type EvaluationCriterion = {
  name: string;
  type: string;
};

export type EvaluationCriterionResult = {
  name: string;
  passed: number;
  failed: number;
};

export type EvaluationResultCounts = {
  total: number;
  passed: number;
  failed: number;
  errored: number;
};

export type EvaluationRun = {
  id: string;
  name: string;
  status: string;
  created_at: number;
  model?: string | null;
  target_type?: "model" | "agent" | null;
  target_name?: string | null;
  report_url?: string | null;
  result_counts: EvaluationResultCounts;
  criteria_results: EvaluationCriterionResult[];
};

export type Evaluation = {
  id: string;
  name: string;
  created_at: number;
  metadata: Record<string, string>;
  criteria: EvaluationCriterion[];
  runs: EvaluationRun[];
};

export type EvaluationListResponse = {
  use_case: string;
  evaluations: Evaluation[];
};
