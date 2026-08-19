# Sensei Pipeline Scheduling Game Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an original, offline-capable four-level pipeline scheduling game
that teaches legal scheduling, `F = 1` / `B = 2` compute geometry, optimization,
and activation-memory constraints.

**Architecture:** A pure immutable TypeScript engine derives all schedule truth
from `LevelConfig + Action[]`; coaching, persistence, and the React/SVG shell
consume that engine without duplicating rules. The implementation proceeds in
tested vertical increments and finishes with original golden level fixtures,
keyboard accessibility, native service-worker generation, and a clean-room
audit.

**Tech Stack:** Node 24, npm 11, TypeScript 7, Vite 8, React 19, SVG/HTML,
Vitest 4, Testing Library, fast-check, axe-core, ESLint 10, Prettier 3.

**Design contract:**
`docs/superpowers/specs/2026-08-19-sensei-pipeline-game-design.md`

---

## File map

```text
package.json                         scripts and pinned dependencies
package-lock.json                    npm-resolved dependency receipt
index.html                           static application entry
vite.config.ts                       Vite and Vitest configuration
tsconfig.json                        strict TypeScript project references
tsconfig.app.json                    browser application compiler config
tsconfig.node.json                   tool-script compiler config
eslint.config.js                     TypeScript/React lint rules
.prettierrc.json                     formatting contract
src/main.tsx                         browser bootstrap
src/app/App.tsx                      top-level game shell
src/app/useGame.ts                   reducer-like replay orchestration
src/engine/types.ts                  branded IDs and domain result types
src/engine/config.ts                 level validation
src/engine/operations.ts             operation inventory and dependencies
src/engine/replay.ts                 classify, validate, apply, replay
src/engine/score.ts                  score and attempt ranking
src/engine/properties.test.ts        bounded property tests
src/levels/levels.ts                 four original level configurations
src/levels/fixtures.ts               original legal/mastered action logs
src/coaching/coaching.ts             explanations and policy assistance
src/persistence/codec.ts             URL/local schema decoding and replay
src/persistence/storage.ts           best-attempt and progress storage
src/components/OperationTray.tsx     ready/blocked/completed operation controls
src/components/ScheduleBoard.tsx     SVG rank timelines and memory strips
src/components/MoveInspector.tsx     causal legality and projected deltas
src/components/MetricsPanel.tsx      accounting and mastery targets
src/components/GameControls.tsx      undo/redo/wait/hint/automation/reset
src/styles/app.css                   original technical-tabletop presentation
src/offline/register.ts              service-worker registration and status
src/test/factories.ts                shared config/action/replay test helpers
scripts/generate-service-worker.mjs  build-derived atomic application cache
tests/accessibility.test.tsx         axe and keyboard-only playthrough
tests/game-flow.test.tsx             four-level pointer/keyboard integration
tests/persistence.test.ts            version and ranking behavior
tests/offline.test.mjs               generated service-worker contract
README.md                            run, test, architecture, and attribution
docs/clean-room-audit.md             concrete independent-derivation receipt
```

## Original golden configurations

Use these independently specified values throughout the plan. Operation IDs use
`F:<stage>:<microbatch>` and `B:<stage>:<microbatch>`.

| Level | Ranks | Microbatches | Cap | Mastered makespan | Bubble | Peak memory |
|---|---:|---:|---|---:|---:|---|
| dependency-chain | 2 | 1 | unbounded | 6 | 0.5 | `[1,1]` |
| fill-the-pipe | 2 | 3 | unbounded | 12 | 0.25 | `[3,3]` |
| backward-is-heavier | 3 | 3 | unbounded | 15 | 0.4 | `[3,3,3]` |
| memory-wall | 3 | 4 | `[3,2,1]` | 18 | 1/3 | `[3,2,1]` |

These values are executable contracts, not prose estimates.

### Task 1: Bootstrap the strict React/Vite test surface

**Files:**
- Create: `package.json`
- Create: `package-lock.json`
- Create: `index.html`
- Create: `vite.config.ts`
- Create: `tsconfig.json`
- Create: `tsconfig.app.json`
- Create: `tsconfig.node.json`
- Create: `eslint.config.js`
- Create: `.prettierrc.json`
- Create: `.prettierignore`
- Create: `src/main.tsx`
- Create: `src/app/App.test.tsx`
- Create: `src/app/App.tsx`
- Create: `src/test/setup.ts`

- [ ] **Step 1: Create the pinned toolchain**

Create `package.json` with this exact public surface:

```json
{
  "name": "sensei-pipeline-game",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build && node scripts/generate-service-worker.mjs",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc -b --pretty false",
    "lint": "eslint .",
    "format:check": "prettier --check .",
    "verify": "npm run format:check && npm run lint && npm run typecheck && npm test && npm run build"
  },
  "dependencies": {
    "react": "19.2.8",
    "react-dom": "19.2.8"
  },
  "devDependencies": {
    "@testing-library/dom": "10.4.0",
    "@testing-library/react": "16.3.2",
    "@testing-library/jest-dom": "7.0.1",
    "@testing-library/user-event": "14.6.5",
    "@types/node": "26.2.0",
    "@types/react": "19.2.18",
    "@types/react-dom": "19.2.4",
    "@vitejs/plugin-react": "6.0.5",
    "axe-core": "4.13.0",
    "eslint": "10.8.1",
    "eslint-plugin-react-hooks": "7.1.1",
    "fast-check": "4.9.0",
    "globals": "17.11.0",
    "jsdom": "30.0.1",
    "prettier": "3.9.6",
    "typescript": "6.0.3",
    "typescript-eslint": "8.67.0",
    "vite": "8.2.1",
    "vitest": "4.1.11"
  }
}
```

Run `npm install`. Commit the generated `package-lock.json`; do not hand-edit it.
Configure `vite.config.ts` with React, `jsdom`, `src/test/setup.ts`, and test
includes `src/**/*.test.{ts,tsx}` plus `tests/**/*.{test,spec}.{ts,tsx,mjs}`. In
`src/test/setup.ts`, import `@testing-library/jest-dom/vitest`. Set all
three TypeScript configs to strict mode with `noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes`, and `noImplicitOverride`.

- [ ] **Step 2: Write the failing application-shell test**

```tsx
// src/app/App.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('App', () => {
  it('announces Sensei as a pipeline scheduling game', () => {
    render(<App />);
    expect(
      screen.getByRole('heading', { name: /sensei pipeline scheduling/i }),
    ).toBeTruthy();
  });
});
```

- [ ] **Step 3: Run the test and verify RED**

Run: `npm test -- src/app/App.test.tsx`

Expected: FAIL because `./App` does not exist.

- [ ] **Step 4: Implement the minimum shell**

```tsx
// src/app/App.tsx
export function App() {
  return (
    <main>
      <h1>Sensei Pipeline Scheduling</h1>
      <p>Correct first. Efficient next.</p>
    </main>
  );
}
```

`src/main.tsx` must create a React root under `#root`; `index.html` must contain
only the metadata, `#root`, and the module entry.

- [ ] **Step 5: Run the bootstrap gates**

Run: `npm test -- src/app/App.test.tsx && npm run typecheck && npm run lint`

Expected: all commands PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json index.html vite.config.ts tsconfig*.json \
  eslint.config.js .prettierrc.json src/main.tsx src/app src/test
git commit -m "build: bootstrap sensei web app"
```

### Task 2: Define and validate the scheduling domain

**Files:**
- Create: `src/engine/types.ts`
- Create: `src/engine/config.ts`
- Create: `src/engine/config.test.ts`
- Create: `src/engine/operations.ts`
- Create: `src/engine/operations.test.ts`
- Create: `src/test/factories.ts`

- [ ] **Step 1: Write failing config and dependency tests**

```ts
import { describe, expect, it } from 'vitest';
import { validateLevelConfig } from './config';
import { deriveOperations, predecessorsOf } from './operations';
import type { LevelConfig } from './types';

const config = makeConfig();

describe('level configuration', () => {
  it('requires one logical stage per rank in V1', () => {
    expect(() => validateLevelConfig({ ...config, stageCount: 3 })).toThrow(
      /stageCount must equal rankCount/,
    );
  });
});

describe('operation inventory', () => {
  it('derives F=1 and B=2 operations and the forward/backward DAG', () => {
    const operations = deriveOperations(config);
    expect(operations.map((op) => [op.id, op.rank, op.duration])).toEqual([
      ['F:0:0', 0, 1], ['B:0:0', 0, 2],
      ['F:1:0', 1, 1], ['B:1:0', 1, 2],
    ]);
    expect(predecessorsOf('F:1:0', config)).toEqual(['F:0:0']);
    expect(predecessorsOf('B:1:0', config)).toEqual(['F:1:0']);
    expect(predecessorsOf('B:0:0', config)).toEqual(['F:0:0', 'B:1:0']);
  });
});
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- src/engine/config.test.ts src/engine/operations.test.ts`

Expected: FAIL because the engine modules do not exist.

- [ ] **Step 3: Implement branded domain types and configuration validation**

`types.ts` must define these discriminated unions and fields exactly:

```ts
export type OperationKind = 'F' | 'B';
export type OperationId = `${OperationKind}:${number}:${number}`;
export interface Operation {
  id: OperationId;
  kind: OperationKind;
  stage: number;
  rank: number;
  microbatch: number;
  duration: number;
}
export interface PlaceOperationAction { type: 'place'; operationId: OperationId }
export interface InsertIdleAction { type: 'wait'; rank: number }
export type Action = PlaceOperationAction | InsertIdleAction;
export interface MasteryTarget {
  metric: 'makespan' | 'bubbleRatio' | 'intentionalIdle' | 'peakActivationMemory';
  op: '<=';
  value: number;
}
export interface LevelConfig {
  id: string; version: number; title: string; rankCount: number; stageCount: number;
  microbatchCount: number; durations: Record<OperationKind, number>;
  memoryCaps: readonly number[] | null; masteryTargets: readonly MasteryTarget[];
  coaching: { readySet: boolean; suggest: boolean; auto: boolean };
}
```

`validateLevelConfig` must reject non-positive counts/durations,
`stageCount !== rankCount`, a cap vector of the wrong length, and caps below one.
`deriveOperations` must order by stage, then `F` before `B`, then microbatch.
`predecessorsOf` must implement the three dependency rules in the design.
Create the shared helpers at the same time:

```ts
export function makeConfig(overrides: Partial<LevelConfig> = {}): LevelConfig {
  return {
    id: 'test', version: 1, title: 'Test', rankCount: 2, stageCount: 2,
    microbatchCount: 1, durations: { F: 1, B: 2 }, memoryCaps: null,
    masteryTargets: [],
    coaching: { readySet: true, suggest: false, auto: false },
    ...overrides,
  };
}

export function placeIds(...operationIds: OperationId[]): PlaceOperationAction[] {
  return operationIds.map((operationId) => ({ type: 'place', operationId }));
}
```

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- src/engine/config.test.ts src/engine/operations.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/types.ts src/engine/config.ts src/engine/config.test.ts \
  src/engine/operations.ts src/engine/operations.test.ts src/test/factories.ts
git commit -m "feat: define pipeline scheduling domain"
```

### Task 3: Implement immutable replay, legality, gaps, and memory

**Files:**
- Create: `src/engine/replay.ts`
- Create: `src/engine/replay.test.ts`
- Modify: `src/test/factories.ts`

- [ ] **Step 1: Write failing replay tests**

At the top of the test file, define `const config = makeConfig()`. The test
contains one exact happy path plus each typed blocker:

```ts
it('replays the dependency chain with a dependency-forced gap', () => {
  const result = replay(config, [
    { type: 'place', operationId: 'F:0:0' },
    { type: 'place', operationId: 'F:1:0' },
    { type: 'place', operationId: 'B:1:0' },
    { type: 'place', operationId: 'B:0:0' },
  ]);
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.state.placements.map((p) => [p.operationId, p.start, p.end])).toEqual([
    ['F:0:0', 0, 1], ['F:1:0', 1, 2], ['B:1:0', 2, 4], ['B:0:0', 4, 6],
  ]);
  expect(result.state.gaps).toContainEqual({ rank: 0, start: 1, end: 4, kind: 'dependency-forced' });
});

it('keeps missing dependencies inspectable', () => {
  const state = initialState(config);
  expect(classifyOperation(state, 'B:0:0')).toMatchObject({
    status: 'blocked',
    reasons: expect.arrayContaining([
      { kind: 'dependency-not-finished', operationId: 'F:0:0' },
    ]),
  });
});

it('blocks a forward whose completion would exceed its rank cap', () => {
  const capped = { ...config, microbatchCount: 3, memoryCaps: [2, 2] };
  const state = expectState(replay(capped, [
    { type: 'place', operationId: 'F:0:0' },
    { type: 'place', operationId: 'F:0:1' },
  ]));
  expect(classifyOperation(state, 'F:0:2')).toMatchObject({
    status: 'blocked', reasons: [{ kind: 'memory-cap', rank: 0, resident: 2, requested: 1, cap: 2 }],
  });
});

it('records one intentional tick per wait action', () => {
  const state = expectState(replay(config, [{ type: 'wait', rank: 0 }]));
  expect(state.rankFrontiers).toEqual([1, 0]);
  expect(state.gaps).toEqual([{ rank: 0, start: 0, end: 1, kind: 'intentional' }]);
});
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- src/engine/replay.test.ts`

Expected: FAIL because replay is undefined.

- [ ] **Step 3: Implement the immutable transition API**

Expose exactly:

```ts
export interface Placement {
  operationId: OperationId; rank: number; start: number; end: number;
}
export interface Gap {
  rank: number; start: number; end: number;
  kind: 'dependency-forced' | 'intentional';
}
export type BlockReason =
  | { kind: 'already-placed'; operationId: OperationId }
  | { kind: 'dependency-not-finished'; operationId: OperationId }
  | { kind: 'memory-cap'; rank: number; resident: number; requested: 1; cap: number }
  | { kind: 'invalid-rank'; rank: number };
export type MoveClassification =
  | { status: 'legal'; operation: Operation; earliestStart: number; projectedMemory: number }
  | { status: 'blocked'; operation: Operation; reasons: readonly BlockReason[] }
  | { status: 'completed'; operation: Operation; placement: Placement };
export interface ScheduleState {
  config: LevelConfig; operations: readonly Operation[]; placements: readonly Placement[];
  placementById: Readonly<Partial<Record<OperationId, Placement>>>;
  rankFrontiers: readonly number[]; currentMemory: readonly number[];
  peakMemory: readonly number[]; gaps: readonly Gap[]; actions: readonly Action[];
}
export type ApplyResult =
  | { ok: true; state: ScheduleState }
  | { ok: false; action: Action; reason: BlockReason };
export type ReplayResult =
  | { ok: true; state: ScheduleState }
  | { ok: false; index: number; action: Action; reason: BlockReason };

export function initialState(config: LevelConfig): ScheduleState;
export function classifyOperation(state: ScheduleState, id: OperationId): MoveClassification;
export function classifyMoves(state: ScheduleState): readonly MoveClassification[];
export function applyAction(state: ScheduleState, action: Action): ApplyResult;
export function replay(config: LevelConfig, actions: readonly Action[]): ReplayResult;
```

Use this placement algorithm in `applyAction`:

```ts
const start = Math.max(
  state.rankFrontiers[operation.rank]!,
  ...predecessors.map((id) => state.placementById[id]!.end),
);
const end = start + operation.duration;
```

For `F`, compute resident activations from unmatched placed forwards on the same
rank; because the rank is serial, that is the exact resident count immediately
before this forward completes. Reject when `resident + 1 > cap`.
For `B`, remove only its matching `(stage,microbatch)` activation at completion.
Replay must stop at the first bad action and return `{ ok:false, index, reason }`.
No ordinary blocked result may throw or mutate its input. Deadlock is
`incomplete && legalMoves.length === 0`; classify it as memory-caused when any
dependency-ready operation has a `memory-cap` reason.
Extend `src/test/factories.ts` with:

```ts
export function expectState(result: ReplayResult): ScheduleState {
  if (!result.ok) {
    throw new Error(`replay failed at action ${result.index}: ${result.reason.kind}`);
  }
  return result.state;
}
```

- [ ] **Step 4: Verify GREEN and immutability**

Run: `npm test -- src/engine/replay.test.ts`

Expected: PASS, including an assertion that the pre-apply state deep-equals a
snapshot after both accepted and rejected actions.

- [ ] **Step 5: Commit**

```bash
git add src/engine/replay.ts src/engine/replay.test.ts src/test/factories.ts
git commit -m "feat: add deterministic schedule replay"
```

### Task 4: Add scoring, mastery, ranking, and properties

**Files:**
- Create: `src/engine/score.ts`
- Create: `src/engine/score.test.ts`
- Create: `src/engine/properties.test.ts`

- [ ] **Step 1: Write failing score examples**

```ts
it('scores the mastered dependency chain', () => {
  const config = makeConfig({
    masteryTargets: [
      { metric: 'makespan', op: '<=', value: 6 },
      { metric: 'intentionalIdle', op: '<=', value: 0 },
    ],
  });
  const state = expectState(replay(config, [
    { type: 'place', operationId: 'F:0:0' },
    { type: 'place', operationId: 'F:1:0' },
    { type: 'place', operationId: 'B:1:0' },
    { type: 'place', operationId: 'B:0:0' },
  ]));
  expect(score(state)).toEqual({
    makespan: 6, totalWork: 6, capacity: 12, bubbleRatio: 0.5,
    intentionalIdle: 0, peakActivationMemoryByRank: [1, 1],
    peakActivationMemory: 1, complete: true, mastered: true,
  });
});

it('ranks attempts lexicographically without a hidden aggregate', () => {
  expect(compareAttempts(
    { makespan: 18, peakActivationMemory: 3, intentionalIdle: 0, actionCount: 24 },
    { makespan: 19, peakActivationMemory: 1, intentionalIdle: 0, actionCount: 24 },
  )).toBeLessThan(0);
});
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- src/engine/score.test.ts`

Expected: FAIL because `score` and `compareAttempts` do not exist.

- [ ] **Step 3: Implement exact accounting**

Implement the formulas from the spec. `compareAttempts` compares, in order,
`makespan`, `peakActivationMemory`, `intentionalIdle`, and `actionCount`; lower
wins. Mastery is true only for a complete schedule satisfying every configured
target. Return the tuple for UI display. For an in-progress state, `totalWork` is
the sum of placed operation durations and `capacity` is
`rankCount * max(rankFrontiers)`; define empty-state `bubbleRatio` as zero. For a
complete state, `totalWork` therefore equals the full operation inventory.

- [ ] **Step 4: Add bounded property tests**

Use `fast-check` to generate `rankCount` 1–4, `microbatchCount` 1–4, optional caps
1–4, and legal prefixes selected from the current ready set. Assert:

```ts
export const legalReplayArbitrary = fc.record({
  rankCount: fc.integer({ min: 1, max: 4 }),
  microbatchCount: fc.integer({ min: 1, max: 4 }),
  cap: fc.option(fc.integer({ min: 1, max: 4 }), { nil: null }),
  choices: fc.array(fc.nat(), { maxLength: 64 }),
}).map(({ rankCount, microbatchCount, cap, choices }) => {
  const config = makeConfig({
    rankCount, stageCount: rankCount, microbatchCount,
    memoryCaps: cap === null ? null : Array(rankCount).fill(cap),
  });
  const actions: Action[] = [];
  let state = initialState(config);
  for (const choice of choices) {
    const legal = classifyMoves(state).filter(
      (move): move is Extract<MoveClassification, { status: 'legal' }> =>
        move.status === 'legal',
    );
    if (legal.length === 0) break;
    const selected = legal[choice % legal.length]!;
    const action: Action = { type: 'place', operationId: selected.operation.id };
    const result = applyAction(state, action);
    if (!result.ok) throw new Error('classified legal move was rejected');
    actions.push(action);
    state = result.state;
  }
  return { config, actions };
});

fc.assert(fc.property(legalReplayArbitrary, ({ config, actions }) => {
  const first = replay(config, actions);
  const second = replay(config, actions);
  expect(second).toEqual(first);
  if (!first.ok) return;
  expect(first.state.currentMemory.every((n, rank) =>
    config.memoryCaps === null || n <= config.memoryCaps[rank]!,
  )).toBe(true);
  const result = score(first.state);
  expect(result.bubbleRatio).toBeGreaterThanOrEqual(0);
  expect(result.bubbleRatio).toBeLessThanOrEqual(1);
  expect(result.totalWork).toBeLessThanOrEqual(result.capacity);
}));
```

Keep `legalReplayArbitrary` in `src/test/factories.ts` so Task 6 can extend it.

Also assert undo/redo prefix equality and that completed schedules contain every
operation exactly once. Fix the random seed in failure output, not in generation.

- [ ] **Step 5: Run engine tests**

Run: `npm test -- src/engine && npm run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/engine/score.ts src/engine/score.test.ts src/engine/properties.test.ts
git commit -m "feat: score and verify schedule attempts"
```

### Task 5: Encode four original levels and golden replays

**Files:**
- Create: `src/levels/levels.ts`
- Create: `src/levels/fixtures.ts`
- Create: `src/levels/levels.test.ts`

- [ ] **Step 1: Write the failing golden test table**

```ts
it.each([
  ['dependency-chain', 6, 0.5, [1, 1]],
  ['fill-the-pipe', 12, 0.25, [3, 3]],
  ['backward-is-heavier', 15, 0.4, [3, 3, 3]],
  ['memory-wall', 18, 1 / 3, [3, 2, 1]],
] as const)('%s mastered replay is stable', (id, makespan, bubble, peaks) => {
  const level = getLevel(id);
  const state = expectState(replay(level, MASTERED_ACTIONS[id]));
  const result = score(state);
  expect(result.complete).toBe(true);
  expect(result.mastered).toBe(true);
  expect(result.makespan).toBe(makespan);
  expect(result.bubbleRatio).toBeCloseTo(bubble, 10);
  expect(result.peakActivationMemoryByRank).toEqual(peaks);
});
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- src/levels/levels.test.ts`

Expected: FAIL because levels and fixtures are absent.

- [ ] **Step 3: Define the four configurations**

Use rank/microbatch/cap values from the golden table. All levels use
`durations:{F:1,B:2}` and version `1`. Set mastery targets to the table's
makespan plus `intentionalIdle <= 0`; Level 4 also uses
`peakActivationMemory <= 3`. Coaching unlocks are:

```ts
dependencyChain: { readySet: false, suggest: false, auto: false }
fillThePipe:      { readySet: true,  suggest: false, auto: false }
backwardHeavy:    { readySet: true,  suggest: true,  auto: false }
memoryWall:       { readySet: true,  suggest: true,  auto: true  }
```

Define the public level identity and lookup surface exactly:

```ts
export const LEVEL_IDS = [
  'dependency-chain', 'fill-the-pipe', 'backward-is-heavier', 'memory-wall',
] as const;
export type LevelId = (typeof LEVEL_IDS)[number];
export function getLevel(id: LevelId): LevelConfig;
```

- [ ] **Step 4: Add original golden action logs**

The mastered logs are exactly:

```ts
export const MASTERED_ACTIONS = {
  'dependency-chain': placeIds(
    'F:0:0', 'F:1:0', 'B:1:0', 'B:0:0',
  ),
  'fill-the-pipe': placeIds(
    'F:0:0', 'F:0:1', 'F:0:2',
    'F:1:0', 'F:1:1', 'F:1:2',
    'B:1:0', 'B:0:0', 'B:1:1', 'B:0:1', 'B:1:2', 'B:0:2',
  ),
  'backward-is-heavier': placeIds(
    'F:0:0', 'F:0:1', 'F:0:2',
    'F:1:0', 'F:1:1', 'F:1:2',
    'F:2:0', 'F:2:1', 'F:2:2',
    'B:2:0', 'B:1:0', 'B:0:0',
    'B:2:1', 'B:1:1', 'B:0:1',
    'B:2:2', 'B:1:2', 'B:0:2',
  ),
  'memory-wall': placeIds(
    'F:0:0', 'F:0:1', 'F:0:2', 'F:1:0', 'F:1:1', 'F:2:0',
    'B:2:0', 'B:1:0', 'B:0:0', 'F:0:3', 'F:1:2', 'F:2:1',
    'B:2:1', 'B:1:1', 'B:0:1', 'F:1:3', 'F:2:2', 'B:2:2',
    'B:1:2', 'B:0:2', 'F:2:3', 'B:2:3', 'B:1:3', 'B:0:3',
  ),
} satisfies Record<LevelId, readonly Action[]>;
```

Define each legal non-mastered fixture by prepending exactly one wait on rank 0
to its mastered log:

```ts
export const LEGAL_ACTIONS = Object.fromEntries(
  Object.entries(MASTERED_ACTIONS).map(([id, actions]) => [
    id,
    [{ type: 'wait', rank: 0 } as const, ...actions],
  ]),
) as Record<LevelId, readonly Action[]>;
```

Assert those fixtures complete legally, increase makespan by one, record one
intentional-idle tick, and miss at least the makespan/idle mastery target.

- [ ] **Step 5: Run golden and full engine tests**

Run: `npm test -- src/levels src/engine`

Expected: PASS with all four exact metric rows.

- [ ] **Step 6: Commit**

```bash
git add src/levels
git commit -m "feat: add four pipeline learning levels"
```

### Task 6: Implement causal coaching and bounded automation

**Files:**
- Create: `src/coaching/coaching.ts`
- Create: `src/coaching/coaching.test.ts`

- [ ] **Step 1: Write failing coaching tests**

Build each state with `replay` from the already-defined levels and test the exact
boundary order:

```ts
it('stops when two legal operations share minimum earliestStart', () => {
  const state = expectState(replay(getLevel('fill-the-pipe'), placeIds(
    'F:0:0', 'F:0:1', 'F:0:2', 'F:1:0',
  )));
  expect(runUntilInteresting(state)).toEqual({
    state, applied: [], stop: {
      kind: 'choice', operationIds: ['B:1:0', 'F:1:1'], earliestStart: 2,
    },
  });
});

it('stops before a dependency-forced gap', () => {
  const state = expectState(replay(getLevel('dependency-chain'), placeIds('F:0:0')));
  expect(runUntilInteresting(state).stop).toMatchObject({
    kind: 'dependency-gap', operationId: 'F:1:0', start: 1, rankFrontier: 0,
  });
});

it('stops when a dependency-ready operation is memory-blocked', () => {
  const state = expectState(replay(getLevel('memory-wall'), placeIds(
    'F:0:0', 'F:0:1', 'F:0:2',
  )));
  expect(runUntilInteresting(state).stop).toMatchObject({
    kind: 'memory-boundary', operationIds: ['F:0:3'],
  });
});

it('never suggests a blocked move', () => {
  const state = expectState(replay(getLevel('fill-the-pipe'), placeIds(
    'F:0:0', 'F:0:1', 'F:1:0',
  )));
  const suggestion = suggestMove(state);
  expect(suggestion).not.toBeNull();
  if (suggestion === null) return;
  expect(classifyOperation(state, suggestion.operationId).status).toBe('legal');
});
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- src/coaching/coaching.test.ts`

Expected: FAIL because coaching is absent.

- [ ] **Step 3: Implement coaching from typed engine results**

Expose `explainBlockedMove`, `revealReadySet`, `suggestMove`, and
`runUntilInteresting`. Sort candidates by `earliestStart`, then operation ID for
stable presentation. Automation may apply only when one legal operation owns the
minimum earliest start, starts at its rank frontier, no dependency-ready move is
memory-blocked, and it will not complete the schedule. Each loop removes one
operation, so cap iterations at the initial remaining-operation count. Return
typed stop reasons: `choice`, `dependency-gap`, `memory-boundary`,
`would-complete`, `memory-deadlock`, or `deadlock`. The last two are defensive
diagnostics for an incomplete no-legal-move state; do not construct such a state
by bypassing valid configuration/replay invariants merely to reach a branch.

- [ ] **Step 4: Run coaching and property tests**

Run: `npm test -- src/coaching src/engine/properties.test.ts`

Expected: PASS. Add this property to `src/engine/properties.test.ts`:

```ts
fc.assert(fc.property(legalReplayArbitrary, ({ config, actions }) => {
  let cursor = expectState(replay(config, actions));
  const automated = runUntilInteresting(cursor);
  for (const action of automated.applied) {
    const move = classifyOperation(cursor, action.operationId);
    expect(move.status).toBe('legal');
    cursor = expectApplied(applyAction(cursor, action));
  }
}));
```

Add `expectApplied(result: ApplyResult): ScheduleState` beside `expectState` in
`src/test/factories.ts`; it throws with `result.reason.kind` when `ok` is false.

- [ ] **Step 5: Commit**

```bash
git add src/coaching src/engine/properties.test.ts
git commit -m "feat: add progressive schedule coaching"
```

### Task 7: Add versioned replay and best-attempt persistence

**Files:**
- Create: `src/persistence/codec.ts`
- Create: `src/persistence/storage.ts`
- Create: `tests/persistence.test.ts`

- [ ] **Step 1: Write failing persistence tests**

```ts
const actions = MASTERED_ACTIONS['dependency-chain'];
const bestAttempt: StoredAttempt = {
  levelId: 'dependency-chain', levelVersion: 1, actions,
  outcome: 'mastered',
  tuple: { makespan: 6, peakActivationMemory: 1, intentionalIdle: 0, actionCount: 4 },
};

it('decodes only matching level versions and replays truth', () => {
  const encoded = encodeAttempt({ schemaVersion: 1, levelId: 'dependency-chain', levelVersion: 1, actions });
  expect(decodeAttempt(encoded, getLevel)).toMatchObject({ ok: true, attempt: { actions } });
  const historical = encodeAttempt({ schemaVersion: 1, levelId: 'dependency-chain', levelVersion: 0, actions });
  expect(decodeAttempt(historical, getLevel)).toMatchObject({
    ok: false, reason: 'historical-level-version',
  });
});

it('does not let a bad URL overwrite good local progress', () => {
  const storage = memoryStorageWith(bestAttempt);
  loadProgress(storage, '#attempt=malformed');
  expect(readStoredProgress(storage)).toEqual(bestAttempt);
});

it('uses makespan, memory, idle, then action count for best', () => {
  const fastHighMemory = {
    ...bestAttempt,
    tuple: { makespan: 18, peakActivationMemory: 3, intentionalIdle: 0, actionCount: 24 },
  };
  const slowLowMemory = {
    ...bestAttempt,
    tuple: { makespan: 19, peakActivationMemory: 1, intentionalIdle: 0, actionCount: 24 },
  };
  expect(selectBest([fastHighMemory, slowLowMemory])).toEqual(fastHighMemory);
});
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- tests/persistence.test.ts`

Expected: FAIL because codec/storage modules are missing.

- [ ] **Step 3: Implement strict decoding and storage quarantine**

The encoded payload contains only schema version, level ID/version, and actions;
outcomes and scores are recomputed by replay. Use `encodeURIComponent` over a
compact JSON object, enforce exact keys and primitive types, and cap decoded
actions at the level's operation count plus 1,000 wait ticks. Mismatched level
versions return `historical-level-version` and remain exportable but unranked.
Storage writes use `sensei.progress.v1`; catch storage exceptions and return
`session-only` without throwing.

Define `StoredAttempt` with the fields shown in Step 1 and `Progress` as unlocked
level IDs plus optional best legal/mastered attempts per level. In the test,
`memoryStorageWith` returns this standards-compatible implementation:

```ts
function memoryStorageWith(attempt: StoredAttempt): Storage {
  const values = new Map<string, string>([[
    'sensei.progress.v1',
    JSON.stringify(progressContaining(attempt)),
  ]]);
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, value); },
  };
}
```

`progressContaining` returns level 1 unlocked with `attempt` in both the legal
and mastered slots when its outcome is mastered.

- [ ] **Step 4: Run persistence tests**

Run: `npm test -- tests/persistence.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/persistence tests/persistence.test.ts
git commit -m "feat: persist versioned schedule attempts"
```

### Task 8: Build the accessible game shell and operation workflow

**Files:**
- Create: `src/app/useGame.ts`
- Modify: `src/app/App.tsx`
- Create: `src/components/OperationTray.tsx`
- Create: `src/components/ScheduleBoard.tsx`
- Create: `src/components/MoveInspector.tsx`
- Create: `src/components/MetricsPanel.tsx`
- Create: `src/components/GameControls.tsx`
- Create: `src/components/GameShell.test.tsx`
- Create: `src/styles/app.css`
- Modify: `src/main.tsx`

- [ ] **Step 1: Write failing interaction tests**

```tsx
it('keeps blocked operations focusable and explains every blocker', async () => {
  const user = userEvent.setup();
  render(<App initialLevelId="dependency-chain" />);
  await user.click(screen.getByRole('button', { name: /place B stage 0 microbatch 0/i }));
  const blocked = screen.getByRole('button', {
    name: /place B stage 0 microbatch 0/i,
  });
  expect(blocked).toHaveAttribute('aria-disabled', 'true');
  expect(screen.getByRole('status')).toHaveTextContent(/waiting for F stage 0/i);
});

it('renders backward at twice the forward width', () => {
  render(<App initialLevelId="dependency-chain" />);
  expect(screen.getByTestId('tile-F:0:0')).toHaveAttribute('data-duration', '1');
  expect(screen.getByTestId('tile-B:0:0')).toHaveAttribute('data-duration', '2');
});

it('plays level one with keyboard commands only', async () => {
  const user = userEvent.setup();
  render(<App initialLevelId="dependency-chain" />);
  for (const name of ['F stage 0', 'F stage 1', 'B stage 1', 'B stage 0']) {
    await tabUntil(user, screen.getByRole('button', { name: new RegExp(name, 'i') }));
    await user.keyboard('{Enter}');
  }
  expect(screen.getByText(/legal completion/i)).toBeTruthy();
  expect(screen.getByText(/mastered/i)).toBeTruthy();
});
```

Implement a small `tabUntil` helper in the test rather than extending production
code. Use the jest-dom matchers loaded by `src/test/setup.ts`.

```ts
async function tabUntil(
  user: ReturnType<typeof userEvent.setup>,
  target: HTMLElement,
): Promise<void> {
  for (let index = 0; index < 100; index += 1) {
    if (document.activeElement === target) return;
    await user.tab();
  }
  throw new Error(
    `could not focus ${target.getAttribute('aria-label') ?? target.textContent}`,
  );
}
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- src/components/GameShell.test.tsx`

Expected: FAIL because components and orchestration are absent.

- [ ] **Step 3: Implement replay-owned game state**

`useGame` stores only `levelId`, `actions`, `cursor`, selected operation, and UI
overlay state. Derive `ScheduleState` with `replay(level, actions.slice(0,cursor))`.
New commands truncate redo actions before appending. Never store placements,
scores, readiness, or memory independently.

- [ ] **Step 4: Implement the five stable regions**

Use native buttons in the operation tray. Blocked buttons use
`aria-disabled="true"` but intercept activation to select and explain rather
than becoming unfocusable. `ScheduleBoard` renders SVG rectangles using
`x = start * cellWidth` and `width = duration * cellWidth`, with text/pattern
redundancy and an adjacent HTML description list. `GameControls` exposes per-rank
wait-one-tick, undo/redo, hint, bounded automation, and reset. `MetricsPanel`
shows formulas and the lexicographic best tuple.

- [ ] **Step 5: Add original technical-tabletop CSS**

Define tokens under `:root` for warm paper, ink, rust, teal, gold, and dark
diagnostic surfaces. At `max-width: 900px`, stack the inspector below the board;
keep the SVG in a labeled horizontal scroll region. Add `:focus-visible`,
high-contrast pattern strokes, and `prefers-reduced-motion: reduce`. Do not copy
upstream selectors, layout, colors, or typography.

- [ ] **Step 6: Run UI gates**

Run: `npm test -- src/components && npm run typecheck && npm run lint`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/app src/components src/styles src/main.tsx
git commit -m "feat: build accessible scheduling tabletop"
```

### Task 9: Connect progression, coaching, persistence, and all four levels

**Files:**
- Modify: `src/app/useGame.ts`
- Modify: `src/app/App.tsx`
- Modify: `src/components/GameControls.tsx`
- Create: `tests/game-flow.test.tsx`
- Create: `tests/accessibility.test.tsx`

- [ ] **Step 1: Write failing four-level flow tests**

For each level, replay both fixture action logs through the same public commands
used by pointer/keyboard UI. Assert legal completion unlocks the next level,
mastery is optional for unlocking, best tuples persist, and coaching controls
match the level capability. Add an axe-core test:

```tsx
it('has no serious or critical axe violations', async () => {
  const { container } = render(<App initialLevelId="memory-wall" />);
  const results = await axe.run(container, { resultTypes: ['violations'] });
  expect(results.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''))).toEqual([]);
});
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- tests/game-flow.test.tsx tests/accessibility.test.tsx`

Expected: FAIL because progress/coaching/storage are not wired.

- [ ] **Step 3: Wire progress and coaching without duplicating truth**

On every accepted action, derive score; on completion, persist progress and the
best tuple through `storage.ts`. Show a non-blocking notice when storage falls
back to session-only. Hints call coaching APIs directly. Automation appends the
returned applied actions as one undoable batch while preserving the canonical
flat action log. Show all stop reasons in an `aria-live="polite"` region.

- [ ] **Step 4: Verify pointer and keyboard parity**

Run: `npm test -- tests/game-flow.test.tsx tests/accessibility.test.tsx`

Expected: PASS for four legal and four mastered fixture journeys, with identical
action logs for equivalent pointer and keyboard commands.

- [ ] **Step 5: Commit**

```bash
git add src/app src/components/GameControls.tsx tests/game-flow.test.tsx \
  tests/accessibility.test.tsx
git commit -m "feat: connect sensei learning progression"
```

### Task 10: Add native offline caching and failure recovery

**Files:**
- Create: `src/offline/register.ts`
- Create: `scripts/generate-service-worker.mjs`
- Create: `tests/offline.test.mjs`
- Modify: `src/main.tsx`
- Modify: `src/app/App.tsx`

- [ ] **Step 1: Write the failing generated-cache test**

Build to a temporary directory fixture and assert the generator writes `sw.js`
whose cache manifest contains `/`, `/index.html`, and every emitted JS/CSS asset,
uses a content digest in the cache name, calls `cache.addAll`, deletes only older
`sensei-shell-` caches after successful activation, and serves cached navigation
when fetch fails. Also assert registration errors return
`{status:'unavailable'}` rather than throwing.
Start `tests/offline.test.mjs` with `// @vitest-environment node` so filesystem
and subprocess assertions do not run under jsdom.

- [ ] **Step 2: Verify RED**

Run: `npm test -- tests/offline.test.mjs`

Expected: FAIL because generator and registration are absent.

- [ ] **Step 3: Implement build-derived atomic caching**

`generate-service-worker.mjs` reads `dist/index.html` and `dist/assets/`, hashes
their paths and contents, and writes a self-contained `dist/sw.js`. Install opens
the new digest cache and uses `addAll`; a rejection leaves the previous cache
untouched. Activate deletes other `sensei-shell-*` caches only after the new
cache exists. Fetch uses cache-first for hashed assets and network-first with
cached `/index.html` fallback for navigation.

- [ ] **Step 4: Wire visible registration status**

Register only in production and only when `serviceWorker` exists. Expose
`ready`, `unavailable`, or `unsupported`; render a non-blocking notice for the
latter two.

- [ ] **Step 5: Run build/offline tests**

Run: `npm run build && npm test -- tests/offline.test.mjs`

Expected: PASS; `dist/sw.js` references only current build assets.

- [ ] **Step 6: Commit**

```bash
git add src/offline src/main.tsx src/app/App.tsx scripts \
  tests/offline.test.mjs package.json package-lock.json
git commit -m "feat: support atomic offline play"
```

### Task 11: Document, audit, and run the release gate

**Files:**
- Create: `README.md`
- Create: `docs/clean-room-audit.md`
- Modify: `package.json` only if a verified release command is incorrect

- [ ] **Step 1: Write the reader and contributor guide**

`README.md` must include: product purpose; screenshot-free text walkthrough;
Node/npm prerequisites; `npm install`, `npm run dev`, and `npm run verify`; the
pure-engine architecture; four-level table; keyboard controls; offline behavior;
metric formulas; and attribution to the upstream inspiration with its pinned
commit and missing-license observation. State clearly that Sensei contains no
vendored upstream code or presentation assets.

- [ ] **Step 2: Record the clean-room receipt**

`docs/clean-room-audit.md` must list:

- permitted domain overlap: DAG dependencies, pipeline stages/microbatches,
  `F=1/B=2`, activation lifetime, legal-before-efficient curriculum;
- independently derived concrete choices: four level IDs/titles, topology,
  microbatch counts, caps, targets, action logs, prose, visual tokens, React
  structure, tests, and coaching stop predicate;
- prohibited and absent artifacts: upstream source, HTML/CSS, screenshots,
  fixtures, text, palettes, and assets; and
- reproducible audit commands: `rg` checks for upstream filenames/phrases,
  `git status`, and the full test/build gate.

Record these exact clean-room scans in the receipt:

```bash
rg -n 'run until strange|proposal ghost|BF-PP|ZeroPP|ZB-H[12]' src tests README.md
rg -n 'ezyang/pipeline-parallelism-tutor' src tests
git status --short
npm run verify
```

The first two commands must return no matches in product/test source. Attribution
is expected only in `README.md` and `docs/`.

- [ ] **Step 3: Run the complete release gate**

Run:

```bash
npm ci
npm run verify
git diff --check
git status --short
```

Expected: install from lockfile succeeds; format, lint, typecheck, all tests, and
production/offline build pass; no whitespace errors; only the intended README
and audit files remain uncommitted.

- [ ] **Step 4: Perform manual acceptance checks**

Run `npx vite preview --host 127.0.0.1 --port 4173`, open
`http://127.0.0.1:4173`, and verify at desktop, 764px, and 390px widths. Complete
all four levels once with pointer input and Level 1 with keyboard only. Confirm
blocked operations remain inspectable, `B` is twice `F`, Level 4 exposes a
memory-blocked move, legal completion unlocks without mastery, reduced motion
disables transitions, and a second load succeeds with the server stopped. Record
the checked date and browser in `docs/clean-room-audit.md`.

- [ ] **Step 5: Commit**

```bash
git add README.md docs/clean-room-audit.md package.json package-lock.json
git commit -m "docs: publish sensei game guide and audit"
```

- [ ] **Step 6: Final verification**

Run: `npm run verify && git status --short --branch`

Expected: all gates PASS and the worktree is clean.
