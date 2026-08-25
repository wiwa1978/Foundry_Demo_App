import { ChevronDown, ChevronRight, X } from "lucide-react";
import { Fragment } from "react";
import { useState } from "react";

import {
  foundryGuardrailRiskTypes,
  guardrailSectionOrder,
} from "@/app/workspace/constants";
import type { GuardrailPolicy } from "@/app/workspace/contracts";
import {
  findGuardrailPolicy,
  formatConfiguredGuardrail,
  formatGuardrailFilterGroupState,
  formatGuardrailFilterName,
  formatGuardrailSources,
  guardrailFilterGroupValue,
  guardrailSection,
} from "@/app/workspace/formatters";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type GuardrailPolicyComparisonModalProps = {
  policyNames: string[];
  deploymentPolicyName?: string | null;
  policies: GuardrailPolicy[];
  onClose: () => void;
};

export function GuardrailPolicyComparisonModal({
  policyNames,
  deploymentPolicyName,
  policies,
  onClose,
}: GuardrailPolicyComparisonModalProps) {
  const comparedPolicies = policyNames
    .slice(0, 2)
    .map((name) => findGuardrailPolicy(policies, name, deploymentPolicyName));
  const filterNames = Array.from(
    new Set([
      ...foundryGuardrailRiskTypes,
      ...comparedPolicies.flatMap((policy) =>
        (policy?.content_filters ?? []).map((filter) => filter.name),
      ),
    ]),
  ).sort((left, right) => {
    const sectionDifference =
      guardrailSectionOrder.indexOf(guardrailSection(left)) -
      guardrailSectionOrder.indexOf(guardrailSection(right));
    return (
      sectionDifference ||
      formatGuardrailFilterName(left).localeCompare(
        formatGuardrailFilterName(right),
      )
    );
  });
  const sections = Array.from(
    new Set(filterNames.map((name) => guardrailSection(name))),
  );
  const [expandedSections, setExpandedSections] = useState<
    Record<string, boolean>
  >({});

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Guardrail policy comparison"
    >
      <div className="flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border bg-white shadow-2xl dark:border-[#606066] dark:bg-[#303033]">
        <header className="border-b px-5 py-4 dark:border-[#55555a]">
          <div className="flex items-start justify-between gap-4">
            <h2 className="text-lg font-semibold">
              Guardrail policy differences
            </h2>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={onClose}
              aria-label="Close guardrail comparison"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="mt-3 flex flex-wrap justify-center gap-2 text-xs">
            <span className="rounded-md border border-amber-400 bg-amber-50 px-2 py-1 font-medium text-amber-950 dark:border-amber-500/70 dark:bg-amber-500/10 dark:text-amber-100">
              Amber: policies differ
            </span>
            <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 font-medium dark:border-emerald-800/60 dark:bg-emerald-950/20">
              Green: same and enabled
            </span>
            <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 font-medium text-slate-500 dark:border-[#55555a] dark:bg-[#39393d] dark:text-slate-400">
              Muted: same and disabled
            </span>
          </div>
        </header>
        <div className="overflow-auto p-5">
          <div className="grid min-w-[46rem] grid-cols-[12rem_minmax(0,1fr)_minmax(0,1fr)] gap-3">
            <div />
            {comparedPolicies.map((policy, index) => (
              <div
                key={index}
                className="rounded-xl border bg-slate-50 p-3 dark:border-[#606066] dark:bg-[#39393d]"
              >
                <div className="font-semibold">Guardrail {index + 1}</div>
                <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                  {formatConfiguredGuardrail(
                    policyNames[index],
                    deploymentPolicyName,
                  )}
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Badge variant="outline">
                    {policy?.mode || "Default"} mode
                  </Badge>
                  {policy?.base_policy_name ? (
                    <Badge variant="outline">
                      Base: {policy.base_policy_name}
                    </Badge>
                  ) : null}
                </div>
              </div>
            ))}
            {sections.map((section) => {
              const sectionFilterNames = filterNames.filter(
                (filterName) => guardrailSection(filterName) === section,
              );
              const expanded = expandedSections[section] ?? false;
              return (
                <Fragment key={section}>
                  <div className="col-span-3 mt-3 border-b pb-2 dark:border-[#55555a]">
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 text-left text-sm font-semibold"
                      aria-expanded={expanded}
                      onClick={() =>
                        setExpandedSections((current) => ({
                          ...current,
                          [section]: !expanded,
                        }))
                      }
                    >
                      {expanded ? (
                        <ChevronDown className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <ChevronRight className="h-4 w-4" aria-hidden="true" />
                      )}
                      <span>{section}</span>
                      <span className="text-xs font-normal text-slate-400">
                        {sectionFilterNames.length} risk type(s)
                      </span>
                    </button>
                  </div>
                  {expanded
                    ? sectionFilterNames.map((name) => {
                        const filterGroups = comparedPolicies.map((policy) =>
                          (policy?.content_filters ?? []).filter(
                            (filter) => filter.name === name,
                          ),
                        );
                        const different =
                          guardrailFilterGroupValue(filterGroups[0]) !==
                          guardrailFilterGroupValue(filterGroups[1]);
                        return (
                          <Fragment key={name}>
                            <div className="flex flex-col justify-center rounded-lg border bg-slate-50 px-3 py-2 dark:border-[#55555a] dark:bg-[#39393d]">
                              <span className="text-sm font-semibold">
                                {formatGuardrailFilterName(name)}
                              </span>
                            </div>
                            {filterGroups.map((filters, index) => {
                              const enabledFilters = filters.filter(
                                (filter) => filter.enabled,
                              );
                              return (
                                <div
                                  key={index}
                                  className={cn(
                                    "rounded-lg border px-3 py-2 text-sm",
                                    different
                                      ? "border-amber-400 bg-amber-50 text-amber-950 dark:border-amber-500/70 dark:bg-amber-500/10 dark:text-amber-100"
                                      : enabledFilters.length
                                        ? "border-emerald-200 bg-emerald-50 dark:border-emerald-800/60 dark:bg-emerald-950/20"
                                        : "border-slate-200 bg-slate-50 text-slate-400 dark:border-[#55555a] dark:bg-[#39393d]",
                                  )}
                                >
                                  <div className="font-semibold">
                                    {formatGuardrailFilterGroupState(filters)}
                                  </div>
                                  <div className="mt-0.5 text-xs opacity-75">
                                    {enabledFilters.length
                                      ? `Intervention: ${formatGuardrailSources(enabledFilters)}`
                                      : "Not evaluated"}
                                  </div>
                                  {enabledFilters.length ? (
                                    <div className="mt-0.5 text-xs opacity-75">
                                      Action:{" "}
                                      {enabledFilters.every(
                                        (filter) => filter.blocking,
                                      )
                                        ? "Block"
                                        : "Annotate"}
                                    </div>
                                  ) : null}
                                </div>
                              );
                            })}
                          </Fragment>
                        );
                      })
                    : null}
                </Fragment>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
