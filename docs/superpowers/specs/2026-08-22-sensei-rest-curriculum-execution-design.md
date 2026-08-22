# Sensei Rest Curriculum Execution Design

**Status:** Approved design, awaiting implementation-plan approval

**Date:** 2026-08-22

**Builds on:**

- `docs/superpowers/specs/2026-08-21-sensei-ux-and-algorithm-curriculum-spec.md`
- `docs/superpowers/specs/2026-08-21-sensei-full-curriculum-implementation-design.md`
- `docs/superpowers/issues/2026-08-22-sensei-full-curriculum-issues.md`

## Outcome

Complete the remaining Sensei curriculum without turning it into one large
engine rewrite. The rest of the curriculum lands as dependency-ordered slices,
each with playable value, focused tests, and a clean verification gate.

The current state already has:

- current-engine foundations, GPipe AFAB, and 1F1B levels;
- compact cockpit UI with grouped ready queue and dominant schedule board;
- reference policy projection and recognition for GPipe AFAB and 1F1B;
- completion feedback that can name exact current-engine reference schedules.

The next work should widen the model only when a level needs the new semantics.

## Non-Goals

- Do not implement all remaining curriculum issues in one patch.
- Do not add locked placeholder levels as a substitute for playable mechanics.
- Do not add a long visible rules panel.
- Do not copy upstream code, CSS, prose, diagrams, screenshots, or fixtures.
- Do not touch the pre-existing untracked `src/components/PipelineLessonPanel.tsx`
  unless a later approved task explicitly owns it.

## Recommended Execution Order

### Wave 1: Current-Engine Feedback

Implement `SENSEI-CURR-02` first.

Add compact policy-relative comparison after completion for levels that already
run on the current `F/B` one-to-one engine. Use the policy module from
`SENSEI-CURR-01` to show:

- recognized policy when known;
- reference makespan;
- reference peak activation memory;
- current attempt deltas from the reference.

The score rail stays scoreboard-first. Detailed comparison belongs behind an
existing disclosure or a similarly compact detail surface. Wording must say
"reference" or "policy-relative", not "optimal".

### Wave 2: Building Blocks

Implement `SENSEI-CURR-03` after the policy comparison is stable.

Add a pure `BuildingBlockPlan` representation for periodic trajectory
validation:

```ts
interface BuildingBlockPlan {
  period: number;
  trajectory: readonly BuildingBlockOperation[];
}

interface BuildingBlockOperation {
  operationId: OperationId;
  offset: number;
}
```

The plan is not persisted as the canonical learner artifact. A valid plan
expands into ordinary `Action[]`, so replay, scoring, undo, redo, local storage,
and share links continue to depend on the existing action log.

Validation returns structured violations for:

- unknown operations;
- duplicate residues on a rank;
- unsatisfied dependencies after stamping;
- predicted memory cap failures.

The UI adds only level-local pattern validation affordances. Manual block
placement remains the primary interaction.

### Wave 3: Virtual Stages

Implement `SENSEI-CURR-04` before interleaved 1F1B.

Add topology as an optional level capability:

```ts
interface PipelineTopology {
  placement: 'one-to-one' | 'wrap' | 'v-shape';
  virtualStagesPerRank: number;
}
```

One-to-one topology remains the default and must preserve current behavior.
Operation dependencies use logical stage identity. Placement, rank frontiers,
memory, and board lanes use physical rank ownership.

The board continues to render rank lanes. Compact labels keep the
`F0:S4:B2` style, with owner rank shown by lane and inspector text.

### Wave 4: Interleaved 1F1B And Nonuniform Cost

Implement `SENSEI-CURR-05` and `SENSEI-CURR-06` after topology exists.

Interleaved 1F1B adds playable virtual-stage levels:

- an introductory virtual-stage ownership level;
- an interleaved 1F1B reference level;
- a ragged-round level that distinguishes policy par from global optimality.

Nonuniform duration support should be introduced only as far as needed for a
playable cost lesson. Existing levels stay at `F=1`, `B=2`. New duration
semantics must update tile width, inspector text, accessible labels, fixture
expectations, and persistence versioning where affected.

### Wave 5: Grouped Scheduling Before FSDP

Implement `SENSEI-CURR-09` before FSDP residency.

Add group metadata and group-major policy projection over existing operation
identity:

- group size and group labels live in level config;
- operation IDs remain `F:stage:microbatch` / `B:stage:microbatch`;
- group boundaries are compact visual markers, not new operation identity;
- recognition distinguishes grouped order from 1F1B when per-rank orders differ.

This wave must avoid FSDP residency, all-gather, or communication claims. It
teaches schedule ordering, memory, and bubble only.

### Wave 6: Split Backward And Zero Bubble

Implement `SENSEI-CURR-07` before `SENSEI-CURR-08`.

Extend `OperationKind` to support split-gradient levels:

```ts
type OperationKind = 'F' | 'B' | 'W';
```

For unsplit levels, behavior stays `F/B` only. For split levels:

- `B` means input-gradient work;
- `W` means weight-gradient work;
- activation release happens at `W`, not `B`;
- ready queue stacks become `FWD`, `BWD`, and `WGT`;
- notation key becomes `(F/B/W, stage_id, micro_batch_id)`.

Zero-bubble levels then add policy projection, recognition, and internal-bubble
scoring only for levels that enable the metric.

### Wave 7: FSDP Residency

Implement `SENSEI-CURR-10` after grouped scheduling exists.

Track activation memory separately from resident weight units. A move can
gather, reuse, evict, or block on residency-aware memory admission. Score adds
`allGatherCount` only for residency levels, and the score rail adds a compact
`Gathers` card only when the metric exists.

Persistence compatibility must be explicit because score tuple semantics change
for residency levels.

### Wave 8: DualPipe Model Then Levels

Implement `SENSEI-CURR-11` before `SENSEI-CURR-12`.

DualPipe needs a model record before code. The record must decide:

- whether direction belongs in operation IDs, operation fields, or level-local
  metadata;
- how opposite-direction dependencies are represented;
- whether paired work is true concurrent occupancy or a visual macro over serial
  operations;
- how rank resource conflicts are represented;
- how URL and local persistence are versioned.

Only after that record is approved should playable DualPipe levels be
implemented.

## Shared Architecture Rules

The canonical data flow remains:

```text
LevelConfig + Action[] -> replay -> ScheduleState -> score -> React view model
```

New representations are projections into or annotations over that flow:

```text
reference policy -> projected Action[]
building block plan -> expanded Action[]
topology -> logical stage to physical rank ownership
residency model -> additional resource fields
recognition -> compact feedback and comparison
```

Actions remain the durable learner artifact unless a later approved slice
explicitly versions the action schema.

## UI Rules

Preserve the current cockpit pattern:

- board remains the dominant lower workspace;
- ready queue tokens stay smaller than placed schedule blocks;
- level guide stays concise;
- command feedback stays attached to the command rail;
- score rail stays scoreboard-first;
- optional details are disclosed, not permanently expanded.

New UI appears only when a level needs it:

- policy comparison after completion;
- building-block validator on building-block levels;
- third `WGT` stack on split-gradient levels;
- `Gathers` score card on residency levels;
- DualPipe-specific visualization only after the model record is approved.

## Testing And Landing Discipline

Each wave must land independently with `npm run verify` passing.

Expected test ownership:

- `src/engine/*`: topology, dependency, replay, resource accounting, policy
  projection, recognition, scoring;
- `src/levels/*`: catalog order, fixture replay, frozen configs, mastery targets;
- `src/persistence/*`: URL/local-storage compatibility and version recovery;
- `src/components/*` and `tests/*`: compact labels, keyboard reachability,
  responsive density, and completion feedback.

Commits should be grouped by concern and remain independently reviewable. Do
not stage unrelated files.

## Acceptance Criteria

The rest-curriculum implementation is complete when:

1. `SENSEI-CURR-02` through `SENSEI-CURR-12` are either implemented or, for
   DualPipe, represented by an approved model record plus implemented playable
   levels.
2. Every visible curriculum level is playable under executable engine rules.
3. Every new semantic axis has engine tests and at least one fixture-backed UI
   path.
4. Reference and comparison text remains policy-relative.
5. Persistence stays versioned and recoverable.
6. The cockpit remains focused on placing blocks.
7. `npm run verify` passes at every landing point.
