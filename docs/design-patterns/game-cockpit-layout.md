# Game Cockpit Layout Pattern

**Status:** Adopted from the Sensei cockpit pass

**Use when:** A learning game asks the player to repeatedly manipulate a compact set of technical objects and understand the global result of each move.

## Pattern

Use a **game cockpit**: a dense, calm workspace where the main game board owns the largest visual area, the inventory is a compact parts bin, controls sit directly beside the thing they mutate, and feedback is visible without becoming a rules panel.

This pattern is a better fit than a landing-page, card-stack, or tutorial-first layout when the player is learning by repeated placement.

## Why It Works

The player needs to answer three questions quickly:

1. What can I place?
2. Where did it land?
3. Did that improve the schedule?

The cockpit keeps those answers spatially stable:

- **Inventory above:** available blocks are nearby but visually subordinate.
- **Commands between:** actions are attached to the schedule, not hidden below the fold.
- **Board below:** the schedule is the dominant artifact.
- **Score/inspector beside:** evaluation stays visible while the player acts.
- **Feedback line:** every command confirms what happened without interrupting play.

## Layout Recipe

```text
+----------------------------------------------------------------------------------+
| TOP RAIL                                                                          |
| Product | Level selector | compact global state                                   |
+----------------------------------------------------------------------------------+
| LEVEL GUIDE                                                            | SCORE    |
| one short objective + goal chips                                       | inspect  |
+-----------------------------------------------------------------------| metrics  |
| READY QUEUE                                                           |          |
| compact grouped inventory; smaller tokens than placed board blocks    |          |
+----------------------------------------------------------------------------------+
| COMMAND RAIL                                                                        |
| Schedule | Undo Redo | Place Clear | Wait R0 R1 R2 | Ready Hint Auto | feedback    |
+----------------------------------------------------------------------------------+
| GAME BOARD                                                                          |
| dominant lower workspace; local horizontal scroll; readable placed pieces           |
+----------------------------------------------------------------------------------+
```

## Region Rules

### Top Rail

Keep it shallow. It identifies the product and current level; it is not a hero.

Good contents:

- product name;
- level selector;
- compact global status;
- export/share/unlock controls only if they are part of the current game loop.

Avoid:

- marketing copy;
- large titles;
- decorative hero imagery;
- controls that belong to the board.

### Level Guide

Use one compact teaching sentence plus one goal. The guide should tell the learner what to pay attention to, not explain every rule.

Good:

```text
Keep activation memory under the cap while preserving pipeline flow.
Goal: makespan <= 18.
```

Avoid:

- long rules panels;
- implementation detail;
- prose that competes with the board.

### Ready Queue

The ready queue is a parts bin, not the main attraction.

Rules:

- group by the domain unit the learner reasons about;
- keep subgroups spatially stable, such as `FWD` and `BWD` stacks;
- make selectable tokens visually smaller than placed board pieces;
- show the durable compact code;
- keep full identity in the accessible button label;
- keep scroll local to the queue.
- show lane phase at a glance: ready lanes stay prominent, waiting lanes recede, completed lanes remain inspectable but visually quiet.

For Sensei:

- visible code: `F0:S0:D1`;
- notation key: `(F/B, stage_id, data_id)`;
- accessible label: `Place F stage 0 microbatch 1, 1 tick, ready`;
- secondary metadata can be visually hidden when it makes the token taller than a placed board block.

Completed tokens should stay reachable for inspection and undo reasoning. Do not remove them from the queue unless the board supplies an equally direct way to inspect completed blocks.

### Command Rail

Place commands immediately above the board. Use a thin rail, grouped by intent:

```text
Schedule | Undo Redo | Place Clear | Wait R0 R1 R2 | Ready Hint Auto | Share Reset
```

Rules:

- keep controls as native buttons/selects;
- keep labels explicit;
- preserve disabled semantics;
- keep command feedback visible;
- avoid hiding core actions behind disclosures once the layout has room.

### Game Board

The board is the game. It should dominate the lower workspace and be easier to read than the inventory.

Rules:

- board pieces must be larger than inventory tokens;
- labels must fit without overflow;
- time/rank axes should be scan-friendly;
- rank rows can use very subtle alternating bands when the board has several timelines;
- board horizontal overflow must be contained inside the board region;
- empty space should support reading the timeline, not decorate the page.

### Score Rail

Put evaluation and selected-object explanation in a right rail on desktop.

Default contents:

- selected move and blocker/completion state;
- completion/mastery;
- makespan;
- bubble or efficiency metric;
- memory peak/current state;
- best/current attempt tuple.

The score rail should support scanning, not teach the formulas by default. Put detailed formula explanation behind disclosure if needed.

Prefer a scoreboard-first rail:

```text
Score
Run state
+----------+----------+
| Makespan | Bubble   |
+----------+----------+
| Memory   | Status   |
+----------+----------+
Metric details
```

The selected-object inspector should repeat the same color cue and compact code used in the ready queue and board. This lets the learner track one block across queue, preview, placement, and explanation without re-parsing a sentence.

## Visual Language

Use **technical learning cockpit**, not arcade HUD.

Good qualities:

- dense but ordered;
- quiet diagnostic surfaces;
- strong monospaced data typography;
- stable object colors from inventory to board;
- selected-object continuity across queue, board, and inspector;
- phase-aware compression for finished or temporarily unplaceable inventory groups;
- subtle borders and shadows;
- minimal motion used only for feedback or state change.

Avoid:

- oversized game chrome;
- one-note bright palettes;
- decorative blobs/orbs;
- hero sections;
- hidden success/failure feedback;
- color-only status.

## Interaction Rules

Apply these as hard constraints:

- Every interactive chip/token is a real button or control.
- Keyboard focus order follows the visual order.
- Blocked tokens remain focusable when inspection is useful.
- Command feedback is visible and also exposed through `role="status"` or equivalent live semantics.
- Disabled controls use native disabled semantics.
- Hover/press/selected states must not shift layout bounds.
- Compact labels stay whole on one line when practical.
- Full values must remain available without hover-only recovery.

## Responsive Rules

Desktop and 13-inch laptop:

- top rail and guide stay shallow;
- ready queue is a controlled strip;
- command rail sits directly above the board;
- score rail remains visible on the right;
- board owns the lower center.

Narrow screens:

- stack in play order: top rail, level guide, ready queue, command rail, board, score;
- preserve local horizontal scroll for inventory and board;
- do not allow page-level horizontal overflow;
- keep the top rail shallow, not hero-sized.

## Acceptance Checks

Use these before calling a cockpit layout finished:

- The first viewport says what to do without a rules panel.
- The board is visually dominant over the inventory.
- Ready tokens render smaller than placed board blocks.
- A player can identify the same object in the queue, preview, and board.
- The selected object uses the same visual identity in the inspector.
- Completed groups remain inspectable but no longer compete with ready groups.
- Score rail presents high-signal metrics before the full metric table.
- The command rail is visible without scrolling on a laptop viewport.
- Feedback for place, wait, hint, ready, auto, share, reset, undo, and redo is visible.
- Screen-reader labels carry full object identity even when visible labels are compact.
- The banner/header landmark is valid and not nested inside `main`.
- The page has no accidental horizontal scroll.
- Queue and board scrolling are local to their own regions.

## Sensei Reference

The current Sensei cockpit implements this pattern with:

- `LevelGuide` as the shallow teaching band;
- `OperationTray` as the compact grouped ready queue;
- `GameControls` as the schedule command rail;
- `ScheduleBoard` as the dominant lower workspace;
- `MoveInspector` and `MetricsPanel` combined into the score rail.

Keep this pattern as the default for future pipeline-scheduling levels unless a new mechanic genuinely requires a different spatial model.
