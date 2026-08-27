import { ShoppingBag } from "lucide-react";

import { AzureArchitectAgentWorkspace } from "@/features/azureArchitectAgent/AzureArchitectAgentWorkspace";

import type {
  RetailAgentRunConfig,
  RetailAgentStep,
  RetailCartItem,
  RetailConversationTurn,
  RetailProduct,
} from "./types";

type Props = {
  configured: boolean;
  agentName: string | null;
  projectEndpoint: string | null;
  message: string;
  submittedMessage: string;
  answer: string;
  steps: RetailAgentStep[];
  runConfig: RetailAgentRunConfig | null;
  products: RetailProduct[];
  cart: RetailCartItem[];
  conversationHistory: RetailConversationTurn[];
  isRunning: boolean;
  error: string;
  onMessageChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
};

export function RetailAgentWorkspace(props: Props) {
  const answer = formatRetailAnswer(props.answer);

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <div className="border-b border-slate-200 bg-slate-50 px-5 py-3 dark:border-[#606066] dark:bg-[#303035]">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <ShoppingBag className="h-4 w-4" />
          Zava marketplace
          <span className="ml-auto text-xs font-normal text-slate-500">
            {props.cart.length} cart item{props.cart.length === 1 ? "" : "s"}
          </span>
        </div>
        {props.products.length ? (
          <div className="mt-3 flex gap-3 overflow-x-auto pb-1">
            {props.products.slice(0, 4).map((product) => (
              <div
                key={product.id}
                className="min-w-44 rounded-xl border bg-white p-3 text-xs shadow-sm dark:border-[#606066] dark:bg-[#39393d]"
              >
                <div className="font-medium">{product.name}</div>
                <div className="mt-1 text-slate-500">{product.type}</div>
                <div className="mt-2 font-semibold">
                  ${product.price?.toFixed(2) ?? "—"}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
      <AzureArchitectAgentWorkspace
        configured={props.configured}
        projectEndpoint={props.projectEndpoint}
        question={props.message}
        submittedQuestion={props.submittedMessage}
        answer={answer}
        conversationHistory={props.conversationHistory.map((turn) => ({
          ...turn,
          answer: formatRetailAnswer(turn.answer),
        }))}
        steps={props.steps}
        citations={[]}
        runConfig={props.runConfig}
        isRunning={props.isRunning}
        error={props.error}
        onQuestionChange={props.onMessageChange}
        onSubmit={props.onSubmit}
        onCancel={props.onCancel}
        defaultAgentName={props.agentName ?? "zava-shop-assistant-agent"}
        emptyStateTitle="Start shopping"
        emptyStateDescription="Browse the bundled Zava marketplace catalog, check stock, and manage a cart with the Retail Shopping Assistant."
        questionPlaceholder="Ask about products, stock, or your cart..."
        questionAriaLabel="Retail Shopping Assistant question"
        activityDescription="Retail search, cart, and SSE activity"
        promptGallery={{
          title: "Try a Zava shopping conversation",
          description:
            "Use these sample questions to explore products, stock, your cart, and checkout.",
          examples: retailPromptExamples,
        }}
        conversationMode="chat"
      />
    </div>
  );
}

const retailPromptExamples = [
  {
    id: "green-paint-colors",
    title: "Green paint colors",
    prompt: "What colors of green paint do you have?",
  },
  {
    id: "bedroom-paint-quantity",
    title: "Estimate paint quantity",
    prompt:
      "I think I’m interested in Deep Forest. How many gallons would I need to paint a medium sized bedroom?",
  },
  {
    id: "stock-check",
    title: "Check stock",
    prompt: "How much of PROD0018 do you have in stock?",
  },
  {
    id: "add-paint",
    title: "Add paint",
    prompt: "Let’s add two gallons to the cart, please.",
  },
  {
    id: "add-accessories",
    title: "Add accessories",
    prompt:
      "Please also add one paint tray and two of your All-Purpose Wall Paint Brushes.",
  },
  {
    id: "view-cart",
    title: "View cart",
    prompt: "What items are in my cart right now?",
  },
  {
    id: "checkout",
    title: "Check out",
    prompt: "I’d like to check out now.",
  },
] as const;

function formatRetailAnswer(value: string) {
  if (!value.trim()) return value;

  try {
    const parsed: unknown = JSON.parse(value);
    const candidates = Array.isArray(parsed) ? parsed : [parsed];
    const answers = candidates
      .filter(
        (item): item is { answer: string } =>
          Boolean(item) &&
          typeof item === "object" &&
          "answer" in item &&
          typeof item.answer === "string",
      )
      .map((item) => item.answer.trim())
      .filter(Boolean);
    if (answers.length) {
      return answers.join("\n\n");
    }
  } catch {
    return value;
  }

  return value;
}
