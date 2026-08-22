# Sensei Policy Comparison Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `SENSEI-CURR-02` by showing compact policy-relative comparison feedback for completed current-engine GPipe and 1F1B schedules.

**Architecture:** Add a pure engine helper that compares a completed schedule against the projected reference policy from `src/engine/policies.ts`. Thread that comparison through `useGame` into the score rail, and use it to make completion feedback more diagnostic without adding a rules panel. The UI stays scoreboard-first: comparison details live behind a compact disclosure.

**Tech Stack:** TypeScript, React 19, Vitest, Testing Library, existing Sensei replay/score/policy modules, CSS contract tests.

---

## Scope

This plan implements only `SENSEI-CURR-02`.

It does not implement building blocks, virtual stages, grouped scheduling, `W` operations, zero-bubble scoring, FSDP residency, or DualPipe. It must not touch the pre-existing untracked `src/components/PipelineLessonPanel.tsx`.

## File Map

- Create `src/engine/policyComparison.ts`
  - Pure comparison helper.
  - Depends on `recognizeSchedule()`, `projectReferencePolicy()`, and `score()`.
  - Returns `null` for incomplete schedules and non-reference curriculum families.
- Create `src/engine/policyComparison.test.ts`
  - Engine-owned tests for exact match, order-only match, unmatched schedule, incomplete schedule, and foundation-level suppression.
- Modify `src/app/useGame.ts`
  - Add `policyComparison` to `GameViewModel`.
  - Compute comparison from the current schedule.
  - Reuse comparison in completion feedback.
- Modify `src/app/App.tsx`
  - Pass `game.policyComparison` to `MetricsPanel`.
- Modify `src/components/MetricsPanel.tsx`
  - Render a compact `Reference comparison` disclosure below the scoreboard.
- Modify `src/components/GameShell.test.tsx`
  - Verify comparison details are keyboard-reachable and do not appear as a new rules panel.
- Modify `tests/game-flow.test.tsx`
  - Verify completion feedback for order-only or missed-mastery completions includes a concise reference delta.
- Modify `tests/responsive-css.test.mjs`
  - Lock the comparison disclosure as compact score-rail content.
- Modify `src/styles/app.css`
  - Add small score-rail styles for the comparison disclosure and deltas.

## Invariants

- Policy comparison is policy-relative, not an optimality claim.
- The canonical learner artifact remains `Action[]`.
- Persistence schemas do not change in this slice.
- Existing foundation levels do not show GPipe/1F1B comparison labels.
- The score rail remains scoreboard-first.
- The schedule board remains the dominant lower workspace.

---

### Task 1: Add Pure Policy Comparison Helper

**Files:**

- Create: `src/engine/policyComparison.test.ts`
- Create: `src/engine/policyComparison.ts`

- [ ] **Step 1: Write the failing engine tests**

Create `src/engine/policyComparison.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Action } from './types';
import { LEGAL_ACTIONS, MASTERED_ACTIONS } from '../levels/fixtures';
import { getLevel } from '../levels/levels';
import { replay } from './replay';
import { compareToReferencePolicy } from './policyComparison';

function replayComplete(levelId: Parameters<typeof getLevel>[0], actions: readonly Action[]) {
  const result = replay(getLevel(levelId), actions);
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error('unreachable replay failure');
  }
  return result.state;
}

describe('policy comparison', () => {
  it('returns exact zero deltas for the GPipe AFAB reference schedule', () => {
    const state = replayComplete('gpipe-afab', MASTERED_ACTIONS['gpipe-afab']);

    expect(compareToReferencePolicy(state)).toEqual({
      policyId: 'gpipe-afab',
      label: 'GPipe AFAB',
      match: 'exact',
      current: {
        makespan: 18,
        peakActivationMemory: 4,
        intentionalIdle: 0,
        actionCount: 24,
      },
      reference: {
        makespan: 18,
        peakActivationMemory: 4,
        intentionalIdle: 0,
        actionCount: 24,
      },
      delta: {
        makespan: 0,
        peakActivationMemory: 0,
        intentionalIdle: 0,
        actionCount: 0,
      },
    });
  });

  it('reports order-only matches when intentional idle changes timing', () => {
    const state = replayComplete('gpipe-afab', LEGAL_ACTIONS['gpipe-afab']);
    const comparison = compareToReferencePolicy(state);

    expect(comparison).toMatchObject({
      policyId: 'gpipe-afab',
      label: 'GPipe AFAB',
      match: 'order-only',
    });
    expect(comparison?.delta.makespan).toBe(1);
    expect(comparison?.delta.intentionalIdle).toBe(1);
  });

  it('compares unmatched complete schedules against the family reference', () => {
    const state = replayComplete('gpipe-afab', [
      ...MASTERED_ACTIONS['gpipe-afab'].slice(0, 12),
      { type: 'place', operationId: 'B:2:3' },
      { type: 'place', operationId: 'B:1:3' },
      { type: 'place', operationId: 'B:0:3' },
      ...MASTERED_ACTIONS['gpipe-afab'].slice(12, 21),
    ]);

    const comparison = compareToReferencePolicy(state);

    expect(comparison).toMatchObject({
      policyId: 'gpipe-afab',
      label: 'GPipe AFAB',
      match: 'unmatched',
    });
    expect(comparison?.current.makespan).toBeGreaterThanOrEqual(comparison?.reference.makespan ?? 0);
  });

  it('returns null for incomplete schedules', () => {
    const result = replay(getLevel('gpipe-afab'), MASTERED_ACTIONS['gpipe-afab'].slice(0, 4));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(compareToReferencePolicy(result.state)).toBeNull();
    }
  });

  it('does not label foundation levels as algorithm references', () => {
    const state = replayComplete('dependency-chain', MASTERED_ACTIONS['dependency-chain']);

    expect(compareToReferencePolicy(state)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the engine tests and verify they fail**

Run:

```bash
npm test -- src/engine/policyComparison.test.ts
```

Expected: FAIL because `./policyComparison` does not exist.

- [ ] **Step 3: Implement the comparison helper**

Create `src/engine/policyComparison.ts`:

```ts
import {
  REFERENCE_POLICIES,
  projectReferencePolicy,
  recognizeSchedule,
  type ReferencePolicyId,
} from './policies';
import type { ScheduleState } from './replay';
import { attemptRankingTuple, type AttemptRankingTuple } from './score';

export type PolicyMatchKind = 'exact' | 'order-only' | 'unmatched';

export interface PolicyComparison {
  readonly policyId: ReferencePolicyId;
  readonly label: string;
  readonly match: PolicyMatchKind;
  readonly current: AttemptRankingTuple;
  readonly reference: AttemptRankingTuple;
  readonly delta: AttemptRankingTuple;
}

function isComparableFamily(family: ScheduleState['config']['algorithm']['family']): boolean {
  return family === 'gpipe' || family === 'one-f-one-b';
}

function subtractTuples(
  current: AttemptRankingTuple,
  reference: AttemptRankingTuple,
): AttemptRankingTuple {
  return Object.freeze({
    makespan: current.makespan - reference.makespan,
    peakActivationMemory: current.peakActivationMemory - reference.peakActivationMemory,
    intentionalIdle: current.intentionalIdle - reference.intentionalIdle,
    actionCount: current.actionCount - reference.actionCount,
  });
}

export function compareToReferencePolicy(state: ScheduleState): PolicyComparison | null {
  if (!isComparableFamily(state.config.algorithm.family)) {
    return null;
  }

  if (state.placements.length !== state.operations.length) {
    return null;
  }

  const recognition = recognizeSchedule(state);
  const policyId =
    recognition.kind === 'matched'
      ? recognition.policyId
      : recognition.candidatePolicyIds.find((candidate) => {
          const projected = projectReferencePolicy(state.config, candidate);
          return projected.ok;
        });

  if (!policyId) {
    return null;
  }

  const projected = projectReferencePolicy(state.config, policyId);
  if (!projected.ok) {
    return null;
  }

  const current = attemptRankingTuple(state);
  const reference = attemptRankingTuple(projected.state);
  const match: PolicyMatchKind =
    recognition.kind === 'matched' ? (recognition.exact ? 'exact' : 'order-only') : 'unmatched';
  const label =
    recognition.kind === 'matched' ? recognition.label : REFERENCE_POLICIES[policyId].label;

  return Object.freeze({
    policyId,
    label,
    match,
    current,
    reference,
    delta: subtractTuples(current, reference),
  });
}
```

- [ ] **Step 4: Run the focused engine tests**

Run:

```bash
npm test -- src/engine/policyComparison.test.ts src/engine/policies.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the pure comparison helper**

Run:

```bash
git add src/engine/policyComparison.ts src/engine/policyComparison.test.ts
git commit -m "feat: add policy comparison helper"
```

---

### Task 2: Thread Comparison Into The View Model And Score Rail

**Files:**

- Modify: `src/app/useGame.ts`
- Modify: `src/app/App.tsx`
- Modify: `src/components/MetricsPanel.tsx`
- Modify: `src/components/GameShell.test.tsx`

- [ ] **Step 1: Write the failing score-rail UI test**

In `src/components/GameShell.test.tsx`, add this test inside `describe('Game shell', () => { ... })`:

```ts
  it('shows policy-relative comparison behind a compact score detail', async () => {
    const user = userEvent.setup();
    render(<App initialLevelId="gpipe-afab" />);

    for (const action of MASTERED_ACTIONS['gpipe-afab']) {
      if (action.type !== 'place') {
        throw new Error('expected place-only mastered fixture');
      }
      const [kind, stage, microbatch] = action.operationId.split(':');
      await user.click(
        screen.getByRole('button', {
          name: new RegExp(`place ${kind} stage ${stage} microbatch ${microbatch}`, 'i'),
        }),
      );
    }

    const metrics = screen.getByRole('region', { name: /metrics panel/i });
    expect(within(metrics).getByRole('group', { name: /scoreboard/i })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: /pipeline rules/i })).not.toBeInTheDocument();

    await user.click(within(metrics).getByText(/^Reference comparison$/i));
    const comparison = within(metrics).getByRole('group', {
      name: /reference comparison/i,
    });
    expect(within(comparison).getByText(/^GPipe AFAB reference$/i)).toBeInTheDocument();
    expect(within(comparison).getByText(/^Exact reference match$/i)).toBeInTheDocument();
    expect(within(comparison).getByText(/^Makespan delta$/i)).toBeInTheDocument();
    expect(within(comparison).getByText(/^0$/i)).toBeInTheDocument();
  });
```

Add these imports if they are not already present:

```ts
import { MASTERED_ACTIONS } from '../levels/fixtures';
```

- [ ] **Step 2: Run the UI test and verify it fails**

Run:

```bash
npm test -- src/components/GameShell.test.tsx -t "policy-relative comparison"
```

Expected: FAIL because no reference comparison region is rendered.

- [ ] **Step 3: Add comparison to the game view model**

In `src/app/useGame.ts`, add the import:

```ts
import {
  compareToReferencePolicy,
  type PolicyComparison,
} from '../engine/policyComparison';
```

Extend `GameViewModel`:

```ts
  readonly policyComparison: PolicyComparison | null;
```

Inside `useGame()`, after `const attemptTuple = attemptRankingTuple(schedule);`, add:

```ts
  const policyComparison = compareToReferencePolicy(schedule);
```

In the returned object, add:

```ts
    policyComparison,
```

- [ ] **Step 4: Pass comparison into `MetricsPanel`**

In `src/app/App.tsx`, update the `MetricsPanel` call:

```tsx
            <MetricsPanel
              level={game.level}
              score={game.score}
              currentMemory={game.schedule.currentMemory}
              attemptTuple={game.attemptTuple}
              policyComparison={game.policyComparison}
            />
```

- [ ] **Step 5: Render compact comparison in `MetricsPanel`**

In `src/components/MetricsPanel.tsx`, add the import:

```ts
import type { PolicyComparison } from '../engine/policyComparison';
```

Extend props:

```ts
  readonly policyComparison: PolicyComparison | null;
```

Add helpers above the component:

```ts
function formatDelta(value: number): string {
  if (value > 0) {
    return `+${value}`;
  }
  return `${value}`;
}

function formatMatch(match: PolicyComparison['match']): string {
  switch (match) {
    case 'exact':
      return 'Exact reference match';
    case 'order-only':
      return 'Same per-rank order';
    case 'unmatched':
      return 'Different order';
  }
}
```

Update the component signature:

```ts
export function MetricsPanel({
  level,
  score,
  currentMemory,
  attemptTuple,
  policyComparison,
}: MetricsPanelProps) {
```

Render this block after the scoreboard and before `Metric details`:

```tsx
      {policyComparison ? (
        <details className="policy-comparison">
          <summary>
            <span>Reference comparison</span>
            <span className="metrics-summary__value">{policyComparison.label}</span>
          </summary>
          <dl className="metrics-grid" role="group" aria-label="Reference comparison">
            <div>
              <dt>Policy</dt>
              <dd>{policyComparison.label} reference</dd>
            </div>
            <div>
              <dt>Match</dt>
              <dd>{formatMatch(policyComparison.match)}</dd>
            </div>
            <div>
              <dt>Reference makespan</dt>
              <dd>{policyComparison.reference.makespan}</dd>
            </div>
            <div>
              <dt>Makespan delta</dt>
              <dd>{formatDelta(policyComparison.delta.makespan)}</dd>
            </div>
            <div>
              <dt>Reference peak memory</dt>
              <dd>{policyComparison.reference.peakActivationMemory}</dd>
            </div>
            <div>
              <dt>Peak memory delta</dt>
              <dd>{formatDelta(policyComparison.delta.peakActivationMemory)}</dd>
            </div>
          </dl>
        </details>
      ) : null}
```

- [ ] **Step 6: Run the focused UI test**

Run:

```bash
npm test -- src/components/GameShell.test.tsx -t "policy-relative comparison"
```

Expected: PASS.

- [ ] **Step 7: Commit the score-rail comparison UI**

Run:

```bash
git add src/app/useGame.ts src/app/App.tsx src/components/MetricsPanel.tsx src/components/GameShell.test.tsx
git commit -m "feat: show policy comparison in score rail"
```

---

### Task 3: Make Completion Feedback Diagnostic

**Files:**

- Modify: `tests/game-flow.test.tsx`
- Modify: `src/app/useGame.ts`

- [ ] **Step 1: Write the failing completion-feedback regression**

In `tests/game-flow.test.tsx`, add this test after the existing recognized-reference completion test:

```ts
  it('summarizes policy-relative deltas for non-exact reference completions', async () => {
    const user = userEvent.setup();

    render(<App initialLevelId="gpipe-afab" />);

    await runJourney(user, LEGAL_ACTIONS['gpipe-afab'], 'pointer');

    expect(screen.getByRole('status', { name: /interaction feedback/i })).toHaveTextContent(
      /Completed with GPipe AFAB order, \+1 makespan vs reference\. Legal completion\. Missed makespan target\./i,
    );
  }, 10000);
```

- [ ] **Step 2: Run the regression and verify it fails**

Run:

```bash
npm test -- tests/game-flow.test.tsx -t "policy-relative deltas"
```

Expected: FAIL because current feedback says only `Legal completion.` or the existing exact-reference message.

- [ ] **Step 3: Update completion feedback formatting**

In `src/app/useGame.ts`, keep the existing `recognizeSchedule` import only if still used directly. If `compareToReferencePolicy` is imported from Task 2, use it inside `completionMessage()`.

Add these helpers near `completionMessage()`:

```ts
function formatSignedDelta(value: number): string {
  if (value > 0) {
    return `+${value}`;
  }
  return `${value}`;
}

function missedMasteryReason(level: ReturnType<typeof getLevel>, scoreResult: ReturnType<typeof score>): string | null {
  for (const target of level.masteryTargets) {
    if (!('metric' in target)) {
      continue;
    }

    const actual =
      target.metric === 'makespan'
        ? scoreResult.makespan
        : target.metric === 'bubbleRatio'
          ? scoreResult.bubbleRatio
          : target.metric === 'intentionalIdle'
            ? scoreResult.intentionalIdle
            : scoreResult.peakActivationMemory;

    if (actual > target.value) {
      return `Missed ${target.metric} target.`;
    }
  }

  return null;
}
```

Replace `completionMessage()` with:

```ts
function completionMessage(levelId: LevelId, actions: readonly Action[]): string | null {
  const level = getLevel(levelId);
  const replayed = replay(level, actions);
  if (!replayed.ok) {
    throw new Error(`Completed attempt became invalid at action ${replayed.index}.`);
  }

  const scoreResult = score(replayed.state);
  if (!scoreResult.complete) {
    return null;
  }

  const outcome = scoreResult.mastered ? 'Mastered.' : 'Legal completion.';
  const missed = scoreResult.mastered ? null : missedMasteryReason(level, scoreResult);
  const suffix = missed ? ` ${missed}` : '';
  const comparison = compareToReferencePolicy(replayed.state);

  if (!comparison) {
    return `Completed. ${outcome}${suffix}`;
  }

  if (comparison.match === 'exact') {
    return `Completed as ${comparison.label} reference. ${outcome}${suffix}`;
  }

  if (comparison.match === 'order-only') {
    return `Completed with ${comparison.label} order, ${formatSignedDelta(
      comparison.delta.makespan,
    )} makespan vs reference. ${outcome}${suffix}`;
  }

  return `Completed against ${comparison.label} reference, ${formatSignedDelta(
    comparison.delta.makespan,
  )} makespan vs reference. ${outcome}${suffix}`;
}
```

- [ ] **Step 4: Run the focused game-flow test**

Run:

```bash
npm test -- tests/game-flow.test.tsx -t "recognized reference|policy-relative deltas"
```

Expected: PASS.

- [ ] **Step 5: Commit the completion feedback refinement**

Run:

```bash
git add src/app/useGame.ts tests/game-flow.test.tsx
git commit -m "feat: add policy-relative completion feedback"
```

---

### Task 4: Add Compact CSS Contract For Comparison Details

**Files:**

- Modify: `tests/responsive-css.test.mjs`
- Modify: `src/styles/app.css`

- [ ] **Step 1: Write the failing CSS contract**

In `tests/responsive-css.test.mjs`, inside `it('keeps selected identity and score summary compact in the right rail', async () => { ... })`, add:

```js
    const policyComparisonBlock = extractBlock(css, '.policy-comparison');

    expect(policyComparisonBlock).toMatch(/\\.policy-comparison\\s*\\{[^}]*\\bborder-radius:\\s*8px\\s*;/);
    expect(policyComparisonBlock).toMatch(/\\.policy-comparison\\s*\\{[^}]*\\boverflow:\\s*hidden\\s*;/);
    expect(policyComparisonBlock).not.toMatch(/\\bposition:\\s*absolute\\s*;/);
```

- [ ] **Step 2: Run the CSS test and verify it fails**

Run:

```bash
npm test -- tests/responsive-css.test.mjs -t "score summary compact"
```

Expected: FAIL because `.policy-comparison` is not styled yet.

- [ ] **Step 3: Add compact score-rail styles**

In `src/styles/app.css`, near the existing `.metrics-details` styles, add:

```css
.policy-comparison {
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.56);
}

.policy-comparison summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.62rem 0.72rem;
  color: var(--ink);
  font-size: 0.78rem;
  font-weight: 800;
}

.policy-comparison .metrics-grid {
  border-top: 1px solid var(--line);
  padding: 0.7rem;
}
```

- [ ] **Step 4: Run the CSS test**

Run:

```bash
npm test -- tests/responsive-css.test.mjs -t "score summary compact"
```

Expected: PASS.

- [ ] **Step 5: Commit the CSS contract**

Run:

```bash
git add tests/responsive-css.test.mjs src/styles/app.css
git commit -m "style: keep policy comparison compact"
```

---

### Task 5: Full Verification And Final Review

**Files:**

- Review: all files changed by Tasks 1-4

- [ ] **Step 1: Run full verification**

Run:

```bash
npm run verify
```

Expected: PASS. The existing jsdom canvas `getContext()` warning may appear during accessibility tests; it is acceptable if the suite exits successfully.

- [ ] **Step 2: Confirm unrelated files are not staged**

Run:

```bash
git status --short --untracked-files=all
```

Expected:

```text
?? src/components/PipelineLessonPanel.tsx
```

If the status includes modified files from Tasks 1-4 after the commits, inspect them with `git diff` and commit the missing focused change before continuing.

- [ ] **Step 3: Review recent commits**

Run:

```bash
git log --oneline -6
```

Expected: the newest commits are the focused `CURR-02` commits from this plan, followed by `ee75300 docs: add rest curriculum execution design` and `18aae49 feat: add reference policy recognition`.

- [ ] **Step 4: Report completion**

Final response should include:

- implemented `SENSEI-CURR-02`;
- commit hashes created during execution;
- `npm run verify` result;
- note that `src/components/PipelineLessonPanel.tsx` remains untouched and untracked.

## Plan Self-Review

- Spec coverage: this plan covers Wave 1 / `SENSEI-CURR-02` from the approved rest-curriculum execution design. Later waves intentionally require separate plans.
- Placeholder scan: no unresolved placeholder markers are present.
- Type consistency: `PolicyComparison`, `PolicyMatchKind`, and `compareToReferencePolicy()` are introduced in Task 1 and reused by Tasks 2 and 3.
- Scope check: the plan avoids persistence schema changes, topology changes, new operation kinds, and new levels.
