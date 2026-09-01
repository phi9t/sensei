# Sensei Schedule Synthesis Toolkit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add replay-backed fixed-order squeezing and bounded building-block
candidate search for small Sensei pipeline schedules.

**Architecture:** `src/engine/scheduleSynthesis.ts` owns synthesis utilities and
depends on replay, score, operations, and building-block APIs. It does not add UI
surface area and it does not change existing replay legality.

**Tech Stack:** TypeScript, Vitest, existing Sensei engine modules.

---

## File Structure

- Create: `src/engine/scheduleSynthesis.ts`
  - Public result types, `squeezeActionsByRankOrder`, and
    `findBuildingBlockCandidates`.
- Create: `src/engine/scheduleSynthesis.test.ts`
  - Tests for squeezing, candidate discovery, sorted ranking, search limits, and
    unsupported model boundaries.
- Modify: `docs/superpowers/specs/2026-08-26-sensei-schedule-synthesis-toolkit.md`
  - Track the synthesis boundary, verifier, and post-execution review.
- Modify: `docs/superpowers/plans/2026-08-26-sensei-schedule-synthesis-toolkit.md`
  - Track execution checkboxes and any corrections discovered during work.
- Do not modify: `src/components/PipelineLessonPanel.tsx`.

## Task 1: Write Synthesis Tests

**Files:**

- Create: `src/engine/scheduleSynthesis.test.ts`

- [x] **Step 1: Add imports and shared fixture**

  ```ts
  import { describe, expect, it } from 'vitest';
  import { getLevel } from '../levels/levels';
  import { expectState } from '../test/factories';
  import { expandBuildingBlockPlan, type BuildingBlockPlan } from './buildingBlocks';
  import { replay } from './replay';
  import { score } from './score';
  import { findBuildingBlockCandidates, squeezeActionsByRankOrder } from './scheduleSynthesis';
  import type { LevelConfig } from './types';

  const BASE_LEVEL: LevelConfig = Object.freeze({
    id: 'test-synthesis',
    version: 1,
    title: 'Test Synthesis',
    rankCount: 2,
    stageCount: 2,
    microbatchCount: 3,
    durations: Object.freeze({ F: 1, B: 2 }),
    memoryCaps: null,
    masteryTargets: Object.freeze([]),
    coaching: Object.freeze({ readySet: true, suggest: false, auto: false }),
    algorithm: Object.freeze({
      family: 'building-block',
      setTitle: 'Building Blocks',
      concept: 'Test synthesis.',
      objective: 'Build candidate schedules.',
      patternLabel: 'Periodic',
      introducedModel: Object.freeze(['periodic trajectory']),
    }),
  });

  const VALID_PLAN: BuildingBlockPlan = Object.freeze({
    period: 3,
    trajectory: Object.freeze([
      Object.freeze({ operationId: 'F:0:0', offset: 0 }),
      Object.freeze({ operationId: 'F:1:0', offset: 1 }),
      Object.freeze({ operationId: 'B:1:0', offset: 2 }),
      Object.freeze({ operationId: 'B:0:0', offset: 4 }),
    ]),
  });
  ```

- [x] **Step 2: Add fixed-order squeeze test**

  ```ts
  it('squeezes a stamped building-block action log while preserving rank order', () => {
    const expanded = expandBuildingBlockPlan(BASE_LEVEL, VALID_PLAN);
    expect(expanded.ok).toBe(true);
    if (!expanded.ok) return;

    const result = squeezeActionsByRankOrder(BASE_LEVEL, expanded.actions);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.squeezed.actions.every((action) => action.type === 'place')).toBe(true);
    expect(result.removedIntentionalIdle).toBeGreaterThan(0);
    expect(result.squeezed.score.makespan).toBeLessThanOrEqual(result.original.score.makespan);
    expect(result.rankOrders).toEqual([
      ['F:0:0', 'F:0:1', 'B:0:0', 'F:0:2', 'B:0:1', 'B:0:2'],
      ['F:1:0', 'B:1:0', 'F:1:1', 'B:1:1', 'F:1:2', 'B:1:2'],
    ]);
  });
  ```

- [x] **Step 3: Add source failure and unsupported tests**

  ```ts
  it('returns source replay failure for invalid action logs', () => {
    expect(
      squeezeActionsByRankOrder(BASE_LEVEL, [{ type: 'place', operationId: 'B:0:0' }]),
    ).toMatchObject({
      ok: false,
      reason: { kind: 'source-replay-failed' },
    });
  });

  it('returns structured unsupported synthesis results for DualPipe and residency levels', () => {
    expect(squeezeActionsByRankOrder(getLevel('dualpipe-balance'), [])).toMatchObject({
      ok: false,
      reason: { kind: 'unsupported-dual-pipe' },
    });
    expect(findBuildingBlockCandidates(getLevel('gather-once-reuse'))).toMatchObject({
      ok: false,
      reason: { kind: 'unsupported-residency' },
    });
  });
  ```

- [x] **Step 4: Add candidate search tests**

  ```ts
  it('discovers replayable building-block candidates sorted by score', () => {
    const result = findBuildingBlockCandidates(BASE_LEVEL, {
      minPeriod: 3,
      maxPeriod: 3,
      maxOffset: 4,
      maxRepresentativeOperations: 4,
      maxAssignments: 5_000,
      maxCandidates: 4,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.candidates.length).toBeGreaterThan(0);
    expect(result.candidates[0]?.plan).toEqual(VALID_PLAN);
    for (const candidate of result.candidates) {
      expect(candidate.analysis.validation.ok).toBe(true);
      expect(candidate.expanded.actions.length).toBeGreaterThan(candidate.squeezed.actions.length);
      const replayed = replay(BASE_LEVEL, candidate.squeezed.actions);
      expect(replayed.ok).toBe(true);
      if (replayed.ok) {
        expect(score(replayed.state)).toEqual(candidate.squeezed.score);
      }
    }
  });

  it('returns a structured limit result for too many representative operations', () => {
    expect(
      findBuildingBlockCandidates(getLevel('zero-bubble-h1'), {
        maxRepresentativeOperations: 4,
      }),
    ).toMatchObject({
      ok: false,
      reason: {
        kind: 'too-many-representative-operations',
        representativeOperationCount: 6,
        maxRepresentativeOperations: 4,
      },
    });
  });

  it('returns search exhaustion when assignment budget is too small', () => {
    expect(
      findBuildingBlockCandidates(BASE_LEVEL, {
        minPeriod: 3,
        maxPeriod: 3,
        maxOffset: 4,
        maxRepresentativeOperations: 4,
        maxAssignments: 1,
      }),
    ).toMatchObject({
      ok: false,
      reason: { kind: 'search-exhausted', maxAssignments: 1 },
      stats: { assignmentsVisited: 1 },
    });
  });
  ```

- [x] **Step 5: Run tests and confirm failure**

  Run:

  ```bash
  npm test -- src/engine/scheduleSynthesis.test.ts
  ```

  Expected: fail because `scheduleSynthesis.ts` does not exist yet.

## Task 2: Implement Squeeze API

**Files:**

- Create: `src/engine/scheduleSynthesis.ts`

- [x] **Step 1: Add imports and public result types**

  ```ts
  import { analyzeBuildingBlockPlan, expandBuildingBlockPlan } from './buildingBlocks';
  import { deriveOperations, predecessorsOf } from './operations';
  import {
    applyAction,
    initialState,
    replay,
    type ReplayResult,
    type ScheduleState,
  } from './replay';
  import {
    attemptRankingTuple,
    compareAttempts,
    score,
    type AttemptRankingTuple,
    type ScoreResult,
  } from './score';
  import type {
    Action,
    BuildingBlockAnalysis,
    BuildingBlockPlan,
    LevelConfig,
    Operation,
    OperationId,
  } from './types';
  ```

  Define `SynthesisSchedule`, `SynthesisFailureReason`,
  `SqueezedScheduleResult`, `BuildingBlockCandidate`, `BuildingBlockSearchStats`,
  `BuildingBlockSearchOptions`, and `BuildingBlockCandidateSearchResult`.

- [x] **Step 2: Add schedule freezing helpers**

  Implement helpers that freeze action arrays, rank orders, schedule bundles,
  stats, and failure result objects.

- [x] **Step 3: Add model guard helper**

  Implement:

  ```ts
  function unsupportedReason(config: LevelConfig): SynthesisFailureReason | null;
  ```

  It returns `unsupported-dual-pipe` for `dualPipeModel` and
  `unsupported-residency` for `residencyModel`.

- [x] **Step 4: Implement `squeezeActionsByRankOrder`**

  The function must:

  1. return unsupported failures before replaying unsupported levels;
  2. replay source actions;
  3. return `{ kind: 'source-replay-failed', index, action, blockReason }` on
     replay failure;
  4. group completed placements by `placement.rank`, sorted by start/end/id;
  5. repeatedly place a legal operation that is the head of its rank queue,
     preferring the smallest current `earliestStart`;
  6. return `deadlock` if no head is legal;
  7. compute `removedIntentionalIdle` from the score delta.

## Task 3: Implement Candidate Search

**Files:**

- Modify: `src/engine/scheduleSynthesis.ts`

- [x] **Step 1: Add representative operation ordering**

  Use `deriveOperations(config).filter(operation => operation.microbatch === 0)`.
  Sort by kind/stage/microbatch/id so deterministic search reaches the existing
  two-rank example first.

- [x] **Step 2: Add incremental pruning**

  While assigning offsets:

  - offset must be an integer in `[0, maxOffset]`;
  - for each occupied duration tick, `(rank, offset % period)` must be empty;
  - every already-assigned predecessor must finish no later than the candidate
    offset;
  - every already-assigned successor must start no earlier than the candidate
    end.

- [x] **Step 3: Add complete-plan evaluation**

  For each complete assignment:

  1. build a `BuildingBlockPlan`;
  2. call `analyzeBuildingBlockPlan`;
  3. skip invalid plans;
  4. call `expandBuildingBlockPlan`;
  5. call `squeezeActionsByRankOrder`;
  6. create a `BuildingBlockCandidate` with `plan`, `analysis`, `expanded`,
     `squeezed`, and `ranking`.

- [x] **Step 4: Sort and cap candidates**

  Sort by `compareAttempts(candidate.ranking, other.ranking)`, then period, then
  stable bubble, then trajectory offset string. Keep at most `maxCandidates`.

- [x] **Step 5: Return structured results**

  Return `ok: true` with an empty `candidates` array if search completes with no
  valid candidates. Return `search-exhausted` if assignment budget is consumed
  before the search finishes.

## Task 4: Verify And Record Lessons

**Files:**

- Modify: `docs/superpowers/plans/2026-08-26-sensei-schedule-synthesis-toolkit.md`

- [x] **Step 1: Run focused tests**

  Run:

  ```bash
  npm test -- src/engine/scheduleSynthesis.test.ts
  ```

  Expected: pass.

- [x] **Step 2: Run related engine tests**

  Run:

  ```bash
  npm test -- src/engine/scheduleSynthesis.test.ts src/engine/buildingBlocks.test.ts src/engine/exactOracle.test.ts
  ```

  Expected: pass.

- [x] **Step 3: Run static checks**

  Run:

  ```bash
  npm run typecheck
  npm run lint
  npm run format:check
  ```

  Expected: pass.

- [x] **Step 4: Run full verification**

  Run:

  ```bash
  npm run verify
  ```

  Expected: pass.

- [x] **Step 5: Post-execution review**

  Record:

  ```text
  Fixed-order squeezing preserves rank-local order but may change cross-rank
  action interleaving.
  Candidate search is bounded by representative count, offset range, and
  assignment visits.
  The first candidate search is useful for small periodic examples; it is not a
  replacement for CP-SAT/MILP on hard resource models.
  ```
