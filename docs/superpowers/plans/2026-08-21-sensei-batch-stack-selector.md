# Sensei Batch Stack Selector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Phase 1 of the approved design: group each microbatch into vertical `FWD` and `BWD` stacks, and carry stable per-operation color identity from the selector into the schedule board.

**Architecture:** Keep scheduling truth in `src/engine`; this is a presentation-only change. Add a small component-local visual helper for deterministic operation color variables, use it from `OperationTray` and `ScheduleBoard`, and update tests to lock grouping, accessibility, responsive behavior, and board color continuity.

**Tech Stack:** React 19, TypeScript 6, Vite, SVG, CSS custom properties, Vitest, Testing Library, Prettier, ESLint.

---

## Scope Check

This plan implements only Phase 1 from `docs/superpowers/specs/2026-08-21-sensei-batch-stacks-and-curriculum-design.md`.

It does not add GPipe, 1F1B, interleaving, zero-bubble, DualPipe, new level metadata, or algorithm explanations. Those belong to a separate curriculum architecture plan because they change engine and level semantics.

The current worktree may contain an uncommitted selector prototype. Treat it as partial work: keep useful pieces, but verify against every task below before committing. Do not stage `.superpowers/` companion files or unrelated `src/components/PipelineLessonPanel.tsx`.

## File Map

- Modify `src/components/OperationTray.tsx`
  - Owns operation selector rendering.
  - Will group classifications by microbatch, split each batch into `FWD` and `BWD` stacks, and keep accessible labels explicit.

- Modify `src/components/ScheduleBoard.tsx`
  - Owns SVG placement and preview rendering.
  - Will apply deterministic visual identity CSS variables to placed and previewed operations.

- Create `src/components/operationVisuals.ts`
  - Owns presentation-only color identity helpers for operations.
  - Has no engine, DOM, or React dependency.

- Modify `src/styles/app.css`
  - Owns selector lane layout, token states, SVG accent colors, responsive behavior, and reduced-motion constraints.

- Modify `src/components/GameShell.test.tsx`
  - Adds behavior tests for batch lanes, `FWD`/`BWD` stacks, compact labels, accessible names, and board color attributes.

- Modify `tests/responsive-css.test.mjs`
  - Updates CSS contract tests for compact batch lanes and mobile scrolling.

## Task 1: Operation Visual Identity Helper

**Files:**
- Create: `src/components/operationVisuals.ts`
- Test indirectly in: `src/components/GameShell.test.tsx`

- [ ] **Step 1: Create the helper**

Create `src/components/operationVisuals.ts`:

```ts
import type { Operation } from '../engine/types';

export interface OperationVisualVars {
  readonly '--operation-hue': string;
  readonly '--operation-accent': string;
}

const OPERATION_HUES = [184, 38, 132, 258, 88, 214, 12, 164, 296, 52, 228, 112] as const;

export function operationVisualKey(operation: Operation): string {
  return `${operation.kind}-${operation.stage}-${operation.microbatch}`;
}

export function operationHue(operation: Operation): number {
  const kindOffset = operation.kind === 'F' ? 0 : 5;
  const index = (operation.microbatch * 3 + operation.stage * 2 + kindOffset) % OPERATION_HUES.length;
  return OPERATION_HUES[index]!;
}

export function operationVisualVars(operation: Operation): OperationVisualVars {
  const hue = operationHue(operation);
  return {
    '--operation-hue': String(hue),
    '--operation-accent': `hsl(${hue} 44% 40%)`,
  };
}
```

- [ ] **Step 2: Run typecheck for helper import safety**

Run:

```bash
npm run typecheck
```

Expected: this may still fail until later tasks import the helper correctly. If it fails only because the file is unused, continue; TypeScript should not emit syntax or type errors for the new file.

## Task 2: Group Selector By Batch And Pass

**Files:**
- Modify: `src/components/OperationTray.tsx`
- Test: `src/components/GameShell.test.tsx`

- [ ] **Step 1: Write the failing grouping test**

Add this test near the existing operation-tray tests in `src/components/GameShell.test.tsx`:

```tsx
it('groups compact block tokens by microbatch and pass stack', () => {
  render(<App initialLevelId="backward-is-heavier" />);

  const blocks = screen.getByRole('region', { name: /^blocks$/i });
  const batchZero = within(blocks).getByRole('region', { name: /batch 0 blocks/i });
  const forwardStack = within(batchZero).getByRole('group', { name: /batch 0 forward blocks/i });
  const backwardStack = within(batchZero).getByRole('group', { name: /batch 0 backward blocks/i });

  expect(within(batchZero).getByText(/^Batch 0$/i)).toBeInTheDocument();
  expect(within(forwardStack).getByText(/^FWD$/i)).toBeInTheDocument();
  expect(within(backwardStack).getByText(/^BWD$/i)).toBeInTheDocument();
  expect(within(forwardStack).getAllByText(/^S[0-2]$/i)).toHaveLength(3);
  expect(within(backwardStack).getAllByText(/^S[0-2]$/i)).toHaveLength(3);
  expect(within(batchZero).queryByText(/^F:0:0$/)).not.toBeInTheDocument();
  expect(
    within(forwardStack).getByRole('button', {
      name: /place F stage 0 microbatch 0, 1 tick, ready/i,
    }),
  ).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
npm test -- src/components/GameShell.test.tsx -t "groups compact block tokens"
```

Expected: FAIL because `FWD` and `BWD` stack groups do not exist yet.

- [ ] **Step 3: Implement grouping and stack structure**

In `src/components/OperationTray.tsx`, replace the flat rendering with these helpers and JSX structure. Preserve `accessibleOperationLabel` and the existing button event behavior.

```tsx
import type { CSSProperties } from 'react';
import type { MoveClassification } from '../engine/replay';
import type { OperationKind, OperationId } from '../engine/types';
import { formatOperationName } from '../app/useGame';
import { operationVisualKey, operationVisualVars } from './operationVisuals';

interface BatchGroup {
  readonly microbatch: number;
  readonly classifications: readonly MoveClassification[];
}

function groupByMicrobatch(classifications: readonly MoveClassification[]): readonly BatchGroup[] {
  const groups = new Map<number, MoveClassification[]>();

  for (const classification of classifications) {
    const { microbatch } = classification.operation;
    const existing = groups.get(microbatch);
    if (existing) {
      existing.push(classification);
    } else {
      groups.set(microbatch, [classification]);
    }
  }

  return Array.from(groups.entries())
    .sort(([left], [right]) => left - right)
    .map(([microbatch, batchClassifications]) =>
      Object.freeze({
        microbatch,
        classifications: Object.freeze(
          [...batchClassifications].sort(
            (left, right) =>
              left.operation.stage - right.operation.stage ||
              left.operation.kind.localeCompare(right.operation.kind),
          ),
        ),
      }),
    );
}

function passLabel(kind: OperationKind): string {
  return kind === 'F' ? 'FWD' : 'BWD';
}
```

Inside `OperationTray`, compute:

```tsx
const batchGroups = groupByMicrobatch(classifications);
const operationKinds: readonly OperationKind[] = ['F', 'B'];
```

Render each batch lane like this:

```tsx
<div className="operation-tray-grid" aria-label="Blocks grouped by microbatch">
  {batchGroups.map((group) => (
    <section
      key={group.microbatch}
      className="batch-lane"
      aria-label={`Batch ${group.microbatch} blocks`}
    >
      <div className="batch-lane__heading">
        <h3>Batch {group.microbatch}</h3>
      </div>
      <div className="batch-lane__stacks">
        {operationKinds.map((kind) => {
          const stackClassifications = group.classifications.filter(
            (classification) => classification.operation.kind === kind,
          );

          return (
            <div
              key={`${group.microbatch}-${kind}`}
              className="batch-stack"
              role="group"
              aria-label={`Batch ${group.microbatch} ${kind === 'F' ? 'forward' : 'backward'} blocks`}
              data-kind={kind}
            >
              <p className="batch-stack__label">{passLabel(kind)}</p>
              <div className="batch-stack__tokens">
                {stackClassifications.map((classification) => {
                  const { operation } = classification;
                  const stateLabel = visibleStateLabel(classification);
                  const isSelected = selectedOperationId === operation.id;

                  return (
                    <button
                      key={operation.id}
                      type="button"
                      className="operation-button"
                      data-testid={`tile-${operation.id}`}
                      data-operation-visual={operationVisualKey(operation)}
                      data-duration={operation.duration}
                      data-kind={operation.kind}
                      data-state={classification.status}
                      data-selected={isSelected ? 'true' : 'false'}
                      aria-label={accessibleOperationLabel(classification)}
                      aria-current={isSelected ? 'true' : undefined}
                      onClick={() => onActivate(operation.id)}
                      onFocus={() => onInspect(operation.id)}
                      style={
                        {
                          ...operationVisualVars(operation),
                          '--tile-duration': String(operation.duration),
                        } as CSSProperties
                      }
                    >
                      <span className="operation-button__stage">S{operation.stage}</span>
                      <span className="operation-button__meta">
                        R{operation.rank} - {operation.duration}t
                      </span>
                      <span className="operation-button__state">{stateLabel}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  ))}
</div>
```

- [ ] **Step 4: Run the grouping test and verify it passes**

Run:

```bash
npm test -- src/components/GameShell.test.tsx -t "groups compact block tokens"
```

Expected: PASS.

## Task 3: Style Batch Lanes And Vertical Stacks

**Files:**
- Modify: `src/styles/app.css`
- Test: `tests/responsive-css.test.mjs`

- [ ] **Step 1: Write CSS contract assertions**

Update `tests/responsive-css.test.mjs` in the compact-controls test:

```js
const batchStacksBlock = extractBlock(css, '.batch-lane__stacks');
const batchStackBlock = extractBlock(css, '.batch-stack');
const batchStackTokensBlock = extractBlock(css, '.batch-stack__tokens');
const operationButtonBlock = extractBlock(css, '\n.operation-button {');

expect(batchStacksBlock).toMatch(
  /\.batch-lane__stacks\s*\{[^}]*\bgrid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)\s*;/,
);
expect(batchStackBlock).toMatch(/\.batch-stack\s*\{[^}]*\bmin-width:\s*0\s*;/);
expect(batchStackTokensBlock).toMatch(/\.batch-stack__tokens\s*\{[^}]*\bdisplay:\s*grid\s*;/);
expect(operationButtonBlock).toMatch(
  /\.operation-button\s*\{[^}]*\bmin-height:\s*2\.75rem\s*;/,
);
expect(css).toMatch(
  /@media\s*\(max-width:\s*40rem\)[\s\S]*?\.operation-tray-grid\s*\{[\s\S]*?grid-auto-columns:\s*minmax\(13\.75rem,\s*76vw\)\s*;/,
);
```

- [ ] **Step 2: Run CSS test and verify it fails**

Run:

```bash
npm test -- tests/responsive-css.test.mjs
```

Expected: FAIL until `.batch-lane__stacks`, `.batch-stack`, and `.batch-stack__tokens` are styled.

- [ ] **Step 3: Implement compact lane CSS**

In `src/styles/app.css`, replace the previous flat `.operation-tray-grid` and button tile layout with these structures while preserving existing state selectors:

```css
.operation-tray-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(13.75rem, 1fr));
  gap: 0.55rem;
}

.batch-lane {
  position: relative;
  display: grid;
  gap: 0.42rem;
  min-width: 0;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--paper-strong);
  padding: 0.5rem;
}

.batch-lane__heading {
  display: flex;
  align-items: center;
  min-height: 1rem;
}

.batch-lane__heading h3,
.batch-stack__label {
  margin: 0;
  font-family: var(--font-mono);
  font-weight: 850;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.batch-lane__heading h3 {
  color: var(--muted);
  font-size: 0.66rem;
}

.batch-lane__stacks {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.4rem;
}

.batch-stack {
  display: grid;
  gap: 0.28rem;
  min-width: 0;
}

.batch-stack__label {
  color: var(--muted);
  font-size: 0.56rem;
}

.batch-stack[data-kind='F'] .batch-stack__label {
  color: var(--forward);
}

.batch-stack[data-kind='B'] .batch-stack__label {
  color: var(--backward);
}

.batch-stack__tokens {
  display: grid;
  gap: 0.34rem;
}

.operation-button {
  position: relative;
  display: grid;
  gap: 0.08rem;
  min-width: 0;
  min-height: 2.75rem;
  overflow: hidden;
  border: 1px solid var(--line-strong);
  border-radius: 6px;
  background: var(--paper-strong);
  color: var(--ink);
  padding: 0.42rem 0.48rem 0.5rem;
  text-align: left;
  transition:
    transform var(--motion-fast),
    box-shadow var(--motion-fast),
    opacity var(--motion-fast),
    border-color var(--motion-fast);
}
```

Keep the existing ready, blocked, completed, selected, hover, active, and reduced-motion rules. Update text selectors to `.operation-button__stage`, `.operation-button__meta`, and `.operation-button__state`.

- [ ] **Step 4: Implement mobile lane scroll CSS**

Inside `@media (max-width: 40rem)`, use:

```css
.operation-tray-grid {
  grid-auto-flow: column;
  grid-auto-columns: minmax(13.75rem, 76vw);
  grid-template-columns: none;
  overflow-x: auto;
  padding: 0.15rem 0 0.45rem;
  scroll-snap-type: x proximity;
}

.batch-lane {
  scroll-snap-align: start;
}
```

- [ ] **Step 5: Run CSS contract tests**

Run:

```bash
npm test -- tests/responsive-css.test.mjs
```

Expected: PASS.

## Task 4: Carry Operation Color Hints Into Board And Preview

**Files:**
- Modify: `src/components/ScheduleBoard.tsx`
- Modify: `src/styles/app.css`
- Test: `src/components/GameShell.test.tsx`

- [ ] **Step 1: Write failing board identity test**

Add assertions to `src/components/GameShell.test.tsx`:

```tsx
it('carries operation color identity from selector to schedule and preview', async () => {
  const user = userEvent.setup();
  render(<App initialLevelId="dependency-chain" />);

  const selectorTile = screen.getByTestId('tile-F:0:0');
  expect(selectorTile).toHaveAttribute('data-operation-visual', 'F-0-0');

  await tabUntil(
    user,
    screen.getByRole('button', { name: /place F stage 0 microbatch 0, 1 tick, ready/i }),
  );
  const preview = screen.getByTestId('preview-tile-F:0:0');
  expect(preview).toHaveAttribute('data-operation-visual', 'F-0-0');

  await user.keyboard('{Enter}');
  const placed = screen.getByTestId('rank-tile-F:0:0');
  expect(placed).toHaveAttribute('data-operation-visual', 'F-0-0');
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
npm test -- src/components/GameShell.test.tsx -t "carries operation color identity"
```

Expected: FAIL because schedule and preview rects do not yet expose `data-operation-visual`.

- [ ] **Step 3: Apply operation visual variables in ScheduleBoard**

In `src/components/ScheduleBoard.tsx`, import:

```ts
import { operationVisualKey, operationVisualVars } from './operationVisuals';
```

For placed operation `<rect>` nodes, add:

```tsx
data-operation-visual={operationVisualKey(operation)}
style={operationVisualVars(operation)}
```

For preview `<rect>` nodes, add:

```tsx
data-operation-visual={operationVisualKey(previewOperation)}
style={operationVisualVars(previewOperation)}
```

- [ ] **Step 4: Add SVG color hint CSS**

In `src/styles/app.css`, update schedule and preview rect styles:

```css
.schedule-rect {
  stroke: var(--operation-accent, rgba(23, 33, 35, 0.7));
  stroke-width: 1.5;
}

.schedule-rect[data-selected='true'] {
  stroke: var(--accent);
  stroke-width: 3;
}

.schedule-preview-rect {
  fill: hsl(var(--operation-hue, 44) 75% 88% / 0.28);
  stroke: var(--operation-accent, var(--accent));
  stroke-dasharray: 5 4;
  stroke-width: 2;
}
```

Keep `data-kind='F'` and `data-kind='B'` as semantic hooks, but do not make them the only source of color.

- [ ] **Step 5: Run focused test**

Run:

```bash
npm test -- src/components/GameShell.test.tsx -t "carries operation color identity"
```

Expected: PASS.

## Task 5: Focused Verification And Commit

**Files:**
- Modify: all Phase 1 files

- [ ] **Step 1: Format touched files**

Run:

```bash
npx prettier --write \
  src/components/operationVisuals.ts \
  src/components/OperationTray.tsx \
  src/components/ScheduleBoard.tsx \
  src/components/GameShell.test.tsx \
  src/styles/app.css \
  tests/responsive-css.test.mjs
```

Expected: Prettier reports files written or unchanged.

- [ ] **Step 2: Run focused verification**

Run:

```bash
npm test -- src/components/GameShell.test.tsx tests/responsive-css.test.mjs && npm run typecheck
```

Expected: Game shell tests, responsive CSS tests, and TypeScript all pass.

- [ ] **Step 3: Run full verification**

Run:

```bash
npm run verify
```

Expected: format, lint, typecheck, tests, and build pass.

- [ ] **Step 4: Check diff scope**

Run:

```bash
git diff --check
git status --short
git diff --stat
```

Expected:

```text
git diff --check
# no output
```

`git status --short` should show only intended Phase 1 files plus any pre-existing unrelated untracked files. Do not stage `.superpowers/` or `src/components/PipelineLessonPanel.tsx`.

- [ ] **Step 5: Commit Phase 1**

Run:

```bash
git add \
  src/components/operationVisuals.ts \
  src/components/OperationTray.tsx \
  src/components/ScheduleBoard.tsx \
  src/components/GameShell.test.tsx \
  src/styles/app.css \
  tests/responsive-css.test.mjs
git commit -m "Improve Sensei batch block selector"
```

Expected: one focused commit containing selector, board-color, CSS, and test changes.

## Self-Review

Spec coverage:

- Batch lanes with vertical `FWD` and `BWD` stacks: Task 2 and Task 3.
- Stable operation color identity across selector, board, and preview: Task 1 and Task 4.
- Tuple notation only as compact key: Task 2 test and markup.
- Accessibility and keyboard behavior preserved: Task 2 keeps button roles and accessible names; Task 5 runs existing accessibility coverage through `npm run verify`.
- Mobile lane scroll: Task 3 CSS and CSS contract test.
- Phase 2 separated: Scope Check and non-goal statement.

Placeholder scan:

- No placeholder markers or unspecified implementation steps are intentionally left in this plan.

Type consistency:

- `operationVisualKey`, `operationHue`, and `operationVisualVars` are defined in Task 1 before use in Task 2 and Task 4.
- `OperationKind`, `Operation`, and `OperationId` are existing engine types.

Risk:

- Existing uncommitted prototype may already satisfy part of Task 2 and Task 3. Execution should reconcile it with this plan rather than overwrite unrelated changes.
