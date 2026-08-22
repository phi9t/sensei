# Sensei Current-Engine Curriculum Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the first full-curriculum slice: add algorithm metadata and playable GPipe/1F1B levels that the current `F/B` engine can enforce today.

**Architecture:** Keep the replay engine's V1 invariants unchanged: `F/B` only, one logical stage per rank, `F=1`, `B=2`, activation release on `B`. Add curriculum metadata to every level, add four new current-engine levels with original golden fixtures, and surface the metadata through the existing compact cockpit UI.

**Tech Stack:** React 19, TypeScript 6, Vite 8, SVG/HTML, Vitest 4, Testing Library, Prettier, ESLint.

---

## Scope Check

This plan implements Slice 1 from
`docs/superpowers/specs/2026-08-21-sensei-full-curriculum-implementation-design.md`.

It does not implement policy projection, strategy recognition, building-block
validation, virtual stages, split `W`, grouped policy mechanics, FSDP residency,
or DualPipe. Those require engine-model changes and get separate plans after
this slice lands.

Preserve these invariants:

- no visible long rules panel;
- visible operation codes stay in `F0:S0:B1` style;
- the notation key stays visible as `(F/B, stage_id, micro_batch_id)`;
- current persisted attempts for the original four levels still decode;
- level versions do not change for metadata-only edits to the original four
  levels;
- do not stage or edit the pre-existing untracked
  `src/components/PipelineLessonPanel.tsx`.

## File Map

- Modify `src/engine/types.ts`
  - Add `AlgorithmFamily` and `AlgorithmLevelMetadata`.
  - Require `algorithm` metadata on `LevelConfig`.

- Modify `src/levels/levels.ts`
  - Freeze nested algorithm metadata.
  - Add four current-engine levels:
    `gpipe-afab`, `warm-up-then-alternate`, `tie-at-the-frontier`,
    `memory-capped-one-f-one-b`.

- Modify `src/levels/fixtures.ts`
  - Add original mastered and legal action logs for the new levels.

- Modify `src/levels/levels.test.ts`
  - Lock catalog order, metadata, new golden scores, and fixture coverage.

- Modify `src/app/useGame.ts`
  - Carry set metadata in level picker options.
  - Keep unlock progression linear across the expanded catalog.

- Modify `src/components/LevelGuide.tsx`
  - Render metadata-driven set, concept, objective, and pattern chip.

- Modify `src/app/App.tsx`
  - Group the level selector by curriculum set using `<optgroup>`.

- Modify `src/components/GameShell.test.tsx`
  - Assert metadata-driven guide text, pattern chips, grouped selector options,
    and unlocked progression surface.

- Modify `tests/persistence.test.ts`
  - Assert old stored progress still decodes and new level IDs round-trip.

## New Level Contracts

Append these IDs after the existing four levels:

```ts
export const LEVEL_IDS = [
  'dependency-chain',
  'fill-the-pipe',
  'backward-is-heavier',
  'memory-wall',
  'gpipe-afab',
  'warm-up-then-alternate',
  'tie-at-the-frontier',
  'memory-capped-one-f-one-b',
] as const;
```

Use these original configs:

| Level                       | Set   | Pattern | Ranks | Microbatches | Cap         | Mastered makespan | Peak memory |
| --------------------------- | ----- | ------- | ----: | -----------: | ----------- | ----------------: | ----------: |
| `gpipe-afab`                | GPipe | AFAB    |     3 |            4 | none        |                18 |           4 |
| `warm-up-then-alternate`    | 1F1B  | 1F1B    |     3 |            4 | none        |                18 |           3 |
| `tie-at-the-frontier`       | 1F1B  | 1F1B    |     2 |            4 | none        |                15 |           2 |
| `memory-capped-one-f-one-b` | 1F1B  | 1F1B    |     3 |            5 | `[3, 2, 1]` |                21 |           3 |

## Task 1: Add Algorithm Metadata To The Level Type

**Files:**

- Modify: `src/engine/types.ts`
- Modify: `src/levels/levels.ts`
- Modify: `src/levels/levels.test.ts`

- [ ] **Step 1: Write the failing metadata test**

In `src/levels/levels.test.ts`, add this test inside
`describe('levels public API', () => { ... })`:

```ts
it('exports metadata for every current curriculum level', () => {
  for (const id of LEVEL_IDS) {
    const level = getLevel(id);

    expect(level.algorithm).toEqual(
      expect.objectContaining({
        family: expect.any(String),
        setTitle: expect.any(String),
        concept: expect.any(String),
        objective: expect.any(String),
        introducedModel: expect.any(Array),
      }),
    );
    expect(level.algorithm.setTitle.trim().length).toBeGreaterThan(0);
    expect(level.algorithm.concept.trim().length).toBeGreaterThan(0);
    expect(level.algorithm.objective.trim().length).toBeGreaterThan(0);
    expect(Object.isFrozen(level.algorithm)).toBe(true);
    expect(Object.isFrozen(level.algorithm.introducedModel)).toBe(true);
  }
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
npm test -- src/levels/levels.test.ts -t "exports metadata"
```

Expected: FAIL because `LevelConfig` does not have `algorithm`.

- [ ] **Step 3: Add metadata types**

In `src/engine/types.ts`, insert these definitions above `LevelConfig`:

```ts
export type AlgorithmFamily =
  | 'foundations'
  | 'gpipe'
  | 'one-f-one-b'
  | 'building-block'
  | 'interleaved-one-f-one-b'
  | 'zero-bubble'
  | 'grouped'
  | 'fsdp-residency'
  | 'dualpipe';

export interface AlgorithmLevelMetadata {
  readonly family: AlgorithmFamily;
  readonly setTitle: string;
  readonly concept: string;
  readonly objective: string;
  readonly patternLabel: string | null;
  readonly introducedModel: readonly string[];
}
```

Then add this field to `LevelConfig`:

```ts
algorithm: AlgorithmLevelMetadata;
```

- [ ] **Step 4: Freeze metadata in level configs**

In `src/levels/levels.ts`, update imports:

```ts
import type { AlgorithmLevelMetadata, LevelConfig, MasteryTarget } from '../engine/types';
```

Add this helper above `freezeLevel`:

```ts
function freezeAlgorithm(metadata: AlgorithmLevelMetadata): AlgorithmLevelMetadata {
  return Object.freeze({
    ...metadata,
    introducedModel: Object.freeze([...metadata.introducedModel]),
  });
}
```

In `freezeLevel`, add:

```ts
    algorithm: freezeAlgorithm(config.algorithm),
```

- [ ] **Step 5: Add metadata to existing four levels**

Add these `algorithm` fields without changing existing versions or scheduling
values. Add the same `algorithm` objects to the matching entries in
`EXPECTED_CONFIGS` inside `src/levels/levels.test.ts` so the exact-config test
continues to describe the public contract.

```ts
algorithm: {
  family: 'foundations',
  setTitle: 'Foundations',
  concept: 'Read the dependency chain before placing backward work.',
  objective: 'Finish the only microbatch without inserting idle.',
  patternLabel: null,
  introducedModel: ['forward dependency', 'backward dependency'],
},
```

```ts
algorithm: {
  family: 'foundations',
  setTitle: 'Foundations',
  concept: 'Place forward blocks to fill the pipeline before draining it.',
  objective: 'Overlap microbatches while keeping every move legal.',
  patternLabel: 'Fill/Drain',
  introducedModel: ['pipeline fill', 'pipeline drain', 'bubble'],
},
```

```ts
algorithm: {
  family: 'foundations',
  setTitle: 'Foundations',
  concept: 'Backward work is heavier, so the tail dominates sloppy schedules.',
  objective: 'Keep the heavier backward tail short.',
  patternLabel: 'F=1 B=2',
  introducedModel: ['duration asymmetry', 'critical tail'],
},
```

```ts
algorithm: {
  family: 'foundations',
  setTitle: 'Foundations',
  concept: 'Activation memory can block otherwise legal forward work.',
  objective: 'Respect per-rank memory caps without adding idle.',
  patternLabel: 'Memory cap',
  introducedModel: ['activation lifetime', 'memory admission'],
},
```

- [ ] **Step 6: Run the metadata test and typecheck**

Run:

```bash
npm test -- src/levels/levels.test.ts -t "exports metadata" && npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit Task 1**

```bash
git add src/engine/types.ts src/levels/levels.ts src/levels/levels.test.ts
git commit -m "feat: add curriculum metadata to levels"
```

## Task 2: Add Current-Engine Curriculum Levels And Fixtures

**Files:**

- Modify: `src/levels/levels.ts`
- Modify: `src/levels/fixtures.ts`
- Modify: `src/levels/levels.test.ts`

- [ ] **Step 1: Extend expected level IDs in tests**

In `src/levels/levels.test.ts`, replace `EXPECTED_LEVEL_IDS` with:

```ts
const EXPECTED_LEVEL_IDS = [
  'dependency-chain',
  'fill-the-pipe',
  'backward-is-heavier',
  'memory-wall',
  'gpipe-afab',
  'warm-up-then-alternate',
  'tie-at-the-frontier',
  'memory-capped-one-f-one-b',
] as const;
```

Add expected golden rows for the new levels:

```ts
'gpipe-afab': {
  makespan: 18,
  bubbleRatio: 1 / 3,
  peakActivationMemoryByRank: [4, 4, 4],
  peakActivationMemory: 4,
},
'warm-up-then-alternate': {
  makespan: 18,
  bubbleRatio: 1 / 3,
  peakActivationMemoryByRank: [3, 2, 1],
  peakActivationMemory: 3,
},
'tie-at-the-frontier': {
  makespan: 15,
  bubbleRatio: 0.2,
  peakActivationMemoryByRank: [2, 1],
  peakActivationMemory: 2,
},
'memory-capped-one-f-one-b': {
  makespan: 21,
  bubbleRatio: 2 / 7,
  peakActivationMemoryByRank: [3, 2, 1],
  peakActivationMemory: 3,
},
```

- [ ] **Step 2: Run the expanded catalog test and verify RED**

Run:

```bash
npm test -- src/levels/levels.test.ts -t "exports LEVEL_IDS"
```

Expected: FAIL because the new IDs are not exported.

- [ ] **Step 3: Add new level configs**

In `src/levels/levels.ts`, append the new IDs to `LEVEL_IDS`, then add these
entries to `LEVELS_BY_ID`:

```ts
'gpipe-afab': freezeLevel({
  id: 'gpipe-afab',
  version: 1,
  title: 'GPipe AFAB',
  rankCount: 3,
  stageCount: 3,
  microbatchCount: 4,
  durations: { F: 1, B: 2 },
  memoryCaps: null,
  masteryTargets: [
    { metric: 'makespan', op: '<=', value: 18 },
    { metric: 'intentionalIdle', op: '<=', value: 0 },
    { metric: 'peakActivationMemory', op: '<=', value: 4 },
  ],
  coaching: { readySet: true, suggest: true, auto: true },
  algorithm: {
    family: 'gpipe',
    setTitle: 'GPipe',
    concept: 'Run all forward work first, then drain all backward work.',
    objective: 'Build the AFAB shape and notice the activation memory it holds.',
    patternLabel: 'AFAB',
    introducedModel: ['all-forward/all-backward policy', 'activation accumulation'],
  },
}),
'warm-up-then-alternate': freezeLevel({
  id: 'warm-up-then-alternate',
  version: 1,
  title: 'Warm Up Then Alternate',
  rankCount: 3,
  stageCount: 3,
  microbatchCount: 4,
  durations: { F: 1, B: 2 },
  memoryCaps: null,
  masteryTargets: [
    { metric: 'makespan', op: '<=', value: 18 },
    { metric: 'intentionalIdle', op: '<=', value: 0 },
    { metric: 'peakActivationMemory', op: '<=', value: 3 },
  ],
  coaching: { readySet: true, suggest: true, auto: true },
  algorithm: {
    family: 'one-f-one-b',
    setTitle: '1F1B',
    concept: 'Warm up the pipe, then alternate backward and forward work.',
    objective: 'Match GPipe makespan while holding fewer activations.',
    patternLabel: '1F1B',
    introducedModel: ['warmup', 'steady alternation', 'memory reduction'],
  },
}),
'tie-at-the-frontier': freezeLevel({
  id: 'tie-at-the-frontier',
  version: 1,
  title: 'Tie at the Frontier',
  rankCount: 2,
  stageCount: 2,
  microbatchCount: 4,
  durations: { F: 1, B: 2 },
  memoryCaps: null,
  masteryTargets: [
    { metric: 'makespan', op: '<=', value: 15 },
    { metric: 'intentionalIdle', op: '<=', value: 0 },
    { metric: 'peakActivationMemory', op: '<=', value: 2 },
  ],
  coaching: { readySet: true, suggest: true, auto: true },
  algorithm: {
    family: 'one-f-one-b',
    setTitle: '1F1B',
    concept: 'When forward and backward are both ready, backward can protect memory.',
    objective: 'Choose the backward move at frontier ties.',
    patternLabel: '1F1B',
    introducedModel: ['ready-set tie', 'backward priority'],
  },
}),
'memory-capped-one-f-one-b': freezeLevel({
  id: 'memory-capped-one-f-one-b',
  version: 1,
  title: 'Memory-Capped 1F1B',
  rankCount: 3,
  stageCount: 3,
  microbatchCount: 5,
  durations: { F: 1, B: 2 },
  memoryCaps: [3, 2, 1],
  masteryTargets: [
    { metric: 'makespan', op: '<=', value: 21 },
    { metric: 'intentionalIdle', op: '<=', value: 0 },
    { metric: 'peakActivationMemory', op: '<=', value: 3 },
  ],
  coaching: { readySet: true, suggest: true, auto: true },
  algorithm: {
    family: 'one-f-one-b',
    setTitle: '1F1B',
    concept: 'Memory caps turn backward priority into an admission policy.',
    objective: 'Keep the 1F1B rhythm under a tight last-rank cap.',
    patternLabel: '1F1B + cap',
    introducedModel: ['memory-constrained 1F1B', 'admission pressure'],
  },
}),
```

Add matching entries to `EXPECTED_CONFIGS` in `src/levels/levels.test.ts`. Use
the same values as the level configs above, including the full `algorithm`
objects.

- [ ] **Step 4: Add mastered fixtures**

In `src/levels/fixtures.ts`, add these entries to `masteredActions`:

```ts
'gpipe-afab': placeIds(
  'F:0:0',
  'F:0:1',
  'F:0:2',
  'F:0:3',
  'F:1:0',
  'F:1:1',
  'F:1:2',
  'F:1:3',
  'F:2:0',
  'F:2:1',
  'F:2:2',
  'F:2:3',
  'B:2:0',
  'B:1:0',
  'B:0:0',
  'B:2:1',
  'B:1:1',
  'B:0:1',
  'B:2:2',
  'B:1:2',
  'B:0:2',
  'B:2:3',
  'B:1:3',
  'B:0:3',
),
'warm-up-then-alternate': placeIds(
  'F:0:0',
  'F:0:1',
  'F:0:2',
  'F:1:0',
  'F:1:1',
  'F:2:0',
  'B:2:0',
  'B:1:0',
  'B:0:0',
  'F:0:3',
  'F:1:2',
  'F:2:1',
  'B:2:1',
  'B:1:1',
  'B:0:1',
  'F:1:3',
  'F:2:2',
  'B:2:2',
  'B:1:2',
  'B:0:2',
  'F:2:3',
  'B:2:3',
  'B:1:3',
  'B:0:3',
),
'tie-at-the-frontier': placeIds(
  'F:0:0',
  'F:0:1',
  'F:1:0',
  'B:1:0',
  'B:0:0',
  'F:0:2',
  'F:1:1',
  'B:1:1',
  'B:0:1',
  'F:0:3',
  'F:1:2',
  'B:1:2',
  'B:0:2',
  'F:1:3',
  'B:1:3',
  'B:0:3',
),
'memory-capped-one-f-one-b': placeIds(
  'F:0:0',
  'F:0:1',
  'F:0:2',
  'F:1:0',
  'F:1:1',
  'F:2:0',
  'B:2:0',
  'B:1:0',
  'B:0:0',
  'F:0:3',
  'F:1:2',
  'F:2:1',
  'B:2:1',
  'B:1:1',
  'B:0:1',
  'F:0:4',
  'F:1:3',
  'F:2:2',
  'B:2:2',
  'B:1:2',
  'B:0:2',
  'F:1:4',
  'F:2:3',
  'B:2:3',
  'B:1:3',
  'B:0:3',
  'F:2:4',
  'B:2:4',
  'B:1:4',
  'B:0:4',
),
```

Add matching `legalActions` entries using `withLeadingWait` for each new level.

- [ ] **Step 5: Add expected mastered IDs to tests**

In `src/levels/levels.test.ts`, add the same four operation ID arrays to
`EXPECTED_MASTERED_IDS`. The arrays must contain only strings, in the same order
as the `placeIds` calls from Step 4.

- [ ] **Step 6: Run level fixture tests**

Run:

```bash
npm test -- src/levels/levels.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit Task 2**

```bash
git add src/levels/levels.ts src/levels/fixtures.ts src/levels/levels.test.ts
git commit -m "feat: add current-engine pipeline curriculum levels"
```

## Task 3: Preserve Progression And Persistence Compatibility

**Files:**

- Modify: `tests/persistence.test.ts`
- Modify: `src/app/useGame.ts`

- [ ] **Step 1: Add persistence compatibility tests**

In `tests/persistence.test.ts`, add these tests:

```ts
it('accepts old progress payloads that only mention the original four levels', () => {
  const oldProgress = {
    schemaVersion: 1,
    unlockedLevelIds: ['dependency-chain', 'fill-the-pipe', 'backward-is-heavier', 'memory-wall'],
    bestLegalAttempts: {},
    bestMasteredAttempts: {},
    historicalAttempts: [],
  };

  const decoded = deserializeProgress(JSON.stringify(oldProgress), getLevel);

  expect(decoded).toEqual({
    ok: true,
    progress: {
      unlockedLevelIds: ['dependency-chain', 'fill-the-pipe', 'backward-is-heavier', 'memory-wall'],
      bestLegalAttempts: {},
      bestMasteredAttempts: {},
      historicalAttempts: [],
    },
  });
});

it('round-trips attempts for the new current-engine curriculum levels', () => {
  for (const levelId of [
    'gpipe-afab',
    'warm-up-then-alternate',
    'tie-at-the-frontier',
    'memory-capped-one-f-one-b',
  ] as const) {
    const level = getLevel(levelId);
    const payload: UrlAttemptPayload = {
      schemaVersion: 1,
      levelId,
      levelVersion: level.version,
      actions: MASTERED_ACTIONS[levelId],
    };

    const decoded = decodeAttempt(encodeAttempt(payload), getLevel);

    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      expect(decoded.attempt.levelId).toBe(levelId);
      expect(decoded.attempt.outcome).toBe('mastered');
      expect(decoded.attempt.actions).toEqual(MASTERED_ACTIONS[levelId]);
    }
  }
});
```

- [ ] **Step 2: Run the persistence tests**

Run:

```bash
npm test -- tests/persistence.test.ts
```

Expected: PASS. If TypeScript fails because `LevelId` widened correctly, update
only the local type annotations in the new tests.

- [ ] **Step 3: Add set metadata to level options**

In `src/app/useGame.ts`, extend `LevelOptionState`:

```ts
export interface LevelOptionState {
  readonly levelId: LevelId;
  readonly title: string;
  readonly setTitle: string;
  readonly patternLabel: string | null;
  readonly unlocked: boolean;
  readonly reason: string | null;
}
```

Then update `levelOptions` to include metadata:

```ts
setTitle: getLevel(levelId).algorithm.setTitle,
patternLabel: getLevel(levelId).algorithm.patternLabel,
```

- [ ] **Step 4: Run focused typecheck and tests**

Run:

```bash
npm run typecheck && npm test -- tests/persistence.test.ts src/components/GameShell.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit Task 3**

```bash
git add tests/persistence.test.ts src/app/useGame.ts
git commit -m "test: preserve curriculum persistence compatibility"
```

## Task 4: Surface Curriculum Metadata In The Cockpit

**Files:**

- Modify: `src/components/LevelGuide.tsx`
- Modify: `src/app/App.tsx`
- Modify: `src/components/GameShell.test.tsx`

- [ ] **Step 1: Add failing cockpit metadata tests**

In `src/components/GameShell.test.tsx`, add:

```tsx
it('surfaces the current algorithm set and pattern without adding a rules panel', () => {
  render(<App initialLevelId="gpipe-afab" />);

  const guide = screen.getByRole('region', { name: /level guide/i });

  expect(within(guide).getByText(/^GPipe$/i)).toBeInTheDocument();
  expect(within(guide).getByRole('heading', { name: /^GPipe AFAB$/i })).toBeInTheDocument();
  expect(
    within(guide).getByText(/Run all forward work first, then drain all backward work/i),
  ).toBeInTheDocument();
  expect(within(guide).getByText(/^AFAB$/i)).toBeInTheDocument();
  expect(
    within(guide).getByText(/Build the AFAB shape and notice the activation memory it holds/i),
  ).toBeInTheDocument();
  expect(screen.queryByRole('region', { name: /pipeline rules/i })).not.toBeInTheDocument();
});

it('groups the level picker by curriculum set', () => {
  render(<App initialLevelId="dependency-chain" />);

  const picker = screen.getByRole('combobox', { name: /choose level/i });
  const groups = Array.from(picker.querySelectorAll('optgroup')).map((group) =>
    group.getAttribute('label'),
  );

  expect(groups).toEqual(['Foundations', 'GPipe', '1F1B']);
  expect(
    picker.querySelector('optgroup[label=\"1F1B\"] option[value=\"tie-at-the-frontier\"]'),
  ).not.toBeNull();
});
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
npm test -- src/components/GameShell.test.tsx -t "algorithm set|level picker"
```

Expected: FAIL because `LevelGuide` still uses switch-based copy and the picker
is not grouped.

- [ ] **Step 3: Replace `LevelGuide` copy logic with metadata**

In `src/components/LevelGuide.tsx`, remove `levelConcept`. Replace
`LevelGuide` with:

```tsx
export function LevelGuide({ level, score }: LevelGuideProps) {
  return (
    <section className="panel level-guide-panel" aria-label="Level guide">
      <div>
        <p className="panel-kicker">{level.algorithm.setTitle}</p>
        <h2 id="level-guide-heading">{level.title}</h2>
        <p className="level-guide-panel__copy">{level.algorithm.concept}</p>
      </div>
      <div className="level-guide-panel__chips" aria-label="Level progress summary">
        <span>{primaryGoal(level)}</span>
        {level.algorithm.patternLabel ? <span>{level.algorithm.patternLabel}</span> : null}
        <span>{level.algorithm.objective}</span>
        <span>{score.complete ? 'Complete' : 'In progress'}</span>
        <span>makespan {score.makespan}</span>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Group level picker options by set**

In `src/app/App.tsx`, update the `useGame` import:

```tsx
import { useGame, type LevelOptionState } from './useGame';
```

Add this helper above `App`:

```tsx
interface LevelOptionGroup {
  readonly setTitle: string;
  readonly options: readonly LevelOptionState[];
}

function groupLevelOptions(options: readonly LevelOptionState[]): readonly LevelOptionGroup[] {
  const groups: LevelOptionGroup[] = [];

  for (const option of options) {
    const last = groups.at(-1);
    if (last && last.setTitle === option.setTitle) {
      groups[groups.length - 1] = {
        setTitle: last.setTitle,
        options: Object.freeze([...last.options, option]),
      };
    } else {
      groups.push({
        setTitle: option.setTitle,
        options: Object.freeze([option]),
      });
    }
  }

  return Object.freeze(groups);
}
```

Replace the flat `<option>` mapping with:

```tsx
{
  groupLevelOptions(game.levelOptions).map((group) => (
    <optgroup key={group.setTitle} label={group.setTitle}>
      {group.options.map((option) => (
        <option key={option.levelId} value={option.levelId} disabled={!option.unlocked}>
          {option.patternLabel ? `${option.title} (${option.patternLabel})` : option.title}
        </option>
      ))}
    </optgroup>
  ));
}
```

- [ ] **Step 5: Run cockpit tests**

Run:

```bash
npm test -- src/components/GameShell.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit Task 4**

```bash
git add src/components/LevelGuide.tsx src/app/App.tsx src/components/GameShell.test.tsx
git commit -m "feat: surface curriculum metadata in cockpit"
```

## Task 5: Full Verification And Release Check

**Files:**

- No source edits unless a verification failure points to a defect from Tasks
  1-4.

- [ ] **Step 1: Run formatting**

Run:

```bash
npx prettier --write src/engine/types.ts src/levels/levels.ts src/levels/fixtures.ts src/levels/levels.test.ts src/app/useGame.ts src/components/LevelGuide.tsx src/app/App.tsx src/components/GameShell.test.tsx tests/persistence.test.ts
```

Expected: listed files are formatted.

- [ ] **Step 2: Run the full project gate**

Run:

```bash
npm run verify
```

Expected: PASS for format check, lint, typecheck, tests, and production build.

- [ ] **Step 3: Check staged and unstaged state**

Run:

```bash
git diff --check
git status --short --branch
```

Expected:

```text
branch is master
only src/components/PipelineLessonPanel.tsx remains untracked
```

If formatting changed tracked files after Task 4, commit only those files:

```bash
git add src/engine/types.ts src/levels/levels.ts src/levels/fixtures.ts src/levels/levels.test.ts src/app/useGame.ts src/components/LevelGuide.tsx src/app/App.tsx src/components/GameShell.test.tsx tests/persistence.test.ts
git commit -m "chore: format current-engine curriculum slice"
```

- [ ] **Step 4: Start the development server for review**

Run:

```bash
npm run dev -- --host 127.0.0.1
```

Expected: Vite prints a local URL. Share that URL in the final implementation
summary.

Do not leave the server running if the user asks for a terminal-only handoff.

## Self-Review Checklist

- Spec coverage: this plan covers Slice 1 from the full-curriculum design and
  leaves every engine-expansion slice for its own plan.
- Placeholders: there are no unresolved implementation markers in this plan.
- Type consistency: `AlgorithmLevelMetadata`, `LevelOptionState`, `LevelConfig`,
  `LEVEL_IDS`, and fixture keys use the same level IDs throughout.
- Clean-room: all level names, prose, targets, and action logs are original
  Sensei content.
- Persistence: old progress payloads remain valid because schema version and
  original level versions do not change.
