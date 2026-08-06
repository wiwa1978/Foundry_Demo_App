import { Fragment } from "react";
import { X } from "lucide-react";

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
  const comparedPolicies = policyNames.slice(0, 2).map((name) =>
    findGuardrailPolicy(policies, name, deploymentPolicyName),
  );
  const filterNames = Array.from(
    new Set(
      [
        ...foundryGuardrailRiskTypes,
        ...comparedPolicies.flatMap((policy) =>
          (policy?.content_filters ?? []).map((filter) => filter.name),
        ),
      ],
    ),
  ).sort((left, right) => {
    const sectionDifference =
      guardrailSectionOrder.indexOf(guardrailSection(left)) -
      guardrailSectionOrder.indexOf(guardrailSection(right));
    return sectionDifference || formatGuardrailFilterName(left).localeCompare(formatGuardrailFilterName(right));
  });

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/70 p-4" role="dialog" aria-modal="true" aria-label="Guardrail policy comparison">
      <div className="flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border bg-white shadow-2xl dark:border-[#606066] dark:bg-[#303033]">
        <header className="flex items-start justify-between gap-4 border-b px-5 py-4 dark:border-[#55555a]">
          <div>
            <h2 className="text-lg font-semibold">Guardrail policy differences</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Amber rows differ. Green rules are enabled; muted rules are disabled.
            </p>
          </div>
          <Button type="button" variant="outline" size="icon" onClick={onClose} aria-label="Close guardrail comparison">
            <X className="h-4 w-4" />
          </Button>
        </header>
        <div className="overflow-auto p-5">
          <div className="grid min-w-[46rem] grid-cols-[12rem_minmax(0,1fr)_minmax(0,1fr)] gap-3">
            <div />
            {comparedPolicies.map((policy, index) => (
              <div key={index} className="rounded-xl border bg-slate-50 p-3 dark:border-[#606066] dark:bg-[#39393d]">
                <div className="font-semibold">Guardrail {index + 1}</div>
                <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                  {formatConfiguredGuardrail(policyNames[index], deploymentPolicyName)}
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Badge variant="outline">{policy?.mode || "Default"} mode</Badge>
                  {policy?.base_policy_name ? <Badge variant="outline">Base: {policy.base_policy_name}</Badge> : null}
                </div>
              </div>
            ))}
            {filterNames.map((name, rowIndex) => {
              const filterGroups = comparedPolicies.map((policy) =>
                (policy?.content_filters ?? []).filter((filter) => filter.name === name),
              );
              const different =
                guardrailFilterGroupValue(filterGroups[0]) !==
                guardrailFilterGroupValue(filterGroups[1]);
              const section = guardrailSection(name);
              const showSection = rowIndex === 0 || guardrailSection(filterNames[rowIndex - 1]) !== section;
              return (
                <Fragment key={name}>
                  {showSection ? (
                    <div className="col-span-3 mt-3 flex items-center gap-3 border-b pb-2 text-sm font-semibold dark:border-[#55555a]">
                      <span>{section}</span>
                      <span className="text-xs font-normal text-slate-400">
                        {filterNames.filter((filterName) => guardrailSection(filterName) === section).length} risk type(s)
                      </span>
                    </div>
                  ) : null}
                  <div className="flex flex-col justify-center rounded-lg border bg-slate-50 px-3 py-2 dark:border-[#55555a] dark:bg-[#39393d]">
                    <span className="text-sm font-semibold">{formatGuardrailFilterName(name)}</span>
                  </div>
                  {filterGroups.map((filters, index) => {
                    const enabledFilters = filters.filter((filter) => filter.enabled);
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
                      <div className="font-semibold">{formatGuardrailFilterGroupState(filters)}</div>
                      <div className="mt-0.5 text-xs opacity-75">
                        {enabledFilters.length
                          ? `Intervention: ${formatGuardrailSources(enabledFilters)}`
                          : "Not evaluated"}
                      </div>
                      {enabledFilters.length ? (
                        <div className="mt-0.5 text-xs opacity-75">
                          Action: {enabledFilters.every((filter) => filter.blocking) ? "Block" : "Annotate"}
                        </div>
                      ) : null}
                    </div>
                    );
                  })}
                </Fragment>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
