# Sensei Curriculum UX Completion Spec

**Status:** Approved execution spec

**Date:** 2026-08-25

## Route

Ask Matt route: this is an idea-to-ship continuation in an existing codebase. The
work is small enough to implement in this session rather than splitting into
tracker issues. Use the existing docs, tests, and local verification as the
execution contract.

## Product Direction

Sensei is a dense technical learning game, not a tutorial page. The UI should
feel like a compact scheduling cockpit:

- the schedule board remains the dominant object;
- ready blocks remain the primary interaction;
- explanations stay contextual and optional;
- algorithm progression is visible without becoming a rules panel;
- compact labels preserve the `F0:S0:D1` visual code while accessible labels
  spell out pass, stage, microbatch, direction, duration, and status.

The design direction is a data-dense learning cockpit with restrained color,
strong monospaced object identity, subtle state transitions, and local scrolling
for queue and board regions. Avoid hero composition, decorative blobs, nested
cards, and long visible rules copy.

## End-State UX

### Level Guide

The level guide is the learner's orientation strip. It should show:

- current curriculum set and level title;
- one-sentence concept;
- no more than four compact chips: primary goal, combined completion
  state/current makespan, primary modifier when present, and level index;
- a collapsed `Concepts` disclosure with the level objective and introduced
  model terms, set-local progress, and next-level context.

The disclosure is the home for algorithm explanations. It must be closed by
default, keyboard reachable, and shallow enough that opening it does not compete
with the schedule board.

### Ready Queue

The ready queue remains a parts bin:

- grouped by microbatch;
- FWD/BWD/WGT stacks stay vertically grouped;
- batch color hints remain stable from queue to board;
- token visible text remains compact;
- blocked and completed blocks remain inspectable.

### Inspector

The inspector remains selected-block first:

- same swatch/color identity as queue and board;
- compact facts before prose;
- blockers and memory/resource facts only when relevant.

### Board And Score

The lower workspace keeps the board dominant. The score rail stays
scoreboard-first, with policy comparison and metrics behind disclosures.

## Remaining Work To End

1. **Curriculum orientation pass**
   - Add level/set progress and next-level context to the guide.
   - Add collapsed concept/objective disclosure backed by `LevelConfig.algorithm`.
   - Preserve no-rules-panel tests.

2. **Responsive and accessibility hardening**
   - Keep guide chips bounded with no text overflow.
   - Keep focus visible for the guide disclosure and scrollable board.
   - Maintain mobile local scrolling and touch-sized controls.

3. **Visual verification**
   - Run focused component and CSS tests.
   - Run accessibility tests.
   - Run full `npm run verify`.
   - Capture desktop and mobile screenshots from a production preview.

4. **Deploy**
   - Build `dist`.
   - Redeploy the latest verified artifact to Goofy Preview alias `groovy`.
   - Verify the served URL returns the expected app shell.

5. **Post-execution review**
   - Record what changed, tests run, visual findings, and any next refinements.
   - Do not touch unrelated untracked work.

## Acceptance Criteria

- The guide exposes a concise algorithm explanation for every level through
  existing metadata.
- The default first viewport still focuses on placing blocks.
- There is no visible `Pipeline rules` region in the normal cockpit.
- Guide chips stay bounded and support long labels by ellipsis or wrapping in
  controlled space.
- Keyboard and screen-reader users can reach the concept disclosure.
- Existing score, board, ready queue, and policy comparison behavior remains
  intact.
- `npm run verify` passes.
- The `groovy` preview is updated and reachable.
