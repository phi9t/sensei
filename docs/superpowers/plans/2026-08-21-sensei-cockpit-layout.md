# Sensei Cockpit Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework Sensei into the approved cockpit layout: shallow top rail, compact level guide, smaller ready queue, thin schedule command rail, board-dominant lower workspace, and right-side score rail.

**Architecture:** Keep the replay engine, persistence, fixtures, and operation semantics unchanged. Recompose existing React components around new layout regions in `App.tsx`, add a focused `LevelGuide` component, make `GameControls` rail-friendly, and rebalance layout/geometry through CSS and schedule constants.

**Tech Stack:** React 19, TypeScript, SVG schedule rendering, CSS grid, Vitest, Testing Library, Prettier, ESLint.

---

## Scope And Invariants

The approved design source is `docs/superpowers/specs/2026-08-21-sensei-cockpit-layout-design.md`.

Do not modify:

- `src/engine`
- `src/levels`
- `src/persistence`
- scoring semantics
- replay legality
- local storage behavior
- fixtures
- pre-existing untracked `src/components/PipelineLessonPanel.tsx`

Keep these UI constraints:

- The first screen stays focused on placing blocks.
- Do not add a visible long rules panel.
- Keep the naming note `(F/B, stage_id, micro_batch_id)` visible in the ready queue.
- Keep visible operation codes in the compact `F0:S0:B1` style.
- Keep accessible operation labels descriptive, for example `Place F stage 0 microbatch 1, 1 tick, ready`.
- Ready queue tokens become smaller than schedule blocks.
- Schedule blocks become larger and easier to read on a 13-inch laptop screen.
- The schedule board owns the lower main workspace.
- Page-level horizontal overflow is not allowed; ready queue and schedule board own their own horizontal scroll.

## File Map

- Create `src/components/LevelGuide.tsx`: compact level guidance strip above the ready queue.
- Modify `src/app/App.tsx`: replace the hero/content-grid arrangement with cockpit regions and compose the score rail.
- Modify `src/components/GameControls.tsx`: convert the existing control card into a thin schedule command rail while preserving button semantics.
- Modify `src/components/OperationTray.tsx`: keep batch grouping and accessible names; only adjust markup if compact CSS needs existing class hooks.
- Modify `src/components/ScheduleBoard.tsx`: increase schedule geometry constants and preserve two-line compact labels.
- Modify `src/styles/app.css`: implement cockpit grid, top rail, guide, score rail, compact tray, command rail, larger board, and responsive fallbacks.
- Modify `src/components/GameShell.test.tsx`: assert the new region structure, rail controls, and updated geometry.
- Modify `tests/responsive-css.test.mjs`: assert layout, scroll containment, ready token sizing, and board geometry contracts.

## Task 1: Lock The Cockpit Region Contract In Tests

**Files:**

- Modify: `src/components/GameShell.test.tsx`
- Modify: `tests/responsive-css.test.mjs`

- [ ] **Step 1: Replace the old top-level layout smoke test**

In `src/components/GameShell.test.tsx`, replace the test named `centers the play surface on blocks and the timeline` with:

```tsx
it('lays out the cockpit around guide, queue, command rail, schedule, and score rail', () => {
  render(<App initialLevelId="backward-is-heavier" />);

  expect(screen.getByRole('banner', { name: /sensei cockpit/i })).toBeInTheDocument();
  expect(screen.getByRole('region', { name: /level guide/i })).toBeInTheDocument();
  expect(screen.getByRole('region', { name: /^ready queue$/i })).toBeInTheDocument();
  expect(screen.getByRole('region', { name: /schedule command rail/i })).toBeInTheDocument();
  expect(screen.getByRole('region', { name: /schedule board/i })).toBeInTheDocument();
  expect(screen.getByRole('complementary', { name: /score rail/i })).toBeInTheDocument();
  expect(screen.queryByRole('region', { name: /pipeline rules/i })).not.toBeInTheDocument();
  expect(screen.getByText(/\(F\/B, stage_id, micro_batch_id\)/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Replace the old CSS layout contract**

In `tests/responsive-css.test.mjs`, replace the first test body with:

```js
const css = await readFile(new URL('../src/styles/app.css', import.meta.url), 'utf8');
const appShellBlock = extractBlock(css, '.app-shell');
const cockpitGridBlock = extractBlock(css, '.cockpit-grid');
const cockpitChildrenBlock = extractBlock(css, '.cockpit-grid > *');

expect(appShellBlock).toMatch(/\.app-shell\s*\{[^}]*\bmin-width:\s*0\s*;/);
expect(withoutDeclaration(appShellBlock, /\s*min-width:\s*0\s*;\n?/)).not.toMatch(
  /\.app-shell\s*\{[^}]*\bmin-width:\s*0\s*;/,
);

expect(cockpitGridBlock).toMatch(/\.cockpit-grid\s*\{[^}]*\bdisplay:\s*grid\s*;/);
expect(cockpitGridBlock).toMatch(/\.cockpit-grid\s*\{[^}]*\bmin-width:\s*0\s*;/);
expect(cockpitGridBlock).toMatch(
  /\.cockpit-grid\s*\{[^}]*\bmin-height:\s*calc\(100vh - 1\.3rem\)\s*;/,
);
expect(cockpitGridBlock).toMatch(
  /grid-template-columns:\s*minmax\(0,\s*1fr\) minmax\(16rem,\s*19rem\)\s*;/,
);
expect(cockpitGridBlock).toMatch(
  /'toprail toprail'\s*'guide score'\s*'tray score'\s*'commands score'\s*'board score'/,
);

expect(cockpitChildrenBlock).toMatch(
  /\.cockpit-grid\s*>\s*\*\s*\{[^}]*\bmin-width:\s*0\s*;/,
);
expect(withoutDeclaration(cockpitChildrenBlock, /\s*min-width:\s*0\s*;\n?/)).not.toMatch(
  /\.cockpit-grid\s*>\s*\*\s*\{[^}]*\bmin-width:\s*0\s*;/,
);

expect(css).toMatch(
  /@media\s*\(max-width:\s*58rem\)[\s\S]*?\.cockpit-grid\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)\s*;/,
);
expect(css).toMatch(
  /@media\s*\(max-width:\s*58rem\)[\s\S]*?\.cockpit-grid\s*\{[\s\S]*?'toprail'\s*'guide'\s*'tray'\s*'commands'\s*'board'\s*'score'/,
);
```

- [ ] **Step 3: Run the new failing contract**

Run:

```bash
npm test -- src/components/GameShell.test.tsx -t "lays out the cockpit" tests/responsive-css.test.mjs
```

Expected: FAIL because `.cockpit-grid`, `LevelGuide`, `Schedule command rail`, and `Score rail` do not exist yet.

- [ ] **Step 4: Do not commit this failing state**

Continue to Task 2 before committing. The first implementation commit must include passing layout tests.

## Task 2: Introduce Top Rail, Level Guide, Score Rail, And Cockpit Grid

**Files:**

- Create: `src/components/LevelGuide.tsx`
- Modify: `src/app/App.tsx`
- Modify: `src/styles/app.css`
- Test: `src/components/GameShell.test.tsx`
- Test: `tests/responsive-css.test.mjs`

- [ ] **Step 1: Create the compact level guide component**

Create `src/components/LevelGuide.tsx`:

```tsx
import type { ScoreResult } from '../engine/score';
import type { LevelConfig } from '../engine/types';

interface LevelGuideProps {
  readonly level: LevelConfig;
  readonly score: ScoreResult;
}

function levelConcept(level: LevelConfig): string {
  switch (level.id) {
    case 'dependency-chain':
      return 'Read the dependency chain before placing backward work.';
    case 'fill-the-pipe':
      return 'Place forward blocks to fill the pipeline before draining it.';
    case 'backward-is-heavier':
      return 'Account for backward blocks taking longer than forward blocks.';
    case 'memory-wall':
      return 'Keep activation memory under the cap while preserving pipeline flow.';
    default:
      return 'Place the next legal block and watch the schedule take shape.';
  }
}

function primaryGoal(level: LevelConfig): string {
  const makespanTarget = level.masteryTargets.find((target) => target.metric === 'makespan');
  return makespanTarget
    ? `Goal: makespan ${makespanTarget.op} ${makespanTarget.value}`
    : 'Goal: complete the schedule';
}

export function LevelGuide({ level, score }: LevelGuideProps) {
  return (
    <section className="panel level-guide-panel" aria-label="Level guide">
      <div>
        <p className="panel-kicker">Level guide</p>
        <h2 id="level-guide-heading">{level.title}</h2>
        <p className="level-guide-panel__copy">{levelConcept(level)}</p>
      </div>
      <div className="level-guide-panel__chips" aria-label="Level progress summary">
        <span>{primaryGoal(level)}</span>
        <span>{score.complete ? 'Complete' : 'In progress'}</span>
        <span>makespan {score.makespan}</span>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Import `LevelGuide` in `App.tsx`**

Add:

```tsx
import { LevelGuide } from '../components/LevelGuide';
```

- [ ] **Step 3: Replace the `App.tsx` visual shell**

In `src/app/App.tsx`, keep the existing `preview`, `offlineNotice`, level picker logic, and component props. Replace the current `<header className="hero-panel">`, standalone `<div className="live-region">`, and `<div className="content-grid" id="play-surface">` with this structure:

```tsx
<div className="cockpit-grid" id="play-surface">
  <header className="top-rail" aria-label="Sensei cockpit">
    <div className="top-rail__brand">
      <h1 id="sensei-heading">Sensei</h1>
      <p>Pipeline scheduling</p>
    </div>

    <div className="level-picker">
      <label>
        <span>Level</span>
        <select
          aria-label="Choose level"
          value={game.levelId}
          onChange={(event) => game.changeLevel(event.target.value as LevelId)}
        >
          {game.levelOptions.map((option) => (
            <option key={option.levelId} value={option.levelId} disabled={!option.unlocked}>
              {option.title}
            </option>
          ))}
        </select>
      </label>

      <p className="top-rail__count">
        {placedBlockCount}/{totalBlockCount} blocks
      </p>

      <ul className="sr-only" aria-label="Level access status">
        {game.levelOptions
          .filter((option) => !option.unlocked && option.reason !== null)
          .map((option) => (
            <li key={option.levelId}>{option.reason}</li>
          ))}
      </ul>

      {offlineNotice ? (
        <p
          className="header-notice"
          role="status"
          aria-live="polite"
          aria-atomic="true"
          aria-label="Offline support notice"
        >
          {offlineNotice}
        </p>
      ) : null}
      {game.persistenceNotice ? (
        <p
          className="header-notice"
          role="status"
          aria-live="polite"
          aria-atomic="true"
          aria-label="Saved progress notice"
        >
          {game.persistenceNotice}
        </p>
      ) : null}
    </div>
  </header>

  <LevelGuide level={game.level} score={game.score} />

  <OperationTray
    classifications={game.moveClassifications}
    selectedOperationId={game.selectedOperationId}
    onActivate={game.activateOperation}
    onInspect={game.selectOperation}
  />

  <div
    className="live-region command-feedback"
    role="status"
    aria-label="Interaction feedback"
    aria-live="polite"
  >
    <span className="live-region__pulse" aria-hidden="true" />
    {game.overlay.message}
  </div>

  <GameControls
    level={game.level}
    canUndo={game.cursor > 0}
    canRedo={game.cursor < game.actions.length}
    canReadySet={game.canReadySet}
    readySetReason={game.readySetReason}
    hintReason={game.hintReason}
    automationReason={game.automationReason}
    onWait={game.waitOneTick}
    onPlaceSelected={game.placeSelectedOperation}
    onClearSelection={game.clearSelection}
    onShare={game.shareAttempt}
    onUndo={game.undo}
    onRedo={game.redo}
    onReadySet={game.showReadySet}
    onHint={game.showHint}
    onAutomate={game.automate}
    onReset={game.reset}
  />

  <ScheduleBoard
    schedule={game.schedule}
    selectedOperationId={game.selectedOperationId}
    preview={preview}
  />

  <aside className="score-rail" aria-label="Score rail">
    <MoveInspector operationId={game.selectedOperationId} explanation={game.selectedExplanation} />
    <MetricsPanel
      level={game.level}
      score={game.score}
      currentMemory={game.schedule.currentMemory}
      attemptTuple={game.attemptTuple}
    />
  </aside>
</div>
```

Keep `<main className="app-shell">` and the skip link. Change the skip link text from `Skip to blocks` to `Skip to play surface`.

- [ ] **Step 4: Rename the ready queue region without changing its heading**

In `src/components/OperationTray.tsx`, change the section label to make the landmark match the cockpit language while retaining the visible `Blocks` heading. Use one accessible-name source:

```tsx
<section className="panel tray-panel" aria-label="Ready queue">
```

Keep this visible heading inside the section:

```tsx
<h2 id="operation-tray-heading">Blocks</h2>
```

- [ ] **Step 5: Add cockpit grid CSS**

In `src/styles/app.css`, add these blocks near the existing shell/header styles:

```css
.cockpit-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(16rem, 19rem);
  grid-template-areas:
    'toprail toprail'
    'guide score'
    'tray score'
    'commands score'
    'board score';
  gap: 0.65rem;
  min-width: 0;
  min-height: calc(100vh - 1.3rem);
}

.cockpit-grid > * {
  min-width: 0;
}

.top-rail {
  grid-area: toprail;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  min-width: 0;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  background: rgba(22, 32, 35, 0.96);
  color: var(--paper);
  padding: 0.48rem 0.7rem;
}

.top-rail__brand {
  display: flex;
  align-items: baseline;
  gap: 0.6rem;
  min-width: 0;
}

.top-rail__brand h1 {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.12rem;
  line-height: 1;
}

.top-rail__brand p {
  margin: 0;
  color: #9fb1b0;
  font-family: var(--font-mono);
  font-size: 0.66rem;
  font-weight: 800;
  letter-spacing: 0.07em;
  text-transform: uppercase;
}

.top-rail__count {
  margin: 0;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 999px;
  border-color: rgba(224, 169, 40, 0.36);
  color: #f2ca69;
  padding: 0.42rem 0.65rem;
  font-family: var(--font-mono);
  font-size: 0.72rem;
  font-weight: 750;
}

.level-guide-panel {
  grid-area: guide;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.7rem 0.85rem;
}

.level-guide-panel h2 {
  margin-bottom: 0.15rem;
}

.level-guide-panel__copy {
  margin: 0;
  color: var(--muted);
  font-size: 0.82rem;
  line-height: 1.35;
}

.level-guide-panel__chips {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.35rem;
  color: var(--ink);
  font-family: var(--font-mono);
  font-size: 0.62rem;
  font-weight: 800;
}

.level-guide-panel__chips span {
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--paper-strong);
  padding: 0.24rem 0.46rem;
}

.score-rail {
  grid-area: score;
  display: grid;
  align-content: start;
  gap: 0.65rem;
  min-width: 0;
}

.command-feedback {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
```

Remove or stop using `.hero-panel`, `.brand-lockup`, `.content-grid`, and `.content-grid > *` as top-level layout selectors after the new cockpit shell is in place.

- [ ] **Step 6: Assign grid areas**

Ensure these selectors have the cockpit areas:

```css
.tray-panel {
  grid-area: tray;
}

.schedule-command-rail,
.controls-panel {
  grid-area: commands;
}

.board-panel {
  grid-area: board;
}
```

After Task 3, `.controls-panel` can be deleted if no component uses it.

- [ ] **Step 7: Add responsive cockpit fallback**

Replace the old `@media (max-width: 52rem)` `.content-grid` rules with:

```css
@media (max-width: 58rem) {
  .top-rail,
  .level-guide-panel {
    align-items: flex-start;
    flex-direction: column;
  }

  .cockpit-grid {
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas:
      'toprail'
      'guide'
      'tray'
      'commands'
      'board'
      'score';
  }

  .score-rail {
    grid-template-columns: minmax(0, 1fr);
  }
}
```

Inside the existing `@media (max-width: 40rem)`, replace `.hero-panel` selectors with `.top-rail` selectors and keep the level picker width rules.

- [ ] **Step 8: Run targeted tests**

Run:

```bash
npm test -- src/components/GameShell.test.tsx -t "lays out the cockpit" tests/responsive-css.test.mjs
```

Expected: PASS for the new layout contract and CSS contract.

- [ ] **Step 9: Commit the shell layout skeleton**

Run:

```bash
git add src/app/App.tsx src/components/LevelGuide.tsx src/styles/app.css src/components/GameShell.test.tsx tests/responsive-css.test.mjs
git commit -m "Reframe Sensei as cockpit layout"
```

## Task 3: Convert Controls Into A Thin Schedule Command Rail

**Files:**

- Modify: `src/components/GameControls.tsx`
- Modify: `src/styles/app.css`
- Modify: `src/components/GameShell.test.tsx`

- [ ] **Step 1: Add a command rail behavior test**

In `src/components/GameShell.test.tsx`, replace the test named `keeps secondary actions behind one disclosure` with:

```tsx
it('keeps core schedule commands in a thin command rail', () => {
  render(<App initialLevelId="dependency-chain" />);

  const rail = screen.getByRole('region', { name: /schedule command rail/i });
  expect(within(rail).getByText(/^Schedule$/i)).toBeInTheDocument();
  expect(within(rail).getByRole('button', { name: /undo last action/i })).toBeDisabled();
  expect(within(rail).getByRole('button', { name: /redo next action/i })).toBeDisabled();
  expect(within(rail).getByRole('button', { name: /place selected operation/i })).toBeEnabled();
  expect(within(rail).getByRole('button', { name: /clear selected operation/i })).toBeEnabled();
  expect(within(rail).getByRole('button', { name: /wait one tick on rank 0/i })).toBeEnabled();
});
```

- [ ] **Step 2: Replace the `GameControls.tsx` return value**

Keep the `GameControlsProps` interface and function parameters. Replace only the JSX returned by `GameControls` with:

```tsx
return (
  <section className="schedule-command-rail" aria-label="Schedule command rail">
    <div className="schedule-command-rail__primary">
      <h2 id="game-controls-heading">Schedule</h2>
      <button
        type="button"
        className="command-button"
        aria-label="Undo last action"
        onClick={onUndo}
        disabled={!canUndo}
      >
        Undo
      </button>
      <button
        type="button"
        className="command-button"
        aria-label="Redo next action"
        onClick={onRedo}
        disabled={!canRedo}
      >
        Redo
      </button>
      <button
        type="button"
        className="command-button command-button--primary"
        aria-label="Place selected operation"
        onClick={onPlaceSelected}
      >
        Place
      </button>
      <button
        type="button"
        className="command-button"
        aria-label="Clear selected operation"
        onClick={onClearSelection}
      >
        Clear
      </button>
    </div>

    <div className="schedule-command-rail__secondary">
      <div className="control-cluster" aria-label="Rank wait controls">
        <span className="control-cluster__label">Wait</span>
        {Array.from({ length: level.rankCount }, (_, rank) => (
          <button
            key={rank}
            type="button"
            className="command-button command-button--rank"
            aria-label={'Wait one tick on rank ' + rank}
            onClick={() => onWait(rank)}
          >
            R{rank}
          </button>
        ))}
      </div>

      <div className="control-cluster" aria-label="Learning controls">
        <span className="control-cluster__label">Assist</span>
        <button
          type="button"
          className="command-button"
          aria-label="Show ready operations"
          onClick={onReadySet}
          disabled={!canReadySet}
          aria-describedby="ready-set-reason"
        >
          Ready
        </button>
        <button
          type="button"
          className="command-button"
          aria-label="Show local hint"
          onClick={onHint}
          disabled={!level.coaching.suggest}
          aria-describedby="hint-reason"
        >
          Hint
        </button>
        <button
          type="button"
          className="command-button"
          aria-label="Run until interesting boundary"
          onClick={onAutomate}
          disabled={!level.coaching.auto}
          aria-describedby="automation-reason"
        >
          Auto
        </button>
      </div>

      <div className="control-cluster" aria-label="Attempt controls">
        <span className="control-cluster__label">Attempt</span>
        <button
          type="button"
          className="command-button"
          aria-label="Share attempt link"
          onClick={onShare}
        >
          Share
        </button>
        <button
          type="button"
          className="command-button command-button--danger"
          aria-label="Reset current attempt"
          onClick={onReset}
        >
          Reset
        </button>
      </div>

      <div className="control-notes sr-only">
        <p id="ready-set-reason">{readySetReason}</p>
        <p id="hint-reason">{hintReason}</p>
        <p id="automation-reason">{automationReason}</p>
      </div>
    </div>
  </section>
);
```

- [ ] **Step 3: Replace controls CSS with rail CSS**

In `src/styles/app.css`, replace `.controls-panel`, `.controls-primary`, `.more-controls`, and `.more-controls__body` top-level visual rules with:

```css
.schedule-command-rail {
  grid-area: commands;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.45rem 0.75rem;
  min-width: 0;
  border: 1px solid rgba(23, 33, 35, 0.12);
  border-radius: 8px;
  background: rgba(246, 247, 242, 0.94);
  padding: 0.48rem 0.58rem;
}

.schedule-command-rail__primary,
.schedule-command-rail__secondary {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
  min-width: 0;
}

.schedule-command-rail__primary h2 {
  margin: 0 0.25rem 0 0;
  font-family: var(--font-mono);
  font-size: 0.72rem;
  font-weight: 900;
  letter-spacing: 0.07em;
  text-transform: uppercase;
}
```

Replace the base `.command-button` block with:

```css
.command-button {
  min-height: 2.25rem;
  border: 1px solid var(--line-strong);
  border-radius: 6px;
  background: var(--paper-strong);
  color: var(--ink);
  padding: 0.42rem 0.58rem;
  font-size: 0.72rem;
  font-weight: 800;
}
```

Keep existing disabled, primary, danger, rank, and hover styles.

- [ ] **Step 4: Update tests that still click `More controls`**

In `src/components/GameShell.test.tsx`, remove each line that opens `More controls`. Change control-region lookups from:

```tsx
screen.getByRole('region', { name: /game controls/i })
```

to:

```tsx
screen.getByRole('region', { name: /schedule command rail/i })
```

For tests that click reset, wait, hint, automation, or clear, keep the button accessible names unchanged.

- [ ] **Step 5: Run control-related tests**

Run:

```bash
npm test -- src/components/GameShell.test.tsx -t "controls|command rail|undo redo|hint|wait|clear"
```

Expected: PASS.

- [ ] **Step 6: Commit command rail**

Run:

```bash
git add src/components/GameControls.tsx src/styles/app.css src/components/GameShell.test.tsx
git commit -m "Make schedule controls a cockpit rail"
```

## Task 4: Compact Ready Queue Into A Smaller Parts Bin

**Files:**

- Modify: `src/components/OperationTray.tsx`
- Modify: `src/styles/app.css`
- Modify: `src/components/GameShell.test.tsx`
- Modify: `tests/responsive-css.test.mjs`

- [ ] **Step 1: Update ready queue grouping test**

In `src/components/GameShell.test.tsx`, in `groups compact block tokens by microbatch and pass stack`, change:

```tsx
const blocks = screen.getByRole('region', { name: /^blocks$/i });
```

to:

```tsx
const blocks = screen.getByRole('region', { name: /^ready queue$/i });
```

Keep the visible heading assertion:

```tsx
expect(within(batchZero).getByText(/^Batch 0$/i)).toBeInTheDocument();
```

- [ ] **Step 2: Add CSS assertions for compact ready tokens and bounded scroll**

In `tests/responsive-css.test.mjs`, in the second test, update the `.operation-button` expectations and add tray scroll expectations:

```js
const trayPanelBlock = extractBlock(css, '.tray-panel');
const operationTrayGridBlock = extractBlock(css, '.operation-tray-grid');

expect(trayPanelBlock).toMatch(/\.tray-panel\s*\{[^}]*\boverflow:\s*hidden\s*;/);
expect(operationTrayGridBlock).toMatch(
  /\.operation-tray-grid\s*\{[^}]*\bgrid-auto-flow:\s*column\s*;/,
);
expect(operationTrayGridBlock).toMatch(
  /\.operation-tray-grid\s*\{[^}]*\bgrid-auto-columns:\s*minmax\(12rem,\s*15rem\)\s*;/,
);
expect(operationTrayGridBlock).toMatch(
  /\.operation-tray-grid\s*\{[^}]*\boverflow-x:\s*auto\s*;/,
);
expect(operationButtonBlock).toMatch(
  /\.operation-button\s*\{[^}]*\bmin-height:\s*2\.25rem\s*;/,
);
expect(operationButtonBlock).toMatch(
  /\.operation-button\s*\{[^}]*\bpadding:\s*0\.3rem 0\.38rem 0\.38rem\s*;/,
);
```

Remove the old assertion that `.operation-button` has `min-height: 2.75rem`.

- [ ] **Step 3: Confirm the tray component already has compact label hooks**

In `src/components/OperationTray.tsx`, confirm each operation button still renders:

```tsx
<span className="operation-button__code">{formatOperationCode(operation)}</span>
<span className="operation-button__meta">
  R{operation.rank} - {operation.duration}t
</span>
<span className="operation-button__state">{stateLabel}</span>
```

If this exact structure is present, do not change this file beyond the region label from Task 2.

- [ ] **Step 4: Compact ready queue CSS**

In `src/styles/app.css`, update ready-queue styling:

```css
.tray-panel {
  grid-area: tray;
  overflow: hidden;
  padding: 0.62rem 0.72rem;
}

.operation-tray-grid {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(12rem, 15rem);
  grid-template-columns: none;
  gap: 0.45rem;
  overflow-x: auto;
  padding-bottom: 0.18rem;
}

.batch-lane {
  gap: 0.32rem;
  padding: 0.38rem;
}

.batch-lane__heading h3 {
  font-size: 0.58rem;
}

.batch-lane__stacks {
  gap: 0.28rem;
  padding-left: 0.4rem;
}

.batch-stack__tokens {
  gap: 0.24rem;
}

.operation-button {
  min-height: 2.25rem;
  border-radius: 5px;
  padding: 0.3rem 0.38rem 0.38rem;
}

.operation-button__code {
  font-size: 0.72rem;
}

.operation-button__meta {
  font-size: 0.5rem;
}

.operation-button__state {
  font-size: 0.48rem;
}
```

Keep focus rings and button semantics.

- [ ] **Step 5: Run focused tests**

Run:

```bash
npm test -- src/components/GameShell.test.tsx -t "groups compact block tokens|cockpit" tests/responsive-css.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit compact ready queue**

Run:

```bash
git add src/components/OperationTray.tsx src/styles/app.css src/components/GameShell.test.tsx tests/responsive-css.test.mjs
git commit -m "Compact ready queue for cockpit layout"
```

## Task 5: Enlarge Schedule Board Geometry

**Files:**

- Modify: `src/components/ScheduleBoard.tsx`
- Modify: `src/styles/app.css`
- Modify: `src/components/GameShell.test.tsx`
- Modify: `tests/responsive-css.test.mjs`

- [ ] **Step 1: Update geometry assertions in component tests**

In `src/components/GameShell.test.tsx`, update old `44` pixel expectations:

```tsx
expect(preview).toHaveAttribute('width', '56');
```

```tsx
expect(preview).toHaveAttribute('x', '56');
```

```tsx
expect(tile).toHaveAttribute('x', '56');
expect(tile).toHaveAttribute('width', '56');
```

- [ ] **Step 2: Add source-level geometry assertions**

In `tests/responsive-css.test.mjs`, inside `keeps schedule SVG geometry intrinsic and gives memory strips explicit non-default paint`, add:

```js
const scheduleBoardSource = await readFile(
  new URL('../src/components/ScheduleBoard.tsx', import.meta.url),
  'utf8',
);
expect(scheduleBoardSource).toMatch(/export const CELL_WIDTH = 56;/);
expect(scheduleBoardSource).toMatch(/const WORK_BLOCK_HEIGHT = 38;/);
expect(scheduleBoardSource).toMatch(/const ROW_HEIGHT = 74;/);
expect(scheduleBoardSource).toMatch(/const MIN_BOARD_WIDTH = 860;/);
```

Update label font-size assertions:

```js
expect(scheduleLabelBlock).toMatch(/\.schedule-label\s*\{[^}]*\bfont-size:\s*0\.58rem\s*;/);
expect(previewLabelBlock).toMatch(
  /\.schedule-preview-label\s*\{[^}]*\bfont-size:\s*0\.58rem\s*;/,
);
```

- [ ] **Step 3: Run geometry tests and verify failure**

Run:

```bash
npm test -- src/components/GameShell.test.tsx -t "previews|shows only legal|geometry" tests/responsive-css.test.mjs
```

Expected: FAIL because schedule constants still use `44`, `30`, `60`, and `760`.

- [ ] **Step 4: Increase schedule constants**

In `src/components/ScheduleBoard.tsx`, update:

```ts
export const CELL_WIDTH = 56;
const WORK_BLOCK_HEIGHT = 38;
const ROW_HEIGHT = 74;
const MIN_BOARD_WIDTH = 860;
```

- [ ] **Step 5: Recenter two-line schedule labels**

In `src/components/ScheduleBoard.tsx`, update placed label y positions from:

```tsx
y={y + 10}
```

to:

```tsx
y={y + 12}
```

Update preview label y positions from:

```tsx
y={
  rankRowTop(previewOperation.rank) + MEMORY_STRIP_HEIGHT + MEMORY_STRIP_GAP + 10
}
```

to:

```tsx
y={
  rankRowTop(previewOperation.rank) + MEMORY_STRIP_HEIGHT + MEMORY_STRIP_GAP + 12
}
```

- [ ] **Step 6: Tune schedule CSS for larger labels**

In `src/styles/app.css`, update both label blocks:

```css
.schedule-preview-label {
  fill: var(--ink);
  font-family: var(--font-mono);
  font-size: 0.58rem;
  font-weight: 850;
  letter-spacing: 0;
  pointer-events: none;
}

.schedule-label {
  fill: var(--ink);
  font-size: 0.58rem;
  font-weight: 850;
  letter-spacing: 0;
  pointer-events: none;
}
```

- [ ] **Step 7: Run focused tests**

Run:

```bash
npm test -- src/components/GameShell.test.tsx -t "previews|shows only legal|geometry|visual identity" tests/responsive-css.test.mjs
```

Expected: PASS.

- [ ] **Step 8: Commit larger schedule board**

Run:

```bash
git add src/components/ScheduleBoard.tsx src/styles/app.css src/components/GameShell.test.tsx tests/responsive-css.test.mjs
git commit -m "Enlarge schedule board blocks"
```

## Task 6: Final Verification And Browser Review

**Files:**

- Modify: `src/styles/app.css` only if browser review reveals a focused layout defect.
- Modify: `src/components/GameShell.test.tsx` and `tests/responsive-css.test.mjs` only if a final CSS fix requires a contract update.

- [ ] **Step 1: Run full verification**

Run:

```bash
npm run verify
```

Expected: PASS.

- [ ] **Step 2: Check worktree state**

Run:

```bash
git status --short
```

Expected: only the pre-existing untracked `src/components/PipelineLessonPanel.tsx`, or a clean tree if the user separately handled it. There must be no staged `.superpowers/` files.

- [ ] **Step 3: Start or reuse the dev server**

If no Vite server is running, run:

```bash
npm run dev -- --host 127.0.0.1 --port 54473
```

Expected: server prints `Local: http://127.0.0.1:54473/`. If port `54473` is busy, use the next available port and report the actual URL.

- [ ] **Step 4: Review the cockpit at a 13-inch-laptop-like viewport**

Open the local URL and check:

- top rail is shallow;
- level guide is one compact band;
- ready queue is visually smaller than schedule blocks;
- command rail sits immediately above the schedule;
- schedule board occupies the lower center and uses larger blocks;
- score rail remains visible on the right at desktop width;
- no page-level horizontal overflow appears;
- board and ready queue scroll only inside their own regions;
- keyboard focus rings remain visible.

If Playwright is already available, capture screenshots at `1280x800` and `390x844`. Do not add Playwright as a dependency for this review.

- [ ] **Step 5: Commit browser-review polish only when there are changes**

If Step 4 required focused CSS or test adjustments, run:

```bash
git add src/styles/app.css src/components/GameShell.test.tsx tests/responsive-css.test.mjs
git commit -m "Polish cockpit responsive layout"
```

If Step 4 required no changes, do not create an empty commit.
