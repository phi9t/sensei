# Sensei Nonuniform Duration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `SENSEI-CURR-06` by adding stage-specific duration overrides and one playable Heavy Backward Tail level that teaches cost-aware scheduling without changing the learner action schema.

**Architecture:** Keep `durations: { F: 1, B: 2 }` as the base model for all existing levels. Add optional level-owned `durationOverrides` records selected by operation kind and logical stage, resolve every operation duration in one engine helper, and continue to let replay, score, persistence, and board geometry consume `operation.duration`.

**Tech Stack:** TypeScript 6, React 19, Vite, Vitest, Testing Library, existing Sensei replay/score/policy/persistence modules, CSS contract tests.

---

## Goal Contract

A coding agent can treat this file as the implementation goal. It must complete every checked task, run the verifier, then run the post-execution review and improve this plan with any corrections discovered during execution.

Definition of done:

- `LevelConfig` can express positive integer duration overrides for `(kind, stage)`.
- Existing levels still derive the same operation durations, fixtures, scores, and persisted attempts.
- A new `heavy-backward-tail` level is playable, mastered by a cost-aware fixture, and has a legal-but-not-mastered fixture.
- The UI exposes duration differences through existing compact block surfaces, not a rules panel.
- URL and local persistence remain canonical `Action[]`; duration metadata never appears in persisted attempts.
- `npm run verify` passes.
- A post-execution review section is appended to this plan before final commit or final handoff.

## Scope

This plan implements only `SENSEI-CURR-06: Add Nonuniform Duration Support`.

Do not implement split backward `W`, zero-bubble scoring, grouped scheduling, FSDP residency, DualPipe, dynamic/random durations, operation-specific microbatch overrides, or a new visible rules panel.

Do not touch or stage the pre-existing untracked file `src/components/PipelineLessonPanel.tsx`.

## File Map

- Modify `src/engine/types.ts`
  - Add `OperationDurationOverride`.
  - Add optional `LevelConfig.durationOverrides`.
- Modify `src/engine/config.ts`
  - Validate the optional override list.
  - Keep base V1 `durations.F === 1` and `durations.B === 2`.
- Modify `src/engine/config.test.ts`
  - Cover valid overrides and malformed override rejection.
- Modify `src/engine/operations.ts`
  - Add and use one duration resolver.
- Modify `src/engine/operations.test.ts`
  - Cover fallback durations, override resolution, order precedence, and unchanged IDs/ranks.
- Modify `src/engine/replay.ts`
  - Deep-freeze cloned `durationOverrides`.
- Modify `src/engine/replay.test.ts`
  - Cover placement end times and frozen override metadata.
- Modify `src/engine/score.test.ts`
  - Cover total work, capacity, bubble ratio, and mastery with an overridden stage.
- Modify `src/levels/levels.ts`
  - Freeze `durationOverrides`.
  - Add `heavy-backward-tail` after `ragged-rounds`.
- Modify `src/levels/fixtures.ts`
  - Add mastered and legal fixtures for `heavy-backward-tail`.
- Modify `src/levels/levels.test.ts`
  - Update catalog order, level groups/config snapshots, fixtures, and freeze tests.
- Modify `src/components/LevelGuide.tsx`
  - Add one compact cost chip when a level has duration overrides.
- Inspect `src/components/OperationTray.tsx`
  - No source edit is expected because it already renders `operation.duration` through accessible labels, `data-duration`, `--tile-duration`, and the existing compact metadata span.
- Inspect `src/components/ScheduleBoard.tsx`
  - No source edit is expected because it already renders width and placement details from `operation.duration`.
- Modify `src/components/MoveInspector.tsx`
  - Include duration in selected-operation legal/completed copy.
- Modify `src/components/GameShell.test.tsx`
  - Cover compact cost chip, overridden block labels, inspector duration, and board geometry.
- Modify `tests/persistence.test.ts`
  - Verify URL and stored attempts for the new level contain only canonical attempt keys and no duration metadata.
- Modify `tests/game-flow.test.tsx`
  - Verify the full public journey includes the new level and completion feedback remains policy-relative when applicable.
- Modify `tests/responsive-css.test.mjs`
  - Add or preserve contract coverage that duration/cost chips fit compactly.
- Modify `src/styles/app.css`
  - Add compact cost-chip styling and allow level-guide chips to wrap safely.
- Modify this plan file
  - Append the post-execution review and any plan corrections found during implementation.

## Invariants

- Base `durations` remains a complete `Record<OperationKind, number>` and stays `F=1`, `B=2` for V1 levels.
- `durationOverrides` is optional level metadata, not learner state.
- Override selectors are by operation kind and logical stage only:

```ts
export interface OperationDurationOverride {
  readonly kind: OperationKind;
  readonly stage: number;
  readonly duration: number;
}
```

- Duration resolution is deterministic: exact `(kind, stage)` override first, then `config.durations[kind]`.
- Existing operation IDs remain unchanged: `F:stage:microbatch` and `B:stage:microbatch`.
- Visible compact labels stay in the `F0:S0:B1` style, and the notation key stays `(F/B, stage_id, micro_batch_id)`.
- Replay, score, policy projection, and UI geometry consume `operation.duration`; they do not re-derive duration directly from config.
- Persistence schema remains version 1 and stores only `schemaVersion`, `levelId`, `levelVersion`, and `actions`.
- If a level's duration semantics change after release, bump that level's `version` so old URL/local attempts are treated as historical.

---

## Task 1: Add Duration Override Types And Validation

**Files:**

- Modify: `src/engine/types.ts`
- Modify: `src/engine/config.ts`
- Modify: `src/engine/config.test.ts`

- [x] **Step 1: Write failing config tests**

Add these tests to `src/engine/config.test.ts` near the duration validation tests:

```ts
it('accepts positive integer stage-specific duration overrides', () => {
  expect(() =>
    validateLevelConfig(
      makeConfig({
        durationOverrides: [{ kind: 'B', stage: 0, duration: 4 }],
      }),
    ),
  ).not.toThrow();
});

it('keeps base V1 durations fixed even when duration overrides exist', () => {
  expect(() =>
    validateLevelConfig(
      makeConfig({
        durations: { F: 2, B: 2 },
        durationOverrides: [{ kind: 'B', stage: 0, duration: 4 }],
      }),
    ),
  ).toThrow(/V1 base durations must be F=1 and B=2/);
});

it('rejects duration overrides outside the logical stage range', () => {
  expect(() =>
    validateLevelConfig(
      makeConfig({
        durationOverrides: [{ kind: 'B', stage: 2, duration: 4 }],
      }),
    ),
  ).toThrow(/duration override stage 2 out of bounds for stageCount 2/);
});

it('rejects malformed duration override duration values', () => {
  for (const duration of [0, -1, 1.5, NaN, Infinity]) {
    expect(() =>
      validateLevelConfig(
        makeConfig({
          durationOverrides: [{ kind: 'B', stage: 0, duration }],
        }),
      ),
    ).toThrow(/duration override for B stage 0 must be a positive finite integer/);
  }
});

it('rejects duplicate duration overrides for the same kind and stage', () => {
  expect(() =>
    validateLevelConfig(
      makeConfig({
        durationOverrides: [
          { kind: 'B', stage: 0, duration: 4 },
          { kind: 'B', stage: 0, duration: 3 },
        ],
      }),
    ),
  ).toThrow(/duplicate duration override for B stage 0/);
});

it('rejects unsupported duration override kinds from untrusted config objects', () => {
  expect(() =>
    validateLevelConfig(
      makeConfig({
        durationOverrides: [{ kind: 'X' as OperationKind, stage: 0, duration: 4 }],
      }),
    ),
  ).toThrow(/duration override kind must be F or B/);
});
```

- [x] **Step 2: Run the config tests and verify they fail**

Run:

```bash
npm test -- src/engine/config.test.ts
```

Expected: FAIL because `durationOverrides` is not typed or validated yet.

- [x] **Step 3: Add the type**

Update `src/engine/types.ts`:

```ts
export interface OperationDurationOverride {
  readonly kind: OperationKind;
  readonly stage: number;
  readonly duration: number;
}
```

Add the optional field to `LevelConfig`:

```ts
  durationOverrides?: readonly OperationDurationOverride[];
```

- [x] **Step 4: Validate duration overrides**

Update `src/engine/config.ts`:

```ts
import type { LevelConfig, OperationKind, PipelineTopologyPlacement } from './types';
```

Change the fixed-duration error string so it is clear that overrides are allowed:

```ts
if (config.durations.F !== 1 || config.durations.B !== 2) {
  throw new Error('V1 base durations must be F=1 and B=2');
}
```

Add a helper near the other validation helpers:

```ts
function isOperationKind(value: string): value is OperationKind {
  return value === 'F' || value === 'B';
}
```

If `src/engine/config.test.ts` imports only `PipelineTopologyPlacement`, update that import to include `OperationKind` before adding the malformed-kind test above.

Add this block after validating `stageCount` and base durations, before memory caps:

```ts
if (config.durationOverrides) {
  const seen = new Set<string>();
  for (const override of config.durationOverrides) {
    if (!isOperationKind(override.kind)) {
      throw new Error('duration override kind must be F or B');
    }
    if (
      !Number.isInteger(override.stage) ||
      !Number.isFinite(override.stage) ||
      override.stage < 0 ||
      override.stage >= config.stageCount
    ) {
      throw new Error(
        `duration override stage ${override.stage} out of bounds for stageCount ${config.stageCount}`,
      );
    }
    if (!isFinitePositiveInteger(override.duration)) {
      throw new Error(
        `duration override for ${override.kind} stage ${override.stage} must be a positive finite integer`,
      );
    }
    const key = `${override.kind}:${override.stage}`;
    if (seen.has(key)) {
      throw new Error(`duplicate duration override for ${override.kind} stage ${override.stage}`);
    }
    seen.add(key);
  }
}
```

- [x] **Step 5: Run focused validation**

Run:

```bash
npm test -- src/engine/config.test.ts
npm run typecheck
```

Expected: PASS.

- [x] **Step 6: Commit**

Run:

```bash
git add src/engine/types.ts src/engine/config.ts src/engine/config.test.ts
git commit -m "feat: validate stage duration overrides"
```

## Task 2: Resolve Durations In Operation Derivation

**Files:**

- Modify: `src/engine/operations.ts`
- Modify: `src/engine/operations.test.ts`
- Modify: `src/engine/replay.ts`
- Modify: `src/engine/replay.test.ts`
- Modify: `src/engine/score.test.ts`

- [x] **Step 1: Write failing operation derivation tests**

Add these tests to `src/engine/operations.test.ts` inside `describe('deriveOperations', ...)`:

```ts
it('uses stage-specific duration overrides before base durations', () => {
  const config = makeConfig({
    rankCount: 2,
    stageCount: 2,
    microbatchCount: 2,
    durationOverrides: [{ kind: 'B', stage: 0, duration: 4 }],
  });

  const durationsById = Object.fromEntries(
    deriveOperations(config).map((operation) => [operation.id, operation.duration]),
  );

  expect(durationsById).toMatchObject({
    'F:0:0': 1,
    'F:0:1': 1,
    'B:0:0': 4,
    'B:0:1': 4,
    'F:1:0': 1,
    'B:1:0': 2,
  });
});

it('applies duration overrides by logical stage, not physical rank', () => {
  const config = makeConfig({
    rankCount: 2,
    stageCount: 4,
    microbatchCount: 1,
    topology: { placement: 'v-shape', virtualStagesPerRank: 2 },
    durationOverrides: [{ kind: 'B', stage: 3, duration: 5 }],
  });

  expect(
    deriveOperations(config).map(({ id, rank, duration }) => ({ id, rank, duration })),
  ).toEqual([
    { id: 'F:0:0', rank: 0, duration: 1 },
    { id: 'B:0:0', rank: 0, duration: 2 },
    { id: 'F:1:0', rank: 1, duration: 1 },
    { id: 'B:1:0', rank: 1, duration: 2 },
    { id: 'F:2:0', rank: 1, duration: 1 },
    { id: 'B:2:0', rank: 1, duration: 2 },
    { id: 'F:3:0', rank: 0, duration: 1 },
    { id: 'B:3:0', rank: 0, duration: 5 },
  ]);
});
```

- [x] **Step 2: Run operation tests and verify they fail**

Run:

```bash
npm test -- src/engine/operations.test.ts
```

Expected: FAIL because all operations still use only `config.durations[kind]`.

- [x] **Step 3: Add one duration resolver**

Update `src/engine/operations.ts`:

```ts
import type { LevelConfig, Operation, OperationId, OperationKind } from './types';
```

Add this helper above `deriveOperations`:

```ts
export function durationForOperation(
  config: LevelConfig,
  kind: OperationKind,
  stage: number,
): number {
  const override = config.durationOverrides?.find(
    (candidate) => candidate.kind === kind && candidate.stage === stage,
  );
  return override?.duration ?? config.durations[kind];
}
```

Change the operation object inside `deriveOperations`:

```ts
duration: durationForOperation(config, kind, stage),
```

- [x] **Step 4: Preserve override metadata through replay cloning**

Add a replay test in `src/engine/replay.test.ts` near the config-freeze tests:

```ts
it('deep-freezes cloned duration override metadata independently of the input config', () => {
  const config = makeConfig({
    durationOverrides: [{ kind: 'B', stage: 0, duration: 4 }],
  });

  const state = initialState(config);

  expect(Object.isFrozen(state.config.durationOverrides)).toBe(true);
  expect(Object.isFrozen(state.config.durationOverrides?.[0])).toBe(true);

  (config.durationOverrides as Array<{ duration: number }>)[0]!.duration = 9;

  expect(state.config.durationOverrides).toEqual([{ kind: 'B', stage: 0, duration: 4 }]);
  expect(state.operations.find((operation) => operation.id === 'B:0:0')?.duration).toBe(4);
});
```

Update `cloneConfig()` in `src/engine/replay.ts`:

```ts
    ...(config.durationOverrides
      ? {
          durationOverrides: Object.freeze(
            config.durationOverrides.map((override) => Object.freeze({ ...override })),
          ),
        }
      : {}),
```

- [x] **Step 5: Add score coverage for overridden work**

Add this test to `src/engine/score.test.ts`:

```ts
it('scores total work and bubble ratio from operation duration overrides', () => {
  const config = makeConfig({
    durationOverrides: [{ kind: 'B', stage: 0, duration: 4 }],
    masteryTargets: [{ metric: 'makespan', op: '<=', value: 8 }],
  });
  const state = expectState(replay(config, placeIds('F:0:0', 'F:1:0', 'B:1:0', 'B:0:0')));

  expect(score(state)).toEqual({
    makespan: 8,
    totalWork: 8,
    capacity: 16,
    bubbleRatio: 0.5,
    intentionalIdle: 0,
    peakActivationMemoryByRank: [1, 1],
    peakActivationMemory: 1,
    complete: true,
    mastered: true,
  });
});
```

- [x] **Step 6: Run focused engine verification**

Run:

```bash
npm test -- src/engine/operations.test.ts src/engine/replay.test.ts src/engine/score.test.ts
npm run typecheck
```

Expected: PASS.

- [x] **Step 7: Commit**

Run:

```bash
git add src/engine/operations.ts src/engine/operations.test.ts src/engine/replay.ts src/engine/replay.test.ts src/engine/score.test.ts
git commit -m "feat: derive operation duration overrides"
```

## Task 3: Add Heavy Backward Tail Level And Fixtures

**Files:**

- Modify: `src/levels/levels.ts`
- Modify: `src/levels/fixtures.ts`
- Modify: `src/levels/levels.test.ts`

- [x] **Step 1: Add failing level catalog tests**

Update `EXPECTED_LEVEL_IDS` in `src/levels/levels.test.ts` by appending:

```ts
'heavy-backward-tail',
```

Update `EXPECTED_LEVEL_GROUPS` in `src/levels/levels.test.ts` by appending:

```ts
'Nonuniform Cost',
```

Add this expected config entry to `EXPECTED_CONFIGS`:

```ts
'heavy-backward-tail': {
  id: 'heavy-backward-tail',
  version: 1,
  title: 'Heavy Backward Tail',
  rankCount: 2,
  stageCount: 4,
  microbatchCount: 3,
  topology: { placement: 'v-shape', virtualStagesPerRank: 2 },
  durations: { F: 1, B: 2 },
  durationOverrides: [{ kind: 'B', stage: 0, duration: 4 }],
  memoryCaps: null,
  coaching: { readySet: true, suggest: true, auto: true },
  masteryTargets: [
    { metric: 'makespan', op: '<=', value: 28 },
    { metric: 'intentionalIdle', op: '<=', value: 0 },
    { metric: 'peakActivationMemory', op: '<=', value: 6 },
  ],
  algorithm: {
    family: 'interleaved-one-f-one-b',
    setTitle: 'Nonuniform Cost',
    concept: 'A heavy first-stage backward creates a critical tail even when operation counts look balanced.',
    objective: 'Keep the interleaved rhythm while draining the expensive B:S0 tail early enough.',
    patternLabel: 'Cost-aware',
    introducedModel: ['stage-specific duration', 'critical tail by cost'],
  },
},
```

Add a freeze test near the existing topology freeze test:

```ts
it('freezes duration override metadata with the level config', () => {
  const level = getLevel('heavy-backward-tail');

  expect(Object.isFrozen(level.durationOverrides)).toBe(true);
  expect(Object.isFrozen(level.durationOverrides?.[0])).toBe(true);
  expect(level.durationOverrides).toEqual([{ kind: 'B', stage: 0, duration: 4 }]);
  expect(getLevel('ragged-rounds').durationOverrides).toBeUndefined();
});
```

- [x] **Step 2: Run level tests and verify they fail**

Run:

```bash
npm test -- src/levels/levels.test.ts
```

Expected: FAIL because the level and fixtures do not exist yet.

- [x] **Step 3: Add the level**

Update `LEVEL_IDS` in `src/levels/levels.ts` by appending:

```ts
'heavy-backward-tail',
```

Add a `freezeDurationOverrides()` helper:

```ts
function freezeDurationOverrides(
  overrides: NonNullable<LevelConfig['durationOverrides']>,
): NonNullable<LevelConfig['durationOverrides']> {
  return Object.freeze(overrides.map((override) => Object.freeze({ ...override })));
}
```

Update `freezeLevel()`:

```ts
const { buildingBlock, topology, durationOverrides, ...baseConfig } = config;
```

and include:

```ts
...(durationOverrides ? { durationOverrides: freezeDurationOverrides(durationOverrides) } : {}),
```

Add the `heavy-backward-tail` level object after `ragged-rounds`:

```ts
'heavy-backward-tail': freezeLevel({
  id: 'heavy-backward-tail',
  version: 1,
  title: 'Heavy Backward Tail',
  rankCount: 2,
  stageCount: 4,
  microbatchCount: 3,
  topology: { placement: 'v-shape', virtualStagesPerRank: 2 },
  durations: { F: 1, B: 2 },
  durationOverrides: [{ kind: 'B', stage: 0, duration: 4 }],
  memoryCaps: null,
  masteryTargets: [
    { metric: 'makespan', op: '<=', value: 28 },
    { metric: 'intentionalIdle', op: '<=', value: 0 },
    { metric: 'peakActivationMemory', op: '<=', value: 6 },
  ],
  coaching: { readySet: true, suggest: true, auto: true },
  algorithm: {
    family: 'interleaved-one-f-one-b',
    setTitle: 'Nonuniform Cost',
    concept: 'A heavy first-stage backward creates a critical tail even when operation counts look balanced.',
    objective: 'Keep the interleaved rhythm while draining the expensive B:S0 tail early enough.',
    patternLabel: 'Cost-aware',
    introducedModel: ['stage-specific duration', 'critical tail by cost'],
  },
}),
```

- [x] **Step 4: Add mastered and legal fixture actions**

Add `heavy-backward-tail` to `MASTERED_ACTIONS` in `src/levels/fixtures.ts`:

```ts
'heavy-backward-tail': placeIds(
  'F:0:0',
  'F:0:1',
  'F:1:0',
  'F:2:0',
  'F:3:0',
  'B:3:0',
  'F:1:1',
  'F:2:1',
  'F:3:1',
  'B:3:1',
  'F:0:2',
  'F:1:2',
  'F:2:2',
  'F:3:2',
  'B:3:2',
  'B:2:0',
  'B:1:0',
  'B:0:0',
  'B:2:1',
  'B:1:1',
  'B:0:1',
  'B:2:2',
  'B:1:2',
  'B:0:2',
),
```

Add `heavy-backward-tail` to `LEGAL_ACTIONS` with the same order plus one leading wait:

```ts
'heavy-backward-tail': withLeadingWait(MASTERED_ACTIONS['heavy-backward-tail']),
```

Add the same ordered operations to `EXPECTED_MASTERED_ACTIONS` in `src/levels/levels.test.ts`:

```ts
'heavy-backward-tail': [
  'F:0:0',
  'F:0:1',
  'F:1:0',
  'F:2:0',
  'F:3:0',
  'B:3:0',
  'F:1:1',
  'F:2:1',
  'F:3:1',
  'B:3:1',
  'F:0:2',
  'F:1:2',
  'F:2:2',
  'F:3:2',
  'B:3:2',
  'B:2:0',
  'B:1:0',
  'B:0:0',
  'B:2:1',
  'B:1:1',
  'B:0:1',
  'B:2:2',
  'B:1:2',
  'B:0:2',
],
```

Expected fixture score for the mastered actions:

```ts
{
  makespan: 28,
  totalWork: 42,
  capacity: 56,
  bubbleRatio: 0.25,
  intentionalIdle: 0,
  peakActivationMemoryByRank: [4, 6],
  peakActivationMemory: 6,
}
```

Expected fixture score for the legal actions:

```ts
{
  makespan: 29,
  totalWork: 42,
  capacity: 58,
  bubbleRatio: 16 / 58,
  intentionalIdle: 1,
  peakActivationMemoryByRank: [4, 6],
  peakActivationMemory: 6,
}
```

Add the mastered score to `EXPECTED_GOLDEN_ROWS` in `src/levels/levels.test.ts`:

```ts
'heavy-backward-tail': {
  makespan: 28,
  intentionalIdle: 0,
  bubbleRatio: 0.25,
  peakActivationMemoryByRank: [4, 6],
  peakActivationMemory: 6,
},
```

- [x] **Step 5: Run level tests**

Run:

```bash
npm test -- src/levels/levels.test.ts
```

Expected: PASS.

- [x] **Step 6: Commit**

Run:

```bash
git add src/levels/levels.ts src/levels/fixtures.ts src/levels/levels.test.ts
git commit -m "feat: add heavy backward tail level"
```

## Task 4: Expose Nonuniform Cost In Compact UI

**Files:**

- Modify: `src/components/LevelGuide.tsx`
- Modify: `src/components/MoveInspector.tsx`
- Modify: `src/components/GameShell.test.tsx`
- Modify: `tests/responsive-css.test.mjs`
- Modify: `src/styles/app.css`

- [x] **Step 1: Write failing UI tests**

Add these tests to `src/components/GameShell.test.tsx`:

```ts
it('shows compact nonuniform-cost metadata without adding a rules panel', () => {
  render(<App initialLevelId="heavy-backward-tail" />);

  const guide = screen.getByRole('region', { name: /level guide/i });

  expect(within(guide).getByRole('heading', { name: /^Heavy Backward Tail$/i })).toBeInTheDocument();
  expect(within(guide).getByText(/^Nonuniform Cost$/i)).toBeInTheDocument();
  expect(within(guide).getByText(/^B:S0 = 4t$/i)).toBeInTheDocument();
  expect(within(guide).getByText(/^Cost-aware$/i)).toBeInTheDocument();
  expect(screen.queryByRole('region', { name: /pipeline rules/i })).not.toBeInTheDocument();
});

it('renders overridden durations in ready queue, inspector, preview, and board geometry', async () => {
  const user = userEvent.setup();
  render(<App initialLevelId="heavy-backward-tail" />);

  await user.click(screen.getByRole('button', { name: /place F stage 0 microbatch 0/i }));
  await user.click(screen.getByRole('button', { name: /place F stage 1 microbatch 0/i }));
  await user.click(screen.getByRole('button', { name: /place F stage 2 microbatch 0/i }));
  await user.click(screen.getByRole('button', { name: /place F stage 3 microbatch 0/i }));
  await user.click(screen.getByRole('button', { name: /place B stage 3 microbatch 0/i }));
  await user.click(screen.getByRole('button', { name: /place B stage 2 microbatch 0/i }));
  await user.click(screen.getByRole('button', { name: /place B stage 1 microbatch 0/i }));

  const heavy = screen.getByRole('button', {
    name: /place B stage 0 microbatch 0, 4 ticks, ready/i,
  });
  await user.click(heavy);

  const board = screen.getByRole('region', { name: /schedule board/i });
  expect(screen.getByTestId('rank-tile-B:0:0')).toHaveAttribute('data-duration', '4');
  expect(screen.getByTestId('rank-tile-B:0:0')).toHaveAttribute('width', '224');
  expect(scheduleLabelIn(board, 'B:0:0')).toHaveAccessibleName('B0:S0:B0');
  expect(within(board).getByText(/Rank 0, start 10, end 14, duration 4/i)).toBeInTheDocument();

  await user.click(screen.getByTestId('tile-B:0:0'));
  const inspector = screen.getByRole('region', { name: /move inspector/i });
  expect(within(inspector).getByText(/Duration 4/i)).toBeInTheDocument();
});
```

Add or extend a CSS contract test in `tests/responsive-css.test.mjs`:

```js
it('keeps nonuniform-cost level guide chips compact', async () => {
  const css = await readFile(new URL('../src/styles/app.css', import.meta.url), 'utf8');
  const levelGuideChipBlock = extractBlock(css, '.level-guide-panel__chips span');

  expect(levelGuideChipBlock).toMatch(
    /\.level-guide-panel__chips span\s*\{[^}]*\bwhite-space:\s*normal\s*;/,
  );
  expect(levelGuideChipBlock).toMatch(
    /\.level-guide-panel__chips span\s*\{[^}]*\boverflow-wrap:\s*anywhere\s*;/,
  );
});
```

- [x] **Step 2: Run UI tests and verify they fail**

Run:

```bash
npm test -- src/components/GameShell.test.tsx tests/responsive-css.test.mjs
```

Expected: FAIL because the new level and cost chip are not rendered yet, and the inspector does not explicitly include duration.

- [x] **Step 3: Add the compact cost chip**

Update `src/components/LevelGuide.tsx`:

```ts
function durationOverrideLabels(level: LevelConfig): readonly string[] {
  return Object.freeze(
    (level.durationOverrides ?? []).map(
      (override) => `${override.kind}:S${override.stage} = ${override.duration}t`,
    ),
  );
}
```

Inside `LevelGuide`, add:

```ts
const durationLabels = durationOverrideLabels(level);
```

Render after the topology chip:

```tsx
{
  durationLabels.map((label) => (
    <span key={`duration-${label}`} className="duration-chip">
      {label}
    </span>
  ));
}
```

- [x] **Step 4: Add duration to inspector copy**

Update the legal and completed paragraphs in `src/components/MoveInspector.tsx` so selected operations include duration:

```tsx
{
  explanation.status === 'legal' ? (
    <p>
      Legal now. Earliest start {explanation.earliestStart}. Duration{' '}
      {explanation.operation?.duration}. Memory after: {explanation.projectedMemory}.
    </p>
  ) : null;
}

{
  explanation.status === 'completed' ? (
    <p>
      Placed on rank {explanation.placement?.rank} from {explanation.placement?.start} to{' '}
      {explanation.placement?.end}. Duration {explanation.operation?.duration}.
    </p>
  ) : null;
}
```

- [x] **Step 5: Add compact chip CSS**

Update `src/styles/app.css` so level-guide chip text can wrap inside compact panels:

```css
.level-guide-panel__chips span {
  max-width: 100%;
  white-space: normal;
  overflow-wrap: anywhere;
}
```

Add duration-chip contrast:

```css
.duration-chip {
  border-color: color-mix(in srgb, var(--warning) 35%, var(--line));
}
```

Do not add a new full-width section or rules panel.

- [x] **Step 6: Run focused UI verification**

Run:

```bash
npm test -- src/components/GameShell.test.tsx tests/responsive-css.test.mjs
npm run typecheck
```

Expected: PASS.

- [x] **Step 7: Commit**

Run:

```bash
git add src/components/LevelGuide.tsx src/components/MoveInspector.tsx src/components/GameShell.test.tsx tests/responsive-css.test.mjs src/styles/app.css
git commit -m "feat: surface nonuniform duration cues"
```

## Task 5: Persistence And Public Flow Guardrails

**Files:**

- Modify: `tests/persistence.test.ts`
- Modify: `tests/game-flow.test.tsx`

- [x] **Step 1: Add persistence tests for duration metadata exclusion**

Add this test to `tests/persistence.test.ts` near the existing topology persistence tests:

```ts
it('encodes and decodes nonuniform-duration attempts as expanded actions only', () => {
  const level = getLevel('heavy-backward-tail');
  const payload: UrlAttemptPayload = {
    schemaVersion: 1,
    levelId: 'heavy-backward-tail',
    levelVersion: level.version,
    actions: MASTERED_ACTIONS['heavy-backward-tail'],
  };

  const encoded = encodeAttempt(payload);
  const storedPayload = JSON.parse(decodeURIComponent(encoded)) as Record<string, unknown>;

  expect(Object.keys(storedPayload).sort()).toEqual(
    ['actions', 'levelId', 'levelVersion', 'schemaVersion'].sort(),
  );
  expect(storedPayload).not.toHaveProperty('durationOverrides');
  expect(storedPayload).not.toHaveProperty('durations');
  expect(storedPayload).not.toHaveProperty('topology');
  expect(storedPayload.actions).toEqual(MASTERED_ACTIONS['heavy-backward-tail']);

  const decoded = decodeAttempt(encoded, getLevel);

  expect(decoded.ok).toBe(true);
  if (decoded.ok) {
    expect(decoded.attempt.levelId).toBe('heavy-backward-tail');
    expect(decoded.attempt.outcome).toBe('mastered');
    expect(decoded.attempt.actions).toEqual(MASTERED_ACTIONS['heavy-backward-tail']);
  }
});
```

- [x] **Step 2: Add public-flow expectations**

Confirm the existing `tests/game-flow.test.tsx` journey test iterates `LEVEL_IDS`; after Task 3 adds `heavy-backward-tail` to `LEVEL_IDS`, that journey test must include the new level automatically without a hard-coded level list.

Add a focused test:

```ts
it('names the interleaved reference for the nonuniform-cost level completion', async () => {
  const user = userEvent.setup();

  render(<App initialLevelId="heavy-backward-tail" />);

  await runJourney(user, MASTERED_ACTIONS['heavy-backward-tail'], 'pointer');

  expect(screen.getByRole('status', { name: /interaction feedback/i })).toHaveTextContent(
    /^Completed as Interleaved 1F1B reference\. Mastered\.$/,
  );
});
```

- [x] **Step 3: Run public-flow tests**

Run:

```bash
npm test -- tests/persistence.test.ts tests/game-flow.test.tsx
```

Expected: PASS.

- [x] **Step 4: Commit**

Run:

```bash
git add tests/persistence.test.ts tests/game-flow.test.tsx
git commit -m "test: guard nonuniform duration persistence"
```

## Task 6: Full Verifier

**Files:**

- No source edits expected.

- [x] **Step 1: Run the full verifier**

Run:

```bash
npm run verify
```

Expected: PASS.

Known acceptable warning if it appears:

```text
Not implemented: HTMLCanvasElement's getContext() method: without installing the canvas npm package
```

No TypeScript, ESLint, Prettier, unit, integration, or build failures are acceptable.

- [x] **Step 2: Check git state**

Run:

```bash
git status --short --branch
```

Expected:

```text
## <implementation-branch>
```

The pre-existing untracked file may still appear:

```text
?? src/components/PipelineLessonPanel.tsx
```

Do not add it unless a later approved plan explicitly owns it.

## Task 7: Post-Execution Review And Plan Improvement

**Files:**

- Modify: `docs/superpowers/plans/2026-08-23-sensei-nonuniform-duration.md`

- [x] **Step 1: Self-review the implementation against this plan**

Read the final diff and answer these questions in the plan's `Post-Execution Review` section:

- Did every invariant in this plan remain true?
- Did any task require a different file, helper, command, or expected value?
- Did any test expectation in this plan turn out to be wrong?
- Did the new level teach operation cost without adding non-CURR-06 mechanics?
- Did `durationOverrides` stay out of URL and local-storage payloads?
- Did the verifier pass, and was the known jsdom canvas warning the only acceptable warning?

- [x] **Step 2: Improve this plan from the review**

Append a dated note under `Plan Corrections From Execution` with exact corrections. Use this format:

```markdown
## Post-Execution Review

Date: 2026-08-23

- Verifier: `npm run verify` passed.
- Invariants: all preserved.
- Persistence: URL/local attempts remain canonical `Action[]`; duration metadata is not serialized.
- Plan corrections:
  - `src/components/MoveInspector.tsx` already needed `explanation.operation.duration`; no extra prop was required.
  - Fixture makespan target remained `28`; legal fixture with one leading wait produced `29`.
```

If a correction requires changing earlier task instructions, edit those instructions in this file before committing the plan update.

- [x] **Step 3: Commit the post-execution plan update**

Run:

```bash
git add docs/superpowers/plans/2026-08-23-sensei-nonuniform-duration.md
git commit -m "docs: review nonuniform duration plan execution"
```

## Suggested Agent Goal

Use this exact goal prompt for the coding agent:

```text
Implement the plan in docs/superpowers/plans/2026-08-23-sensei-nonuniform-duration.md to completion. Use superpowers:subagent-driven-development or superpowers:executing-plans as required by the plan. Do not touch src/components/PipelineLessonPanel.tsx. Complete every task checkbox, run npm run verify, append the post-execution review and plan corrections to the plan file, and commit the implementation plus the final plan update as focused commits.
```

## Post-Execution Review

Date: 2026-08-23

- Verifier: `npm run verify` passed with 20 test files and 315 tests passing, followed by a successful production build.
- Known warning: the jsdom `HTMLCanvasElement.getContext()` warning appeared during accessibility tests and was the only accepted warning observed.
- Invariants: all preserved. Base V1 durations remain `F=1` and `B=2`; operation IDs remain `F:stage:microbatch` / `B:stage:microbatch`; visible compact notation remains `F0:S0:B1` style with the `(F/B, stage_id, micro_batch_id)` key.
- Level scope: `heavy-backward-tail` teaches stage-specific cost through one `B:S0 = 4t` override, a cost-aware fixture, and compact guide/inspector cues without introducing split backward, zero-bubble, DualPipe, FSDP residency, dynamic durations, per-microbatch overrides, or a rules panel.
- Persistence: URL and local attempts remain canonical `Action[]`; `durationOverrides`, `durations`, and `topology` are not serialized into attempt payloads.
- Plan corrections:
  - The existing level picker test needed its expected optgroup list updated to include `Nonuniform Cost` after adding the new catalog entry.
  - `src/styles/app.css` did not already define `--warning`; the compact duration chip required adding `--warning: #c07b16` before using it in `.duration-chip`.
  - `src/components/MoveInspector.tsx` already had access to `explanation.operation.duration`; no new prop or state shape was needed.
  - Fixture makespan target remained `28`; the legal fixture with one leading wait produced `29`, `totalWork` `42`, `capacity` `58`, and `bubbleRatio` `16 / 58`.
