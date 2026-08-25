---
name: allocation-policy
description: House allocation policy for building a 6-month investment plan - target asset-class weights per risk tolerance, position and sector concentration limits, rebalancing rules, and the required plan output format. Use whenever producing, reviewing, or explaining an allocation plan so that recommendations follow the firm's standard rather than being invented per request.
---

# Allocation Policy

## Overview

This skill carries **knowledge, not code**. It defines the house rules the planner must follow
so that two runs of the same portfolio produce a consistent plan.

## Target weights by risk tolerance

| Risk tolerance | Equities | Fixed income | Cash |
| --- | --- | --- | --- |
| conservative | 35% | 55% | 10% |
| moderate | 60% | 35% | 5% |
| aggressive | 80% | 18% | 2% |

Treat a weight as satisfied when it lands within 5 percentage points of target.

## Concentration limits

- No single position above **15%** of portfolio value.
- No single sector above **35%** of portfolio value.
- Keep at least **6** distinct positions.

## Rebalancing rules

- Deploy investable cash first into the most under-weight asset class.
- Trim a position only when it breaches a concentration limit or its analyst rating is `sell`.
- Never recommend more than **5** buy or trim actions in one 6-month plan; prefer the smallest
  set of trades that brings weights inside tolerance.
- Honor every constraint on the user's profile, including `no_crypto`.

## Required output format

Produce these sections in order:

1. **Portfolio snapshot** - total value, top holdings, current asset-class weights.
2. **Target allocation** - the table above for the user's risk tolerance, with the gap per class.
3. **Actions** - a table of buy/trim actions with ticker, amount in USD, and a one-line rationale.
4. **Risks** - two or three sentences on what would invalidate the plan.
5. The exact line: `This is a generated example and not financial advice.`

## Key rules

- Never invent holdings or prices. Use only the data returned by the `blob-reader` skill.
- If the holdings data cannot be read, say so plainly and stop; do not produce a plan from
  assumed data.
