# Sensei Optimizer Model Export Spec

**Status:** Offline solver boundary after exact oracle and synthesis.

## Goal

Expose a stable, data-only optimization model for hard pipeline-scheduling
cases without adding a CP-SAT or MILP runtime dependency to the browser game.

## Problem

The exact oracle proves small replay-backed schedules, and the synthesis toolkit
searches structured building-block candidates. Hard cases need a different
boundary: arbitrary resource overlap, DualPipe shared capacity, future
communication resources, and eventually residency/cache choices. Those belong
in an offline optimizer or research tool.

Sensei needs a precise export shape so external solvers can be plugged in later
without reimplementing operation IDs, stage/rank mapping, durations, or
dependency semantics.

## Scope

This slice exports:

- normalized operations from `deriveOperations(config)`;
- dependency edges from `predecessorsOf(operation.id, config)`;
- rank resources for ordinary one-direction levels;
- shared and directional rank resources for DualPipe levels;
- per-operation resource requirements;
- activation acquire/release events;
- memory caps as rank-local activation constraints;
- lexicographic objective metadata matching `attemptRankingTuple`;
- conservative lower and upper time horizons.

This slice does not:

- solve the model;
- introduce OR-Tools, CP-SAT, or MILP dependencies;
- encode FSDP residency decisions;
- model communication links or bandwidth;
- export UI-facing lesson content.

## Public API

Add:

```ts
function exportOptimizerModel(config: LevelConfig): OptimizerModelExportResult;
```

Successful result:

```ts
{
  ok: true,
  model: {
    metadata,
    timeHorizon,
    operations,
    dependencies,
    resources,
    resourceRequirements,
    activationMemory,
    objective,
  },
}
```

Residency failure:

```ts
{
  ok: false,
  reason: {
    kind: "unsupported-residency",
    detail: "Residency requires stateful cache and eviction variables, not only intervals.",
  },
}
```

## Model Semantics

Each operation is an interval:

```text
start_i >= 0
end_i = start_i + duration_i
```

Each dependency edge means:

```text
end_from <= start_to
```

Ordinary levels use one capacity-1 exclusive rank resource per rank. A solver
should add a no-overlap constraint for all intervals requiring that rank
resource.

DualPipe levels use:

```text
rank:r:shared
rank:r:direction:asc
rank:r:direction:desc
```

Each directional operation consumes one shared slot and one direction-specific
slot. A solver should model those as cumulative/no-overlap resources according
to their capacities.

Activation memory is emitted as operation-end events:

```text
F end -> +1 activation on the operation rank
B end -> -1 activation for fused backward levels
W end -> -1 activation for split backward levels
```

At equal time, external solvers should apply acquire events before release
events to match Sensei's conservative peak-memory accounting.

## Objective

The exported objective is metadata, not a linearized solver expression:

```text
1. minimize makespan
2. minimize peakActivationMemory
3. minimize allGatherCount
4. minimize intentionalIdle
5. minimize actionCount
```

This is the same ordering as `attemptRankingTuple`. External solvers can run
staged solves, scalarized weighted solves, or repeated constrained solves to
recover a Pareto frontier.

## Time Horizon

The model exports:

- `upperBound`: sum of operation durations, always feasible for serial
  placement when dependencies are acyclic and resources are finite;
- `lowerBound`: max of resource-work lower bound and dependency critical-path
  lower bound.

These bounds are aids for offline tools. They are not a proof that the exported
model has been solved.

## Acceptance

- Ordinary levels export operations, dependencies, rank resources, resource
  requirements, activation constraints, and objectives.
- Split-backward levels release activation at `W`, not `B`.
- DualPipe levels export shared and directional rank resources without trying
  to solve overlap choices.
- Residency levels return a structured unsupported result until cache-state
  variables are designed.
- Focused tests and full repository verification pass.

## Post-Execution Review

After implementation:

1. Confirm export uses engine-derived operations and dependencies.
2. Confirm the module has no solver/runtime dependency.
3. Confirm residency remains unsupported with a clear reason.
4. Record that any CP-SAT/MILP runner should live outside the game runtime.
