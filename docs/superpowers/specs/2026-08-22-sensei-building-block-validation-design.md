# Sensei Building-Block Validation Design

**Status:** Approved design, awaiting implementation-plan approval

**Date:** 2026-08-22

**Issue:** `SENSEI-CURR-03`

**Builds on:**

- `docs/superpowers/specs/2026-08-21-sensei-ux-and-algorithm-curriculum-spec.md`
- `docs/superpowers/specs/2026-08-21-sensei-full-curriculum-implementation-design.md`
- `docs/superpowers/specs/2026-08-22-sensei-rest-curriculum-execution-design.md`
- `docs/superpowers/issues/2026-08-22-sensei-full-curriculum-issues.md`

## Outcome

Add the first playable building-block curriculum slice. The learner can inspect
a compact periodic trajectory, validate whether it tiles safely, and stamp a
valid trajectory into the existing schedule as ordinary placement actions.

The feature teaches one representation shift: from placing single operations to
reasoning about a repeated microbatch trajectory. It must not become a broad
pattern editor or a second saved schedule format.

## Current Context

The current engine uses this durable flow:

```text
LevelConfig + Action[] -> replay -> ScheduleState -> score -> React view model
```

Current operation identity is still unsplit `F/B` over one-to-one
stage-to-rank placement:

```text
F:stage:microbatch
B:stage:microbatch
```

The visible UI formats those operations compactly as `F0:S0:B1` and keeps the
notation key `(F/B, stage_id, micro_batch_id)` in the ready queue.

`SENSEI-CURR-01` and `SENSEI-CURR-02` already added reference-policy projection,
recognition, and compact policy-relative feedback for the current engine. This
slice should reuse the replay and scoring contracts instead of widening the
engine model beyond what building-block levels need.

## Non-Goals

- Do not implement virtual stages, split backward `W`, grouped scheduling, FSDP
  residency, or DualPipe semantics in this slice.
- Do not persist `BuildingBlockPlan` in local storage or share URLs.
- Do not add a full free-form pattern editor.
- Do not add a long visible rules panel.
- Do not copy upstream code, CSS, prose, screenshots, fixtures, or exact level
  definitions.
- Do not touch the pre-existing untracked
  `src/components/PipelineLessonPanel.tsx`.

## Approach

Implement building blocks as a pure planning projection:

```ts
interface BuildingBlockPlan {
  readonly period: number;
  readonly trajectory: readonly BuildingBlockOperation[];
}

interface BuildingBlockOperation {
  readonly operationId: OperationId;
  readonly offset: number;
}
```

The plan describes offsets for one representative microbatch. Validation and
expansion are deterministic engine helpers. If a plan is valid, expansion
returns ordinary `Action[]`; after that, the existing replay, scoring, undo,
redo, persistence, and share-link behavior are authoritative.

## Engine Design

Add a pure module, `src/engine/buildingBlocks.ts`, with no React or storage
dependency.

Public API:

```ts
type BuildingBlockViolation =
  | { kind: 'invalid-period'; period: number }
  | { kind: 'unknown-operation'; operationId: OperationId }
  | { kind: 'duplicate-operation'; operationId: OperationId }
  | { kind: 'missing-operation'; operationId: OperationId }
  | {
      kind: 'duplicate-rank-residue';
      rank: number;
      residue: number;
      operationIds: readonly OperationId[];
    }
  | {
      kind: 'unsatisfied-dependency';
      operationId: OperationId;
      dependencyId: OperationId;
    }
  | {
      kind: 'memory-cap';
      rank: number;
      peak: number;
      cap: number;
    };

interface BuildingBlockValidation {
  readonly ok: boolean;
  readonly period: number;
  readonly violations: readonly BuildingBlockViolation[];
  readonly projectedPeakMemory: readonly number[];
}

function validateBuildingBlockPlan(
  config: LevelConfig,
  plan: BuildingBlockPlan,
): BuildingBlockValidation;

function expandBuildingBlockPlan(
  config: LevelConfig,
  plan: BuildingBlockPlan,
): { ok: true; actions: readonly Action[] } | { ok: false; validation: BuildingBlockValidation };
```

Validation should check:

1. The period is a positive integer.
2. The trajectory contains exactly one template entry for every operation in
   representative microbatch `0`.
3. Every referenced operation exists in the representative microbatch inventory.
4. No two operations on the same rank occupy the same residue modulo `period`.
5. Dependencies are satisfiable after stamping across all microbatches.
6. Predicted peak activation memory does not exceed configured caps.

Expansion should stamp the trajectory across the level's microbatch count and
return a deterministic sequence of `place` actions. If expansion produces a
replay failure, that failure is represented as structured validation rather
than an uncaught exception.

## Level Design

Add one playable `building-block` level in this slice:

- title: `Stamp The Pattern`;
- family: `building-block`;
- set title: `Building Blocks`;
- pattern label: `Periodic`;
- concept: one trajectory can be repeated across microbatches;
- objective: validate the provided pattern, stamp it, and inspect the completed
  schedule;
- model: current unsplit `F/B`, one-to-one ranks, fixed `F=1`, `B=2`.

This level should be enough to prove the representation and UI path. Later
levels can teach unsafe patterns and more advanced building-block variants.

Extend `LevelConfig` with optional building-block metadata:

```ts
interface BuildingBlockLevelMetadata {
  readonly plan: BuildingBlockPlan;
  readonly label: string;
}
```

The field is absent from existing levels.

## UI Design

Keep the cockpit focused on block placement. Building-block UI appears only
when the current level has building-block metadata.

Add a compact `Pattern check` affordance near the existing command/inspector
surface, not as a large separate rules panel. It should show:

- the pattern label and period;
- validation status;
- projected peak memory;
- at most the first two violation summaries, with a count for the rest;
- a `Stamp` command only when validation succeeds.

Stamping appends the expanded `place` actions through the same game action path
used by manual placement. The learner should still see the resulting blocks on
the schedule board and can undo/reset using existing controls.

Visible wording stays terse. Examples:

- `Pattern valid. Peak memory 3.`
- `Residue conflict on R1 at 2.`
- `Stamp pattern`

The notation key remains `(F/B, stage_id, micro_batch_id)`, and labels stay in
the `F0:S0:B1` visual format.

## Data Flow

```text
LevelConfig.buildingBlock
  -> validateBuildingBlockPlan(config, plan)
  -> Pattern check view model
  -> expandBuildingBlockPlan(config, plan)
  -> Action[]
  -> existing replay/score/persistence/share flow
```

The building-block plan is level-authored curriculum data. The learner artifact
remains the action log.

## Error Handling

Validation failures are normal learner-visible states, not thrown errors.

The engine may throw only for programmer errors already covered by
`validateLevelConfig`, such as malformed level metadata that cannot be interpreted
as a plan. UI code must not crash on invalid plans; it should show compact
structured feedback and leave the normal manual-placement path available.

## Testing

Engine tests:

- valid plan expands into actions that replay to a complete schedule;
- unknown operation returns `unknown-operation`;
- duplicate template entry returns `duplicate-operation`;
- omitted representative operation returns `missing-operation`;
- duplicate rank residue returns `duplicate-rank-residue`;
- dependency ordering problems return `unsatisfied-dependency`;
- memory prediction catches cap overflow before expansion.

Level tests:

- the building-block level is present in the catalog in dependency order;
- existing levels remain unchanged and do not carry building-block metadata;
- the level metadata is frozen with the rest of the config.

UI and flow tests:

- the pattern check appears only on building-block levels;
- a valid pattern can be stamped and then scored through normal completion;
- the stamped schedule persists and shares as expanded `Action[]`;
- responsive CSS keeps the board as the dominant lower workspace.

Verification gate:

```bash
npm run verify
```

## Landing Discipline

Implement in an isolated worktree. Keep commits grouped by concern:

1. engine model, validation, and expansion;
2. level metadata and building-block level;
3. UI/view-model stamp affordance;
4. persistence, responsive, and integration regressions if they are not already
   covered by the earlier commits.

Before landing, run full verification, request final review, rebase on
`master`, fast-forward merge, and remove the temporary worktree.

## Acceptance Criteria

The slice is complete when:

1. building-block plans validate and expand through pure engine helpers;
2. invalid plans produce structured violations for the required cases;
3. at least one building-block level is playable;
4. stamping produces ordinary actions and uses existing replay/scoring/storage;
5. the UI remains compact and level-local;
6. existing current-engine levels behave unchanged;
7. `npm run verify` passes.
