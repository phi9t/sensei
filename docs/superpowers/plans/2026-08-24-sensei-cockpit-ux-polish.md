# Sensei Cockpit UX Polish Implementation Plan

> **For agentic workers:** REQUIRED WORKFLOW SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. If multiple agents are used, coordinate them with `superpowers:subagent-driven-development`. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve the Sensei game UI so the block-placement loop is visually dominant, compact, readable on a 13-inch laptop, and backed by explicit accessibility and responsive verifier checks.

**Architecture:** Keep engine, level, scoring, and persistence behavior unchanged. Rebalance the existing React components and CSS grid around a board-dominant cockpit: concise level guide, compact ready queue, thin command rail, larger schedule board, and scoreboard-first right rail.

**Tech Stack:** React 19, TypeScript 6, Vite, SVG schedule rendering, CSS grid, Vitest, Testing Library, Prettier, ESLint.

---

## Goal Contract

A coding agent can use this file as the implementation goal. It must complete every task, run the verifier, then perform the post-execution review and update this plan with corrections or lessons discovered during execution.

Definition of done:

- The visual hierarchy matches `docs/superpowers/specs/2026-08-24-sensei-cockpit-ux-polish-design.md`.
- The schedule board owns the lower workspace on a 13-inch laptop viewport.
- The ready queue is visually subordinate to the board and uses compact batch lanes.
- `FWD` and `BWD` stacks remain vertical; split-gradient levels render `FWD`, `BWD`, and `WGT` without awkward wrapping.
- Visible block codes remain `F0:S0:D1`; notation key remains `(F/B, stage_id, data_id)` or `(F/B/W, stage_id, data_id)`.
- DualPipe direction remains separate from visible block code.
- Keyboard and pointer placement remain first-class; no drag-only interaction is introduced.
- Existing engine, scoring, level, and persistence tests still pass.
- `npm run verify` passes.
- A post-execution review section is appended to this plan before the final handoff or commit.

## Scope

This is a UI polish pass only.

Do not modify:

- `src/engine/*` behavior;
- `src/levels/*` curriculum semantics;
- `src/persistence/*` schema or codec behavior;
- `src/components/PipelineLessonPanel.tsx` unless a later user instruction explicitly owns it.

Do not add:

- new algorithm levels;
- new persisted learner data;
- a visible long rules panel;
- drag as the only way to place blocks;
- copied source, prose, CSS, fixtures, screenshots, or assets from reference projects.

## File Map

- Modify `src/components/LevelGuide.tsx`
  - Owns the concise top-row level guidance and visible guide chips.
- Modify `src/components/OperationTray.tsx`
  - Owns ready queue grouping, lane phase labels, batch color variables, and pass-stack
    structure.
- Inspect `src/components/GameControls.tsx`
  - Modify only if command-rail grouping needs a class or accessibility hook not already present.
- Modify `src/components/PatternCheck.tsx`
  - Owns building-block validation affordance inside the command rail.
- Modify `src/components/ScheduleBoard.tsx`
  - Owns board geometry constants and SVG block labels.
- Modify `src/components/MoveInspector.tsx`
  - Owns selected-block explanation density in the score rail.
- Inspect `src/components/MetricsPanel.tsx`
  - Modify only if the score rail no longer stays scoreboard-first after the layout changes.
- Modify `src/styles/app.css`
  - Owns layout hierarchy, responsive behavior, compact tokens, command rail, board size, focus, motion, and overflow contracts.
- Modify `src/components/GameShell.test.tsx`
  - Owns integrated UI behavior assertions.
- Modify `src/components/ScheduleBoard.test.tsx`
  - Owns direct board geometry/label rendering assertions.
- Modify `tests/responsive-css.test.mjs`
  - Owns CSS contract assertions for layout, density, scrolling, reduced motion, and no accidental horizontal overflow.
- Modify this plan file
  - Append post-execution review findings and any plan improvements discovered during implementation.

## Invariants

- The canonical data flow remains:

```text
LevelConfig + Action[] -> replay -> ScheduleState -> score -> React view model
```

- The durable learner artifact remains `Action[]`.
- `OperationTray` buttons remain enabled/focusable for blocked and completed operations when inspection is useful.
- `ScheduleBoard` remains an SVG inside a locally scrollable region.
- `MoveInspector` and `MetricsPanel` remain in the `score-rail` on desktop.
- Visible UI text stays succinct; detailed mechanics stay in disclosures or inspector context.
- CSS uses existing design tokens where practical; avoid one-off raw colors unless matching existing palette usage.

---

## Task 1: Lock The Polished Cockpit Contract In Tests

**Files:**

- Modify: `src/components/GameShell.test.tsx`
- Modify: `tests/responsive-css.test.mjs`

- [ ] **Step 1: Add a failing integration test for concise level guide content**

Add this test to `src/components/GameShell.test.tsx` near the existing level guide tests:

```tsx
it('keeps the level guide concise and bounded for dense curriculum levels', () => {
  render(<App initialLevelId="heavy-backward-tail" />);

  const guide = screen.getByRole('region', { name: /level guide/i });
  const chips = within(guide).getAllByTestId('level-guide-chip');

  expect(
    within(guide).getByRole('heading', { name: /^Heavy Backward Tail$/i }),
  ).toBeInTheDocument();
  expect(within(guide).getByText(/^Nonuniform Cost$/i)).toBeInTheDocument();
  expect(
    within(guide).getByText(/A heavy first-stage backward creates a critical tail/i),
  ).toBeInTheDocument();
  expect(within(guide).getByText(/^Variable cost$/i)).toBeInTheDocument();
  expect(chips.length).toBeLessThanOrEqual(4);
  expect(within(guide).queryByText(/^B:S0 = 4t$/i)).not.toBeInTheDocument();
  expect(screen.queryByRole('region', { name: /pipeline rules/i })).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Add a failing integration test for three-column split-gradient stack layout**

Add this test to `src/components/GameShell.test.tsx` near the split-backward tests:

```tsx
it('marks split-gradient batch lanes as three-stack groups without changing compact codes', () => {
  render(<App initialLevelId="split-backward" />);

  const blocks = screen.getByRole('region', { name: /^ready queue$/i });
  const batchZero = within(blocks).getByRole('region', { name: /batch 0 blocks/i });

  expect(batchZero).toHaveAttribute('data-stack-count', '3');
  expect(
    within(batchZero).getByRole('group', { name: /batch 0 forward blocks/i }),
  ).toBeInTheDocument();
  expect(
    within(batchZero).getByRole('group', { name: /batch 0 backward blocks/i }),
  ).toBeInTheDocument();
  expect(
    within(batchZero).getByRole('group', { name: /batch 0 weight-gradient blocks/i }),
  ).toBeInTheDocument();
  expect(within(batchZero).getByText(/^F0:S0:D0$/i)).toBeInTheDocument();
  expect(within(batchZero).getByText(/^B0:S0:D0$/i)).toBeInTheDocument();
  expect(within(batchZero).getByText(/^W0:S0:D0$/i)).toBeInTheDocument();
});
```

- [ ] **Step 3: Add CSS contract assertions for board-dominant layout**

In `tests/responsive-css.test.mjs`, add a new test:

```js
it('allocates the lower workspace to the schedule board on laptop layouts', async () => {
  const css = await readFile(new URL('../src/styles/app.css', import.meta.url), 'utf8');
  const cockpitGridBlock = extractBlock(css, '.cockpit-grid');
  const levelGuideBlock = extractBlock(css, '.level-guide-panel');
  const trayPanelBlock = extractBlock(css, '.tray-panel');
  const commandRailBlock = extractBlock(css, '.schedule-command-rail');
  const boardPanelBlock = extractBlock(css, '.board-panel');
  const boardHeaderBlock = extractBlock(css, '.board-panel__header');
  const boardScrollBlock = extractBlock(css, '.board-scroll-region');

  expect(cockpitGridBlock).toMatch(
    /grid-template-rows:\s*auto minmax\(0,\s*auto\) auto auto minmax\(45dvh,\s*1fr\)\s*;/,
  );
  expect(levelGuideBlock).toMatch(/\.level-guide-panel\s*\{[^}]*\bmin-height:\s*0\s*;/);
  expect(trayPanelBlock).toMatch(/\.tray-panel\s*\{[^}]*\bmax-height:\s*min\(22dvh,\s*14rem\)\s*;/);
  expect(commandRailBlock).toMatch(/\.schedule-command-rail\s*\{[^}]*\bmin-height:\s*2\.5rem\s*;/);
  expect(boardPanelBlock).toMatch(/\.board-panel\s*\{[^}]*\bmin-height:\s*45dvh\s*;/);
  expect(boardPanelBlock).toMatch(/\.board-panel\s*\{[^}]*\bdisplay:\s*grid\s*;/);
  expect(boardPanelBlock).toMatch(
    /\.board-panel\s*\{[^}]*\bgrid-template-rows:\s*auto minmax\(0,\s*1fr\) auto\s*;/,
  );
  expect(boardHeaderBlock).toMatch(/\.board-panel__header\s*\{[^}]*\bmin-width:\s*0\s*;/);
  expect(boardScrollBlock).toMatch(/\.board-scroll-region\s*\{[^}]*\bmin-height:\s*0\s*;/);
});
```

- [ ] **Step 4: Add or replace CSS contract assertions for compact chips and three-stack lanes**

In `tests/responsive-css.test.mjs`, replace the existing
`keeps nonuniform-cost level guide chips compact` test with this contract. If the old
`keeps virtual-stage topology copy compact and horizontally scrollable` test still expects a
`.topology-chip`, update it to keep only the `.rank-owner-list` horizontal-scroll assertion because
topology is now rendered through the common `.level-guide-panel__chip` class.

```js
it('keeps compact labels whole and supports two or three ready-queue stacks', async () => {
  const css = await readFile(new URL('../src/styles/app.css', import.meta.url), 'utf8');
  const guideChipBlock = extractBlock(css, '.level-guide-panel__chip');
  const batchStacksBlock = extractBlock(css, '\n.batch-lane__stacks {');
  const batchThreeStackBlock = extractBlock(css, ".batch-lane__stacks[data-stack-count='3']");
  const operationButtonBlock = extractBlock(css, '\n.operation-button {');
  const operationCodeBlock = extractBlock(css, '\n.operation-button__code {');

  expect(guideChipBlock).toMatch(/\.level-guide-panel__chip\s*\{[^}]*\bwhite-space:\s*nowrap\s*;/);
  expect(guideChipBlock).toMatch(
    /\.level-guide-panel__chip\s*\{[^}]*\btext-overflow:\s*ellipsis\s*;/,
  );
  expect(batchStacksBlock).toMatch(
    /\.batch-lane__stacks\s*\{[^}]*\bgrid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)\s*;/,
  );
  expect(batchThreeStackBlock).toMatch(
    /\.batch-lane__stacks\[data-stack-count='3'\]\s*\{[^}]*\bgrid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)\s*;/,
  );
  expect(operationButtonBlock).toMatch(/\.operation-button\s*\{[^}]*\bheight:\s*1\.875rem\s*;/);
  expect(operationButtonBlock).toMatch(/\.operation-button\s*\{[^}]*\bmin-height:\s*1\.875rem\s*;/);
  expect(operationCodeBlock).toMatch(
    /\.operation-button__code\s*\{[^}]*\bwhite-space:\s*nowrap\s*;/,
  );
});
```

- [ ] **Step 5: Replace legacy level-guide assertions that conflict with bounded chips**

In existing `src/components/GameShell.test.tsx` guide tests, update assertions that expect the
old every-chip display:

- `surfaces the current algorithm set and pattern without adding a rules panel`: keep set, title,
  concept, and `AFAB`; remove the visible objective assertion.
- `shows compact virtual-stage topology metadata in the guide`: keep `V-stage x2`; remove the
  `V-shape` chip expectation.
- `shows compact nonuniform-cost metadata without adding a rules panel`: replace `B:S0 = 4t` and
  `Cost-aware` expectations with `Variable cost`, and keep the no-rules-panel assertion.
- `shows grouped schedule metadata as compact guide and batch markers`: keep `Group x2`; remove the
  `Group major` chip expectation.
- FSDP and DualPipe guide checks should assert the set label plus bounded modifier (`Residency` or
  `Bidirectional`) instead of requiring every pattern label to remain visible.

Keep duration behavior assertions in ready-queue, inspector, preview, and board tests; only the
top-row guide stops displaying duration override chips by default.

- [ ] **Step 6: Run the focused failing tests**

Run:

```bash
npm test -- src/components/GameShell.test.tsx tests/responsive-css.test.mjs
```

Expected: FAIL. The current implementation still renders too many level-guide chips, lacks a `level-guide-chip` test hook, does not mark the batch lane with `data-stack-count`, and does not yet encode the new board-dominant CSS contract.

Do not commit this failing state.

---

## Task 2: Make The Level Guide A Bounded Teaching Row

**Files:**

- Modify: `src/components/LevelGuide.tsx`
- Modify: `src/styles/app.css`
- Test: `src/components/GameShell.test.tsx`
- Test: `tests/responsive-css.test.mjs`

- [ ] **Step 1: Add a bounded chip helper in `LevelGuide.tsx`**

Replace the current freeform `durationOverrideLabels` rendering with a bounded guide summary. Add these helpers:

```tsx
function primaryModifier(level: LevelConfig): string | null {
  const grouping = groupLabel(level);
  if (grouping) {
    return grouping;
  }
  if (level.residencyModel) {
    return 'Residency';
  }
  if (level.dualPipeModel) {
    return 'Bidirectional';
  }
  if ((level.durationOverrides ?? []).length > 0) {
    return 'Variable cost';
  }
  const topology = topologyLabel(level);
  if (topology) {
    return topology;
  }
  return level.algorithm.patternLabel;
}

function guideChips(level: LevelConfig, score: ScoreResult): readonly string[] {
  return Object.freeze(
    [
      primaryGoal(level),
      score.complete ? 'Complete' : 'In progress',
      `makespan ${score.makespan}`,
      primaryModifier(level),
    ].filter((label): label is string => label !== null),
  );
}
```

- [ ] **Step 2: Render only the bounded chips**

In `LevelGuide`, replace the current `level-guide-panel__chips` contents with:

```tsx
{
  guideChips(level, score).map((label) => (
    <span key={label} className="level-guide-panel__chip" data-testid="level-guide-chip">
      {label}
    </span>
  ));
}
```

Keep `level.algorithm.setTitle`, `level.title`, and `level.algorithm.concept` visible.

This intentionally summarizes `heavy-backward-tail` as `Variable cost` instead of `V-stage x2`.
If future levels combine multiple modifiers, keep only the one most likely to change the current
placement strategy.

- [ ] **Step 3: Make guide chips whole, not mid-token wrapped**

In `src/styles/app.css`, replace `.level-guide-panel__chips span` with `.level-guide-panel__chip`:

```css
.level-guide-panel__chip {
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--paper-strong);
  padding: 0.24rem 0.46rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

Remove the old `overflow-wrap: anywhere` from guide chips.

- [ ] **Step 4: Run the guide-focused test**

Run:

```bash
npm test -- src/components/GameShell.test.tsx -t "keeps the level guide concise"
```

Expected: PASS.

---

## Task 3: Compress The Ready Queue Without Losing Structure

**Files:**

- Modify: `src/components/OperationTray.tsx`
- Modify: `src/styles/app.css`
- Test: `src/components/GameShell.test.tsx`
- Test: `tests/responsive-css.test.mjs`

- [ ] **Step 1: Add stack count metadata to batch lanes**

In `OperationTray.tsx`, add a small batch-level visual helper. Keep operation button colors driven
by `operationVisualVars(operation)`; this helper is only for the lane grouping cue.

```tsx
function batchVisualVars(microbatch: number): CSSProperties {
  const hue = (184 + microbatch * 42) % 360;
  return {
    '--batch-hue': String(hue),
    '--batch-accent': `hsl(${hue} 44% 40%)`,
  } as CSSProperties;
}
```

Then add `data-stack-count` and `style` to the batch-lane section:

```tsx
<section
  className="batch-lane"
  aria-label={`Batch ${group.microbatch} blocks, ${batchPhaseLabel(group)}`}
  data-phase={group.phase}
  data-ready-count={group.readyCount}
  data-group={groupLabel ?? undefined}
  data-stack-count={operationKinds.length}
  style={batchVisualVars(group.microbatch)}
>
```

- [ ] **Step 2: Mirror stack count on the stacks grid**

Keep the existing `data-stack-count={operationKinds.length}` on `.batch-lane__stacks`. If it is missing, add it:

```tsx
<div className="batch-lane__stacks" data-stack-count={operationKinds.length}>
```

- [ ] **Step 3: Reduce lane chrome and support three stacks**

In `src/styles/app.css`, update these rules:

```css
.tray-panel {
  grid-area: tray;
  max-height: min(22dvh, 14rem);
  overflow: hidden;
  padding: 0.5rem 0.6rem;
}

.operation-tray-grid {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(10.5rem, 13rem);
  grid-template-columns: none;
  gap: 0.4rem;
  overflow-x: auto;
  padding-bottom: 0.18rem;
}

.batch-lane {
  position: relative;
  display: grid;
  gap: 0.24rem;
  min-width: 0;
  border: 1px solid color-mix(in srgb, var(--batch-accent, var(--line-strong)) 28%, var(--line));
  border-radius: 7px;
  background: color-mix(in srgb, var(--paper-strong) 92%, hsl(var(--batch-hue, 184) 52% 88%));
  padding: 0.3rem;
  transition:
    border-color var(--motion-fast),
    opacity var(--motion-fast),
    background var(--motion-fast);
}

.batch-lane::before {
  width: 0.16rem;
  opacity: 0.75;
}

.batch-lane__stacks {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.22rem;
  padding-left: 0.34rem;
}

.batch-lane__stacks[data-stack-count='3'] {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.batch-stack__tokens {
  display: grid;
  gap: 0.18rem;
}

.operation-button {
  --block-color: var(--operation-accent);
  position: relative;
  display: grid;
  align-items: center;
  grid-template-rows: minmax(0, 1fr);
  gap: 0;
  width: 100%;
  height: 1.875rem;
  min-width: 0;
  min-height: 1.875rem;
  max-height: 1.875rem;
  overflow: hidden;
  border: 1px solid var(--line-strong);
  border-radius: 5px;
  background: var(--paper-strong);
  color: var(--ink);
  padding: 0.16rem 0.75rem 0.28rem 0.28rem;
  text-align: left;
  transition:
    transform var(--motion-fast),
    box-shadow var(--motion-fast),
    opacity var(--motion-fast),
    border-color var(--motion-fast);
}
```

Keep state selectors for `blocked`, `legal`, `completed`, and `selected`.

- [ ] **Step 4: Preserve mobile target comfort**

Inside `@media (max-width: 40rem)`, add:

```css
.operation-button {
  height: 2.75rem;
  min-height: 2.75rem;
  max-height: 2.75rem;
}
```

This keeps the dense desktop inventory while preserving larger touch targets on mobile.

- [ ] **Step 5: Run the queue tests**

Run:

```bash
npm test -- src/components/GameShell.test.tsx -t "three-stack|groups compact block tokens|renders split-backward blocks"
npm test -- tests/responsive-css.test.mjs -t "compact labels"
```

Expected: PASS.

---

## Task 4: Make The Command Rail Thin And Pattern Check Compact

**Files:**

- Modify: `src/components/PatternCheck.tsx`
- Modify: `src/styles/app.css`
- Test: `src/components/GameShell.test.tsx`
- Test: `tests/responsive-css.test.mjs`

- [ ] **Step 1: Update the command-rail test for compact pattern status**

Replace the visible status expectations in the existing
`shows a compact pattern check only on building-block levels` test in
`src/components/GameShell.test.tsx`:

```tsx
it('keeps building-block validation as compact command-rail status', () => {
  render(<App initialLevelId="stamp-the-pattern" />);

  const rail = screen.getByRole('region', { name: /schedule command rail/i });
  const pattern = within(rail).getByRole('group', { name: /pattern check/i });

  expect(pattern).toHaveAttribute('data-compact', 'true');
  expect(within(pattern).getByText(/^Pattern$/i)).toBeInTheDocument();
  expect(within(pattern).getByText(/^valid$/i)).toBeInTheDocument();
  expect(within(pattern).getByText(/Peak 2/i)).toBeInTheDocument();
  expect(
    within(pattern).getByRole('button', { name: /stamp building-block pattern/i }),
  ).toBeEnabled();
  expect(within(pattern).queryByText(/Pattern valid\. Peak memory 2\./i)).not.toBeInTheDocument();
});
```

Keep the existing negative assertion that non-building-block levels do not render the pattern
check.

- [ ] **Step 2: Make `PatternCheck` expose compact status text**

In `src/components/PatternCheck.tsx`, add:

```tsx
function validationWord(validation: BuildingBlockValidation): string {
  return validation.ok ? 'valid' : 'blocked';
}

function compactValidationSummary(validation: BuildingBlockValidation): string {
  if (validation.ok) {
    return `Peak ${Math.max(...validation.projectedPeakMemory, 0)}`;
  }

  const first = validation.violations[0];
  if (!first) {
    return 'Check failed';
  }

  switch (first.kind) {
    case 'invalid-period':
      return `Period ${first.period}`;
    case 'invalid-offset':
      return 'Offset';
    case 'unknown-operation':
      return 'Unknown block';
    case 'duplicate-operation':
      return 'Duplicate';
    case 'missing-operation':
      return 'Missing';
    case 'duplicate-rank-residue':
      return `R${first.rank} conflict`;
    case 'unsatisfied-dependency':
      return 'Dependency';
    case 'memory-cap':
      return `R${first.rank} memory`;
    default:
      return assertNever(first);
  }
}
```

Update the wrapper and status spans:

```tsx
<div
  className="pattern-check"
  role="group"
  aria-label={`Pattern check: ${validationSummary(check.validation)}`}
  data-status={check.validation.ok ? 'valid' : 'invalid'}
  data-compact="true"
>
  <span className="control-cluster__label">Pattern</span>
  <span className="pattern-check__copy">
    <strong>{validationWord(check.validation)}</strong>
    <span>period {check.period}</span>
  </span>
  <span className="pattern-check__status">
    {compactValidationSummary(check.validation)}
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
```

Keep `validationSummary` because the full reason remains in the group's accessible label.

- [ ] **Step 3: Compress pattern-check CSS**

In `src/styles/app.css`, update `.pattern-check`:

```css
.pattern-check {
  display: grid;
  grid-template-columns: auto minmax(4.75rem, auto) minmax(3.75rem, auto) auto;
  align-items: center;
  gap: 0.3rem;
  max-width: min(100%, 22rem);
  min-width: 0;
  border: 1px solid color-mix(in srgb, var(--accent) 32%, var(--line));
  border-radius: 7px;
  background: color-mix(in srgb, var(--paper-strong) 90%, var(--accent));
  padding: 0.24rem 0.34rem;
}
```

Update `.pattern-check__copy, .pattern-check__status` to keep compact labels whole:

```css
.pattern-check__copy,
.pattern-check__status {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.72rem;
}
```

- [ ] **Step 4: Add CSS assertions for compact command rail**

In `tests/responsive-css.test.mjs`, update the pattern-check expectations to match the compact grid:

```js
expect(patternCheckBlock).toMatch(
  /grid-template-columns:\s*auto minmax\(4\.75rem,\s*auto\) minmax\(3\.75rem,\s*auto\) auto\s*;/,
);
expect(patternCheckBlock).toMatch(
  /\.pattern-check\s*\{[^}]*\bmax-width:\s*min\(100%,\s*22rem\)\s*;/,
);
expect(patternCheckBlock).toMatch(/\.pattern-check\s*\{[^}]*\bmin-width:\s*0\s*;/);
```

- [ ] **Step 5: Run focused command rail tests**

Run:

```bash
npm test -- src/components/GameShell.test.tsx -t "compact command-rail status|compact pattern check|thin command rail"
npm test -- tests/responsive-css.test.mjs -t "comfortable controls"
```

Expected: PASS.

---

## Task 5: Enlarge The Schedule Board And Preserve Label Fit

**Files:**

- Modify: `src/components/ScheduleBoard.tsx`
- Modify: `src/styles/app.css`
- Test: `src/components/ScheduleBoard.test.tsx`
- Test: `src/components/GameShell.test.tsx`
- Test: `tests/responsive-css.test.mjs`

- [ ] **Step 1: Add a direct board geometry test**

In `src/components/ScheduleBoard.test.tsx`, add this test:

```tsx
it('uses readable board geometry for placed blocks and two-line labels', () => {
  const schedule = expectState(replay(makeConfig(), placeIds('F:0:0')));

  render(<ScheduleBoard schedule={schedule} selectedOperationId={null} preview={null} />);

  const placed = screen.getByTestId('rank-tile-F:0:0');
  const label = screen.getByTestId('rank-label-F:0:0');

  expect(placed).toHaveAttribute('width', '60');
  expect(placed).toHaveAttribute('height', '44');
  expect(label).toHaveAccessibleName('F0:S0:D0');
  expect(label.querySelectorAll('tspan')).toHaveLength(2);
});
```

- [ ] **Step 2: Update schedule geometry constants**

In `src/components/ScheduleBoard.tsx`, change:

```ts
export const CELL_WIDTH = 60;
const RIGHT_PADDING = 32;
const MEMORY_STRIP_HEIGHT = 8;
const MEMORY_STRIP_GAP = 8;
const WORK_BLOCK_HEIGHT = 44;
const ROW_HEIGHT = 84;
const DUALPIPE_ROW_HEIGHT = 132;
const TOP_PADDING = 48;
const LEFT_PADDING = 78;
const MIN_BOARD_WIDTH = 920;
```

Keep the DualPipe lane offset as:

```ts
return operation.direction === 'asc' ? 0 : WORK_BLOCK_HEIGHT + 4;
```

- [ ] **Step 3: Slightly increase board label readability**

In `src/styles/app.css`, update:

```css
.schedule-preview-label,
.schedule-label {
  fill: var(--ink);
  font-family: var(--font-mono);
  font-size: 0.62rem;
  font-weight: 850;
  letter-spacing: 0;
  pointer-events: none;
}

.schedule-direction-label {
  fill: color-mix(in srgb, var(--operation-accent) 76%, var(--ink));
  font-size: 0.48rem;
  font-weight: 900;
  letter-spacing: 0;
  pointer-events: none;
  text-transform: uppercase;
}
```

- [ ] **Step 4: Wrap schedule-board header metadata**

In `ScheduleBoard.tsx`, wrap the heading, intro, and optional `rank-owner-list` in a single
header child so the scroll region can occupy the flexible grid row. Move the existing
`<h2>`, intro paragraph, and rank-owner block into:

```tsx
<div className="board-panel__header">
  <h2 id="schedule-board-heading">Schedule board</h2>
  <p className="panel-intro">Your pipeline, one move at a time.</p>
  {rankOwners.length > 0 ? (
    <div className="rank-owner-list" aria-label="Rank stage ownership">
      {rankOwners.map((owner) => (
        <span key={`rank-owner-${owner.rank}`}>{rankOwnerText(owner)}</span>
      ))}
    </div>
  ) : null}
</div>
```

Leave the existing `.board-scroll-region` and `board-details` siblings immediately after that
header wrapper.

- [ ] **Step 5: Give the schedule board the lower workspace**

In `src/styles/app.css`, add the row contract and board sizing that the Task 1 CSS test expects:

```css
.cockpit-grid {
  grid-template-rows: auto minmax(0, auto) auto auto minmax(45dvh, 1fr);
}

.level-guide-panel {
  min-height: 0;
}

.schedule-command-rail {
  min-height: 2.5rem;
}

.board-panel {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  min-height: 45dvh;
}

.board-panel__header {
  min-width: 0;
}

.board-scroll-region {
  min-height: 0;
}
```

Keep the existing narrow-screen stacking rule under `@media (max-width: 58rem)` and reset
`.cockpit-grid` to `min-height: auto` there.

- [ ] **Step 6: Update existing tests that assert old geometry**

In `src/components/GameShell.test.tsx`, update width assertions caused by `CELL_WIDTH`:

```tsx
expect(preview).toHaveAttribute('width', '60');
```

For the heavy duration level:

```tsx
expect(screen.getByTestId('rank-tile-B:0:0')).toHaveAttribute('width', '240');
```

In `tests/responsive-css.test.mjs`, update source regex assertions:

```js
expect(scheduleBoardSource).toMatch(/export const CELL_WIDTH = 60;/);
expect(scheduleBoardSource).toMatch(/const WORK_BLOCK_HEIGHT = 44;/);
expect(scheduleBoardSource).toMatch(/const ROW_HEIGHT = 84;/);
expect(scheduleBoardSource).toMatch(/const DUALPIPE_ROW_HEIGHT = 132;/);
expect(scheduleBoardSource).toMatch(/const MIN_BOARD_WIDTH = 920;/);
```

- [ ] **Step 7: Run focused board tests**

Run:

```bash
npm test -- src/components/ScheduleBoard.test.tsx src/components/GameShell.test.tsx tests/responsive-css.test.mjs
```

Expected: PASS.

---

## Task 6: Tighten Score Rail And Inspector Density

**Files:**

- Modify: `src/components/MoveInspector.tsx`
- Inspect: `src/components/MetricsPanel.tsx`
- Modify: `src/styles/app.css`
- Test: `src/components/GameShell.test.tsx`

- [ ] **Step 1: Update the DualPipe inspector density regression test**

Replace the body of the existing
`explains DualPipe resource waits without inflating block names` test in
`src/components/GameShell.test.tsx` so it focuses the delayed block instead of clicking it:

```tsx
it('keeps selected-block explanation compact while preserving resource facts', async () => {
  const user = userEvent.setup();
  render(<App initialLevelId="dualpipe-conflict" />);

  await user.click(
    screen.getByRole('button', {
      name: /place F stage 0 microbatch 0 asc direction/i,
    }),
  );

  const delayed = screen.getByRole('button', {
    name: /place F stage 0 microbatch 1 asc direction/i,
  });
  await tabUntil(user, delayed);

  const inspector = screen.getByRole('region', { name: /move inspector/i });
  const facts = within(inspector).getByRole('list', { name: /selected block facts/i });

  expect(within(inspector).getByText(/^F0:S0:D1$/i)).toBeInTheDocument();
  expect(within(facts).getByText(/^Owner R0$/i)).toBeInTheDocument();
  expect(within(facts).getByText(/^Direction Up$/i)).toBeInTheDocument();
  expect(within(facts).getByText(/^Deps none$/i)).toBeInTheDocument();
  expect(within(facts).getByText(/^Wait R0 0->1$/i)).toBeInTheDocument();
  expect(
    within(inspector).queryByText(/Resource wait R0 0->1, Up; shared 1/i),
  ).not.toBeInTheDocument();
  expect(screen.getByTestId('preview-label-F:0:1:asc')).toHaveAccessibleName('F0:S0:D1');
});
```

- [ ] **Step 2: Refactor inspector supporting facts into a compact list**

In `MoveInspector.tsx`, keep the existing textual helper functions, but add compact helpers:

```tsx
function compactDependencyFact(dependencyIds: readonly OperationId[]): string {
  if (dependencyIds.length === 0) {
    return 'Deps none';
  }
  return `Deps ${dependencyIds.map(dependencyLabel).join(', ')}`;
}

function compactResourceDelayFact(delay: ResourceDelay): string {
  const direction = compactDirectionLabel(delay.direction);
  const directionText = direction ? ` ${direction}` : '';
  return `Wait R${delay.rank} ${delay.start}->${delay.end}${directionText}`;
}
```

When an operation is selected, render a compact fact list below `.inspector-operation`:

```tsx
const selectedDirection = directionLabel(operationIdentity?.direction);

<ul className="inspector-facts" aria-label="Selected block facts">
  {showOwnerRank ? <li>Owner R{ownerRank}</li> : null}
  {selectedDirection ? <li>{selectedDirection}</li> : null}
  <li>{compactDependencyFact(explanation.dependencyIds)}</li>
  {explanation.status === 'legal' && explanation.resourceDelay ? (
    <li>{compactResourceDelayFact(explanation.resourceDelay)}</li>
  ) : null}
</ul>;
```

Keep the existing status paragraphs, but remove duplicated owner, direction, dependency, and
resource-delay lines from the default visible inspector surface when the fact list covers them.
Residency details may remain as a paragraph because they carry more context than a small fact chip.

- [ ] **Step 3: Add compact fact CSS**

In `src/styles/app.css`, add:

```css
.inspector-facts {
  display: flex;
  flex-wrap: wrap;
  gap: 0.28rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.inspector-facts li {
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.58);
  color: var(--muted);
  padding: 0.18rem 0.42rem;
  font-family: var(--font-mono);
  font-size: 0.64rem;
  font-weight: 800;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

- [ ] **Step 4: Run inspector tests**

Run:

```bash
npm test -- src/components/GameShell.test.tsx -t "selected-block explanation|DualPipe resource waits|blocked operations focusable"
```

Expected: PASS.

---

## Task 7: Final Responsive And Accessibility Polish

**Files:**

- Modify: `src/styles/app.css`
- Test: `tests/responsive-css.test.mjs`
- Test: `tests/accessibility.test.tsx`

- [ ] **Step 1: Add CSS contract checks for reduced motion and local scroll**

In `tests/responsive-css.test.mjs`, add:

```js
it('keeps queue and board scroll local and supports reduced motion', async () => {
  const css = await readFile(new URL('../src/styles/app.css', import.meta.url), 'utf8');
  const htmlBlock = extractBlock(css, 'html');
  const bodyBlock = extractBlock(css, 'body');
  const trayPanelBlock = extractBlock(css, '.tray-panel');
  const operationTrayGridBlock = extractBlock(css, '.operation-tray-grid');
  const boardScrollBlock = extractBlock(css, '.board-scroll-region');

  expect(htmlBlock).toMatch(/\bmin-width:\s*0\s*;/);
  expect(bodyBlock).toMatch(/\bmin-width:\s*0\s*;/);
  expect(trayPanelBlock).toMatch(/\boverflow:\s*hidden\s*;/);
  expect(operationTrayGridBlock).toMatch(/\boverflow-x:\s*auto\s*;/);
  expect(boardScrollBlock).toMatch(/\boverflow-x:\s*auto\s*;/);
  expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  expect(css).toMatch(/transition:\s*none !important/);
});
```

- [ ] **Step 2: Add a CSS assertion for visible focus on board scroll region**

In the same test file, add:

```js
it('keeps keyboard focus visible on scrollable schedule regions', async () => {
  const css = await readFile(new URL('../src/styles/app.css', import.meta.url), 'utf8');

  expect(css).toMatch(/\.board-scroll-region:focus-visible\s*\{/);
  expect(css).toMatch(
    /\.board-scroll-region:focus-visible\s*\{[\s\S]*?outline:\s*var\(--focus-ring\)\s*;/,
  );
  expect(css).toMatch(/\.board-scroll-region:focus-visible\s*\{[\s\S]*?outline-offset:\s*2px\s*;/);
});
```

- [ ] **Step 3: Add focus-visible CSS for the board scroll region**

In `src/styles/app.css`, add:

```css
.board-scroll-region:focus-visible {
  outline: var(--focus-ring);
  outline-offset: 2px;
}
```

- [ ] **Step 4: Run accessibility and CSS tests**

Run:

```bash
npm test -- tests/accessibility.test.tsx tests/responsive-css.test.mjs
```

Expected: PASS.

---

## Task 8: Verifier, Review, And Landing

**Files:**

- Modify: all touched implementation/test/doc files

- [ ] **Step 1: Format touched files**

Run:

```bash
npx prettier --write \
  src/components/LevelGuide.tsx \
  src/components/OperationTray.tsx \
  src/components/PatternCheck.tsx \
  src/components/ScheduleBoard.tsx \
  src/components/MoveInspector.tsx \
  src/components/GameShell.test.tsx \
  src/components/ScheduleBoard.test.tsx \
  src/styles/app.css \
  tests/responsive-css.test.mjs \
  docs/superpowers/specs/2026-08-24-sensei-cockpit-ux-polish-design.md \
  docs/superpowers/plans/2026-08-24-sensei-cockpit-ux-polish.md
```

Expected: Prettier reports files written or unchanged.

- [ ] **Step 2: Run focused verification**

Run:

```bash
npm test -- \
  src/components/GameShell.test.tsx \
  src/components/ScheduleBoard.test.tsx \
  tests/responsive-css.test.mjs \
  tests/accessibility.test.tsx
```

Expected: PASS.

- [ ] **Step 3: Run full verification**

Run:

```bash
npm run verify
```

Expected: PASS for format, lint, typecheck, tests, and production build.

Known acceptable warning:

```text
Not implemented: HTMLCanvasElement's getContext() method: without installing the canvas npm package
```

This jsdom warning is non-fatal if all tests pass.

- [ ] **Step 4: Run a visual sanity check when possible**

Run:

```bash
npm run dev -- --host 127.0.0.1
```

Open the printed local URL and inspect:

- `1280x800`
- `1440x900`
- `390x844`

If browser automation is available, capture screenshots at those viewports. If it is not
available, do a manual browser check and record that limitation in the post-execution review.

- [ ] **Step 5: Run diff hygiene checks**

Run:

```bash
git diff --check
git status --short
git diff --stat
```

Expected:

- `git diff --check` prints no output.
- `git status --short` shows only intended files plus the pre-existing untracked `src/components/PipelineLessonPanel.tsx`.
- No `src/engine/*`, `src/levels/*`, or `src/persistence/*` files changed unless a previous task explicitly justified a test-only change.

- [ ] **Step 6: Post-execution review and plan improvement**

Append a `## Post-Execution Review` section to this plan. It must contain concrete observed
facts, not template markers. Include:

- Date.
- Focused test command result with PASS or FAIL and a one-line summary.
- `npm run verify` result with PASS or FAIL and a one-line summary.
- Visual sanity check result for `1280x800`, `1440x900`, and `390x844`, or the exact reason it was
  not run.
- Changed file list.
- Confirmation that `src/engine/*`, `src/levels/*`, `src/persistence/*`, and
  `src/components/PipelineLessonPanel.tsx` were untouched.
- UX result notes for board dominance, ready queue density, command rail density, and accessibility.
- Plan improvement notes describing anything this plan got wrong, missed, or should make clearer
  for the next agent.

If any task uncovered a better assertion, command, or file boundary, edit the relevant earlier section of this plan before final handoff.

- [ ] **Step 7: Commit the polish pass**

Only after the verifier and post-execution review are complete, stage intended files explicitly:

```bash
git add \
  src/components/LevelGuide.tsx \
  src/components/OperationTray.tsx \
  src/components/PatternCheck.tsx \
  src/components/ScheduleBoard.tsx \
  src/components/MoveInspector.tsx \
  src/components/GameShell.test.tsx \
  src/components/ScheduleBoard.test.tsx \
  src/styles/app.css \
  tests/responsive-css.test.mjs \
  docs/superpowers/specs/2026-08-24-sensei-cockpit-ux-polish-design.md \
  docs/superpowers/plans/2026-08-24-sensei-cockpit-ux-polish.md
git commit -m "feat: polish cockpit ux hierarchy"
```

Do not stage `src/components/PipelineLessonPanel.tsx`.

---

## Review Checklist

Before marking the plan complete, confirm:

- [ ] Every requirement in the design spec maps to a task above.
- [ ] No task says `TBD`, `TODO`, `similar to`, or `add tests` without naming the test.
- [ ] All file paths are exact.
- [ ] All commands are runnable from `/Users/bytedance/workspace/sensei`.
- [ ] The plan includes focused tests, full verifier, visual sanity check, diff hygiene, and post-execution plan review.
- [ ] The plan preserves the current clean-room and persistence boundaries.

## Post-Execution Review

Date: 2026-08-24.

Focused tests: PASS. `npm test -- src/components/GameShell.test.tsx src/components/ScheduleBoard.test.tsx tests/responsive-css.test.mjs tests/accessibility.test.tsx` passed with 58 tests. The known non-fatal jsdom canvas warning appeared during accessibility tests.

Full verifier: PASS. `npm run verify` passed Prettier format check, ESLint, TypeScript build, all Vitest suites, and production build. The full test run passed 422 tests; `vite build` produced `dist/index.html`, CSS, and JS assets successfully.

Visual sanity check: PASS with local dev server at `http://127.0.0.1:5173/`. Headless Chrome screenshots were captured at:

- `1280x800`: `/tmp/sensei-cockpit-ux-screens/1280x800.png`
- `1440x900`: `/tmp/sensei-cockpit-ux-screens/1440x900.png`
- `390x844`: `/tmp/sensei-cockpit-ux-screens/390x844.png`

Observed visual results:

- `1280x800`: nonblank render; level guide is bounded; ready queue is compact; command rail is thin; schedule board occupies the lower workspace.
- `1440x900`: nonblank render; score rail stays compact on the right; schedule board is visually dominant in the lower half.
- `390x844`: nonblank render; cockpit stacks vertically; guide chips, ready queue, command controls, and schedule board remain readable without obvious text overlap.

Changed files:

- `docs/superpowers/plans/2026-08-24-sensei-cockpit-ux-polish.md`
- `docs/superpowers/specs/2026-08-24-sensei-cockpit-ux-polish-design.md`
- `src/components/GameShell.test.tsx`
- `src/components/LevelGuide.tsx`
- `src/components/MoveInspector.tsx`
- `src/components/OperationTray.tsx`
- `src/components/PatternCheck.tsx`
- `src/components/ScheduleBoard.test.tsx`
- `src/components/ScheduleBoard.tsx`
- `src/styles/app.css`
- `tests/responsive-css.test.mjs`

Untouched boundary confirmation:

- No `src/engine/*` files changed.
- No `src/levels/*` files changed.
- No `src/persistence/*` files changed.
- `src/components/PipelineLessonPanel.tsx` remains an untracked pre-existing file and was not touched or staged.

UX result notes:

- Board dominance: `ScheduleBoard` now uses larger `60px` cells and `44px` work blocks, and `.board-panel` owns a flexible `45dvh` lower row.
- Ready queue density: ready blocks remain grouped by batch and pass stack, lanes have batch color cues, and split-gradient lanes support three vertical stacks.
- Command rail density: building-block validation now shows compact `valid` plus `Peak N` status while preserving the full validation sentence in the accessible label.
- Accessibility: pointer and keyboard placement remain first-class; board scroll has visible focus; reduced motion is covered by CSS contract tests; axe-focused accessibility tests pass.

Plan improvement notes:

- CSS contract tests should prefer exact selector anchors when singular and plural class names share a prefix, as with `.level-guide-panel__chip` and `.level-guide-panel__chips`.
- The ready-lane border contract should mention batch-accent fallback explicitly because the implementation intentionally uses `--batch-accent` instead of only `--ready`.
- Headless Chrome on this machine can write screenshots but sometimes does not exit cleanly after capture; future plans should run each viewport capture with a timeout or a bounded wrapper.
