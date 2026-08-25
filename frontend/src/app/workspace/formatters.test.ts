import { describe, expect, it } from "vitest";

import { deploymentDefaultGuardrail } from "@/app/workspace/constants";
import type { GuardrailPolicy } from "@/app/workspace/contracts";
import {
  findGuardrailPolicy,
  formatAxisNumber,
  formatBytes,
  formatCompactNumber,
  formatConfiguredGuardrail,
  formatCurrency,
  formatGuardrailFilterGroupState,
  formatGuardrailFilterName,
  formatGuardrailLabel,
  formatGuardrailSources,
  formatMessageDateTime,
  formatModelName,
  formatTriggeredGuardrails,
  formatUsage,
  guardrailFilterGroupValue,
  guardrailSection,
} from "@/app/workspace/formatters";

type ContentFilter = GuardrailPolicy["content_filters"][number];

function contentFilter(
  name: string,
  source: string,
  enabled: boolean,
  blocking: boolean,
  severityThreshold?: string | null,
): ContentFilter {
  return {
    name,
    source,
    enabled,
    blocking,
    severity_threshold: severityThreshold,
  };
}

describe("workspace formatters", () => {
  it("extracts triggered guardrail filters from Foundry annotations", () => {
    expect(
      formatTriggeredGuardrails({
        content_filters: [
          {
            blocked: true,
            source_type: "prompt",
            content_filter_results: {
              indirect_attack: { detected: true, filtered: true },
              hate: { filtered: false },
            },
          },
        ],
      }),
    ).toEqual(["Indirect Attack"]);
    expect(
      formatTriggeredGuardrails({
        content_filter_results: {
          PII_CreditCardNumber: { filtered: true },
          PII_Email: { detected: true },
        },
      }),
    ).toEqual(["Credit Card Number", "Email"]);
    expect(
      formatTriggeredGuardrails({
        content_filter_results: {
          hate: { filtered: false },
        },
      }),
    ).toEqual([]);
  });

  it("formats valid message timestamps and rejects absent or invalid timestamps", () => {
    const timestamp = "2025-01-02T15:04:00.000Z";
    const expected = new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(timestamp));

    expect(formatMessageDateTime(timestamp)).toBe(expected);
    expect(formatMessageDateTime()).toBe("");
    expect(formatMessageDateTime("not-a-date")).toBe("");
  });

  it("labels every guardrail mode with useful policy fallbacks", () => {
    expect(formatGuardrailLabel({ guardrail_variant: "baseline" })).toBe(
      "Deployment default",
    );
    expect(
      formatGuardrailLabel({
        guardrail_variant: "guarded",
        guardrail_policy_name: "Strict",
      }),
    ).toBe("Strict");
    expect(formatGuardrailLabel({ guardrail_variant: "guarded" })).toBe(
      "Custom guardrail",
    );
    expect(
      formatGuardrailLabel({
        guardrail_variant: "policy_2",
        guardrail_policy_name: "Policy B",
      }),
    ).toBe("Guardrail 2: Policy B");
    expect(formatGuardrailLabel({ guardrail_variant: "policy_1" })).toBe(
      "Guardrail 1: Deployment default",
    );
  });

  it("resolves deployment-default policy names case-insensitively", () => {
    const policies: GuardrailPolicy[] = [
      {
        name: "Microsoft.DefaultV2",
        type: "system",
        mode: "blocking",
        content_filters: [],
        is_selectable: true,
      },
      {
        name: "Strict",
        type: "custom",
        mode: "blocking",
        content_filters: [],
        is_selectable: true,
      },
    ];

    expect(formatConfiguredGuardrail(deploymentDefaultGuardrail)).toBe(
      "Microsoft.DefaultV2 (deployment default)",
    );
    expect(
      formatConfiguredGuardrail(deploymentDefaultGuardrail, "Company.Default"),
    ).toBe("Company.Default (deployment default)");
    expect(formatConfiguredGuardrail("Strict", "ignored")).toBe("Strict");
    expect(
      findGuardrailPolicy(
        policies,
        deploymentDefaultGuardrail,
        "microsoft.defaultv2",
      ),
    ).toBe(policies[0]);
    expect(findGuardrailPolicy(policies, "STRICT")).toBe(policies[1]);
    expect(
      findGuardrailPolicy(policies, deploymentDefaultGuardrail),
    ).toBeUndefined();
    expect(formatModelName("gpt-4.1-mini")).toBe("GPT-4.1-MINI");
  });

  it.each([
    ["Selfharm", "Self-harm"],
    ["Indirect Attack", "Indirect prompt injections"],
    ["Indirect Attack Spotlighting", "Spotlighting (Preview)"],
    ["Protected Material Code", "Protected material for code"],
    ["Protected Material Text", "Protected material for text"],
    ["PII", "PII (Preview)"],
    ["Task Adherence", "Task adherence (Preview)"],
    ["Unknown", "Unknown"],
  ])("formats the %s filter name", (name, expected) => {
    expect(formatGuardrailFilterName(name)).toBe(expected);
  });

  it.each([
    ["Jailbreak", "Jailbreak"],
    ["Indirect Attack Spotlighting", "Indirect prompt injections"],
    ["Violence", "Content harms"],
    ["Protected Material Text", "Protected materials"],
    ["PII", "Sensitive data leakage"],
    ["Task Adherence", "Task drift"],
    ["Groundedness", "Other controls"],
  ])("groups %s into %s", (name, expected) => {
    expect(guardrailSection(name)).toBe(expected);
  });

  it("creates stable group values from enabled filters only", () => {
    const disabled = contentFilter("Hate", "Prompt", false, true, "Low");
    const completion = contentFilter(
      "Hate",
      "Completion",
      true,
      false,
      "Medium",
    );
    const prompt = contentFilter("Hate", "Prompt", true, true);

    expect(guardrailFilterGroupValue([disabled])).toBe("off");
    expect(guardrailFilterGroupValue([prompt, disabled, completion])).toBe(
      "completion|false|Medium;prompt|true|",
    );
  });

  it("summarizes blocking thresholds without overstating mixed configurations", () => {
    expect(formatGuardrailFilterGroupState([])).toBe("Off");
    expect(
      formatGuardrailFilterGroupState([
        contentFilter("Hate", "Prompt", true, true, "Low"),
        contentFilter("Hate", "Completion", true, true, "High"),
      ]),
    ).toBe("On");
    expect(
      formatGuardrailFilterGroupState([
        contentFilter("Hate", "Prompt", true, true, "High"),
      ]),
    ).toBe("Lowest blocking");
    expect(
      formatGuardrailFilterGroupState([
        contentFilter("Hate", "Prompt", true, true, "Medium"),
      ]),
    ).toBe("Medium blocking");
    expect(
      formatGuardrailFilterGroupState([
        contentFilter("Hate", "Prompt", true, true, "Low"),
      ]),
    ).toBe("Highest blocking");
    expect(
      formatGuardrailFilterGroupState([
        contentFilter("Hate", "Prompt", true, true, "VeryHigh"),
      ]),
    ).toBe("VeryHigh+ severity");
  });

  it("formats unique guardrail sources for prompt, completion, and custom sources", () => {
    expect(
      formatGuardrailSources([
        contentFilter("Hate", "Prompt", true, true),
        contentFilter("Hate", "Completion", true, true),
        contentFilter("Violence", "Prompt", true, true),
      ]),
    ).toBe("User input, Output");
    expect(
      formatGuardrailSources([contentFilter("Hate", "Prompt", true, true)]),
    ).toBe("User input");
    expect(
      formatGuardrailSources([contentFilter("Hate", "Completion", true, true)]),
    ).toBe("Output");
    expect(
      formatGuardrailSources([contentFilter("Hate", "Tool", true, true)]),
    ).toBe("tool");
  });

  it("formats usage and numeric boundary values", () => {
    expect(formatUsage()).toBe("");
    expect(
      formatUsage({
        prompt_tokens: 1,
        completion_tokens: 2,
        total_tokens: null,
      }),
    ).toBe("");
    expect(
      formatUsage({ prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }),
    ).toBe("0 tokens");
    expect(formatCompactNumber(999.6)).toBe("1000");
    expect(formatCompactNumber(1_250)).toBe("1.25K");
    expect(formatCompactNumber(12_000)).toBe("12K");
    expect(formatCompactNumber(1_500_000)).toBe("1.5M");
    expect(formatBytes(1023)).toBe("1023 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(2_621_440)).toBe("2.5 MB");
    expect(formatAxisNumber(0)).toBe("0");
    expect(formatAxisNumber(0.126)).toBe("0.13");
    expect(formatAxisNumber(1_200)).toBe("1.2K");
    expect(formatCurrency(0)).toBe("$0");
    expect(formatCurrency(0.009)).toBe("<$0.01");
    expect(formatCurrency(12.345)).toBe("$12.35");
  });
});
