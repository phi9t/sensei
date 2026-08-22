# Sensei Full Curriculum Implementation Design

**Status:** Approved for implementation planning

**Date:** 2026-08-21

**Builds on:**

- `docs/superpowers/specs/2026-08-21-sensei-ux-and-algorithm-curriculum-spec.md`
- `docs/superpowers/specs/2026-08-19-sensei-pipeline-game-design.md`
- `docs/research/pipeline-parallelism-tutor-source-study.md`
- `docs/design-patterns/game-cockpit-layout.md`

## Outcome

Implement the full Sensei pipeline-parallelism curriculum as a sequence of
engine-backed playable levels. "Full" means the algorithm envelope already
approved for Sensei:

- foundations;
- GPipe AFAB;
- 1F1B;
- memory-constrained 1F1B;
- building-block / periodic schedules;
- interleaved 1F1B with virtual stages;
- ragged virtual-stage schedules;
- nonuniform backward cost;
- zero-bubble split backward;
- grouped / BF-PP style schedules;
- FSDP-style residency and all-gather counting;
- DualPipe / bidirectional variants.

The implementation must preserve the current cockpit UX: learners place blocks
first, inspect consequences, and only see compact guidance. New algorithms must
not become a long visible rules panel or a static lesson catalog.

## Existing Constraints

Current Sensei is a strong four-level vertical slice, but its engine is still
V1:

- operation kinds are only `F` and `B`;
- operation IDs are `F:stage:microbatch` and `B:stage:microbatch`;
- displayed operation codes are compact, such as `F0:S0:B1`;
- `stageCount === rankCount`;
- each logical stage maps directly to the same physical rank;
- durations are validated as exactly `F=1` and `B=2`;
- activation memory is acquired by `F` and released by unsplit `B`;
- scores include makespan, bubble ratio, intentional idle, and peak activation
  memory;
- progression, sharing, undo, and redo depend on replaying a level config plus
  an ordered action log.

These constraints are useful for early levels. They are insufficient for the
whole curriculum because virtual stages, split-gradient work, FSDP residency,
and bidirectional pipelines change schedule semantics.

## Recommended Implementation Shape

Use staged engine expansion. Each stage introduces one new domain capability,
adds at least one playable level that forces the capability to matter, and keeps
the UI surface compact.

Do not land every future level as metadata-only content. A level may carry
metadata before its mechanics exist, but it must remain locked or hidden until
the engine can validate its rules.

Do not implement the full curriculum as one large patch. The work should land as
independently verifiable commits grouped by concern:

1. metadata and current-engine levels;
2. policy projection and recognition;
3. building-block representation;
4. virtual-stage topology;
5. split-gradient `W`;
6. grouped policies;
7. FSDP residency;
8. DualPipe model and playable bidirectional levels.

## Architecture

### Level Catalog

Extend `LevelConfig` with optional metadata and capability fields while keeping
existing fields backward compatible:

```ts
interface LevelConfig {
  id: string;
  version: number;
  title: string;
  rankCount: number;
  stageCount: number;
  microbatchCount: number;
  durations: OperationDurations;
  memoryCaps: readonly number[] | null;
  masteryTargets: readonly MasteryTarget[];
  coaching: CoachingConfig;
  algorithm?: AlgorithmLevelMetadata;
  topology?: PipelineTopology;
  operationModel?: OperationModel;
  referencePolicies?: readonly ReferencePolicyConfig[];
}
```

`algorithm` drives the level guide, set labels, pattern chip, unlock UI, and
tests. It does not bypass the engine.

```ts
type AlgorithmFamily =
  | 'foundations'
  | 'gpipe'
  | 'one-f-one-b'
  | 'building-block'
  | 'interleaved-one-f-one-b'
  | 'zero-bubble'
  | 'grouped'
  | 'fsdp-residency'
  | 'dualpipe';

interface AlgorithmLevelMetadata {
  family: AlgorithmFamily;
  setTitle: string;
  concept: string;
  objective: string;
  patternLabel: string | null;
  introducedModel: readonly string[];
  lockedUntil?: CurriculumCapability;
}
```

The level picker remains compact. It can group options by set title, but the
main play surface only shows the current set, level title, one-sentence concept,
goal chip, and optional pattern chip.

### Operation Model

Generalize `OperationKind` in phases:

```ts
type OperationKind = 'F' | 'B' | 'W';
```

Keep IDs stable for current and split-gradient levels:

```text
F:stage:microbatch
B:stage:microbatch
W:stage:microbatch
```

Keep UI codes compact:

```text
F0:S0:B1
W2:S2:B3
```

The notation key is level-aware:

- normal levels: `(F/B, stage_id, micro_batch_id)`;
- split levels: `(F/B/W, stage_id, micro_batch_id)`.

DualPipe must not overload `microbatch` to encode direction. It needs either an
explicit direction field on `Operation` or a future ID extension decided in a
separate model record before code is written.

### Topology

Introduce topology without breaking V1 levels:

```ts
interface PipelineTopology {
  placement: 'one-to-one' | 'wrap' | 'v-shape';
  virtualStagesPerRank: number;
}
```

Derived operations use logical stages for dependencies and physical ranks for
placement:

```text
logical stage -> owner rank
```

The schedule board continues to render rank lanes. Stage identity stays inside
block labels and inspector text. A rank may host multiple logical stages once
virtual stages are enabled.

### Dependencies

Keep dependency logic centralized in `src/engine/operations.ts`.

For unsplit levels:

- `F(s,m)` depends on `F(s-1,m)` when `s > 0`;
- `B(s,m)` depends on `F(s,m)`;
- `B(s,m)` depends on `B(s+1,m)` when `s < lastStage`.

For split-gradient levels:

- `B(s,m)` represents input-gradient work;
- `W(s,m)` represents weight-gradient work;
- `W(s,m)` depends on `B(s,m)`;
- activation release moves from `B` to `W`;
- scoring can distinguish total bubble from internal bubble.

For DualPipe:

- dependency direction becomes part of the operation model;
- forward and backward-style flows can move in opposite directions;
- rank resource conflicts must be explicit;
- paired work must be modeled as either true concurrent occupancy or as a
  visual macro over serial operations before implementation.

### Reference Policies

Add a pure policy module under `src/engine/`:

```text
state + policy config -> next action candidate
level config + policy config -> projected action log
completed state + policy config -> recognition result
```

Policies are heuristics over the legal ready set, not optimal search.

Initial policies:

- `gpipe-afab`: all legal forwards in wave order, then backwards in reverse
  stage flow;
- `one-f-one-b`: warm up, then prefer backward work before forward work on the
  earliest frontier;
- `group-major`: choose groups first, then pass and stage;
- `zero-bubble`: prefer `B`, then useful `F`, then `W` to fill bubbles;
- `dualpipe`: deferred until the DualPipe model record is approved.

Recognition compares per-rank operation order first. Exact timing can be a
secondary flag. This keeps recognition teachable without claiming optimality.

### Building Blocks

Add a second representation for periodic schedules:

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

The engine validates:

- every referenced operation exists for one representative microbatch;
- dependencies are satisfiable after stamping;
- no two operations overlap on the same rank at the same residue modulo period;
- projected activation memory does not exceed caps;
- expansion produces an ordinary action log for replay.

The playable UI can start with a guided level that compares a stamped projection
to the learner's hand-built schedule. A full free-edit pattern editor is
deferred.

### FSDP Residency

Add residency as a separate resource from activation memory:

- activation memory tracks in-flight saved activations;
- weight residency tracks gathered stage weights per rank;
- all-gather count increments when a move needs weights not currently resident;
- eviction/reshard is durationless in the first version;
- admission checks activation plus resident weight units against the relevant
  cap.

The score adds `allGatherCount` only for levels that enable residency. The score
rail should show a `Gathers` card for those levels without changing the core
scoreboard for earlier levels.

## Curriculum Slices

### Slice 1: Metadata And Current-Engine Levels

Add metadata for the existing four levels and add playable current-engine
levels for:

- GPipe AFAB;
- Warm Up Then Alternate;
- Tie At The Frontier;
- Memory-Capped 1F1B.

This slice uses only `F/B`, one-to-one topology, and existing memory semantics.
It should also add set labels and pattern chips in `LevelGuide`.

Acceptance:

- every level has metadata, guide copy, and mastery targets;
- fixtures replay to complete schedules;
- legal-but-not-mastered fixtures exist where meaningful;
- existing persisted attempts still decode;
- no visible rules panel is added.

### Slice 2: Policy Projection And Recognition

Implement reference projection and recognition for AFAB and 1F1B.

Acceptance:

- projected policies produce legal complete action logs;
- recognition names matched strategies on completion;
- schedule comparison is policy-relative, not called globally optimal;
- completion feedback remains compact and attached to the existing feedback
  region.

### Slice 3: Building Blocks

Implement periodic trajectory validation and expansion.

Acceptance:

- valid building-block plans expand into replayable action logs;
- invalid plans return structured violations;
- at least one level teaches stamping a trajectory;
- memory prediction is tested before expansion.

### Slice 4: Virtual Stages And Interleaved 1F1B

Separate logical stage from physical rank and add virtual-stage placement.

Acceptance:

- `stageCount` may exceed `rankCount`;
- one-to-one V1 levels still behave unchanged;
- wrap and V-shape placement are tested with original Sensei fixtures;
- ready queue and board labels remain readable with `F0:S4:B2` style codes;
- interleaved 1F1B and ragged rounds are playable.

### Slice 5: Nonuniform Cost

Relax duration validation enough to support stage or kind variants required by
the curriculum.

Acceptance:

- default levels still use `F=1`, `B=2`;
- nonuniform levels expose duration differences in tile width and inspector
  text;
- mastery targets explain makespan or critical-tail consequences.

### Slice 6: Split Backward And Zero Bubble

Add `W` operations and split-gradient memory release.

Acceptance:

- split levels render `FWD`, `BWD`, and `WGT` stacks;
- notation key updates to `(F/B/W, stage_id, micro_batch_id)`;
- `W` is visually distinct from `F` and `B`;
- activation release is tested on `W`, not `B`;
- zero-bubble levels score internal bubble.

### Slice 7: Grouped And BF-PP

Add group metadata and group-major reference policies.

Acceptance:

- group boundaries are visible but compact;
- policies can rank by group, pass, and stage;
- grouped schedules compare against 1F1B on memory and bubble;
- no FSDP claims appear until residency is enabled.

### Slice 8: FSDP Residency

Add residency state, all-gather counting, and residency-aware memory admission.

Acceptance:

- gathered weights are reused when resident;
- cap pressure can force eviction or block a move;
- all-gather count appears in score only for FSDP levels;
- level fixtures demonstrate gather reduction and a too-wide group failure.

### Slice 9: DualPipe

Write and approve a separate DualPipe model record, then implement
bidirectional levels.

Acceptance:

- operation direction is explicit;
- opposite-direction dependencies are tested;
- rank resource conflicts are tested;
- UI can show bidirectional flow without overloading the compact operation code;
- DualPipe levels are playable and compare against a one-direction baseline.

## UI Design Rules

The UI implementation follows the existing cockpit pattern:

- top rail: current set and level selector;
- level guide: one concept sentence, one objective, one pattern chip;
- ready queue: batch lanes with vertical pass stacks;
- command rail: unchanged placement controls and short feedback;
- schedule board: dominant lower workspace;
- score rail: scoreboard first, details behind disclosure.

New controls appear only when a level needs them. Examples:

- split levels add a third stack label, not a new rules panel;
- FSDP levels add `Gathers`, not a general communication dashboard;
- building-block levels add pattern validation affordances only inside those
  levels;
- DualPipe waits for its model record before adding UI affordances.

## Data Flow

The canonical flow stays:

```text
LevelConfig + Action[] -> replay -> ScheduleState -> score -> React view model
```

New modules should preserve this shape:

```text
reference policy -> projected Action[]
building block plan -> expanded Action[]
residency model -> ScheduleState resource fields
recognition -> completion feedback
```

Actions remain the durable user artifact. Any new action type must be versioned
in URL and local persistence codecs before a level can depend on it.

## Error Handling

Keep structured failure causes:

- invalid config throws during config validation;
- illegal learner moves return typed blocker reasons;
- policy projection returns a deadlock or stopped state instead of looping;
- building-block validation returns a list of violations;
- persistence rejects unknown future schemas with a recovery notice;
- engine/UI inconsistencies continue to throw loudly in tests.

Do not swallow conflict bugs in overlays.

## Testing Strategy

Each slice must add tests at the layer where the behavior is owned:

- `src/engine/*`: operation derivation, dependency rules, replay, scoring,
  resource accounting, policy projection, recognition;
- `src/levels/*`: catalog order, frozen configs, fixture replay, golden score
  rows, unlock sequence;
- `src/persistence/*`: backward compatibility and schema failures when action
  or level versions change;
- `src/components/*`: compact labels, level guide metadata, stack layout,
  optional metric rendering, accessibility names;
- `tests/responsive-css.test.mjs`: cockpit density and no overflow regressions.

Run `npm run verify` before any implementation landing.

## Clean-Room Rules

The source study is evidence, not source material for copying. Implementation
must be original:

- no copied upstream code, CSS, prose, fixtures, screenshots, or exact level
  definitions;
- original level names and targets are required;
- policy behavior must be independently authored from domain understanding;
- source-derived claims must point back to the existing research document or a
  new Sensei-owned source note;
- paper correspondence remains a claim only after separate verification.

## Decomposition And Landing Order

This is too large for one implementation issue. Write the implementation plan as
separate tasks with hard verification gates:

1. add metadata and current-engine curriculum levels;
2. add AFAB/1F1B policy projection and recognition;
3. add building-block validation and expansion;
4. add virtual-stage topology and interleaved levels;
5. add nonuniform duration support;
6. add `W` and zero-bubble levels;
7. add grouped policy levels;
8. add FSDP residency;
9. write and implement DualPipe model record.

Each task should be small enough to land independently on `master` with tests.
If a later slice exposes a weak boundary in an earlier slice, fix the boundary
before adding more algorithm labels.

## Acceptance Criteria

The full curriculum implementation is complete when:

1. every approved curriculum family has at least one playable level;
2. each level's rules are enforced by the engine, not just described by text;
3. the cockpit UI remains focused on placing blocks;
4. operation labels remain compact and accessible;
5. strategy recognition and scoring are transparent and policy-relative;
6. persistence remains versioned and recoverable;
7. every algorithm mechanic has engine tests, fixture tests, and UI coverage;
8. `npm run verify` passes;
9. clean-room constraints are preserved in code, docs, and fixtures.
