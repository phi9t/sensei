# Sensei Building-Block Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `SENSEI-CURR-03` by adding a pure building-block validator/expander, one playable building-block level, and a compact level-local stamp affordance.

**Architecture:** Keep the durable learner artifact as `Action[]`. Add building-block types to `src/engine/types.ts`, put deterministic validation and expansion in `src/engine/buildingBlocks.ts`, add a level-authored plan to the catalog, and expose a small pattern check command through the existing cockpit. Stamping expands the plan into ordinary actions, so replay, scoring, undo/redo, persistence, and share links stay on the existing path.

**Tech Stack:** TypeScript, React 19, Vitest, Testing Library, existing Sensei replay/score/persistence modules, CSS contract tests.

---

## Scope

This plan implements only `SENSEI-CURR-03`.

It does not implement virtual stages, interleaved 1F1B, nonuniform duration support, split backward `W`, zero-bubble scoring, grouped scheduling, FSDP residency, or DualPipe. It must not touch the pre-existing untracked `src/components/PipelineLessonPanel.tsx`.

## File Map

- Modify `src/engine/types.ts`
  - Add `BuildingBlockPlan`, `BuildingBlockOperation`, `BuildingBlockViolation`, `BuildingBlockValidation`, and `BuildingBlockLevelMetadata`.
  - Add optional `buildingBlock` metadata to `LevelConfig`.
- Create `src/engine/buildingBlocks.ts`
  - Validate level-authored periodic plans.
  - Expand valid plans into deterministic `Action[]`.
  - Depend only on engine modules.
- Create `src/engine/buildingBlocks.test.ts`
  - Cover valid expansion, invalid period, unknown operation, duplicate rank residue, dependency timing, and memory-cap prediction.
- Modify `src/levels/levels.ts`
  - Freeze optional `buildingBlock` metadata.
  - Add `stamp-the-pattern` to `LEVEL_IDS` after current 1F1B levels.
- Modify `src/levels/levels.test.ts`
  - Update expected IDs/configs.
  - Assert building-block metadata is present only on the new level and frozen.
- Modify `src/levels/fixtures.ts`
  - Add legal and mastered expanded action fixtures for `stamp-the-pattern`.
- Create `src/components/PatternCheck.tsx`
  - Render compact level-local validation feedback and a stamp command.
- Modify `src/app/useGame.ts`
  - Compute building-block validation.
  - Expose `buildingBlockCheck` and `stampBuildingBlockPlan`.
  - Stamp only from an empty current attempt in this first slice.
- Modify `src/app/App.tsx`
  - Pass pattern-check state into `GameControls`.
- Modify `src/components/GameControls.tsx`
  - Render the optional `PatternCheck` cluster inside the existing command rail.
- Modify `src/components/GameShell.test.tsx`
  - Verify compact pattern check visibility, absence on earlier levels, and no rules panel.
- Modify `tests/game-flow.test.tsx`
  - Verify stamping completes the building-block level through public controls and persists expanded actions.
- Modify `tests/persistence.test.ts`
  - Verify share/local storage contain expanded actions, not a building-block plan.
- Modify `tests/responsive-css.test.mjs`
  - Lock compact pattern-check command-rail styling.
- Modify `src/styles/app.css`
  - Add small `.pattern-check` styles that do not compete with the schedule board.

## Invariants

- `Action[]` remains the only persisted learner schedule.
- A `BuildingBlockPlan` is level-authored metadata, not user-authored persisted state.
- Validation failures are typed values, not UI exceptions.
- Existing levels have no `buildingBlock` metadata and remain behaviorally unchanged.
- Stamp does not merge with partial manual attempts in this slice. If the learner has placed or undone into a non-empty current prefix, the command reports `Reset before stamping pattern.`
- Compact labels remain `F0:S0:D1`; the notation key remains `(F/B, stage_id, data_id)`.
- The cockpit remains placement-first. Pattern feedback stays inside the command rail and never becomes a rules panel.

---

### Task 1: Add Pure Building-Block Engine

**Files:**

- Modify: `src/engine/types.ts`
- Create: `src/engine/buildingBlocks.test.ts`
- Create: `src/engine/buildingBlocks.ts`

- [ ] **Step 1: Add failing engine tests**

Create `src/engine/buildingBlocks.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { replay } from './replay';
import {
  expandBuildingBlockPlan,
  validateBuildingBlockPlan,
  type BuildingBlockPlan,
} from './buildingBlocks';
import type { LevelConfig } from './types';

const BASE_LEVEL: LevelConfig = Object.freeze({
  id: 'test-building-block',
  version: 1,
  title: 'Test Building Block',
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
    concept: 'Test periodic trajectory.',
    objective: 'Stamp a trajectory.',
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

function placementStarts(result: ReturnType<typeof replay>) {
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error('expected replay success');
  }

  return Object.fromEntries(
    result.state.placements.map((placement) => [placement.operationId, placement.start]),
  );
}

describe('building-block plans', () => {
  it('validates and expands a periodic trajectory into a complete ordinary action log', () => {
    const validation = validateBuildingBlockPlan(BASE_LEVEL, VALID_PLAN);

    expect(validation).toEqual({
      ok: true,
      period: 3,
      violations: [],
      projectedPeakMemory: [2, 1],
    });

    const expanded = expandBuildingBlockPlan(BASE_LEVEL, VALID_PLAN);
    expect(expanded.ok).toBe(true);
    if (!expanded.ok) {
      throw new Error('expected expansion success');
    }

    expect(expanded.actions).toContainEqual({ type: 'wait', rank: 0 });
    expect(expanded.actions.filter((action) => action.type === 'place')).toHaveLength(
      BASE_LEVEL.stageCount * BASE_LEVEL.microbatchCount * 2,
    );

    const replayed = replay(BASE_LEVEL, expanded.actions);
    expect(placementStarts(replayed)).toMatchObject({
      'F:0:0': 0,
      'F:1:0': 1,
      'B:1:0': 2,
      'F:0:1': 3,
      'B:0:0': 4,
      'F:1:1': 4,
      'B:1:1': 5,
      'F:0:2': 6,
      'B:0:1': 7,
      'F:1:2': 7,
      'B:1:2': 8,
      'B:0:2': 10,
    });
  });

  it('reports an invalid period without trying residue math', () => {
    const validation = validateBuildingBlockPlan(BASE_LEVEL, {
      period: 0,
      trajectory: VALID_PLAN.trajectory,
    });

    expect(validation.ok).toBe(false);
    expect(validation.violations).toContainEqual({ kind: 'invalid-period', period: 0 });
  });

  it('reports unknown operations', () => {
    const validation = validateBuildingBlockPlan(BASE_LEVEL, {
      period: 3,
      trajectory: [
        { operationId: 'F:0:0', offset: 0 },
        { operationId: 'F:1:0', offset: 1 },
        { operationId: 'B:1:0', offset: 2 },
        { operationId: 'B:0:0', offset: 4 },
        { operationId: 'F:2:0', offset: 5 },
      ],
    });

    expect(validation.ok).toBe(false);
    expect(validation.violations).toContainEqual({
      kind: 'unknown-operation',
      operationId: 'F:2:0',
    });
  });

  it('reports duplicate representative operations', () => {
    const validation = validateBuildingBlockPlan(BASE_LEVEL, {
      period: 3,
      trajectory: [
        { operationId: 'F:0:0', offset: 0 },
        { operationId: 'F:0:0', offset: 1 },
        { operationId: 'F:1:0', offset: 2 },
        { operationId: 'B:1:0', offset: 3 },
        { operationId: 'B:0:0', offset: 5 },
      ],
    });

    expect(validation.ok).toBe(false);
    expect(validation.violations).toContainEqual({
      kind: 'duplicate-operation',
      operationId: 'F:0:0',
    });
  });

  it('reports missing representative operations', () => {
    const validation = validateBuildingBlockPlan(BASE_LEVEL, {
      period: 3,
      trajectory: [
        { operationId: 'F:0:0', offset: 0 },
        { operationId: 'F:1:0', offset: 1 },
        { operationId: 'B:1:0', offset: 2 },
      ],
    });

    expect(validation.ok).toBe(false);
    expect(validation.violations).toContainEqual({
      kind: 'missing-operation',
      operationId: 'B:0:0',
    });
  });

  it('reports duplicate occupied residues on the same rank', () => {
    const validation = validateBuildingBlockPlan(BASE_LEVEL, {
      period: 3,
      trajectory: [
        { operationId: 'F:0:0', offset: 0 },
        { operationId: 'B:0:0', offset: 3 },
      ],
    });

    expect(validation.ok).toBe(false);
    expect(validation.violations).toContainEqual({
      kind: 'duplicate-rank-residue',
      rank: 0,
      residue: 0,
      operationIds: ['F:0:0', 'B:0:0'],
    });
  });

  it('reports dependencies that cannot be satisfied at stamped offsets', () => {
    const validation = validateBuildingBlockPlan(BASE_LEVEL, {
      period: 3,
      trajectory: [
        { operationId: 'F:0:0', offset: 0 },
        { operationId: 'F:1:0', offset: 0 },
        { operationId: 'B:1:0', offset: 2 },
        { operationId: 'B:0:0', offset: 4 },
      ],
    });

    expect(validation.ok).toBe(false);
    expect(validation.violations).toContainEqual({
      kind: 'unsatisfied-dependency',
      operationId: 'F:1:0',
      dependencyId: 'F:0:0',
    });
  });

  it('predicts memory cap failures before returning an expanded action log', () => {
    const cappedLevel: LevelConfig = Object.freeze({
      ...BASE_LEVEL,
      memoryCaps: Object.freeze([1, 1]),
    });

    const validation = validateBuildingBlockPlan(cappedLevel, VALID_PLAN);
    expect(validation.ok).toBe(false);
    expect(validation.violations).toContainEqual({
      kind: 'memory-cap',
      rank: 0,
      peak: 2,
      cap: 1,
    });

    const expanded = expandBuildingBlockPlan(cappedLevel, VALID_PLAN);
    expect(expanded.ok).toBe(false);
    if (!expanded.ok) {
      expect(expanded.validation).toBe(validation);
    }
  });
});
```

- [ ] **Step 2: Run the focused engine test and verify it fails**

Run:

```bash
npm test -- src/engine/buildingBlocks.test.ts
```

Expected: FAIL because `src/engine/buildingBlocks.ts` and the building-block types do not exist.

- [ ] **Step 3: Add building-block types**

Modify `src/engine/types.ts` by adding these interfaces after `Action` and before mastery target types:

```ts
export interface BuildingBlockOperation {
  readonly operationId: OperationId;
  readonly offset: number;
}

export interface BuildingBlockPlan {
  readonly period: number;
  readonly trajectory: readonly BuildingBlockOperation[];
}

export type BuildingBlockViolation =
  | { readonly kind: 'invalid-period'; readonly period: number }
  | { readonly kind: 'unknown-operation'; readonly operationId: OperationId }
  | { readonly kind: 'duplicate-operation'; readonly operationId: OperationId }
  | { readonly kind: 'missing-operation'; readonly operationId: OperationId }
  | {
      readonly kind: 'duplicate-rank-residue';
      readonly rank: number;
      readonly residue: number;
      readonly operationIds: readonly OperationId[];
    }
  | {
      readonly kind: 'unsatisfied-dependency';
      readonly operationId: OperationId;
      readonly dependencyId: OperationId;
    }
  | {
      readonly kind: 'memory-cap';
      readonly rank: number;
      readonly peak: number;
      readonly cap: number;
    };

export interface BuildingBlockValidation {
  readonly ok: boolean;
  readonly period: number;
  readonly violations: readonly BuildingBlockViolation[];
  readonly projectedPeakMemory: readonly number[];
}

export interface BuildingBlockLevelMetadata {
  readonly label: string;
  readonly plan: BuildingBlockPlan;
}
```

Then extend `LevelConfig`:

```ts
export interface LevelConfig {
  id: string;
  version: number;
  title: string;
  rankCount: number;
  stageCount: number;
  microbatchCount: number;
  durations: Record<OperationKind, number>;
  memoryCaps: readonly number[] | null;
  masteryTargets: readonly MasteryTarget[];
  coaching: { readySet: boolean; suggest: boolean; auto: boolean };
  algorithm: AlgorithmLevelMetadata;
  buildingBlock?: BuildingBlockLevelMetadata;
}
```

- [ ] **Step 4: Implement the pure engine helper**

Create `src/engine/buildingBlocks.ts`:

```ts
import { deriveOperations, parseOperationId, predecessorsOf } from './operations';
import { replay } from './replay';
import type {
  Action,
  BuildingBlockPlan,
  BuildingBlockValidation,
  BuildingBlockViolation,
  LevelConfig,
  Operation,
  OperationId,
} from './types';

export type { BuildingBlockPlan } from './types';

interface StampedOperation {
  readonly operationId: OperationId;
  readonly templateOperationId: OperationId;
  readonly plannedStart: number;
  readonly rank: number;
}

function cloneConfigWithoutCaps(config: LevelConfig): LevelConfig {
  return Object.freeze({
    ...config,
    memoryCaps: null,
  });
}

function operationInventory(config: LevelConfig): ReadonlyMap<OperationId, Operation> {
  return new Map(deriveOperations(config).map((operation) => [operation.id, operation]));
}

function positiveInteger(value: number): boolean {
  return Number.isInteger(value) && Number.isFinite(value) && value > 0;
}

function residueFor(offset: number, period: number): number {
  return ((offset % period) + period) % period;
}

function occupiedResidues(offset: number, duration: number, period: number): readonly number[] {
  const residues = new Set<number>();
  for (let tick = 0; tick < duration; tick += 1) {
    residues.add(residueFor(offset + tick, period));
  }
  return Object.freeze([...residues].sort((left, right) => left - right));
}

function operationIdForMicrobatch(operationId: OperationId, microbatch: number): OperationId {
  const parsed = parseOperationId(operationId);
  return `${parsed.kind}:${parsed.stage}:${microbatch}`;
}

function templateOperationId(operationId: OperationId): OperationId {
  const parsed = parseOperationId(operationId);
  return `${parsed.kind}:${parsed.stage}:0`;
}

function stampPlan(config: LevelConfig, plan: BuildingBlockPlan): readonly StampedOperation[] {
  const inventory = operationInventory(config);
  const stamped: StampedOperation[] = [];

  for (let microbatch = 0; microbatch < config.microbatchCount; microbatch += 1) {
    for (const template of plan.trajectory) {
      const operationId = operationIdForMicrobatch(template.operationId, microbatch);
      const operation = inventory.get(operationId);
      if (!operation) {
        continue;
      }
      stamped.push(
        Object.freeze({
          operationId,
          templateOperationId: template.operationId,
          plannedStart: template.offset + microbatch * plan.period,
          rank: operation.rank,
        }),
      );
    }
  }

  return Object.freeze(
    stamped.sort(
      (left, right) =>
        left.plannedStart - right.plannedStart ||
        left.rank - right.rank ||
        left.operationId.localeCompare(right.operationId),
    ),
  );
}

function actionsForStampedPlan(
  config: LevelConfig,
  stamped: readonly StampedOperation[],
): readonly Action[] {
  let replayed = replay(config, []);
  if (!replayed.ok) {
    throw new Error('initial replay unexpectedly failed');
  }

  const actions: Action[] = [];
  for (const entry of stamped) {
    while ((replayed.state.rankFrontiers[entry.rank] ?? 0) < entry.plannedStart) {
      const wait: Action = Object.freeze({ type: 'wait', rank: entry.rank });
      actions.push(wait);
      const next = replay(config, actions);
      if (!next.ok) {
        throw new Error(`building-block wait unexpectedly failed: ${next.reason.kind}`);
      }
      replayed = next;
    }

    const action: Action = Object.freeze({ type: 'place', operationId: entry.operationId });
    actions.push(action);
    const next = replay(config, actions);
    if (!next.ok) {
      throw new Error(`building-block placement unexpectedly failed: ${next.reason.kind}`);
    }
    replayed = next;
  }

  return Object.freeze(actions);
}

function validateInventory(
  config: LevelConfig,
  plan: BuildingBlockPlan,
): readonly BuildingBlockViolation[] {
  const inventory = operationInventory(config);
  const violations: BuildingBlockViolation[] = [];
  const representativeIds = deriveOperations(config)
    .filter((operation) => operation.microbatch === 0)
    .map((operation) => operation.id);
  const seen = new Set<OperationId>();

  for (const entry of plan.trajectory) {
    const parsed = (() => {
      try {
        return parseOperationId(entry.operationId);
      } catch {
        return null;
      }
    })();

    if (!parsed || parsed.microbatch !== 0 || !inventory.has(entry.operationId)) {
      violations.push(
        Object.freeze({
          kind: 'unknown-operation',
          operationId: entry.operationId,
        }),
      );
      continue;
    }

    if (seen.has(entry.operationId)) {
      violations.push(
        Object.freeze({
          kind: 'duplicate-operation',
          operationId: entry.operationId,
        }),
      );
      continue;
    }

    seen.add(entry.operationId);
  }

  for (const operationId of representativeIds) {
    if (!seen.has(operationId)) {
      violations.push(
        Object.freeze({
          kind: 'missing-operation',
          operationId,
        }),
      );
    }
  }

  return Object.freeze(violations);
}

function validateResidues(
  config: LevelConfig,
  plan: BuildingBlockPlan,
): readonly BuildingBlockViolation[] {
  const inventory = operationInventory(config);
  const buckets = new Map<string, { rank: number; residue: number; operationIds: OperationId[] }>();

  for (const entry of plan.trajectory) {
    const operation = inventory.get(templateOperationId(entry.operationId));
    if (!operation) {
      continue;
    }

    for (const residue of occupiedResidues(entry.offset, operation.duration, plan.period)) {
      const key = `${operation.rank}:${residue}`;
      const bucket = buckets.get(key) ?? { rank: operation.rank, residue, operationIds: [] };
      if (!bucket.operationIds.includes(entry.operationId)) {
        bucket.operationIds.push(entry.operationId);
      }
      buckets.set(key, bucket);
    }
  }

  return Object.freeze(
    [...buckets.values()]
      .filter((bucket) => bucket.operationIds.length > 1)
      .map((bucket) =>
        Object.freeze({
          kind: 'duplicate-rank-residue' as const,
          rank: bucket.rank,
          residue: bucket.residue,
          operationIds: Object.freeze([...bucket.operationIds]),
        }),
      ),
  );
}

function validateDependencyTiming(
  config: LevelConfig,
  stamped: readonly StampedOperation[],
  placementsById: ReadonlyMap<OperationId, number>,
): readonly BuildingBlockViolation[] {
  const plannedStarts = new Map(stamped.map((entry) => [entry.operationId, entry.plannedStart]));
  const violations: BuildingBlockViolation[] = [];

  for (const entry of stamped) {
    const actualStart = placementsById.get(entry.operationId);
    if (actualStart !== undefined && actualStart > entry.plannedStart) {
      const dependencyId =
        predecessorsOf(entry.operationId, config).find((candidate) => {
          const dependencyStart = plannedStarts.get(candidate);
          if (dependencyStart === undefined) {
            return true;
          }
          const dependency = deriveOperations(config).find(
            (operation) => operation.id === candidate,
          );
          return dependencyStart + (dependency?.duration ?? 0) > entry.plannedStart;
        }) ?? entry.operationId;
      violations.push(
        Object.freeze({
          kind: 'unsatisfied-dependency',
          operationId: entry.operationId,
          dependencyId,
        }),
      );
    }
  }

  return Object.freeze(violations);
}

function validateMemoryCaps(
  config: LevelConfig,
  projectedPeakMemory: readonly number[],
): readonly BuildingBlockViolation[] {
  if (config.memoryCaps === null) {
    return Object.freeze([]);
  }

  return Object.freeze(
    projectedPeakMemory.flatMap((peak, rank) => {
      const cap = config.memoryCaps?.[rank];
      return cap !== undefined && peak > cap
        ? [
            Object.freeze({
              kind: 'memory-cap' as const,
              rank,
              peak,
              cap,
            }),
          ]
        : [];
    }),
  );
}

export function validateBuildingBlockPlan(
  config: LevelConfig,
  plan: BuildingBlockPlan,
): BuildingBlockValidation {
  if (!positiveInteger(plan.period)) {
    return Object.freeze({
      ok: false,
      period: plan.period,
      violations: Object.freeze([{ kind: 'invalid-period', period: plan.period }]),
      projectedPeakMemory: Object.freeze(new Array<number>(config.rankCount).fill(0)),
    });
  }

  const inventoryViolations = validateInventory(config, plan);
  const residueViolations = validateResidues(config, plan);
  if (inventoryViolations.length > 0 || residueViolations.length > 0) {
    const violations = Object.freeze([...inventoryViolations, ...residueViolations]);
    return Object.freeze({
      ok: false,
      period: plan.period,
      violations,
      projectedPeakMemory: Object.freeze(new Array<number>(config.rankCount).fill(0)),
    });
  }

  const caplessConfig = cloneConfigWithoutCaps(config);
  const stamped = stampPlan(caplessConfig, plan);
  const actions = actionsForStampedPlan(caplessConfig, stamped);
  const replayed = replay(caplessConfig, actions);
  if (!replayed.ok) {
    throw new Error(`building-block capless replay unexpectedly failed: ${replayed.reason.kind}`);
  }

  const placementsById = new Map(
    replayed.state.placements.map((placement) => [placement.operationId, placement.start]),
  );
  const dependencyViolations = validateDependencyTiming(caplessConfig, stamped, placementsById);
  const memoryViolations = validateMemoryCaps(config, replayed.state.peakMemory);
  const violations = Object.freeze([...dependencyViolations, ...memoryViolations]);

  return Object.freeze({
    ok: violations.length === 0,
    period: plan.period,
    violations,
    projectedPeakMemory: replayed.state.peakMemory,
  });
}

export function expandBuildingBlockPlan(
  config: LevelConfig,
  plan: BuildingBlockPlan,
):
  | { readonly ok: true; readonly actions: readonly Action[] }
  | { readonly ok: false; readonly validation: BuildingBlockValidation } {
  const validation = validateBuildingBlockPlan(config, plan);
  if (!validation.ok) {
    return Object.freeze({ ok: false, validation });
  }

  const actions = actionsForStampedPlan(config, stampPlan(config, plan));
  return Object.freeze({ ok: true, actions });
}
```

- [ ] **Step 5: Run the focused engine test**

Run:

```bash
npm test -- src/engine/buildingBlocks.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit the engine slice**

Run:

```bash
git add src/engine/types.ts src/engine/buildingBlocks.ts src/engine/buildingBlocks.test.ts
git commit -m "feat: add building-block validation engine"
```

Expected: commit succeeds.

---

### Task 2: Add Building-Block Level And Fixtures

**Files:**

- Modify: `src/levels/levels.ts`
- Modify: `src/levels/levels.test.ts`
- Modify: `src/levels/fixtures.ts`

- [ ] **Step 1: Write failing level catalog tests**

In `src/levels/levels.test.ts`, extend `EXPECTED_LEVEL_IDS` with:

```ts
  'stamp-the-pattern',
```

Add the `EXPECTED_CONFIGS` entry:

```ts
  'stamp-the-pattern': {
    id: 'stamp-the-pattern',
    version: 1,
    title: 'Stamp The Pattern',
    rankCount: 2,
    stageCount: 2,
    microbatchCount: 3,
    durations: { F: 1, B: 2 },
    memoryCaps: null,
    masteryTargets: [
      { metric: 'makespan', op: '<=', value: 12 },
      { metric: 'intentionalIdle', op: '<=', value: 2 },
      { metric: 'peakActivationMemory', op: '<=', value: 2 },
    ],
    coaching: { readySet: true, suggest: true, auto: true },
    algorithm: {
      family: 'building-block',
      setTitle: 'Building Blocks',
      concept: 'Repeat one trajectory across microbatches.',
      objective: 'Validate the pattern, stamp it, and inspect the completed schedule.',
      patternLabel: 'Periodic',
      introducedModel: ['periodic trajectory', 'pattern stamping'],
    },
    buildingBlock: {
      label: 'Two-rank periodic trajectory',
      plan: {
        period: 3,
        trajectory: [
          { operationId: 'F:0:0', offset: 0 },
          { operationId: 'F:1:0', offset: 1 },
          { operationId: 'B:1:0', offset: 2 },
          { operationId: 'B:0:0', offset: 4 },
        ],
      },
    },
  },
```

Add this freeze regression:

```ts
it('freezes building-block metadata with the level config', () => {
  const level = getLevel('stamp-the-pattern');

  expect(Object.isFrozen(level.buildingBlock)).toBe(true);
  expect(Object.isFrozen(level.buildingBlock?.plan)).toBe(true);
  expect(Object.isFrozen(level.buildingBlock?.plan.trajectory)).toBe(true);
  expect(Object.isFrozen(level.buildingBlock?.plan.trajectory[0])).toBe(true);
  expect(getLevel('memory-capped-one-f-one-b').buildingBlock).toBeUndefined();
});
```

- [ ] **Step 2: Run level tests and verify they fail**

Run:

```bash
npm test -- src/levels/levels.test.ts
```

Expected: FAIL because `stamp-the-pattern` is missing.

- [ ] **Step 3: Add the level ID, frozen metadata, and level config**

In `src/levels/levels.ts`, add `stamp-the-pattern` to `LEVEL_IDS` after `memory-capped-one-f-one-b`:

```ts
  'memory-capped-one-f-one-b',
  'stamp-the-pattern',
```

Add a helper near the other freeze helpers:

```ts
function freezeBuildingBlock(
  buildingBlock: LevelConfig['buildingBlock'],
): LevelConfig['buildingBlock'] {
  if (!buildingBlock) {
    return undefined;
  }

  return Object.freeze({
    ...buildingBlock,
    plan: Object.freeze({
      ...buildingBlock.plan,
      trajectory: Object.freeze(
        buildingBlock.plan.trajectory.map((operation) => Object.freeze({ ...operation })),
      ),
    }),
  });
}
```

Then include it in `freezeLevel`:

```ts
    algorithm: freezeAlgorithm(config.algorithm),
    buildingBlock: freezeBuildingBlock(config.buildingBlock),
```

Add the new frozen config after `memory-capped-one-f-one-b`:

```ts
  'stamp-the-pattern': freezeLevel({
    id: 'stamp-the-pattern',
    version: 1,
    title: 'Stamp The Pattern',
    rankCount: 2,
    stageCount: 2,
    microbatchCount: 3,
    durations: { F: 1, B: 2 },
    memoryCaps: null,
    masteryTargets: [
      { metric: 'makespan', op: '<=', value: 12 },
      { metric: 'intentionalIdle', op: '<=', value: 2 },
      { metric: 'peakActivationMemory', op: '<=', value: 2 },
    ],
    coaching: { readySet: true, suggest: true, auto: true },
    algorithm: {
      family: 'building-block',
      setTitle: 'Building Blocks',
      concept: 'Repeat one trajectory across microbatches.',
      objective: 'Validate the pattern, stamp it, and inspect the completed schedule.',
      patternLabel: 'Periodic',
      introducedModel: ['periodic trajectory', 'pattern stamping'],
    },
    buildingBlock: {
      label: 'Two-rank periodic trajectory',
      plan: {
        period: 3,
        trajectory: [
          { operationId: 'F:0:0', offset: 0 },
          { operationId: 'F:1:0', offset: 1 },
          { operationId: 'B:1:0', offset: 2 },
          { operationId: 'B:0:0', offset: 4 },
        ],
      },
    },
  }),
```

- [ ] **Step 4: Add fixtures for the new level**

In `src/levels/fixtures.ts`, add a helper for the stamped mastered fixture:

```ts
function stampedPatternActions(): readonly Action[] {
  return Object.freeze([
    place('F:0:0'),
    place('F:1:0'),
    place('B:1:0'),
    wait(0),
    wait(0),
    place('F:0:1'),
    place('B:0:0'),
    place('F:1:1'),
    place('B:1:1'),
    place('F:0:2'),
    place('B:0:1'),
    place('F:1:2'),
    place('B:1:2'),
    place('B:0:2'),
  ]);
}
```

Add to `masteredActions`:

```ts
  'stamp-the-pattern': stampedPatternActions(),
```

Add to `legalActions`:

```ts
  'stamp-the-pattern': withLeadingWait(MASTERED_ACTIONS['stamp-the-pattern']),
```

- [ ] **Step 5: Run focused level tests**

Run:

```bash
npm test -- src/levels/levels.test.ts src/engine/buildingBlocks.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit the level slice**

Run:

```bash
git add src/levels/levels.ts src/levels/levels.test.ts src/levels/fixtures.ts
git commit -m "feat: add building-block curriculum level"
```

Expected: commit succeeds.

---

### Task 3: Add Compact Pattern Check And Stamp Command

**Files:**

- Create: `src/components/PatternCheck.tsx`
- Modify: `src/app/useGame.ts`
- Modify: `src/app/App.tsx`
- Modify: `src/components/GameControls.tsx`
- Modify: `src/components/GameShell.test.tsx`
- Modify: `src/styles/app.css`

- [ ] **Step 1: Write failing shell tests for the compact pattern check**

Add these tests to `src/components/GameShell.test.tsx`:

```ts
  it('shows a compact pattern check only on building-block levels', () => {
    render(<App initialLevelId="stamp-the-pattern" />);

    const rail = screen.getByRole('region', { name: /schedule command rail/i });
    const pattern = within(rail).getByRole('group', { name: /pattern check/i });

    expect(within(pattern).getByText(/^Pattern$/i)).toBeInTheDocument();
    expect(within(pattern).getByText(/Two-rank periodic trajectory/i)).toBeInTheDocument();
    expect(within(pattern).getByText(/period 3/i)).toBeInTheDocument();
    expect(within(pattern).getByText(/Pattern valid\. Peak memory 2\./i)).toBeInTheDocument();
    expect(
      within(pattern).getByRole('button', { name: /stamp building-block pattern/i }),
    ).toBeEnabled();
    expect(screen.queryByRole('region', { name: /pipeline rules/i })).not.toBeInTheDocument();

    cleanup();
    render(<App initialLevelId="gpipe-afab" />);
    expect(screen.queryByRole('group', { name: /pattern check/i })).not.toBeInTheDocument();
  });

  it('stamps a valid building-block pattern as one undoable batch', async () => {
    const user = userEvent.setup();
    render(<App initialLevelId="stamp-the-pattern" />);

    await user.click(screen.getByRole('button', { name: /stamp building-block pattern/i }));

    expect(screen.getByRole('status', { name: /interaction feedback/i })).toHaveTextContent(
      /Completed\. Mastered\./i,
    );
    expect(screen.getAllByText(/mastered/i).length).toBeGreaterThan(0);
    expect(screen.getByTestId('rank-label-F:0:2')).toHaveAccessibleName('F0:S0:D2');
    expect(screen.getByTestId('rank-label-B:0:2')).toHaveAccessibleName('B0:S0:D2');

    await user.click(screen.getByRole('button', { name: /undo last action/i }));
    expect(screen.getByRole('status', { name: /interaction feedback/i })).toHaveTextContent(
      /Undid 1 batch containing 14 actions/i,
    );
    expect(screen.queryByTestId('rank-label-F:0:2')).not.toBeInTheDocument();
  });

  it('keeps stamping separate from partial manual attempts', async () => {
    const user = userEvent.setup();
    render(<App initialLevelId="stamp-the-pattern" />);

    await user.click(screen.getByRole('button', { name: /place F stage 0 microbatch 0/i }));
    await user.click(screen.getByRole('button', { name: /stamp building-block pattern/i }));

    expect(screen.getByRole('status', { name: /interaction feedback/i })).toHaveTextContent(
      /Reset before stamping pattern/i,
    );
  });
```

- [ ] **Step 2: Run the shell tests and verify they fail**

Run:

```bash
npm test -- src/components/GameShell.test.tsx -t "pattern|stamps"
```

Expected: FAIL because no pattern-check UI exists.

- [ ] **Step 3: Add the pattern-check component**

Create `src/components/PatternCheck.tsx`:

```tsx
import type { BuildingBlockValidation } from '../engine/types';

export interface PatternCheckModel {
  readonly label: string;
  readonly period: number;
  readonly validation: BuildingBlockValidation;
  readonly canStamp: boolean;
}

interface PatternCheckProps {
  readonly check: PatternCheckModel;
  readonly onStamp: () => void;
}

function validationSummary(validation: BuildingBlockValidation): string {
  if (validation.ok) {
    const peak = Math.max(...validation.projectedPeakMemory, 0);
    return `Pattern valid. Peak memory ${peak}.`;
  }

  const first = validation.violations[0];
  if (!first) {
    return 'Pattern invalid.';
  }

  switch (first.kind) {
    case 'invalid-period':
      return `Invalid period ${first.period}.`;
    case 'unknown-operation':
      return `Unknown block ${first.operationId}.`;
    case 'duplicate-operation':
      return `Duplicate block ${first.operationId}.`;
    case 'missing-operation':
      return `Missing block ${first.operationId}.`;
    case 'duplicate-rank-residue':
      return `Residue conflict on R${first.rank} at ${first.residue}.`;
    case 'unsatisfied-dependency':
      return `${first.operationId} waits for ${first.dependencyId}.`;
    case 'memory-cap':
      return `R${first.rank} peak ${first.peak} exceeds cap ${first.cap}.`;
  }
}

function extraViolationLabel(validation: BuildingBlockValidation): string | null {
  const extra = validation.violations.length - 1;
  return extra > 0 ? `+${extra} more` : null;
}

export function PatternCheck({ check, onStamp }: PatternCheckProps) {
  const extra = extraViolationLabel(check.validation);

  return (
    <div
      className="pattern-check"
      role="group"
      aria-label="Pattern check"
      data-status={check.validation.ok ? 'valid' : 'invalid'}
    >
      <span className="control-cluster__label">Pattern</span>
      <span className="pattern-check__copy">
        <strong>{check.label}</strong>
        <span>period {check.period}</span>
      </span>
      <span className="pattern-check__status">
        {validationSummary(check.validation)}
        {extra ? <span className="pattern-check__extra"> {extra}</span> : null}
      </span>
      <button
        type="button"
        className="command-button"
        aria-label="Stamp building-block pattern"
        onClick={onStamp}
        disabled={!check.canStamp}
      >
        Stamp
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Thread validation and stamp behavior through the game view model**

Modify imports in `src/app/useGame.ts`:

```ts
import { expandBuildingBlockPlan, validateBuildingBlockPlan } from '../engine/buildingBlocks';
import type { PatternCheckModel } from '../components/PatternCheck';
```

Extend `GameViewModel`:

```ts
  readonly buildingBlockCheck: PatternCheckModel | null;
  readonly stampBuildingBlockPlan: () => void;
```

Compute the view model after `automationReason`:

```ts
const buildingBlockValidation = level.buildingBlock
  ? validateBuildingBlockPlan(level, level.buildingBlock.plan)
  : null;
const buildingBlockCheck =
  level.buildingBlock && buildingBlockValidation
    ? Object.freeze({
        label: level.buildingBlock.label,
        period: level.buildingBlock.plan.period,
        validation: buildingBlockValidation,
        canStamp: buildingBlockValidation.ok,
      })
    : null;
```

Add this callback near `automate()`:

```ts
function stampBuildingBlockPlan(): void {
  updateWithCurrentSchedule((current) => {
    const currentLevel = getLevel(current.levelId);
    if (!currentLevel.buildingBlock) {
      return {
        ...current,
        overlay: { message: 'No pattern is available on this level.' },
      };
    }

    if (activeActions(current.actions, current.cursor).length > 0) {
      return {
        ...current,
        overlay: { message: 'Reset before stamping pattern.' },
      };
    }

    const expanded = expandBuildingBlockPlan(currentLevel, currentLevel.buildingBlock.plan);
    if (!expanded.ok) {
      const first = expanded.validation.violations[0];
      return {
        ...current,
        overlay: {
          message: first ? `Pattern is invalid: ${first.kind}.` : 'Pattern is invalid.',
        },
      };
    }

    return appendBatch(
      current,
      expanded.actions,
      null,
      `Stamped ${currentLevel.buildingBlock.label} into ${expanded.actions.length} actions.`,
    );
  });
}
```

Return both fields:

```ts
    buildingBlockCheck,
    stampBuildingBlockPlan,
```

- [ ] **Step 5: Render the component in the command rail**

Modify imports in `src/components/GameControls.tsx`:

```ts
import { PatternCheck, type PatternCheckModel } from './PatternCheck';
```

Extend props:

```ts
  readonly patternCheck: PatternCheckModel | null;
  readonly onStampPattern: () => void;
```

Destructure them and render this after the learning-controls cluster:

```tsx
{
  patternCheck ? <PatternCheck check={patternCheck} onStamp={onStampPattern} /> : null;
}
```

Modify `src/app/App.tsx` in the `GameControls` call:

```tsx
            patternCheck={game.buildingBlockCheck}
            onStampPattern={game.stampBuildingBlockPlan}
```

- [ ] **Step 6: Add compact CSS**

Append near command-rail styles in `src/styles/app.css`:

```css
.pattern-check {
  display: grid;
  grid-template-columns: auto minmax(8rem, 1fr) minmax(9rem, 1.2fr) auto;
  align-items: center;
  gap: 0.42rem;
  min-width: min(100%, 31rem);
  border: 1px solid color-mix(in srgb, var(--accent) 32%, var(--line));
  border-radius: 7px;
  background: color-mix(in srgb, var(--paper-strong) 88%, var(--accent));
  padding: 0.3rem 0.4rem;
}

.pattern-check[data-status='invalid'] {
  border-color: color-mix(in srgb, var(--danger) 42%, var(--line));
}

.pattern-check__copy,
.pattern-check__status {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.72rem;
}

.pattern-check__copy {
  display: grid;
  gap: 0.05rem;
}

.pattern-check__copy strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pattern-check__copy span,
.pattern-check__extra {
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: 0.66rem;
  font-weight: 750;
}

@media (max-width: 48rem) {
  .pattern-check {
    grid-template-columns: auto minmax(0, 1fr) auto;
  }

  .pattern-check__status {
    grid-column: 1 / -1;
  }
}
```

- [ ] **Step 7: Run focused UI tests**

Run:

```bash
npm test -- src/components/GameShell.test.tsx -t "pattern|stamps"
```

Expected: PASS.

- [ ] **Step 8: Commit the UI slice**

Run:

```bash
git add src/app/useGame.ts src/app/App.tsx src/components/GameControls.tsx src/components/PatternCheck.tsx src/components/GameShell.test.tsx src/styles/app.css
git commit -m "feat: add compact building-block stamp UI"
```

Expected: commit succeeds.

---

### Task 4: Add Persistence, Flow, And Responsive Regressions

**Files:**

- Modify: `tests/game-flow.test.tsx`
- Modify: `tests/persistence.test.ts`
- Modify: `tests/responsive-css.test.mjs`

- [ ] **Step 1: Add game-flow regression for stamped completion**

In `tests/game-flow.test.tsx`, add this test near the other completion tests:

```tsx
it('stamps the building-block level through public controls and persists expanded actions', async () => {
  const user = userEvent.setup();
  const storage = createProgressStorageThrough('stamp-the-pattern');

  render(<App initialLevelId="stamp-the-pattern" storage={storage} />);

  await user.click(screen.getByRole('button', { name: /stamp building-block pattern/i }));

  expect(screen.getByRole('status', { name: /interaction feedback/i })).toHaveTextContent(
    /Completed\. Mastered\./i,
  );

  await waitFor(() => {
    const attempt = bestAttempt(parseProgressFrom(storage), 'stamp-the-pattern');
    expect(attempt?.actions).toEqual(MASTERED_ACTIONS['stamp-the-pattern']);
  });
}, 10000);
```

- [ ] **Step 2: Add persistence regression for expanded action logs**

In `tests/persistence.test.ts`, import the new fixture if needed:

```ts
import { MASTERED_ACTIONS } from '../src/levels/fixtures';
```

Add this test near URL/storage serialization tests:

```ts
it('stores building-block stamped attempts as expanded actions only', () => {
  const attempt = {
    schemaVersion: 1 as const,
    levelId: 'stamp-the-pattern' as const,
    levelVersion: getLevel('stamp-the-pattern').version,
    actions: MASTERED_ACTIONS['stamp-the-pattern'],
  };

  const encoded = encodeAttempt(attempt);
  const decoded = decodeAttempt(`#attempt=${encoded}`, getLevel);

  expect(decoded.ok).toBe(true);
  if (!decoded.ok) {
    throw new Error('expected decode success');
  }

  expect(decoded.attempt.actions).toEqual(MASTERED_ACTIONS['stamp-the-pattern']);
  expect(JSON.stringify(decoded.attempt)).not.toContain('buildingBlock');
  expect(JSON.stringify(decoded.attempt)).not.toContain('trajectory');
});
```

- [ ] **Step 3: Add responsive CSS contract for the compact pattern check**

In `tests/responsive-css.test.mjs`, extend the second test with:

```js
const patternCheckBlock = extractBlock(css, '.pattern-check');
const patternStatusBlock = extractBlock(css, '.pattern-check__status');

expect(patternCheckBlock).toMatch(/\.pattern-check\s*\{[^}]*\bdisplay:\s*grid\s*;/);
expect(patternCheckBlock).toMatch(
  /\.pattern-check\s*\{[^}]*\bgrid-template-columns:\s*auto minmax\(8rem,\s*1fr\) minmax\(9rem,\s*1\.2fr\) auto\s*;/,
);
expect(patternCheckBlock).toMatch(/\.pattern-check\s*\{[^}]*\bborder-radius:\s*7px\s*;/);
expect(patternStatusBlock).toMatch(/\.pattern-check__status\s*\{[^}]*\boverflow:\s*hidden\s*;/);
expect(patternStatusBlock).toMatch(
  /\.pattern-check__status\s*\{[^}]*\btext-overflow:\s*ellipsis\s*;/,
);
expect(css).toMatch(
  /@media\s*\(max-width:\s*48rem\)[\s\S]*?\.pattern-check\s*\{[\s\S]*?grid-template-columns:\s*auto minmax\(0,\s*1fr\) auto\s*;/,
);
```

- [ ] **Step 4: Run focused regressions**

Run:

```bash
npm test -- tests/game-flow.test.tsx tests/persistence.test.ts tests/responsive-css.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit integration coverage**

Run:

```bash
git add tests/game-flow.test.tsx tests/persistence.test.ts tests/responsive-css.test.mjs
git commit -m "test: cover building-block stamp integration"
```

Expected: commit succeeds.

---

### Task 5: Verify, Review, Rebase, And Land

**Files:**

- Verify all modified files from Tasks 1-4.
- Do not stage `src/components/PipelineLessonPanel.tsx`.

- [ ] **Step 1: Run formatting on touched files**

Run:

```bash
npx prettier --write src/engine/types.ts src/engine/buildingBlocks.ts src/engine/buildingBlocks.test.ts src/levels/levels.ts src/levels/levels.test.ts src/levels/fixtures.ts src/app/useGame.ts src/app/App.tsx src/components/GameControls.tsx src/components/PatternCheck.tsx src/components/GameShell.test.tsx tests/game-flow.test.tsx tests/persistence.test.ts tests/responsive-css.test.mjs src/styles/app.css
```

Expected: Prettier completes without errors.

- [ ] **Step 2: Run full verification**

Run:

```bash
npm run verify
```

Expected: PASS. A non-fatal jsdom canvas `getContext()` warning may appear during accessibility tests; it is acceptable only if the command exits 0.

- [ ] **Step 3: Check the diff for scope**

Run:

```bash
git status --short
git diff --stat HEAD
git diff -- src/components/PipelineLessonPanel.tsx
```

Expected:

```text
src/components/PipelineLessonPanel.tsx remains untracked or unchanged.
No unrelated files are staged.
```

- [ ] **Step 4: Request final review**

Use the code-review workflow against the implementation branch. The review prompt should include:

```text
Review SENSEI-CURR-03 against docs/superpowers/specs/2026-08-22-sensei-building-block-validation-design.md and docs/superpowers/plans/2026-08-22-sensei-building-block-validation.md.

Focus on:
- building-block plans remaining a projection into Action[];
- validation returning structured violations for invalid period, unknown operations, duplicate residues, unsatisfied dependencies, and memory caps;
- stamping not corrupting undo/redo, persistence, or share links;
- existing levels remaining unchanged;
- the cockpit staying compact and block-placement focused.
```

Expected: no blocking findings. Fix any blocking findings with tests before landing.

- [ ] **Step 5: Rebase and fast-forward land**

Run from the implementation worktree:

```bash
git fetch --all --prune
git rebase master
npm run verify
```

Then from `/Users/bytedance/workspace/sensei`:

```bash
git merge --ff-only <implementation-branch-name>
git branch -d <implementation-branch-name>
git worktree prune
git status --short --branch
```

Expected: `master` contains the CURR-03 commits, verification passed after rebase, and only the pre-existing untracked `src/components/PipelineLessonPanel.tsx` remains.

## Self-Review Checklist

- Spec coverage: Tasks 1-4 cover pure plan representation, validation, expansion, one playable level, compact UI, persistence as expanded actions, and responsive behavior.
- Placeholder scan: no draft markers, unfinished instructions, or unspecified edge-case bucket should remain.
- Type consistency: `BuildingBlockPlan`, `BuildingBlockOperation`, `BuildingBlockViolation`, `BuildingBlockValidation`, and `BuildingBlockLevelMetadata` are defined once in `src/engine/types.ts`; `src/engine/buildingBlocks.ts` owns behavior.
- Scope: no virtual-stage topology, split `W`, FSDP residency, grouped scheduling, or DualPipe work is included.
- Clean-room: all level names, copy, fixtures, and UI phrasing are original to this repo.
