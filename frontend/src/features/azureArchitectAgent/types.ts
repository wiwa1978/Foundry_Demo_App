import type { UseCaseCategory } from "@/app/types";

export type AzureArchitectAgentCitation = {
  title: string | null;
  url: string;
};

export type AzureArchitectAgentStep = {
  id: string;
  label: string;
  status: "running" | "done" | "error";
  detail?: string | null;
};

export type AzureArchitectAgentRunConfig = {
  agentName: string;
  projectEndpoint: string | null;
  tracingEnabled?: boolean;
};

export type AzureArchitectAgentTraceSpan = {
  timestamp: string;
  name: string;
  duration_ms: number;
  success: boolean | null;
  operation: string | null;
  model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  tool_name: string | null;
  error_type: string | null;
  trace_id: string;
  span_id: string;
  parent_span_id: string | null;
};

export type AzureArchitectAgentTrace = {
  response_id: string;
  status: "pending" | "ready";
  spans: AzureArchitectAgentTraceSpan[];
};

export type AzureArchitectAgentStreamEvent =
  | {
      type: "start";
      question: string;
      agent_name: string;
      project_endpoint: string | null;
      tracing_enabled: boolean;
    }
  | {
      type: "step";
      label: string;
      status: "running" | "done" | "error";
      detail?: string | null;
    }
  | {
      type: "delta";
      delta: string;
    }
  | {
      type: "citation";
      citation: AzureArchitectAgentCitation;
    }
  | {
      type: "completed";
      answer: string;
      citations: AzureArchitectAgentCitation[];
      response_id: string | null;
      tracing_enabled: boolean;
    }
  | {
      type: "error";
      error: string;
    };

export type AzureArchitectAgentCategory = UseCaseCategory;
