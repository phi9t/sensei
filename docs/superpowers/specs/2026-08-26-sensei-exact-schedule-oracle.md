# Sensei Exact Schedule Oracle Spec

**Status:** First implementation slice.

## Goal

Add a small exact oracle that can prove the best placement-only schedule for
small one-direction Sensei levels, then use it as a foundation for schedule
generation, fixture validation, and curriculum claims.

## Problem

Sensei currently teaches pipeline schedules through authored policies and
handwritten fixtures. That is useful for curriculum flow, but it leaves two
questions unanswered:

- Is a reference schedule actually optimal for the simplified engine model?
- When a learner finds a different legal schedule, is it better, worse, or just
  a different point in the same trade-off space?

The general scheduling problem is hard: once rank orders, memory, residency,
bidirectional resources, and topology placement are all decision variables, the
problem becomes a resource-constrained project scheduling or job-shop problem.
For the game, the first practical mechanism should be an exact oracle for small
levels, not a general optimizer.

## Scope

This slice solves:

- finite levels that use normal one-direction operation IDs;
- fused `F/B` and split `F/B/W` backward models;
- existing per-rank serial execution semantics;
- existing dependency semantics from `predecessorsOf`;
- existing activation-memory admission, including `memoryCaps`;
- optional virtual-stage topology, because replay already maps logical stages
  to physical ranks;
- placement-only schedules, where the oracle never inserts explicit `wait`
  actions.

This slice does not solve:

- `dualPipeModel` levels with overlapping directional resources;
- `residencyModel` levels with weight gather/reuse/eviction state;
- explicit communication resources;
- stage-to-rank topology search;
- user-inserted intentional waits;
- unbounded large levels.

The no-wait boundary is intentional. The game is centered on placing blocks,
and `applyAction` already inserts dependency-forced gaps when a rank cannot
start immediately. Intentional waits can be added later as a bounded search
dimension if a level needs "same makespan, lower peak memory by delaying a
forward" proofs.

## Engine Contract

Create a pure function:

```ts
function findExactSchedule(
  config: LevelConfig,
  options?: ExactScheduleSearchOptions,
): ExactScheduleSearchResult;
```

The function must use existing engine primitives:

- `initialState(config)` to validate and normalize the level;
- `classifyMoves(state)` to enumerate legal operations;
- `applyAction(state, action)` to produce the next state;
- `attemptRankingTuple(state)` and `compareAttempts(left, right)` to compare
  complete schedules;
- `score(state)` to expose the final scoreboard result.

The oracle must not duplicate dependency or memory legality. If replay semantics
change, the oracle should follow those changes automatically.

## Output

Successful result:

```ts
{
  ok: true,
  actions,
  state,
  score,
  ranking,
  stats,
}
```

Failure result:

```ts
{
  ok: false,
  reason,
  stats,
  bestSoFar?
}
```

Failure reasons:

- `unsupported-dual-pipe`: DualPipe needs interval-resource optimization.
- `unsupported-residency`: residency search needs cache-state reasoning.
- `too-many-operations`: operation count exceeds the configured exact limit.
- `search-exhausted`: state budget was exhausted before proof.
- `deadlock`: the finite state space was exhausted without a complete schedule.

Frontier result:

```ts
{
  ok: true,
  frontier,
  stats,
}
```

`findExactScheduleFrontier` returns nondominated complete schedules over the
same ranking dimensions. Equal ranking tuples collapse to one representative
schedule so the frontier is a compact set of trade-off points, not every action
permutation that reaches the same score.

## Search Strategy

Use branch-and-bound over replay states.

State:

```text
ScheduleState from replay
```

Transition:

```text
for each legal place move:
  next = applyAction(state, { type: "place", operationId })
```

Completion:

```text
state.placements.length === state.operations.length
```

Ranking:

```text
lexicographic(makespan, peakActivationMemory, allGatherCount, intentionalIdle, actionCount)
```

This is exactly the existing `attemptRankingTuple` order.

## Dominance

For the same placed-operation set, one partial state dominates another when it
is no worse in every resource that can affect the supported objective:

```text
rankFrontiers[r] <= other.rankFrontiers[r] for every rank
endTime[op] <= other.endTime[op] for every placed operation
currentMemory[r] <= other.currentMemory[r] for every rank
peakMemory[r] <= other.peakMemory[r] for every rank
allGatherCount <= other.allGatherCount
```

Dominated states can be discarded because the remaining legal operation set is
the same, every rank/resource is at least as available, and every already
placed predecessor finishes no later.

## Lower Bound

For pruning after a complete incumbent exists:

```text
lowerMakespan = max_r(rankFrontier[r] + remainingWorkOnRank[r])
```

If `lowerMakespan` is already worse than the incumbent's makespan, prune. If it
ties the incumbent makespan but current peak activation memory is already worse,
prune.

## Acceptance

- The oracle returns a complete replay-produced state for a one-microbatch
  dependency chain.
- It ranks a lower-activation interleaved schedule ahead of GPipe AFAB in a
  simple two-rank multi-microbatch level when makespan ties.
- It respects memory caps because blocked forward moves come from
  `classifyMoves`.
- It supports split `F/B/W` levels and releases activation memory at `W`.
- It returns structured unsupported results for DualPipe and residency levels.
- It returns a structured limit result before searching oversized instances.
- The returned action log replays through `replay(config, actions)`.
- The frontier API returns replayable schedules sorted by
  `compareAttempts`, and no returned schedule is dominated by another returned
  schedule.

## Verifier

Run focused tests:

```bash
npm test -- src/engine/exactOracle.test.ts
```

Run the broader engine gate:

```bash
npm run typecheck
npm run lint
npm run format:check
```

If the oracle is wired into level metadata or UI later, run the full gate:

```bash
npm run verify
```

## Post-Execution Review

After implementation:

1. Confirm the oracle is truly replay-backed and does not copy dependency or
   memory logic.
2. Record any discovered search-size limits in the plan.
3. Tighten the plan if tests reveal a missing boundary or a better interface.
4. Keep follow-on work separate: counter DP, building-block generation, and
   CP-SAT export should be separate slices.
