# Sensei Board Tile Inspection Spec

**Goal:** Make placed schedule blocks inspectable directly from the schedule
board so the learner can connect a block's visual position to the existing
selected-block rail and move inspector.

## Route

Ask Matt route: small idea-to-ship implementation in this session. This does
not need a PRD or multi-issue split because the behavior is contained to the
board component, app wiring, tests, and CSS.

## Product Direction

- Product type: dense technical learning game.
- Audience: engineers learning pipeline parallel scheduling by repeated block
  placement.
- Tone: calm, compact, scannable, precise.
- Memorable detail: the scheduled block itself becomes the inspection handle.
- Constraint: do not add a rules panel or another lesson surface.

## UX Requirements

- Placed blocks on the schedule board are directly selectable with pointer and
  keyboard.
- Selecting a placed board block updates the same selected-block command-rail
  capsule and move inspector used by ready-queue selection.
- Selection never places another copy of the block.
- The board keeps compact visible codes such as `F0:S0:D1`.
- The notation key remains `(F/B, stage_id, data_id)` unless `W` blocks
  exist, where it becomes `(F/B/W, stage_id, data_id)`.
- Direct ready-block click placement remains fast and unchanged.
- Blocked and completed ready-queue blocks remain inspectable.
- The schedule board remains the dominant lower workspace.

## Accessibility Requirements

- Interactive board blocks have accessible names with operation, rank, and time
  range.
- Interactive board blocks are keyboard reachable in visual schedule order.
- Focus and selected states are visible without relying on color alone.
- Focus and hover styling must not change tile geometry or cause layout shift.
- The board exposes itself as an interactive diagram rather than a single static
  image once child blocks are focusable.

## Acceptance

- Behavior tests cover pointer and keyboard inspection from placed board tiles.
- CSS contract tests cover board tile focus/hover affordance and stable geometry.
- Existing command rail, inspector, accessibility, responsive, and full verify
  suites pass.
- Desktop and mobile visual checks show no page-level horizontal overflow and no
  obvious text overlap.
- Deploy the verified build to Goofy Preview alias `groovy`.
- Commit only this scoped work; keep unrelated untracked WIP untouched.
