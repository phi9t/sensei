# Sensei Placement Rail Affordance Spec

**Status:** Approved execution spec

**Date:** 2026-08-25

## Route

Ask Matt route: idea-to-ship in the current codebase. This is a small UI/UX
pass that can be implemented directly with behavior tests, CSS contract tests,
visual verification, deployment, and a focused commit.

## Product Direction

Sensei is a dense technical learning game where the core loop is selecting and
placing pipeline blocks. The command rail should make that loop clearer without
adding another explanation panel.

- Purpose: make the selected block and `Place` affordance obvious at the point
  of action.
- Audience: engineers learning pipeline parallel scheduling through repeated
  fast attempts.
- Tone: compact, precise, calm, and operational.
- Memorable detail: the rail shows a small selected-block capsule that states
  whether the chosen block is ready, blocked, already placed, or absent.
- Constraints: keep direct block-click placement; keep blocked/completed blocks
  inspectable; keep the schedule board dominant; do not add `Pipeline rules`;
  do not touch unrelated untracked files.

## End-State UX

The command rail should include a compact selected-block status near `Place`.

States:

- no selection: `No block selected` and `Choose a ready block`.
- legal selection: `Ready F0:S0:D0` and placement timing/rank.
- blocked selection: `Blocked B0:S0:D0` and blocker count.
- completed selection: `Placed F0:S0:D0` and board timing.

`Place` should only be enabled for a legal selected block. Direct clicking a
ready block in the ready queue should still place immediately.

## Layout

- The status lives inside the existing schedule command rail.
- It must be compact and wrap safely on mobile.
- It must not push the rail into a tall instruction panel.
- It must use text, not color alone, for state.
- It must use stable CSS hooks for tests and future polish.

## Non-Goals

- Do not change scheduling, scoring, replay, persistence, unlocks, or fixtures.
- Do not change operation button direct placement behavior.
- Do not add a new lesson or rules panel.
- Do not wire `PipelineLessonPanel`.

## Acceptance Criteria

- Initially, `Place` is disabled and the rail says no block is selected.
- Selecting a legal block enables `Place` and shows the terse block code plus
  rank/timing context.
- Selecting a blocked block keeps `Place` disabled and shows blocker count.
- Selecting a completed block keeps `Place` disabled and shows placement
  context.
- Direct ready-block click placement still works.
- The status capsule is visible, responsive, and does not create page-level
  horizontal overflow.
- Focused behavior tests, CSS contract tests, full verification, visual sanity,
  Goofy Preview deployment, and commit all pass.
