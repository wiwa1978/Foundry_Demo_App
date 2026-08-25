import { deploymentDefaultGuardrail } from "@/app/workspace/constants";
import type { GuardrailPolicy } from "@/app/workspace/contracts";
import type { GuardrailVariant, Usage } from "@/features/textChat/types";

export function formatMessageDateTime(timestamp?: string) {
  if (!timestamp) {
    return "";
  }

  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatGuardrailLabel(message: {
  guardrail_variant?: GuardrailVariant | null;
  guardrail_policy_name?: string | null;
}) {
  const slot =
    message.guardrail_variant === "policy_2" ? "Guardrail 2" : "Guardrail 1";
  if (message.guardrail_variant === "baseline") {
    return "Deployment default";
  }
  if (message.guardrail_variant === "guarded") {
    return message.guardrail_policy_name ?? "Custom guardrail";
  }
  return `${slot}: ${message.guardrail_policy_name ?? "Deployment default"}`;
}

export function formatConfiguredGuardrail(
  policyName: string,
  deploymentPolicyName?: string | null,
) {
  return policyName === deploymentDefaultGuardrail
    ? `${deploymentPolicyName ?? "Microsoft.DefaultV2"} (deployment default)`
    : policyName;
}

export function formatModelName(model: string) {
  return model.toUpperCase();
}

export function findGuardrailPolicy(
  policies: GuardrailPolicy[],
  policyName: string,
  deploymentPolicyName?: string | null,
) {
  const resolvedName =
    policyName === deploymentDefaultGuardrail
      ? deploymentPolicyName
      : policyName;
  return policies.find(
    (policy) => policy.name.toLowerCase() === resolvedName?.toLowerCase(),
  );
}

export function isPiiGuardrailFilter(name: string) {
  return (
    name === "PII" || name.startsWith("PII_") || name.endsWith(" Protection")
  );
}

export function formatGuardrailFilterName(name: string) {
  const names: Record<string, string> = {
    Selfharm: "Self-harm",
    "Indirect Attack": "Indirect prompt injections",
    "Indirect Attack Spotlighting": "Spotlighting (Preview)",
    "Protected Material Code": "Protected material for code",
    "Protected Material Text": "Protected material for text",
    PII: "PII (Preview)",
    "Task Adherence": "Task adherence (Preview)",
  };
  if (names[name]) {
    return names[name];
  }
  if (name.startsWith("PII_")) {
    return name
      .slice(4)
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2");
  }
  return name;
}

export function guardrailSection(name: string) {
  if (name === "Jailbreak") return "Jailbreak";
  if (name.startsWith("Indirect Attack")) return "Indirect prompt injections";
  if (["Hate", "Sexual", "Selfharm", "Violence"].includes(name))
    return "Content harms";
  if (name.startsWith("Protected Material")) return "Protected materials";
  if (isPiiGuardrailFilter(name)) return "Sensitive data leakage";
  if (name === "Task Adherence") return "Task drift";
  return "Other controls";
}

export function guardrailFilterGroupValue(
  filters: GuardrailPolicy["content_filters"],
) {
  const enabled = filters.filter((filter) => filter.enabled);
  if (!enabled.length) {
    return "off";
  }
  return enabled
    .map(
      (filter) =>
        `${filter.source.toLowerCase()}|${filter.blocking}|${filter.severity_threshold ?? ""}`,
    )
    .sort()
    .join(";");
}

export function formatGuardrailFilterGroupState(
  filters: GuardrailPolicy["content_filters"],
) {
  const enabled = filters.filter((filter) => filter.enabled);
  if (!enabled.length) {
    return "Off";
  }
  const thresholds = Array.from(
    new Set(enabled.map((filter) => filter.severity_threshold).filter(Boolean)),
  );
  if (thresholds.length !== 1) {
    return "On";
  }
  const blockingLevels: Record<string, string> = {
    High: "Lowest blocking",
    Medium: "Medium blocking",
    Low: "Highest blocking",
  };
  return blockingLevels[thresholds[0]!] ?? `${thresholds[0]}+ severity`;
}

export function formatGuardrailSources(
  filters: GuardrailPolicy["content_filters"],
) {
  const sources = Array.from(
    new Set(filters.map((filter) => filter.source.toLowerCase())),
  );
  const hasPrompt = sources.includes("prompt");
  const hasCompletion = sources.includes("completion");
  if (hasPrompt && hasCompletion) {
    return "User input, Output";
  }
  return hasPrompt
    ? "User input"
    : hasCompletion
      ? "Output"
      : sources.join(", ");
}

export function formatTriggeredGuardrails(
  results?: Record<string, unknown> | null,
) {
  if (!results) {
    return [];
  }

  const names = new Set<string>();

  function visit(value: unknown, context?: string) {
    if (Array.isArray(value)) {
      value.forEach((item) => visit(item, context));
      return;
    }
    if (!value || typeof value !== "object") {
      return;
    }

    const record = value as Record<string, unknown>;
    const triggered =
      record.filtered === true ||
      record.blocked === true ||
      record.detected === true;
    if (triggered && context) {
      names.add(formatTriggeredGuardrailName(context));
    }

    Object.entries(record).forEach(([key, child]) => {
      if (
        key === "content_filter_results" &&
        child &&
        typeof child === "object"
      ) {
        Object.entries(child as Record<string, unknown>).forEach(
          ([filterName, filterResult]) => visit(filterResult, filterName),
        );
      } else if (
        key !== "filtered" &&
        key !== "blocked" &&
        key !== "detected"
      ) {
        visit(child, context);
      }
    });
  }

  visit(results);
  return Array.from(names).sort((left, right) => left.localeCompare(right));
}

function formatTriggeredGuardrailName(name: string) {
  if (name.startsWith("PII_")) {
    return formatGuardrailFilterName(name);
  }
  const labels: Record<string, string> = {
    indirect_attack: "Indirect Attack",
    hate: "Hate",
    sexual: "Sexual",
    self_harm: "Self-harm",
    selfharm: "Self-harm",
    violence: "Violence",
    protected_material_text: "Protected Material Text",
    protected_material_code: "Protected Material Code",
    pii: "PII",
  };
  return (
    labels[name.toLowerCase()] ??
    name
      .replace(/[_-]+/g, " ")
      .replace(/\b\w/g, (character) => character.toUpperCase())
  );
}

export function formatUsage(usage?: Usage) {
  if (
    !usage ||
    usage.total_tokens === null ||
    usage.total_tokens === undefined
  ) {
    return "";
  }

  return `${usage.total_tokens} tokens`;
}

export function formatCompactNumber(value: number) {
  if (value >= 1_000_000) {
    return `${trimTrailingZeroes(value / 1_000_000)}M`;
  }

  if (value >= 1_000) {
    return `${trimTrailingZeroes(value / 1_000)}K`;
  }
  return String(Math.round(value));
}

export function formatBytes(value: number) {
  if (value < 1024) {
    return `${value} B`;
  }
  if (value < 1024 * 1024) {
    return `${trimTrailingZeroes(value / 1024)} KB`;
  }
  return `${trimTrailingZeroes(value / (1024 * 1024))} MB`;
}

export function formatAxisNumber(value: number) {
  if (value === 0) {
    return "0";
  }
  if (value < 1) {
    return value.toFixed(2);
  }
  return formatCompactNumber(value);
}

export function formatCurrency(value: number) {
  if (value === 0) {
    return "$0";
  }
  if (value > 0 && value < 0.01) {
    return "<$0.01";
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function trimTrailingZeroes(value: number) {
  return value.toFixed(value >= 10 ? 1 : 2).replace(/\.?0+$/, "");
}
