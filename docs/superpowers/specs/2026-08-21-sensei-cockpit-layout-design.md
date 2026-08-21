# Sensei Cockpit Layout Design

**Status:** Design captured; awaiting review

**Date:** 2026-08-21

**Related specs:**

- `2026-08-19-sensei-pipeline-game-design.md`
- `2026-08-21-sensei-batch-stacks-and-curriculum-design.md`

## Outcome

Rebalance Sensei from a stack of large panels into a dense scheduling cockpit for a 13-inch laptop screen. The schedule board should occupy the main lower workspace, the ready queue should become a compact parts bin, and the current level guidance should live in a shallow top band above play.

The goal is still block placement. This pass should not add a visible rules panel or expand the scheduling engine.

## Current Context

The current UI already has the right functional pieces:

- `App.tsx` owns the top header, live region, and main `content-grid`.
- `OperationTray.tsx` renders grouped batch lanes with `FWD` and `BWD` stacks.
- `ScheduleBoard.tsx` renders the SVG schedule board, memory strips, gaps, previews, and placed blocks.
- `GameControls.tsx`, `MoveInspector.tsx`, and `MetricsPanel.tsx` are separate panels below or beside the schedule.

The recent UI work made blocks visually richer, but the ready queue now occupies too much screen height. The placed blocks in the schedule board are still smaller than the selector blocks, so the screen reads as inventory-first instead of schedule-first.

## Reference-Informed Direction

The external reference screenshot is useful for arrangement, not for source, text, CSS, or visual assets.

What works in the reference:

- a thin global rail for level/config actions;
- a compact lesson band above the schedule;
- a scoreboard as a right rail;
- controls attached directly to the schedule panel;
- the schedule board as the dominant lower canvas.

What Sensei should improve:

- keep language shorter and less rules-heavy;
- keep the first screen about placing blocks, not reading instructions;
- avoid a dense configuration surface until the engine actually supports those dimensions;
- preserve the existing clean-room visual vocabulary and accessibility model.

## Recommended Layout

Use a **Reference Cockpit, Sensei-Clean** layout:

```text
+------------------------------------------------------------------------------------------------+
| TOP RAIL                                                                                       |
| Sensei | Level: 4. 1F1B | Assist: normal | Colors: Microbatch | Share | SVG | Unlock           |
+------------------------------------------------------------------------------------------------+
| LEVEL GUIDE                                                                         | SCORE     |
| GPipe AFAB / 1F1B learning note, one short paragraph, goal chip, next/compare       | placed    |
| "Goal: complete in makespan <= 22"                                                  | makespan  |
+-------------------------------------------------------------------------------------| bubble    |
| READY QUEUE                                                                         | memory    |
| B0 [FWD mini stack | BWD mini stack]  B1 [...]  B2 [...]  B3 [...]                  | best      |
| smaller tokens than today; compact labels; horizontal scroll if needed              |           |
+-------------------------------------------------------------------------------------+-----------+
| SCHEDULE  Undo Redo Reset | Place Clear | Wait R0 R1 R2 | Ready Hint Auto Stop                  |
+------------------------------------------------------------------------------------------------+
| SCHEDULE BOARD                                                                                 |
| larger time cells, taller rank rows, larger placed blocks                                       |
| rank rows + memory strips dominate the bottom half                                              |
| board-local horizontal scroll only                                                             |
| concise interaction hint at bottom, not a rules panel                                           |
+------------------------------------------------------------------------------------------------+
```

## Layout Roles

### Top Rail

The top rail replaces the current oversized hero. It should identify the product and current level without consuming vertical space.

Contents:

- product name;
- level selector;
- concise assist/color mode labels when those features exist;
- share/export/unlock controls if retained.

This rail is not a marketing hero. It is a compact cockpit header.

### Level Guide

The level guide sits above the ready queue and schedule. It explains the current level in one compact paragraph, then states the goal.

Recommended content shape:

```text
Level 4: 1F1B
Warm up the pipeline, then alternate backward and forward work to reduce bubbles.
Goal: complete in makespan <= 22.
```

This is the place for algorithm-set guidance in future levels. It should not become a long rules panel.

### Score Rail

The right rail combines the current inspector and high-signal metrics. It should remain visible while the learner places blocks.

Default fields:

- selected move / blocker state;
- placed count;
- makespan;
- bubble ratio;
- peak activation memory;
- best attempt.

Detailed metrics can stay collapsible. The rail should support scanning, not explain every formula by default.

### Ready Queue

The ready queue becomes a compact inventory strip.

Requirements:

- keep batch grouping by microbatch;
- keep each batch split into vertical `FWD` and `BWD` stacks;
- make selector tokens visibly smaller than schedule blocks;
- keep accessible button labels explicit;
- keep horizontal scrolling bounded to the ready queue when there are many batches.

Target token sizing:

```text
Ready queue token height: 30-34px
Ready queue code text:    compact but readable
Ready queue metadata:     smaller secondary row, or hidden if needed
```

The selector should remain clickable and keyboard navigable. If visual tokens become too small for comfortable pointer activation, preserve a larger invisible hit area or keep the actual button at the accessibility minimum while reducing internal visual density.

### Thin Control Rail

Controls move from a full card into a thin command row directly attached to the schedule.

Recommended grouping:

```text
SCHEDULE  Undo Redo Reset | Place Clear | Wait R0 R1 R2 | Ready Hint Auto Stop
```

This keeps the controls near the object they mutate. Secondary controls can remain progressively disclosed if the rail becomes too dense.

### Schedule Board

The schedule board becomes the primary lower workspace.

Target geometry:

```text
Schedule cell width: 54-60px
Schedule row height: 68-76px
Schedule block label: readable two-line compact code
Board area: fills most of the bottom half of the viewport
```

Board scrolling should be local to the board. The page itself should not gain accidental horizontal overflow.

## Visual Direction

Purpose: teach pipeline scheduling through repeated block placement.

Audience: ML systems engineers and learners who need to scan rank timelines, bubbles, memory, and local choices.

Tone: dense, technical, playable, and calm.

Palette: keep Sensei's existing paper + diagnostic-dark vocabulary for continuity, but reduce large white surfaces in the top half. The board should feel like the lit workbench; surrounding rails can be darker and quieter.

Typography: keep a strong mono/data face for codes, ticks, ranks, and metrics. Avoid shrinking schedule text below legibility just to fit; prefer more board geometry.

Signature detail: the same operation color and compact code should travel from ready queue to board, while the board gives it more physical presence.

## Responsive Behavior

Desktop and 13-inch laptop:

- top rail and guide stay shallow;
- ready queue occupies a controlled strip above the board;
- score rail remains on the right;
- schedule board owns the lower center and stretches horizontally.

Tablet / narrow desktop:

- score rail may move below or become a right-side collapsible detail;
- ready queue remains horizontally scrollable;
- schedule board remains above controls/details in reading order.

Mobile:

- use a single-column flow:
  1. top rail;
  2. level guide;
  3. ready queue;
  4. schedule command rail;
  5. schedule board;
  6. inspector;
  7. metrics.
- preserve board-local horizontal scroll for timelines.

## Component Boundary Changes

Likely implementation boundaries:

- `App.tsx`: introduce layout regions for top rail, level guide, score rail, command rail, and board workspace.
- `GameControls.tsx`: support a compact rail presentation, possibly by changing markup or CSS while preserving button semantics.
- `MetricsPanel.tsx` and `MoveInspector.tsx`: compose into the right rail or share a parent region.
- `OperationTray.tsx`: keep logic but make visual token density smaller.
- `ScheduleBoard.tsx`: increase board geometry constants and preserve label fit.
- `app.css`: replace the current `content-grid` template with cockpit regions and responsive fallbacks.

The engine and persistence layers should not change.

## Testing

Add or update tests for:

- top rail, level guide, ready queue, schedule, command rail, and score rail are exposed as named regions;
- ready queue still contains batch lanes and `FWD`/`BWD` stacks;
- command controls remain keyboard-operable and accessible by their existing names;
- schedule board geometry constants increase relative to the previous board;
- CSS contract prevents page-level horizontal overflow and keeps queue/board scrolling local;
- mobile layout stacks in the intended order.

Run full verification after implementation:

```bash
npm run verify
```

## Non-Goals

This pass does not:

- add new algorithm levels;
- implement virtual pipeline stages, zero-bubble variants, or DualPipe;
- copy reference UI source, CSS, prose, or screenshots;
- add a long rules panel;
- change replay legality, scoring, persistence, or fixtures.

## Approval Gate

After this spec is approved, write an implementation plan before editing application code.
