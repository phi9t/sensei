# Sensei Exact Schedule Oracle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a replay-backed exact schedule oracle for small non-DualPipe,
non-residency Sensei levels.

**Architecture:** The oracle performs branch-and-bound over ordinary
`ScheduleState` objects. It enumerates legal placement moves with
`classifyMoves`, applies moves with `applyAction`, ranks complete schedules with
the existing score tuple, and prunes duplicate partial states through dominance.

**Tech Stack:** TypeScript, Vitest, existing Sensei engine modules.

---

## File Structure

- Create: `src/engine/exactOracle.ts`
  - Pure oracle API, result types, search options, dominance labels, lower-bound
    pruning, and replay-backed transition loop.
- Create: `src/engine/exactOracle.test.ts`
  - Focused tests for complete schedules, ranking improvement over AFAB,
    memory-cap legality, split `W`, unsupported models, operation limit, and
    replay compatibility.
- Create: `docs/superpowers/specs/2026-08-26-sensei-exact-schedule-oracle.md`
  - Design contract, supported boundaries, verifier, and post-execution review.
- Create: `docs/superpowers/plans/2026-08-26-sensei-exact-schedule-oracle.md`
  - This executable implementation plan.
- Do not modify: `src/components/PipelineLessonPanel.tsx`.

## Task 1: Pin The Spec And Boundaries

**Files:**

- Create: `docs/superpowers/specs/2026-08-26-sensei-exact-schedule-oracle.md`
- Create: `docs/superpowers/plans/2026-08-26-sensei-exact-schedule-oracle.md`

- [x] **Step 1: Write the spec**

  Add a spec that states:

  ```text
  The oracle supports finite one-direction placement-only levels.
  It uses replay legality and score ranking.
  It rejects DualPipe and residency levels with structured reasons.
  It reports proof stats and preserves follow-on work as separate slices.
  ```

- [x] **Step 2: Write this plan**

  The plan must include the implementation, tests, verifier, and
  post-execution review steps so another agent can use it as a goal.

## Task 2: Write The Oracle Tests First

**Files:**

- Create: `src/engine/exactOracle.test.ts`

- [x] **Step 1: Add imports and helpers**

  ```ts
  import { describe, expect, it } from 'vitest';
  import { getLevel } from '../levels/levels';
  import { makeConfig, placeIds, expectState } from '../test/factories';
  import { findExactSchedule } from './exactOracle';
  import { replay } from './replay';
  import { attemptRankingTuple, compareAttempts } from './score';
  ```

- [x] **Step 2: Add the dependency-chain proof test**

  ```ts
  it('finds the exact dependency-chain schedule', () => {
    const result = findExactSchedule(makeConfig());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.actions).toEqual(placeIds('F:0:0', 'F:1:0', 'B:1:0', 'B:0:0'));
    expect(result.score).toMatchObject({
      makespan: 6,
      peakActivationMemory: 1,
      complete: true,
    });
    expect(result.stats.completeSchedules).toBeGreaterThan(0);
  });
  ```

- [x] **Step 3: Add the AFAB comparison test**

  ```ts
  it('ranks an interleaved schedule ahead of all-forward/all-backward by memory', () => {
    const config = makeConfig({ microbatchCount: 3 });
    const afab = expectState(
      replay(
        config,
        placeIds(
          'F:0:0',
          'F:0:1',
          'F:0:2',
          'F:1:0',
          'F:1:1',
          'F:1:2',
          'B:1:0',
          'B:0:0',
          'B:1:1',
          'B:0:1',
          'B:1:2',
          'B:0:2',
        ),
      ),
    );

    const result = findExactSchedule(config);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(compareAttempts(result.ranking, attemptRankingTuple(afab))).toBeLessThan(0);
    expect(result.ranking.makespan).toBe(attemptRankingTuple(afab).makespan);
    expect(result.ranking.peakActivationMemory).toBeLessThan(
      attemptRankingTuple(afab).peakActivationMemory,
    );
    expect(result.actions).toHaveLength(result.state.operations.length);
    expect(result.stats.prunedByDominance).toBeGreaterThan(0);
  });
  ```

- [x] **Step 4: Add memory-cap and split-backward tests**

  ```ts
  it('respects replay memory caps while searching', () => {
    const result = findExactSchedule(makeConfig({ microbatchCount: 2, memoryCaps: [1, 1] }), {
      maxOperations: 8,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.peakMemory).toEqual([1, 1]);
    expect(result.state.currentMemory).toEqual([0, 0]);
  });

  it('supports split F/B/W schedules and releases activation at W', () => {
    const result = findExactSchedule(
      makeConfig({
        durations: { F: 1, B: 1, W: 1 },
        operationModel: { backward: 'split' },
        microbatchCount: 2,
      }),
      { maxOperations: 12 },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.operations.some((operation) => operation.kind === 'W')).toBe(true);
    expect(result.state.currentMemory).toEqual([0, 0]);
    expect(result.score.complete).toBe(true);
  });
  ```

- [x] **Step 5: Add unsupported and limit tests**

  ```ts
  it('returns structured unsupported results for DualPipe and residency levels', () => {
    expect(findExactSchedule(getLevel('dualpipe-balance'))).toMatchObject({
      ok: false,
      reason: { kind: 'unsupported-dual-pipe' },
    });
    expect(findExactSchedule(getLevel('gather-once-reuse'))).toMatchObject({
      ok: false,
      reason: { kind: 'unsupported-residency' },
    });
  });

  it('returns a structured limit result before searching oversized levels', () => {
    expect(findExactSchedule(getLevel('gpipe-afab'), { maxOperations: 4 })).toMatchObject({
      ok: false,
      reason: { kind: 'too-many-operations', operationCount: 24, maxOperations: 4 },
      stats: { operationCount: 24, statesVisited: 0 },
    });
  });
  ```

- [x] **Step 6: Run the new test and confirm it fails**

  Run:

  ```bash
  npm test -- src/engine/exactOracle.test.ts
  ```

  Expected: fail because `src/engine/exactOracle.ts` does not exist.

## Task 3: Implement Oracle Types And Guards

**Files:**

- Create: `src/engine/exactOracle.ts`

- [x] **Step 1: Add imports and public types**

  ```ts
  import { applyAction, classifyMoves, initialState, type ScheduleState } from './replay';
  import {
    attemptRankingTuple,
    compareAttempts,
    score,
    type AttemptRankingTuple,
    type ScoreResult,
  } from './score';
  import type { Action, LevelConfig, OperationId } from './types';

  export interface ExactScheduleSearchOptions {
    readonly maxOperations?: number;
    readonly maxStates?: number;
  }
  ```

- [x] **Step 2: Add result and stats types**

  ```ts
  export interface ExactScheduleSearchStats {
    readonly operationCount: number;
    readonly statesVisited: number;
    readonly transitionsConsidered: number;
    readonly completeSchedules: number;
    readonly prunedByDominance: number;
    readonly prunedByBound: number;
    readonly maxDominanceWidth: number;
  }

  export type ExactScheduleSearchFailureReason =
    | { readonly kind: 'unsupported-dual-pipe' }
    | { readonly kind: 'unsupported-residency' }
    | {
        readonly kind: 'too-many-operations';
        readonly operationCount: number;
        readonly maxOperations: number;
      }
    | { readonly kind: 'search-exhausted'; readonly maxStates: number }
    | { readonly kind: 'deadlock' };
  ```

- [x] **Step 3: Add the result union**

  ```ts
  export type ExactScheduleSearchResult =
    | {
        readonly ok: true;
        readonly actions: readonly Action[];
        readonly state: ScheduleState;
        readonly score: ScoreResult;
        readonly ranking: AttemptRankingTuple;
        readonly stats: ExactScheduleSearchStats;
      }
    | {
        readonly ok: false;
        readonly reason: ExactScheduleSearchFailureReason;
        readonly stats: ExactScheduleSearchStats;
        readonly bestSoFar?: {
          readonly actions: readonly Action[];
          readonly state: ScheduleState;
          readonly score: ScoreResult;
          readonly ranking: AttemptRankingTuple;
        };
      };
  ```

## Task 4: Implement Exact Search

**Files:**

- Modify: `src/engine/exactOracle.ts`

- [x] **Step 1: Add helper functions**

  Implement:

  ```ts
  type MutableStats = {
    operationCount: number;
    statesVisited: number;
    transitionsConsidered: number;
    completeSchedules: number;
    prunedByDominance: number;
    prunedByBound: number;
    maxDominanceWidth: number;
  };

  type DominanceLabel = {
    readonly rankFrontiers: readonly number[];
    readonly operationEnds: ReadonlyMap<OperationId, number>;
    readonly currentMemory: readonly number[];
    readonly peakMemory: readonly number[];
    readonly allGatherCount: number;
  };
  ```

  Add helpers for option validation, freezing stats, placed-set keys,
  dominance labels, and legal-move sorting.

- [x] **Step 2: Add dominance pruning**

  For each placed-set key:

  ```text
  if any existing label dominates the candidate, prune it
  otherwise remove labels dominated by the candidate and keep the candidate
  ```

  A label dominates another only when rank frontiers, per-operation end times,
  current memory, peak memory, and all-gather count are all no worse.

- [x] **Step 3: Add lower-bound pruning**

  After an incumbent exists, compute:

  ```text
  max(rankFrontier[rank] + remainingWorkOnRank[rank])
  ```

  Prune only when that lower bound already loses on makespan, or ties makespan
  while current peak activation is already worse.

- [x] **Step 4: Add `findExactSchedule`**

  The function must:

  1. build `initialState(config)`;
  2. return unsupported failures for DualPipe and residency;
  3. return `too-many-operations` when the normalized operation inventory
     exceeds `maxOperations`;
  4. recursively visit legal placement states until complete, dominated,
     bounded, or exhausted;
  5. return `ok: true` only when the search finishes without exhaustion and an
     incumbent exists.

## Task 5: Verify Tests And Replay Compatibility

**Files:**

- Modify: `src/engine/exactOracle.test.ts`

- [x] **Step 1: Run the focused test**

  Run:

  ```bash
  npm test -- src/engine/exactOracle.test.ts
  ```

  Expected: pass.

- [x] **Step 2: Add replay compatibility assertion if missing**

  Ensure at least one test does:

  ```ts
  const replayed = replay(config, result.actions);
  expect(replayed.ok).toBe(true);
  if (replayed.ok) {
    expect(replayed.state.placements).toEqual(result.state.placements);
  }
  ```

- [x] **Step 3: Run engine tests**

  Run:

  ```bash
  npm test -- src/engine/exactOracle.test.ts src/engine/replay.test.ts src/engine/score.test.ts
  ```

  Expected: pass.

## Task 6: Full Verification And Review

**Files:**

- Modify: `docs/superpowers/plans/2026-08-26-sensei-exact-schedule-oracle.md`
  after execution, only if the implementation reveals a plan correction worth
  recording.

- [x] **Step 1: Run typecheck**

  Run:

  ```bash
  npm run typecheck
  ```

  Expected: pass.

- [x] **Step 2: Run lint**

  Run:

  ```bash
  npm run lint
  ```

  Expected: pass.

- [x] **Step 3: Run format check**

  Run:

  ```bash
  npm run format:check
  ```

  Expected: pass.

- [x] **Step 4: Run full verification if time permits**

  Run:

  ```bash
  npm run verify
  ```

  Expected: pass. If it fails because of unrelated untracked UI WIP, report the
  exact failing path and do not edit `src/components/PipelineLessonPanel.tsx`.

- [x] **Step 5: Post-execution review**

  Confirm and record:

  ```text
  The oracle is replay-backed.
  The oracle is exact only for its bounded supported class.
  Search limits are explicit in result reasons.
  The first AFAB comparison proves lexicographic improvement by peak memory,
  not a universal makespan improvement.
  DualPipe, residency, counter DP, building-block generators, and CP-SAT export
  remain follow-on slices.
  ```
