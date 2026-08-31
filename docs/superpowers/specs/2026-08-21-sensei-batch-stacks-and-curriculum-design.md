# Sensei Batch Selector and Algorithm Curriculum Design

**Status:** Design approved; awaiting written spec review

**Date:** 2026-08-21

**Related prior spec:** `2026-08-19-sensei-pipeline-game-design.md`

## Outcome

Improve Sensei in two phases:

1. **Immediate UI pass:** make the block selector easier to scan by grouping each microbatch into separate vertical `FWD` and `BWD` stage stacks, and carry stable block color hints from the selector into the schedule board.
2. **Curriculum architecture pass:** design the next algorithm-learning ladder from GPipe AFAB through 1F1B, interleaved 1F1B, zero-bubble variants, and DualPipe before expanding the engine.

The first phase keeps the game centered on placing blocks. The second phase prevents the larger algorithm work from leaking into a small visual patch.

## Current Context

The current app has a pure scheduling engine, React UI, SVG board, and four original levels. Recent commits simplified the interface into a block-first workbench and added legal-move board previews.

There is an uncommitted selector prototype that groups blocks by microbatch and replaces visible tuple codes with compact operation labels. That prototype is useful evidence, but this spec is the durable contract for the next implementation.

The previous release spec deliberately deferred virtual pipeline stages, interleaving, split backward work, and zero-bubble variants. The new curriculum request reopens those as a separate architecture concern.

## Design Direction

Purpose: teach pipeline scheduling by making the operation inventory feel like a manipulable schedule primitive, not a raw list of operation IDs.

Audience: ML systems engineers and learners who need to see how local block choices create global pipeline structure.

Tone: dense, technical, and playable. The schedule board stays dominant; the selector becomes a compact control surface.

Memorable detail: every block gets a stable visual identity that survives movement from tray to timeline. A learner should be able to say "the green Batch 2 stage-1 forward block moved here" without reading `F:1:2` every time.

Constraints:

- Preserve keyboard and pointer play.
- Keep minimum interactive targets at least `2.75rem`.
- Keep `(F/B, stage_id, data_id)` visible once as a notation key.
- Do not reintroduce a rules panel.
- Do not rely on color alone; pass kind and state must remain textually/pattern distinguishable.
- Keep `src/engine` as the owner of schedule truth.

## Phase 1: Batch Stack Selector

### Layout

Each microbatch renders as one lane:

```text
Batch 0
+-------------+-------------+
| FWD         | BWD         |
| F0:S0:D0    | B0:S0:D0    |
| F1:S1:D0    | B1:S1:D0    |
| F2:S2:D0    | B2:S2:D0    |
+-------------+-------------+
```

The lane header owns the microbatch identity. The stack headers own pass identity. Each token still repeats a compact operation code so the same block name is recognizable on the schedule board.

This replaces the current interleaved ordering:

```text
FWD S0, BWD S0, FWD S1, BWD S1, ...
```

with a structure that matches how learners reason about a batch flowing forward and then backward through ranks.

### Interaction

The button behavior does not change:

- ready operation: click or keyboard activation places the block;
- blocked operation: click or focus inspects blockers;
- completed operation: remains inspectable and selected without duplicating placement.

Accessible labels remain explicit, for example:

```text
Place F stage 2 microbatch 0, 1 tick, Ready
Inspect B stage 1 microbatch 3, 2 ticks, Blocked
```

Visible labels become compact:

```text
S2
R2 - 1t
Ready
```

Use the display form `F0:S0:D1`, where the first segment is pass plus stage index, `S#` is stage, and `B#` is microbatch. The full tuple meaning remains available through the single notation key and explicit accessible labels.

### Color Identity

Introduce a deterministic operation color identity:

- base hue: stable by microbatch and stage;
- pass modifier: forward and backward remain visually distinct;
- state modifier: ready, blocked, completed, and selected remain legible.

The same identity is applied to:

- selector token accent;
- schedule board placement fill or accent;
- legal preview rectangle;
- selected inspector accent if the inspector grows that affordance.

Color is supplemental. Existing `F` and `B` pattern differences remain so the board is still understandable without color discrimination.

### Responsive Behavior

Desktop:

- batch lanes fit across the top as dense groups;
- each lane contains two internal columns, `FWD` and `BWD`;
- the tray height should shrink relative to the current grouped prototype.

Mobile:

- batch lanes scroll horizontally;
- each lane keeps `FWD` and `BWD` stacks intact;
- no horizontal overflow outside the intended tray scroll region.

## Phase 2: Algorithm Curriculum Architecture

The algorithm ladder is a separate spec and implementation plan because it changes the domain model, not just presentation.

Planned ladder:

1. **GPipe AFAB:** all-forward/all-backward. Teaches pipeline fill/drain, bubbles, and activation buildup.
2. **1F1B:** teaches steady-state alternation and memory reduction after warmup.
3. **Interleaved 1F1B:** introduces virtual stages and local ordering constraints.
4. **Zero-bubble variants:** introduces split backward work, likely input-gradient and weight-gradient operations, and teaches moving weight work into bubble slots.
5. **DualPipe / bidirectional variants:** introduces opposite-direction flow and more complex resource conflicts.

The curriculum model should add level metadata for:

- algorithm family;
- learner-facing objective;
- newly introduced invariant;
- expected visual pattern;
- mastery criteria;
- reference-policy label, when one exists.

The engine must only expand when a level needs executable behavior. Algorithm labels alone are not enough.

## Reference Boundary

The vendored/reference study is evidence for concepts, curriculum ordering, and terminology, not implementation authority.

Allowed:

- using general domain concepts such as GPipe, 1F1B, zero-bubble, virtual stages, and split backward work;
- reading the existing source study to understand what categories the reference project models;
- creating original levels, explanations, fixtures, policies, and tests.

Not allowed:

- copying reference source code, CSS, prose, test fixtures, level definitions, screenshots, or assets;
- treating the reference project's level list as Sensei's schema;
- presenting paper claims as verified unless Sensei separately verifies them from primary sources.

## Testing

Phase 1 UI tests:

- assert batch lanes are exposed as named regions;
- assert each batch has distinct `FWD` and `BWD` stacks;
- assert raw tuple codes are not repeated as the primary visible selector labels;
- assert button accessible names still include full stage and microbatch identity;
- assert board and preview blocks receive deterministic visual identity attributes;
- update CSS contract tests for compact touch targets and mobile lane scrolling.

Phase 2 curriculum tests:

- add schema validation for algorithm metadata;
- add executable fixtures per new algorithm family;
- add recognition or reference-policy tests only when the implementation can prove the behavior;
- keep clean-room checks that prevent importing reference implementation artifacts.

## Non-Goals

Phase 1 does not:

- add new levels;
- change scheduling legality;
- add algorithm explanations;
- add a rules panel;
- change persistence format.

Phase 2 does not:

- copy the reference project;
- require every advanced algorithm in one patch;
- make the UI explain all algorithms before the engine can model them.

## Rollout

1. Land Phase 1 as a focused UI/test patch.
2. Write a separate curriculum architecture spec for Phase 2.
3. Implement new algorithm families incrementally, each with executable fixtures and a small learner-facing explanation surface.
