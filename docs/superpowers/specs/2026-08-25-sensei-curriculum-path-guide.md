# Sensei Curriculum Path Guide Spec

**Status:** Approved execution spec

**Date:** 2026-08-25

## Route

Ask Matt route: idea-to-ship in the current codebase. This is a small UI/UX
pass that can be implemented directly with behavior tests, CSS contract tests,
visual verification, deployment, and a focused commit.

## Product Direction

Sensei is a dense technical learning game for pipeline scheduling. The next
improvement should help learners understand where the current level sits in the
algorithm ladder without adding a second lesson panel or distracting from block
placement.

- Purpose: show curriculum position and access state while the player stays in
  the scheduling cockpit.
- Audience: engineers learning GPipe, 1F1B, zero-bubble, grouped, FSDP, and
  DualPipe scheduling through repeated attempts.
- Tone: compact, precise, calm, and progress-oriented.
- Memorable detail: the learner sees the algorithm ladder as compact set nodes,
  with the active set called out and locked sets visible but subdued.
- Constraints: keep the schedule board dominant; keep the ready queue compact;
  keep the level select as the navigation control; do not add a `Pipeline rules`
  region; do not touch unrelated untracked files.

## End-State UX

The existing `Concepts` disclosure in the level guide should include a compact
`Course path` list.

Each set node should show:

- set title;
- current/unlocked/locked state;
- current level position inside that set, such as `2/4`;
- total level count for locked future sets;
- no per-level rules or long prose.

The current set should be visually stronger. Completed or unlocked sets should
be readable and available to screen readers. Locked future sets should be
subdued but still visible so the course ladder is understandable.

## Layout

- The path lives inside the existing `Concepts` disclosure.
- It uses a horizontal, locally scrollable list on narrow layouts.
- It wraps or scrolls locally without causing page-level horizontal overflow.
- It uses static list items, not buttons, because level switching remains owned
  by the native select.
- It must not increase the always-visible top row height.

## Non-Goals

- Do not replace the level selector.
- Do not add a new always-visible curriculum panel.
- Do not wire `PipelineLessonPanel`.
- Do not change unlock, scoring, replay, or persistence behavior.

## Acceptance Criteria

- The `Concepts` disclosure stays closed by default.
- Opening `Concepts` shows `Course path`.
- The current algorithm set is marked `Current` and shows set progress.
- Previously unlocked sets are marked `Open`; future sets are marked `Locked`.
- The course path is represented as one compact list with stable styling hooks.
- No `Pipeline rules` region is added.
- Focused behavior tests, CSS contract tests, full verification, visual sanity,
  Goofy Preview deployment, and commit all pass.
