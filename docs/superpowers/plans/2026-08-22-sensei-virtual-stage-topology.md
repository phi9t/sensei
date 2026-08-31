# Sensei Virtual-Stage Topology Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `SENSEI-CURR-04` by adding virtual-stage topology, one playable virtual-stage ownership level, compact topology UI affordances, and regression coverage.

**Architecture:** Topology is optional level metadata that maps logical stages to physical rank lanes. Operation IDs and dependencies stay logical-stage based, while placement legality, rank frontiers, waits, memory, and board lanes continue to use the existing `operation.rank` field. Existing one-to-one levels must behave unchanged.

**Tech Stack:** TypeScript 6, React 19, Vite, Vitest, Testing Library, CSS contract tests.

---

## Scope

This plan implements only `SENSEI-CURR-04`.

It does not implement interleaved 1F1B policy recognition, nonuniform duration support, split backward `W`, zero-bubble scoring, grouped scheduling, FSDP residency, or DualPipe. It must not touch the pre-existing untracked `src/components/PipelineLessonPanel.tsx`.

## File Map

- Modify `src/engine/types.ts`
  - Add `PipelineTopologyPlacement`, `PipelineTopology`, and optional `LevelConfig.topology`.
- Modify `src/engine/config.ts`
  - Validate topology defaults and stage/rank relationships.
- Create `src/engine/topology.ts`
  - Own defaulting and logical-stage-to-physical-rank mapping.
- Create `src/engine/topology.test.ts`
  - Cover one-to-one, wrap, v-shape, and invalid stage lookup behavior.
- Modify `src/engine/operations.ts`
  - Use `ownerRankForStage` while keeping dependencies logical.
- Modify `src/engine/config.test.ts`
  - Replace the hard `stageCount !== rankCount` rejection with topology-specific cases.
- Modify `src/engine/operations.test.ts`
  - Add virtual-stage derivation and dependency tests.
- Modify `src/engine/replay.test.ts`
  - Add valid and invalid virtual-stage replay tests.
- Modify `src/levels/levels.ts`
  - Add `virtual-stages` after `stamp-the-pattern`, freeze topology metadata.
- Modify `src/levels/levels.test.ts`
  - Update expected IDs/configs/groups and fixture expectations.
- Modify `src/levels/fixtures.ts`
  - Add mastered and legal action logs for `virtual-stages`.
- Modify `src/app/useGame.ts`
  - Preserve topology metadata when cloning configs and expose helper text through existing view state only if needed.
- Modify `src/components/LevelGuide.tsx`
  - Add one compact topology chip.
- Modify `src/components/MoveInspector.tsx`
  - Include owner rank in selected-operation copy.
- Modify `src/components/ScheduleBoard.tsx`
  - Optionally expose concise rank-stage ownership labels/details while keeping lanes as physical ranks.
- Modify `src/styles/app.css`
  - Add compact chip/owner-label styles without changing the cockpit layout.
- Modify `src/components/GameShell.test.tsx`
  - Cover level picker group, topology chip, compact code rendering, and owner-rank discoverability.
- Modify `tests/persistence.test.ts`
  - Roundtrip virtual-stage attempts as ordinary `Action[]`.
- Modify `tests/responsive-css.test.mjs`
  - Guard topology chip and stage-owner copy against overflow.

## Task 1: Topology Types And Mapping

**Files:**

- Modify: `src/engine/types.ts`
- Create: `src/engine/topology.ts`
- Test: `src/engine/topology.test.ts`

- [ ] **Step 1: Write failing topology helper tests**

Add `src/engine/topology.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { makeConfig } from '../test/factories';
import { ownerRankForStage, topologyForLevel } from './topology';

describe('topologyForLevel', () => {
  it('defaults omitted topology to one-to-one', () => {
    expect(topologyForLevel(makeConfig())).toEqual({
      placement: 'one-to-one',
      virtualStagesPerRank: 1,
    });
  });
});

describe('ownerRankForStage', () => {
  it('maps one-to-one stages to matching ranks', () => {
    const config = makeConfig({ rankCount: 3, stageCount: 3 });

    expect([0, 1, 2].map((stage) => ownerRankForStage(config, stage))).toEqual([0, 1, 2]);
  });

  it('maps wrap topology by stage modulo rank count', () => {
    const config = makeConfig({
      rankCount: 2,
      stageCount: 4,
      topology: { placement: 'wrap', virtualStagesPerRank: 2 },
    });

    expect([0, 1, 2, 3].map((stage) => ownerRankForStage(config, stage))).toEqual([0, 1, 0, 1]);
  });

  it('maps v-shape topology through mirrored rank ownership', () => {
    const config = makeConfig({
      rankCount: 2,
      stageCount: 4,
      topology: { placement: 'v-shape', virtualStagesPerRank: 2 },
    });

    expect([0, 1, 2, 3].map((stage) => ownerRankForStage(config, stage))).toEqual([0, 1, 1, 0]);
  });

  it('maps larger v-shape topology by repeating forward then reverse ownership', () => {
    const config = makeConfig({
      rankCount: 3,
      stageCount: 6,
      topology: { placement: 'v-shape', virtualStagesPerRank: 2 },
    });

    expect([0, 1, 2, 3, 4, 5].map((stage) => ownerRankForStage(config, stage))).toEqual([
      0, 1, 2, 2, 1, 0,
    ]);
  });

  it('rejects stage lookup outside the logical stage range', () => {
    const config = makeConfig({
      rankCount: 2,
      stageCount: 4,
      topology: { placement: 'wrap', virtualStagesPerRank: 2 },
    });

    expect(() => ownerRankForStage(config, -1)).toThrow(/stage -1 out of bounds/);
    expect(() => ownerRankForStage(config, 4)).toThrow(/stage 4 out of bounds/);
  });
});
```

- [ ] **Step 2: Run topology tests and verify they fail**

Run:

```bash
npm test -- src/engine/topology.test.ts
```

Expected: FAIL because `src/engine/topology.ts` does not exist and `LevelConfig.topology` is not typed.

- [ ] **Step 3: Add topology types**

Update `src/engine/types.ts`:

```ts
export type PipelineTopologyPlacement = 'one-to-one' | 'wrap' | 'v-shape';

export interface PipelineTopology {
  readonly placement: PipelineTopologyPlacement;
  readonly virtualStagesPerRank: number;
}
```

Add the optional field to `LevelConfig`:

```ts
  topology?: PipelineTopology;
```

- [ ] **Step 4: Add topology helper implementation**

Create `src/engine/topology.ts`:

```ts
import type { LevelConfig, PipelineTopology } from './types';

const DEFAULT_TOPOLOGY: PipelineTopology = Object.freeze({
  placement: 'one-to-one',
  virtualStagesPerRank: 1,
});

export function topologyForLevel(config: LevelConfig): PipelineTopology {
  return config.topology ?? DEFAULT_TOPOLOGY;
}

export function ownerRankForStage(config: LevelConfig, stage: number): number {
  if (!Number.isInteger(stage) || stage < 0 || stage >= config.stageCount) {
    throw new Error(`stage ${stage} out of bounds for stageCount ${config.stageCount}`);
  }

  const topology = topologyForLevel(config);

  switch (topology.placement) {
    case 'one-to-one':
      return stage;
    case 'wrap':
      return stage % config.rankCount;
    case 'v-shape': {
      const forward = Math.floor(stage / config.rankCount) % 2 === 0;
      const offset = stage % config.rankCount;
      return forward ? offset : config.rankCount - 1 - offset;
    }
  }
}
```

- [ ] **Step 5: Run topology tests and typecheck**

Run:

```bash
npm test -- src/engine/topology.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit topology helper**

Run:

```bash
git add src/engine/types.ts src/engine/topology.ts src/engine/topology.test.ts
git commit -m "feat: add pipeline topology mapping"
```

## Task 2: Config Validation And Operation Derivation

**Files:**

- Modify: `src/engine/config.ts`
- Modify: `src/engine/config.test.ts`
- Modify: `src/engine/operations.ts`
- Modify: `src/engine/operations.test.ts`

- [ ] **Step 1: Write failing config validation tests**

In `src/engine/config.test.ts`, replace the existing `rejects stageCount !== rankCount` test with these topology tests:

```ts
it('rejects stageCount different from rankCount without virtual topology', () => {
  expect(() => validateLevelConfig({ ...makeConfig(), stageCount: 3 })).toThrow(
    /one-to-one topology requires stageCount to equal rankCount/,
  );
});

it('accepts wrap topology when stageCount equals rankCount times virtualStagesPerRank', () => {
  expect(() =>
    validateLevelConfig(
      makeConfig({
        rankCount: 2,
        stageCount: 4,
        topology: { placement: 'wrap', virtualStagesPerRank: 2 },
      }),
    ),
  ).not.toThrow();
});

it('accepts v-shape topology when stageCount equals rankCount times virtualStagesPerRank', () => {
  expect(() =>
    validateLevelConfig(
      makeConfig({
        rankCount: 2,
        stageCount: 4,
        topology: { placement: 'v-shape', virtualStagesPerRank: 2 },
      }),
    ),
  ).not.toThrow();
});

it('rejects virtual topology stage-count mismatches', () => {
  expect(() =>
    validateLevelConfig(
      makeConfig({
        rankCount: 2,
        stageCount: 5,
        topology: { placement: 'wrap', virtualStagesPerRank: 2 },
      }),
    ),
  ).toThrow(/virtual topology requires stageCount to equal rankCount times virtualStagesPerRank/);
});

it('rejects non-positive virtualStagesPerRank values', () => {
  expect(() =>
    validateLevelConfig(
      makeConfig({
        rankCount: 2,
        stageCount: 2,
        topology: { placement: 'wrap', virtualStagesPerRank: 0 },
      }),
    ),
  ).toThrow(/virtualStagesPerRank must be a positive finite integer/);
});

it('rejects one-to-one topology with more than one virtual stage per rank', () => {
  expect(() =>
    validateLevelConfig(
      makeConfig({
        rankCount: 2,
        stageCount: 4,
        topology: { placement: 'one-to-one', virtualStagesPerRank: 2 },
      }),
    ),
  ).toThrow(/one-to-one topology requires virtualStagesPerRank to equal 1/);
});
```

Add `virtualStagesPerRank` to the existing boundary test's integer-count fields:

```ts
it('rejects NaN, Infinity, and fractions for virtualStagesPerRank', () => {
  for (const value of [NaN, Infinity, -Infinity, 1.5, -1]) {
    expect(() =>
      validateLevelConfig(
        makeConfig({
          rankCount: 2,
          stageCount: 4,
          topology: { placement: 'wrap', virtualStagesPerRank: value },
        }),
      ),
    ).toThrow(/virtualStagesPerRank must be a positive finite integer/);
  }
});
```

- [ ] **Step 2: Write failing operation derivation tests**

In `src/engine/operations.test.ts`, add:

```ts
it('derives wrap topology ranks while preserving logical operation IDs', () => {
  const config = makeConfig({
    rankCount: 2,
    stageCount: 4,
    microbatchCount: 1,
    topology: { placement: 'wrap', virtualStagesPerRank: 2 },
  });

  expect(deriveOperations(config).map(({ id, stage, rank }) => ({ id, stage, rank }))).toEqual([
    { id: 'F:0:0', stage: 0, rank: 0 },
    { id: 'B:0:0', stage: 0, rank: 0 },
    { id: 'F:1:0', stage: 1, rank: 1 },
    { id: 'B:1:0', stage: 1, rank: 1 },
    { id: 'F:2:0', stage: 2, rank: 0 },
    { id: 'B:2:0', stage: 2, rank: 0 },
    { id: 'F:3:0', stage: 3, rank: 1 },
    { id: 'B:3:0', stage: 3, rank: 1 },
  ]);
});

it('derives v-shape topology ranks while preserving logical operation IDs', () => {
  const config = makeConfig({
    rankCount: 2,
    stageCount: 4,
    microbatchCount: 1,
    topology: { placement: 'v-shape', virtualStagesPerRank: 2 },
  });

  expect(deriveOperations(config).map(({ id, stage, rank }) => ({ id, stage, rank }))).toEqual([
    { id: 'F:0:0', stage: 0, rank: 0 },
    { id: 'B:0:0', stage: 0, rank: 0 },
    { id: 'F:1:0', stage: 1, rank: 1 },
    { id: 'B:1:0', stage: 1, rank: 1 },
    { id: 'F:2:0', stage: 2, rank: 1 },
    { id: 'B:2:0', stage: 2, rank: 1 },
    { id: 'F:3:0', stage: 3, rank: 0 },
    { id: 'B:3:0', stage: 3, rank: 0 },
  ]);
});
```

In the `predecessorsOf` block, add:

```ts
it('keeps virtual-stage dependencies on logical stage order', () => {
  const config = makeConfig({
    rankCount: 2,
    stageCount: 4,
    topology: { placement: 'v-shape', virtualStagesPerRank: 2 },
  });

  expect(predecessorsOf('F:2:0', config)).toEqual(['F:1:0']);
  expect(predecessorsOf('B:1:0', config)).toEqual(['F:1:0', 'B:2:0']);
  expect(predecessorsOf('B:3:0', config)).toEqual(['F:3:0']);
});
```

- [ ] **Step 3: Run targeted tests and verify they fail**

Run:

```bash
npm test -- src/engine/config.test.ts src/engine/operations.test.ts
```

Expected: FAIL because validation still rejects `stageCount !== rankCount` and derivation still uses `rank = stage`.

- [ ] **Step 4: Implement config validation**

Update `src/engine/config.ts`:

```ts
import type { LevelConfig, PipelineTopologyPlacement } from './types';

const TOPOLOGY_PLACEMENTS = new Set<PipelineTopologyPlacement>(['one-to-one', 'wrap', 'v-shape']);

function isTopologyPlacement(value: string): value is PipelineTopologyPlacement {
  return TOPOLOGY_PLACEMENTS.has(value as PipelineTopologyPlacement);
}
```

Inside `validateLevelConfig`, replace the current `stageCount !== rankCount` check with:

```ts
const topology = config.topology ?? { placement: 'one-to-one' as const, virtualStagesPerRank: 1 };

if (!isTopologyPlacement(topology.placement)) {
  throw new Error('topology placement must be one-to-one, wrap, or v-shape');
}
if (!isFinitePositiveInteger(topology.virtualStagesPerRank)) {
  throw new Error('virtualStagesPerRank must be a positive finite integer');
}
if (topology.placement === 'one-to-one') {
  if (topology.virtualStagesPerRank !== 1) {
    throw new Error('one-to-one topology requires virtualStagesPerRank to equal 1');
  }
  if (config.stageCount !== config.rankCount) {
    throw new Error('one-to-one topology requires stageCount to equal rankCount');
  }
} else {
  if (topology.virtualStagesPerRank <= 1) {
    throw new Error('virtual topology requires virtualStagesPerRank greater than 1');
  }
  if (config.stageCount !== config.rankCount * topology.virtualStagesPerRank) {
    throw new Error(
      'virtual topology requires stageCount to equal rankCount times virtualStagesPerRank',
    );
  }
}
```

- [ ] **Step 5: Update operation derivation**

Update `src/engine/operations.ts` to import and use the topology helper:

```ts
import { ownerRankForStage } from './topology';
```

Replace `rank: stage` with:

```ts
rank: ownerRankForStage(config, stage),
```

- [ ] **Step 6: Run targeted tests**

Run:

```bash
npm test -- src/engine/topology.test.ts src/engine/config.test.ts src/engine/operations.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit engine topology support**

Run:

```bash
git add src/engine/types.ts src/engine/topology.ts src/engine/topology.test.ts src/engine/config.ts src/engine/config.test.ts src/engine/operations.ts src/engine/operations.test.ts
git commit -m "feat: support virtual-stage topology"
```

## Task 3: Replay Semantics And Fixtures

**Files:**

- Modify: `src/engine/replay.test.ts`
- Modify: `src/levels/levels.ts`
- Modify: `src/levels/fixtures.ts`
- Modify: `src/levels/levels.test.ts`

- [ ] **Step 1: Write failing replay tests**

Add to `src/engine/replay.test.ts`:

```ts
describe('virtual-stage replay', () => {
  const config = makeConfig({
    rankCount: 2,
    stageCount: 4,
    microbatchCount: 1,
    topology: { placement: 'v-shape', virtualStagesPerRank: 2 },
  });

  it('places logical stages on their physical owner ranks', () => {
    const state = expectState(replay(config, placeIds('F:0:0', 'F:1:0', 'F:2:0', 'F:3:0')));

    expect(
      state.placements.map(({ operationId, rank, start, end }) => ({
        operationId,
        rank,
        start,
        end,
      })),
    ).toEqual([
      { operationId: 'F:0:0', rank: 0, start: 0, end: 1 },
      { operationId: 'F:1:0', rank: 1, start: 1, end: 2 },
      { operationId: 'F:2:0', rank: 1, start: 2, end: 3 },
      { operationId: 'F:3:0', rank: 0, start: 3, end: 4 },
    ]);
  });

  it('blocks backward work until the next logical stage backward is complete', () => {
    const state = expectState(replay(config, placeIds('F:0:0', 'F:1:0', 'F:2:0', 'F:3:0')));

    const result = applyAction(state, { type: 'place', operationId: 'B:1:0' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toEqual({ kind: 'dependency-not-finished', operationId: 'B:2:0' });
    }
  });
});
```

- [ ] **Step 2: Run replay tests and verify the new cases fail before Task 2 implementation**

If Task 2 is already implemented, this step should pass. Otherwise run:

```bash
npm test -- src/engine/replay.test.ts
```

Expected before implementation: FAIL because topology config is rejected or stage ownership is wrong. Expected after Task 2: PASS.

- [ ] **Step 3: Add level topology freezing**

In `src/levels/levels.ts`, add a helper:

```ts
function freezeTopology(
  topology: NonNullable<LevelConfig['topology']>,
): NonNullable<LevelConfig['topology']> {
  return Object.freeze({ ...topology });
}
```

Then include topology in `freezeLevel` similarly to `buildingBlock`:

```ts
const { buildingBlock, topology, ...baseConfig } = config;
```

and:

```ts
...(topology ? { topology: freezeTopology(topology) } : {}),
```

- [ ] **Step 4: Add `virtual-stages` to level catalog**

Update `LEVEL_IDS`:

```ts
  'stamp-the-pattern',
  'virtual-stages',
```

Add the level after `stamp-the-pattern`:

```ts
  'virtual-stages': freezeLevel({
    id: 'virtual-stages',
    version: 1,
    title: 'Virtual Stages',
    rankCount: 2,
    stageCount: 4,
    microbatchCount: 2,
    topology: { placement: 'v-shape', virtualStagesPerRank: 2 },
    durations: { F: 1, B: 2 },
    memoryCaps: null,
    masteryTargets: [
      { metric: 'makespan', op: '<=', value: 16 },
      { metric: 'intentionalIdle', op: '<=', value: 0 },
      { metric: 'peakActivationMemory', op: '<=', value: 4 },
    ],
    coaching: { readySet: true, suggest: true, auto: true },
    algorithm: {
      family: 'interleaved-one-f-one-b',
      setTitle: 'Virtual Stages',
      concept: 'One physical rank can own multiple logical stages.',
      objective: 'Follow logical dependencies while placing work on the owning rank lane.',
      patternLabel: 'V-shape',
      introducedModel: ['logical stage', 'physical rank ownership', 'virtual pipeline stage'],
    },
  }),
```

- [ ] **Step 5: Add virtual-stage fixtures**

In `src/levels/fixtures.ts`, add the mastered fixture:

```ts
  'virtual-stages': placeIds(
    'F:0:0',
    'F:0:1',
    'F:1:0',
    'F:1:1',
    'F:2:0',
    'F:2:1',
    'F:3:0',
    'B:3:0',
    'B:2:0',
    'B:1:0',
    'B:0:0',
    'F:3:1',
    'B:3:1',
    'B:2:1',
    'B:1:1',
    'B:0:1',
  ),
```

Add the legal fixture:

```ts
  'virtual-stages': withLeadingWait(MASTERED_ACTIONS['virtual-stages']),
```

If this fixture fails its mastery targets during implementation, adjust only the target numbers after inspecting the replayed score; do not change the semantic goal of the level.

- [ ] **Step 6: Update level tests**

In `src/levels/levels.test.ts`:

Update `EXPECTED_LEVEL_IDS`:

```ts
  'stamp-the-pattern',
  'virtual-stages',
```

Add the `virtual-stages` expected config matching Step 4.

Add a topology freezing test:

```ts
it('freezes topology metadata with the level config', () => {
  const level = getLevel('virtual-stages');

  expect(Object.isFrozen(level.topology)).toBe(true);
  expect(level.topology).toEqual({ placement: 'v-shape', virtualStagesPerRank: 2 });
});
```

Update expected group assertions that currently list:

```ts
['Foundations', 'GPipe', '1F1B', 'Building Blocks'];
```

to:

```ts
['Foundations', 'GPipe', '1F1B', 'Building Blocks', 'Virtual Stages'];
```

- [ ] **Step 7: Run level and replay tests**

Run:

```bash
npm test -- src/engine/replay.test.ts src/levels/levels.test.ts
```

Expected: PASS. If the mastered fixture score misses by one tick, inspect with a small temporary test assertion or existing failure output, then update the `virtual-stages` mastery thresholds to the verified best fixture score.

- [ ] **Step 8: Commit virtual-stage level**

Run:

```bash
git add src/engine/replay.test.ts src/levels/levels.ts src/levels/fixtures.ts src/levels/levels.test.ts
git commit -m "feat: add virtual-stage curriculum level"
```

## Task 4: Compact Topology UI

**Files:**

- Modify: `src/app/useGame.ts`
- Modify: `src/components/LevelGuide.tsx`
- Modify: `src/components/MoveInspector.tsx`
- Modify: `src/components/ScheduleBoard.tsx`
- Modify: `src/components/GameShell.test.tsx`
- Modify: `src/styles/app.css`
- Modify: `tests/responsive-css.test.mjs`

- [ ] **Step 1: Write failing UI tests**

In `src/components/GameShell.test.tsx`, add tests that switch to the virtual-stage level after unlocking or by using persisted progress helpers already present in the file:

```ts
  it('shows compact virtual-stage topology guidance on the virtual-stage level', async () => {
    const user = userEvent.setup();
    render(<GameShell initialLevelId="virtual-stages" />);

    expect(screen.getByText('Virtual Stages')).toBeInTheDocument();
    expect(screen.getByText('V-stage x2')).toBeInTheDocument();
    expect(screen.getByText('V-shape')).toBeInTheDocument();

    await user.click(screen.getByTestId('tile-F:2:0'));

    expect(screen.getByText('F2:S2:D0')).toBeInTheDocument();
    expect(screen.getByText(/Owner rank 1/)).toBeInTheDocument();
  });

  it('renders virtual-stage schedule blocks on physical rank lanes', async () => {
    const user = userEvent.setup();
    render(<GameShell initialLevelId="virtual-stages" />);

    await user.click(screen.getByTestId('tile-F:0:0'));
    await user.click(screen.getByRole('button', { name: /place selected block/i }));
    await user.click(screen.getByTestId('tile-F:1:0'));
    await user.click(screen.getByRole('button', { name: /place selected block/i }));
    await user.click(screen.getByTestId('tile-F:2:0'));
    await user.click(screen.getByRole('button', { name: /place selected block/i }));

    expect(screen.getByTestId('rank-tile-F:0:0')).toBeInTheDocument();
    expect(screen.getByTestId('rank-tile-F:1:0')).toBeInTheDocument();
    expect(screen.getByTestId('rank-tile-F:2:0')).toBeInTheDocument();
    expect(screen.getByText('Rank 0 owns S0, S3')).toBeInTheDocument();
    expect(screen.getByText('Rank 1 owns S1, S2')).toBeInTheDocument();
  });
```

Use existing test setup/imports in the file. If direct `initialLevelId` rendering is not currently supported by `GameShell`, adapt the assertion to the existing level selection helper rather than changing app construction just for the test.

- [ ] **Step 2: Write failing CSS contract tests**

In `tests/responsive-css.test.mjs`, add assertions:

```js
const topologyChipBlock = extractBlock(css, '.topology-chip');
const topologyOwnersBlock = extractBlock(css, '.rank-owner-list');

expect(topologyChipBlock).toMatch(/\\.topology-chip\\s*\\{[^}]*\\bwhite-space:\\s*nowrap\\s*;/);
expect(topologyChipBlock).toMatch(/\\.topology-chip\\s*\\{[^}]*\\bmax-width:\\s*100%\\s*;/);
expect(topologyOwnersBlock).toMatch(/\\.rank-owner-list\\s*\\{[^}]*\\boverflow-x:\\s*auto\\s*;/);
```

- [ ] **Step 3: Run targeted UI tests and verify failure**

Run:

```bash
npm test -- src/components/GameShell.test.tsx tests/responsive-css.test.mjs
```

Expected: FAIL because topology UI copy/classes are not present yet.

- [ ] **Step 4: Preserve topology metadata in cloned configs**

In `src/app/useGame.ts`, update `cloneConfig` to include topology if present:

```ts
    ...(config.topology ? { topology: Object.freeze({ ...config.topology }) } : {}),
```

- [ ] **Step 5: Add compact topology chip to level guide**

In `src/components/LevelGuide.tsx`, add:

```ts
function topologyLabel(level: LevelConfig): string | null {
  if (!level.topology || level.topology.placement === 'one-to-one') {
    return null;
  }
  return `V-stage x${level.topology.virtualStagesPerRank}`;
}
```

Then render it inside `.level-guide-panel__chips` before the pattern label:

```tsx
{
  topologyLabel(level) ? <span className="topology-chip">{topologyLabel(level)}</span> : null;
}
```

- [ ] **Step 6: Add owner-rank copy to the inspector**

In `src/components/MoveInspector.tsx`, use the selected explanation operation when available:

```tsx
{
  explanation.operation.rank !== operationIdentity.stage ? (
    <span>Owner rank {explanation.operation.rank}</span>
  ) : null;
}
```

Place this next to the compact code in `.inspector-operation__copy`. If the exact object access differs, use the `operation` already carried by every `ExplanationResult` variant rather than re-deriving ownership from the ID.

- [ ] **Step 7: Add board rank ownership details**

In `src/components/ScheduleBoard.tsx`, add a helper:

```ts
function stageOwnersForRank(state: ScheduleState, rank: number): readonly number[] {
  return Object.freeze(
    [...new Set(state.operations.filter((op) => op.rank === rank).map((op) => op.stage))].sort(
      (left, right) => left - right,
    ),
  );
}

function rankOwnerLabel(state: ScheduleState, rank: number): string {
  const stages = stageOwnersForRank(state, rank);
  return `Rank ${rank} owns ${stages.map((stage) => `S${stage}`).join(', ')}`;
}
```

Render the labels in the timeline details area or just above the board scroll region:

```tsx
{
  schedule.config.topology && schedule.config.topology.placement !== 'one-to-one' ? (
    <div className="rank-owner-list" aria-label="Virtual stage ownership">
      {Array.from({ length: schedule.config.rankCount }, (_, rank) => (
        <span key={rank}>{rankOwnerLabel(schedule, rank)}</span>
      ))}
    </div>
  ) : null;
}
```

- [ ] **Step 8: Add CSS for compact topology affordances**

In `src/styles/app.css`, add:

```css
.topology-chip {
  max-width: 100%;
  white-space: nowrap;
}

.rank-owner-list {
  display: flex;
  gap: 0.45rem;
  overflow-x: auto;
  padding-bottom: 0.25rem;
  color: var(--muted);
  font-size: 0.74rem;
}

.rank-owner-list span {
  flex: 0 0 auto;
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 0.18rem 0.5rem;
  background: color-mix(in srgb, var(--panel) 84%, white);
}
```

- [ ] **Step 9: Run targeted UI tests**

Run:

```bash
npm test -- src/components/GameShell.test.tsx tests/responsive-css.test.mjs
```

Expected: PASS.

- [ ] **Step 10: Commit topology UI**

Run:

```bash
git add src/app/useGame.ts src/components/LevelGuide.tsx src/components/MoveInspector.tsx src/components/ScheduleBoard.tsx src/components/GameShell.test.tsx src/styles/app.css tests/responsive-css.test.mjs
git commit -m "feat: show compact virtual-stage ownership"
```

## Task 5: Persistence And Full Integration Coverage

**Files:**

- Modify: `tests/game-flow.test.tsx`
- Modify: `tests/persistence.test.ts`
- Modify: `src/levels/levels.test.ts`

- [ ] **Step 1: Write failing public flow regression**

In `tests/game-flow.test.tsx`, add:

```ts
  it('plays and persists the virtual-stage level as ordinary actions', async () => {
    const user = userEvent.setup();
    const storage = window.localStorage;
    render(<App storage={storage} initialLevelId="virtual-stages" />);

    for (const action of MASTERED_ACTIONS['virtual-stages']) {
      if (action.type !== 'place') {
        throw new Error('virtual-stage mastered fixture should not require waits');
      }
      await user.click(screen.getByTestId(`tile-${action.operationId}`));
      await user.click(screen.getByRole('button', { name: /place selected block/i }));
    }

    expect(screen.getByText(/Mastered/i)).toBeInTheDocument();
    const stored = storage.getItem('sensei.progress.v1');
    expect(stored).not.toBeNull();
    expect(stored).toContain('virtual-stages');
    expect(stored).not.toContain('topology');
  });
```

Adapt imports to existing helpers in the file.

- [ ] **Step 2: Add persistence roundtrip test**

In `tests/persistence.test.ts`, add:

```ts
it('encodes and decodes virtual-stage attempts as expanded actions only', () => {
  const level = getLevel('virtual-stages');
  const payload: UrlAttemptPayload = {
    schemaVersion: 1,
    levelId: 'virtual-stages',
    levelVersion: level.version,
    actions: MASTERED_ACTIONS['virtual-stages'],
  };

  const encoded = encodeAttempt(payload);
  const storedPayload = JSON.parse(decodeURIComponent(encoded)) as Record<string, unknown>;

  expect(Object.keys(storedPayload).sort()).toEqual(
    ['actions', 'levelId', 'levelVersion', 'schemaVersion'].sort(),
  );
  expect(storedPayload).not.toHaveProperty('topology');
  expect(storedPayload.actions).toEqual(MASTERED_ACTIONS['virtual-stages']);

  const decoded = decodeAttempt(encoded, getLevel);

  expect(decoded.ok).toBe(true);
  if (decoded.ok) {
    expect(decoded.attempt.levelId).toBe('virtual-stages');
    expect(decoded.attempt.outcome).toBe('mastered');
    expect(decoded.attempt.actions).toEqual(MASTERED_ACTIONS['virtual-stages']);
  }
});
```

- [ ] **Step 3: Run integration tests and verify failure if earlier tasks are absent**

Run:

```bash
npm test -- tests/game-flow.test.tsx tests/persistence.test.ts src/levels/levels.test.ts
```

Expected after Tasks 1-4: PASS.

- [ ] **Step 4: Update any stale expected counts**

If tests that enumerate all levels fail, update the expected count or group list to include `virtual-stages` and `Virtual Stages`. Do not weaken tests that assert existing fixtures replay or existing configs are unchanged.

- [ ] **Step 5: Commit integration coverage**

Run:

```bash
git add tests/game-flow.test.tsx tests/persistence.test.ts src/levels/levels.test.ts
git commit -m "test: cover virtual-stage integration"
```

## Task 6: Review, Verify, Rebase, And Land

**Files:**

- No new planned source files.
- Do not stage `src/components/PipelineLessonPanel.tsx`.

- [ ] **Step 1: Review the branch against the spec**

Review against:

```text
docs/superpowers/specs/2026-08-22-sensei-virtual-stage-topology-design.md
docs/superpowers/plans/2026-08-22-sensei-virtual-stage-topology.md
```

Check:

- existing one-to-one levels are unchanged;
- topology validation cannot admit inconsistent `stageCount`/`rankCount` pairs;
- dependencies use logical stage IDs;
- placement uses physical owner rank;
- persisted data contains no topology payload;
- UI additions are compact and level-local;
- no `src/components/PipelineLessonPanel.tsx` changes are staged.

- [ ] **Step 2: Run full verification**

Run:

```bash
npm run verify
git diff --check
git status --short
```

Expected:

- `npm run verify` passes;
- `git diff --check` reports no whitespace errors;
- status shows only intended branch changes before landing and may still show untracked `src/components/PipelineLessonPanel.tsx` in the main worktree.

- [ ] **Step 3: Rebase on master**

If implementing in a worktree branch:

```bash
git fetch origin
git rebase master
```

If `origin` is unavailable or the repository is intentionally local-only, rebase against the current local `master`:

```bash
git rebase master
```

- [ ] **Step 4: Fast-forward land**

From `/Users/bytedance/workspace/sensei` on `master`:

```bash
git merge --ff-only <curr-04-branch-name>
git branch -d <curr-04-branch-name>
git worktree prune
```

- [ ] **Step 5: Final status**

Run:

```bash
git status --short --branch
git log --oneline -8
```

Expected:

- `master` points at the final CURR-04 commit;
- no unexpected tracked changes remain;
- untracked `src/components/PipelineLessonPanel.tsx` remains untouched unless a later approved task owns it.

## Plan Self-Review

- Spec coverage: topology metadata, default behavior, mapping formulas, engine derivation, level, UI, persistence, tests, and landing are all mapped to tasks.
- Placeholder scan: no unresolved placeholder markers remain.
- Type consistency: `PipelineTopology`, `PipelineTopologyPlacement`, `LevelConfig.topology`, `topologyForLevel`, and `ownerRankForStage` are consistently named across tasks.
- Scope check: the plan covers one curriculum subsystem, `SENSEI-CURR-04`, and excludes later algorithms.
