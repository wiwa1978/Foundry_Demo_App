export type RetailProduct = {
  id: string;
  name: string;
  type?: string | null;
  description?: string | null;
  imageURL?: string | null;
  punchLine?: string | null;
  price?: number | null;
};

export type RetailCartItem = {
  product_id: string;
  name: string;
  quantity: number;
  price: number;
  total?: number | null;
};

export type RetailAgentStep = {
  id: string;
  label: string;
  status: "running" | "done" | "error";
  detail?: string | null;
};

export type RetailAgentStreamEvent =
  | {
      type: "start";
      message: string;
      session_id: string;
      agent_name: string;
      project_endpoint: string | null;
      cart: RetailCartItem[];
    }
  | {
      type: "step";
      label: string;
      status: RetailAgentStep["status"];
      detail?: string | null;
    }
  | {
      type: "agent_selected";
      agent_type: string;
      agent_name: string;
      confidence: number;
      reasoning: string;
    }
  | { type: "products"; products: RetailProduct[] }
  | { type: "delta"; delta: string }
  | {
      type: "completed";
      answer: string;
      agent: string;
      cart: RetailCartItem[];
      products: RetailProduct[];
    }
  | { type: "error"; error: string };

export type RetailAgentRunConfig = {
  agentName: string;
  projectEndpoint: string | null;
  sessionId: string;
};

export type RetailConversationTurn = {
  id: string;
  question: string;
  answer: string;
  agentName: string;
};
