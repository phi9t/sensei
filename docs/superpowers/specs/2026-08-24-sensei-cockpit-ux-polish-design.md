# Sensei Cockpit UX Polish Design

**Status:** Ready for implementation planning

**Date:** 2026-08-24

**Related docs:**

- `docs/design-patterns/game-cockpit-layout.md`
- `docs/superpowers/specs/2026-08-21-sensei-cockpit-layout-design.md`
- `docs/superpowers/specs/2026-08-21-sensei-batch-stacks-and-curriculum-design.md`
- `docs/superpowers/specs/2026-08-21-sensei-ux-and-algorithm-curriculum-spec.md`
- `docs/superpowers/specs/2026-08-22-sensei-rest-curriculum-execution-design.md`

## Outcome

Polish the Sensei game UI so the screen reads as a compact block-placement cockpit:

- the schedule board owns the lower half of a 13-inch laptop viewport;
- the ready queue becomes a visually lighter parts bin;
- the level guide becomes one short teaching row, not a compact rules dump;
- controls stay thin and adjacent to the schedule;
- block identity remains stable across ready queue, preview, board, and inspector;
- the UI remains keyboard-accessible and does not require drag gestures.

This is a design and layout refinement pass. It does not add new scheduling
algorithms, change replay legality, change scoring semantics, or change
persistence.

## Product Frame

Sensei is a technical learning game for ML systems engineers and learners. The
primary loop is:

1. choose a ready block;
2. place it into the schedule;
3. inspect the consequence;
4. compare the schedule against the current level goal.

The visual language should stay calm, dense, and diagnostic. It should not look
like a landing page, a generic dashboard, or an arcade HUD. The player should
understand the current move faster than they understand the surrounding chrome.

## UI Guidance Used

The UI review used `ui-ux-pro-max` with focused searches for compact labels,
single-pointer alternatives to drag, target size, focus visibility, and React
list rendering.

Applied guidance:

- Compact chip labels should stay whole when practical. If values are too long,
  bound the unpredictable value and expose the full value through an operable
  disclosure or accessible label.
- Drag-like operations require button and keyboard alternatives. Sensei should
  keep click/tap and keyboard placement as the primary interaction.
- Web pointer targets should meet WCAG target-size expectations; dense desktop
  tokens may be visually compact, but mobile/touch layouts need larger targets
  and spacing.
- Keyboard focus must remain visible and not be hidden behind persistent rails.
- React list rendering should keep stable keys and avoid blanket memoization
  unless profiling proves a render hotspot.

The design-system search did not produce a product-specific game-cockpit match.
The selected fallback is the repository's existing cockpit pattern plus
UI Pro Max's dense-dashboard, compact-label, accessibility, and responsive rules.

## Current UI Pressure Points

The existing implementation already has strong foundations:

- real button controls in `OperationTray.tsx` and `GameControls.tsx`;
- compact visible block codes like `F0:S0:B1`;
- explicit accessible operation labels;
- local horizontal scroll for the ready queue and schedule board;
- grouped batch lanes and pass stacks;
- schedule-board labels split over two lines;
- replay-owned timeline data rendered by the board;
- score details behind disclosure.

The next pass should fix hierarchy rather than rebuild the whole UI:

1. `LevelGuide` renders too many visible chips for a top-row guideline.
2. Ready queue lanes have too much card chrome for a secondary parts bin.
3. The command rail can become a second control panel, especially with pattern
   validation.
4. The board has improved labels, but it does not yet have enough guaranteed
   vertical ownership in the layout.
5. Split-gradient levels need a first-class three-stack ready queue layout
   instead of relying on a two-column grid that wraps `WGT`.

## Target Layout

Desktop and 13-inch laptop:

```text
+--------------------------------------------------------------------------------+
| TOP RAIL                                                                        |
| Sensei | level selector | compact placed/total                                  |
+--------------------------------------------------------------------------------+
| LEVEL GUIDE                                                       | SCORE RAIL   |
| set + level title | one sentence | goal + status                 | selected    |
+-------------------------------------------------------------------| metrics     |
| READY QUEUE                                                       | details     |
| compact batch strips: FWD vertical, BWD vertical, optional WGT     |             |
+--------------------------------------------------------------------------------+
| COMMAND RAIL                                                                      |
| Schedule | Undo Redo | Place Clear | Wait R0 R1 R2 | Ready Hint Auto | status      |
+--------------------------------------------------------------------------------+
| SCHEDULE BOARD                                                                    |
| dominant lower workspace; larger placed blocks; local horizontal scroll           |
+--------------------------------------------------------------------------------+
```

Narrow screens:

```text
Top rail
Level guide
Ready queue
Command rail
Schedule board
Move inspector
Metrics
```

The page must not gain accidental horizontal scrolling. Ready queue and board
scrolling stay local to their own regions.

## Region Specifications

### Top Rail

The top rail identifies the product and the selected level. It stays shallow and
does not become a hero.

Keep:

- product name;
- level selector grouped by curriculum set;
- compact placed/total count;
- existing storage/offline notices as polite status regions.

Avoid:

- large explanatory copy;
- wide badges;
- board or scoring controls.

### Level Guide

The guide becomes a single-line teaching surface with bounded metadata.

Visible content:

- algorithm set label;
- level title;
- one concept sentence;
- primary goal chip;
- status or makespan chip;
- one optional level modifier chip when it materially changes play.

Move out of the default visible row:

- all duration override chips beyond the first;
- long objective text;
- repeated pattern labels when the heading and set already communicate them;
- multi-sentence algorithm explanations.

When hidden metadata matters, expose it through a compact disclosure in the
score rail or details area. Do not add a visible rules panel.

### Ready Queue

The ready queue is a parts bin. It should be visible, scannable, and clearly
subordinate to the board.

Keep:

- grouping by microbatch;
- `FWD` and `BWD` vertical stacks;
- optional `WGT` stack for split-backward levels;
- phase-aware lane treatment for `ready`, `waiting`, and `done`;
- compact visible block code `F0:S0:B1`;
- the notation key `(F/B, stage_id, micro_batch_id)` or
  `(F/B/W, stage_id, micro_batch_id)` once per queue;
- full identity in button accessible labels.

Improve:

- reduce lane borders, shadows, status pills, and decorative bars;
- use batch color as the grouping cue rather than extra chrome;
- make completed lanes quiet but still inspectable;
- use `data-stack-count` to render two or three internal columns without
  awkward wrapping;
- make visual token height smaller than placed board blocks while preserving
  usable pointer and keyboard targets.

Sizing target:

```text
Desktop ready token visual height: 28-34px
Desktop ready token hit area:      at least 32px high
Mobile ready token hit area:       at least 44px high
Board block height:                larger than ready token visual height
```

### Command Rail

The command rail is attached to the schedule and should remain one compact band
on a laptop viewport.

Visible order:

```text
Schedule | Undo Redo | Place Clear | Wait R0 R1 R2 ... | Ready Hint Auto | Pattern status | Share Reset
```

Rules:

- preserve native button semantics;
- preserve disabled states and accessible descriptions;
- keep text labels explicit for now;
- keep command feedback visible and exposed through `role="status"`;
- compress pattern validation into a status pill plus `Stamp`, not a wide card;
- avoid wrapping into more than two rows at 1280px width.

### Schedule Board

The board is the main object and should be easier to read than the queue.

Geometry target:

```text
CELL_WIDTH:             60px
WORK_BLOCK_HEIGHT:      44px
ROW_HEIGHT:             84px
DUALPIPE_ROW_HEIGHT:    132px
MIN_BOARD_WIDTH:        920px
```

Requirements:

- placed blocks are visually larger than ready queue tokens;
- labels remain split as `F0` over `S0:B1`;
- direction remains a separate cue for DualPipe and does not change visible
  `F0:S0:B1` code;
- rank owner chips remain compact and horizontally scrollable;
- memory and residency strips remain aligned to time;
- board details stay collapsed by default;
- the board scroll region grows to fill the available lower workspace.

### Score Rail

The score rail supports scanning during play.

Keep:

- selected-object identity with matching operation color;
- owner rank;
- dependencies;
- resource wait and residency explanation when relevant;
- scoreboard cards for makespan, bubble, memory, optional internal bubble,
  optional gathers, and status;
- detailed metrics behind disclosure.

Improve:

- avoid long inspector paragraphs as the default visual weight;
- make selected-block identity the rail anchor;
- keep resource/delay text compact and line-wrapping-safe;
- do not duplicate detailed formulas outside the disclosure.

## Operation Identity Rules

Visible block code remains:

```text
F0:S0:B1
```

Where:

- `F` or `B` is the pass kind;
- `W` is used only for split-backward weight-gradient levels;
- the first number is the logical stage id attached to the pass;
- `S#` repeats stage identity for scanability;
- `B#` is the microbatch id.

The notation key remains:

```text
(F/B, stage_id, micro_batch_id)
```

or:

```text
(F/B/W, stage_id, micro_batch_id)
```

DualPipe direction remains separate. Do not encode direction into the visible
code or overload microbatch ids. Use `Up` and `Down` as adjacent visual cues and
full `asc direction` / `desc direction` accessible labels.

## Visual System

Keep the existing paper, ink, teal, rust, amber, and muted slate vocabulary, but
use it with stronger hierarchy:

- board: brightest work surface;
- ready queue: low-shadow parts bin;
- command rail: thin connected tool strip;
- score rail: diagnostic panels;
- top rail: dark compact cockpit header.

Use color in two layers:

- operation identity color, stable by operation;
- semantic state, visible through text, opacity, border, and pattern.

Do not rely on color alone. Forward, backward, and weight-gradient must remain
textually and pattern distinguishable.

## Interaction And Accessibility

Hard constraints:

- Every selectable block remains a real `button`.
- Blocked and completed blocks remain focusable for inspection.
- Keyboard focus order follows visual order.
- Focus rings remain visible on all buttons, selects, summaries, and scroll
  regions.
- Placement cannot require drag and drop.
- Hover and press states do not change layout bounds.
- The command feedback line remains visible and `aria-live="polite"`.
- Compact labels do not wrap mid-token; full values remain available through
  accessible labels and details.
- The layout supports reduced motion.

## Implementation Scope

This polish pass may touch:

- `src/app/App.tsx`
- `src/components/LevelGuide.tsx`
- `src/components/OperationTray.tsx`
- `src/components/GameControls.tsx`
- `src/components/PatternCheck.tsx`
- `src/components/ScheduleBoard.tsx`
- `src/components/MoveInspector.tsx`
- `src/components/MetricsPanel.tsx`
- `src/styles/app.css`
- `src/components/GameShell.test.tsx`
- `src/components/ScheduleBoard.test.tsx`
- `tests/responsive-css.test.mjs`
- documentation that records the design pattern or post-execution review.

This pass must not touch:

- `src/engine/*` behavior;
- `src/levels/*` curriculum semantics;
- `src/persistence/*` schema or codec behavior;
- `src/components/PipelineLessonPanel.tsx` unless a later task explicitly owns
  that file.

## Acceptance Criteria

The polish pass is complete when:

1. A 13-inch laptop viewport shows top rail, guide, ready queue, command rail,
   and a visibly dominant board without a rules panel.
2. The board occupies the lower workspace and placed blocks are visually larger
   than ready-queue tokens.
3. The ready queue groups every batch into vertical `FWD` and `BWD` stacks and
   uses a third `WGT` stack only when a level has `W` operations.
4. The level guide displays only a concise teaching sentence and a bounded set
   of chips.
5. Pattern validation no longer expands the command rail into a large embedded
   card.
6. Compact labels do not overflow or break technical codes.
7. Keyboard and pointer placement both work.
8. Focus states are visible and not obscured by sticky or fixed UI.
9. Ready queue and board scrolling are local; the page has no accidental
   horizontal overflow.
10. Existing curriculum, replay, scoring, and persistence behavior remains
    unchanged.
11. `npm run verify` passes.

## Visual QA Checklist

Before landing implementation:

- Check `1280x800` to represent a 13-inch laptop.
- Check `1440x900` for normal desktop density.
- Check `390x844` for narrow mobile stacking.
- Confirm the board is the largest visual region in the first viewport.
- Confirm a long level name and a split-gradient level do not break the guide or
  ready queue.
- Confirm DualPipe shows `F0:S0:B1` plus separate `Up`/`Down` cues.
- Confirm keyboard tabbing reaches ready tokens, command controls, board scroll
  region, score details, and level selector in visual order.
- Confirm reduced motion removes nonessential transitions.

## Spec Self-Review

- Placeholder scan: no `TBD`, unresolved placeholders, or unspecified behavior.
- Internal consistency: the spec preserves existing engine and persistence
  boundaries while changing only UI hierarchy and rendering contracts.
- Scope check: this is one UI polish pass, not a curriculum semantics expansion.
- Ambiguity check: operation notation, DualPipe direction handling, queue
  grouping, board geometry, and verification expectations are explicit.
