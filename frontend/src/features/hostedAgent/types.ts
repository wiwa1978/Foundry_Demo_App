export type HostedAgentStep = {
  id: string;
  label: string;
  status: "running" | "done" | "error";
  detail?: string | null;
};

export type HostedAgentRunConfig = {
  agentName: string;
  projectEndpoint: string;
};

export type HostedAgentVariant = {
  key: string;
  label: string;
  agentName: string;
};

export type HostedAgentStreamEvent =
  | {
      type: "start";
      message: string;
      agent_name: string;
      agent_key: string;
      project_endpoint: string;
    }
  | {
      type: "step";
      label: string;
      status: "running" | "done" | "error";
      detail?: string | null;
    }
  | { type: "delta"; delta: string }
  | { type: "completed"; answer: string }
  | { type: "error"; error: string };
