# Sensei Schedule Synthesis Toolkit Spec

**Status:** Follow-on implementation after the exact oracle.

## Goal

Build the next reusable engine layer for principled pipeline-parallel schedule
construction: squeeze an existing rank-local order, search small periodic
building-block templates, and keep hard optimizer work explicitly outside the
browser-game critical path.

## Algorithmic Position

Sensei now has two complementary mechanisms:

- exact replay-backed search for tiny whole-level schedules;
- building-block analysis for period, collisions, stable bubble, and activation
  lifespan pressure.

The missing middle layer is synthesis:

1. take a legal action log and compact it while preserving rank-local order;
2. search bounded periodic templates using the building-block analyzer;
3. return scored candidates that can be compared against handcrafted policies.

This is still not a general optimizer. It is a deterministic, bounded,
explainable engine primitive for curriculum generation and regression checks.

## Scope

This slice supports:

- non-DualPipe levels;
- non-residency levels;
- fused `F/B` and split `F/B/W`;
- one-to-one and virtual-stage topologies already supported by replay;
- integer durations and offsets;
- placement-only squeezed action logs.

This slice does not support:

- DualPipe shared-capacity overlap;
- FSDP residency or cache-policy search;
- explicit communication-resource scheduling;
- topology search;
- external CP-SAT or MILP execution.

## Fixed-Order Squeezing Contract

Add:

```ts
function squeezeActionsByRankOrder(
  config: LevelConfig,
  actions: readonly Action[],
): SqueezedScheduleResult;
```

The function:

- replays the source actions;
- extracts each rank's placed operation order from the resulting placements;
- rebuilds a placement-only action log by repeatedly placing the legal head of
  one rank queue at the earliest projected start;
- never inserts intentional waits;
- returns the original and squeezed states/scores plus removed intentional idle.

This is the fixed-rank-order case from the algorithmic note. It is equivalent to
earliest feasible realization of the supplied per-rank order under the current
replay semantics.

## Building-Block Candidate Search Contract

Add:

```ts
function findBuildingBlockCandidates(
  config: LevelConfig,
  options?: BuildingBlockSearchOptions,
): BuildingBlockCandidateSearchResult;
```

The search:

- builds the representative microbatch-0 operation set;
- tries candidate periods and integer offsets in a bounded window;
- prunes offset assignments that violate rank residue occupancy or assigned
  dependencies;
- validates complete plans with `analyzeBuildingBlockPlan`;
- expands valid plans with `expandBuildingBlockPlan`;
- squeezes expanded actions with `squeezeActionsByRankOrder`;
- ranks candidates with `attemptRankingTuple`.

The output is a sorted candidate list with search stats. The candidate score is
the squeezed score, while the original expanded action log remains available for
inspection.

## Failure Modes

Both synthesis entry points return structured failures:

- `unsupported-dual-pipe`;
- `unsupported-residency`;
- `source-replay-failed`;
- `deadlock`;
- `too-many-representative-operations`;
- `search-exhausted`.

The implementation must avoid throwing for ordinary unsupported model choices.
Throwing is reserved for an internal inconsistency where `classifyMoves`
reports a legal move that `applyAction` rejects.

## Acceptance

- A stamped building-block action log can be squeezed into a placement-only
  schedule that preserves rank-local order and removes intentional waits.
- Candidate search over the existing two-rank periodic example discovers the
  known valid plan family.
- Candidate search returns scored, replay-produced schedules.
- Search controls cap representative-operation count and partial assignment
  visits.
- DualPipe and residency inputs return structured unsupported results.
- Focused tests and full repository verification pass.

## Post-Execution Review

After implementation:

1. Confirm synthesis remains replay-backed and does not duplicate legality.
2. Confirm candidate search is bounded and reports exhaustion.
3. Record the boundary: this is a small generator, not a global proof for large
   pipeline schedules.
4. Leave CP-SAT/MILP as an offline integration slice with a concrete problem
   export, not a runtime dependency.
