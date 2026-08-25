export type InvestmentPlannerStep = {
  id: string;
  label: string;
  status: "running" | "done" | "error";
  detail?: string | null;
};

export type InvestmentPlannerRunConfig = {
  agentName: string;
  projectEndpoint: string | null;
};

export type InvestmentPlannerStreamEvent =
  | {
      type: "start";
      question: string;
      agent_name: string;
      project_endpoint: string | null;
    }
  | {
      type: "step";
      label: string;
      status: "running" | "done" | "error";
      detail?: string | null;
    }
  | { type: "delta"; delta: string }
  | { type: "completed"; answer: string; response_id: string | null }
  | { type: "error"; error: string };
