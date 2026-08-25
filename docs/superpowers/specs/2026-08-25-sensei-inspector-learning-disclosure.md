# Sensei Inspector Learning Disclosure Spec

**Status:** Approved execution spec

**Date:** 2026-08-25

## Route

Ask Matt route: idea-to-ship in an existing codebase. The work is small enough to
implement in this session. Use the existing React/Vite cockpit, behavior tests,
CSS contract tests, visual inspection, deployment, and commit as the execution
contract.

## Product Direction

Sensei remains a compact technical scheduling game. The next UX improvement
should make the selected block easier to understand without creating another
visible tutorial surface.

- Purpose: help learners connect a selected token to the scheduler invariant it
  is testing.
- Audience: engineers repeatedly trying pipeline schedules on a laptop.
- Tone: dense, calm, cockpit-like, and inspectable.
- Memorable detail: the selected token keeps its `F0:S0:B1` identity while the
  inspector decodes it into pass, stage, microbatch, direction, duration, and
  dependency gates.
- Constraints: keep block placement primary; do not add a `Pipeline rules`
  region; do not stage unrelated untracked work.

## End-State UX

### Move Inspector

The move inspector should add a closed-by-default `Why this block?` disclosure
under the existing compact selected-block summary.

When opened, it should show:

- a one-line decode of the compact visible token;
- the `(F/B, stage_id, micro_batch_id)` naming convention, extended to
  `(F/B/W, stage_id, micro_batch_id)` only on levels with split weight-gradient
  blocks;
- the selected block's rank, duration, direction when present, and readiness
  state;
- compact dependency-gate chips marked as satisfied or waiting;
- status copy that reuses current engine/coaching truth rather than a duplicate
  rules engine.

The default view should remain compact: selected operation card, fact chips, and
current legal/blocked/completed message.

### Layout

The disclosure must stay within the right rail:

- bounded width;
- bounded height with local scrolling;
- no horizontal overflow;
- chips wrap or truncate predictably;
- native `summary` remains keyboard reachable and inherits visible focus.

### Non-Goals

- Do not wire in `PipelineLessonPanel`.
- Do not add a standalone `Pipeline rules` panel.
- Do not rewrite scheduling logic or policy comparison.
- Do not change ready-queue or board token names.

## Acceptance Criteria

- Selecting a blocked block exposes a closed `Why this block?` disclosure in the
  move inspector.
- Opening the disclosure decodes the token using `F0:S0:B1` style and explains
  the level-appropriate `(F/B, stage_id, micro_batch_id)` naming.
- Dependency gates are visible as compact satisfied/waiting items.
- The disclosure is absent when no block is selected.
- The normal cockpit still has no `Pipeline rules` region.
- CSS bounds keep the disclosure local to the inspector rail.
- Focused behavior tests, CSS contract tests, full verification, visual sanity,
  and Goofy Preview deployment pass.
