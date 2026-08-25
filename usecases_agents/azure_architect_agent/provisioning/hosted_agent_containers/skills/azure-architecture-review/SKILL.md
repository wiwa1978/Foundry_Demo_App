---
name: azure-architecture-review
description: Turn a workload description into a Microsoft Learn-grounded Azure architecture recommendation with options, a decision, risks, and citations.
---

# Azure Architecture Review

Use this skill whenever the user describes a workload and wants an Azure
architecture recommendation, a comparison of services, or a second opinion on
a design. It defines *how* to run the review; it does not replace Microsoft
Learn as the source of current facts.

## When to use this skill

- The user describes a workload, system, or migration and asks "what should I
  use on Azure" or "how would you design this."
- The user asks you to compare two or more Azure services for a specific
  scenario.
- The user asks for a review or second opinion on an existing design.

Do not use this skill for simple factual lookups ("what is Azure Container
Apps") that do not require a recommendation or comparison.

## Instructions

Follow these steps in order:

1. **Clarify the workload.** Identify, or ask for if missing: workload type,
   expected scale, data sensitivity, latency/availability targets, region or
   residency constraints, and budget sensitivity. State the assumptions you
   made if the user did not provide something.
2. **Ground in current documentation.** Use the Microsoft Learn MCP tools to
   verify service capabilities, limits, and current guidance before making a
   recommendation. Prefer official documentation over general model
   knowledge, especially for service limits, pricing tiers, and preview
   features that change often.
3. **Compare at least two viable designs.** For each option, cover:
   - Primary purpose
   - Strengths
   - Limitations
   - When to choose it over the alternative(s)
4. **Make a recommendation.** State which option you recommend and why, tied
   back to the requirements gathered in step 1.
5. **Call out cross-cutting concerns.** Address security, cost, reliability,
   and operations (monitoring, deployment, day-2 operations) for the
   recommended option.
6. **Cite sources.** List the Microsoft Learn pages used to ground the
   answer.
7. **State what remains unknown.** If information needed for a confident
   recommendation is still missing, say so explicitly instead of guessing.

## Output format

Structure the response as:

```
## Requirements
- ...

## Options considered
### Option A
- Primary purpose:
- Strengths:
- Limitations:
- Choose this when:

### Option B
(same structure)

## Recommendation
...

## Security, cost, reliability, operations
...

## Sources
- <Microsoft Learn links used>

## Open questions
- ...
```

## Notes

- This skill assumes the agent already has access to a Microsoft Learn MCP
  tool. If MCP tool calls are unavailable, say so and fall back to general
  guidance, clearly labeled as not verified against current documentation.
- Keep the response concise; expand detail only when the user asks for it.
