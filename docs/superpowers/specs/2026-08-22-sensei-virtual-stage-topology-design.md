# Sensei Virtual-Stage Topology Design

**Status:** Approved design, awaiting implementation-plan approval

**Date:** 2026-08-22

**Issue:** `SENSEI-CURR-04`

**Builds on:**

- `docs/superpowers/specs/2026-08-21-sensei-ux-and-algorithm-curriculum-spec.md`
- `docs/superpowers/specs/2026-08-21-sensei-full-curriculum-implementation-design.md`
- `docs/superpowers/specs/2026-08-22-sensei-rest-curriculum-execution-design.md`
- `docs/superpowers/issues/2026-08-22-sensei-full-curriculum-issues.md`
- `docs/superpowers/specs/2026-08-22-sensei-building-block-validation-design.md`

## Outcome

Add virtual-stage topology as the next curriculum primitive. Learners should see
that a pipeline can have more logical stages than physical ranks, and that
operation dependencies still move through logical stage order even when several
logical stages share one rank lane.

This slice prepares interleaved 1F1B without implementing interleaved policy
recognition yet. The result is one playable virtual-stage ownership level plus
the engine and UI contract later curriculum slices can reuse.

## Current Context

The current durable game flow is:

```text
LevelConfig + Action[] -> replay -> ScheduleState -> score -> React view model
```

Operation identity is still compact and logical-stage based:

```text
F:stage:microbatch
B:stage:microbatch
```

The UI renders those IDs as `F0:S0:D1` and keeps the notation key
`(F/B, stage_id, data_id)`. Existing levels assume `stageCount ===
rankCount`, and `deriveOperations` currently sets `operation.rank = stage`.

`SENSEI-CURR-03` proved that new curriculum representations can be level-local
metadata that project back into ordinary `Action[]`. CURR-04 should follow the
same discipline: topology annotates operation ownership, but the persisted
learner artifact remains the action log.

## Non-Goals

- Do not implement interleaved 1F1B policy recognition in this slice.
- Do not add split backward `W`, nonuniform cost, grouped scheduling, FSDP
  residency, zero-bubble scoring, or DualPipe semantics.
- Do not change the `Action[]` persistence format.
- Do not add a large topology editor or long visible rules panel.
- Do not copy upstream code, CSS, prose, screenshots, fixtures, or exact level
  definitions.
- Do not touch the pre-existing untracked
  `src/components/PipelineLessonPanel.tsx`.

## Approach

Add topology as optional level metadata:

```ts
interface PipelineTopology {
  readonly placement: 'one-to-one' | 'wrap' | 'v-shape';
  readonly virtualStagesPerRank: number;
}
```

When omitted, topology is equivalent to:

```ts
{ placement: 'one-to-one', virtualStagesPerRank: 1 }
```

Operations keep their logical `stage` field and gain their physical owner
through the existing `rank` field:

```text
operation.stage -> logical pipeline stage
operation.rank  -> physical rank lane that owns the stage
```

Dependencies continue to use logical stage order. Placement legality, rank
frontiers, waits, memory accounting, and board lanes continue to use physical
rank ownership.

## Topology Mapping

The topology contract is deterministic and config-derived. For all mappings:

```text
logicalStageCount = rankCount * virtualStagesPerRank
```

Virtual-stage levels must set `stageCount` to that logical stage count. Existing
one-to-one levels keep `stageCount === rankCount`.

### One-To-One

Used by all existing levels:

```text
rank = stage
```

Validation requires `virtualStagesPerRank === 1` and `stageCount === rankCount`.

### Wrap

Stages are assigned by modulo rank:

```text
rank = stage % rankCount
```

For `rankCount = 2`, `virtualStagesPerRank = 2`, logical stages map as:

```text
S0 -> R0
S1 -> R1
S2 -> R0
S3 -> R1
```

### V-Shape

Stages walk forward across ranks, then back inward. This exposes the common
virtual-pipeline intuition that the same physical rank can own distant logical
stages.

For `rankCount = 2`, `virtualStagesPerRank = 2`, logical stages map as:

```text
S0 -> R0
S1 -> R1
S2 -> R1
S3 -> R0
```

For larger ranks, the repeated base pattern is:

```text
0, 1, ..., rankCount - 1, rankCount - 1, ..., 1, 0
```

The implementation can derive the owner by chunk index rather than storing a
per-stage table in level data. If a future curriculum needs arbitrary mappings,
that should be a separate topology extension.

## Engine Design

Add topology helpers close to operation derivation, with no React or storage
dependency:

```ts
function topologyForLevel(config: LevelConfig): PipelineTopology;
function ownerRankForStage(config: LevelConfig, stage: number): number;
```

`validateLevelConfig` should check:

1. `rankCount`, `stageCount`, and `microbatchCount` remain positive finite
   integers.
2. Topology placement is one of the supported placement names.
3. `virtualStagesPerRank` is a positive finite integer.
4. `one-to-one` requires `virtualStagesPerRank === 1` and
   `stageCount === rankCount`.
5. `wrap` and `v-shape` require `stageCount === rankCount *
virtualStagesPerRank` and `virtualStagesPerRank > 1`.
6. `memoryCaps`, when present, still has one entry per physical rank.

`deriveOperations` should continue to produce one `F` and one `B` operation for
each logical stage and microbatch, but compute `rank` through
`ownerRankForStage`.

`predecessorsOf` should not change conceptually. Forward dependencies still come
from `F:(stage - 1):microbatch`; backward dependencies still come from the same
stage's forward pass and the next logical stage's backward pass. This is the
main invariant CURR-04 must prove with tests: logical dependency order and
physical rank ownership are separate concerns.

Replay, scoring, memory accounting, and policy comparison should continue to
consume `operation.rank`. The intended implementation should not special-case
virtual stages in those modules unless a test proves the existing abstraction is
insufficient.

## Level Design

Add one playable level:

- id: `virtual-stages`;
- title: `Virtual Stages`;
- family: `interleaved-one-f-one-b`;
- set title: `Virtual Stages`;
- pattern label: `V-shape`;
- rank count: `2`;
- stage count: `4`;
- microbatch count: `2`;
- topology: `{ placement: 'v-shape', virtualStagesPerRank: 2 }`;
- durations: `F=1`, `B=2`;
- memory caps: none in this first level;
- objective: finish a legal schedule while noticing that rank lanes host
  multiple stage identities.

This level is intentionally about ownership, not the full interleaved 1F1B
policy. A mastered fixture should demonstrate legal completion with minimal
idle, but no new reference policy must be added here.

The level should appear after `stamp-the-pattern` so the curriculum moves from
periodic blocks to topology before interleaving.

## UI Design

Keep the cockpit layout and avoid new persistent rule panels.

Visible behavior:

- schedule board lanes remain physical ranks;
- operation labels remain `F0:S4:D2` style;
- ready queue meta continues to show owner rank, e.g. `R1 - 2t`;
- level guide gets one concise topology chip, such as `V-stage x2`;
- inspector text names both logical stage and owner rank when a block is
  selected;
- optional timeline details may list rank ownership, but the main screen should
  remain focused on placing blocks.

The ready queue is allowed to contain more blocks because `stageCount` grows.
The UI must preserve the existing constraints: ready-queue blocks stay compact,
schedule blocks stay readable on a 13-inch laptop, and the board remains the
dominant lower workspace.

## Persistence

No new learner artifact is persisted. Stored attempts remain:

```text
level id + level version + Action[]
```

The new level starts at version `1`. Existing level versions do not change
because their default topology preserves current operation IDs, ranks, replay,
score, and rendered labels.

If a future migration changes topology for an existing level, that level should
receive a version bump in the same change.

## Testing

Add focused coverage:

- config validation accepts default one-to-one topology and rejects invalid
  placement names, non-integer virtual-stage counts, and stage-count mismatches;
- topology helper tests cover one-to-one, wrap, and v-shape mappings;
- operation derivation assigns physical ranks from topology while preserving
  logical operation IDs;
- dependency tests show cross-rank and same-rank dependencies still follow
  logical stage order;
- replay tests prove a valid virtual-stage action log completes and an illegal
  dependency order is blocked;
- level catalog and fixture tests cover `virtual-stages`;
- persistence tests prove virtual-stage attempts still roundtrip as expanded
  `Action[]`;
- UI tests prove the new level appears in the picker, compact codes render, and
  owner rank remains discoverable;
- responsive CSS tests guard against ready-queue and schedule-label overflow.

`npm run verify` is the required final verification gate.

## Implementation Slices

1. Add topology types, defaults, validation, and mapping helpers.
2. Update operation derivation and dependency/replay tests.
3. Add the `virtual-stages` level and fixtures.
4. Add compact UI affordances for topology metadata.
5. Add integration, persistence, and responsive regressions.
6. Run review, full verification, rebase, and fast-forward landing.

## Acceptance Criteria

1. Existing one-to-one levels replay, score, persist, and render unchanged.
2. `stageCount` can exceed `rankCount` only through a valid topology.
3. `wrap` and `v-shape` mappings are deterministic and tested.
4. Operation dependencies use logical stage identity.
5. Placement legality, rank frontiers, waits, memory, and board lanes use
   physical rank ownership.
6. The catalog includes one playable virtual-stage ownership level.
7. Labels remain compact and readable, using `F0:S4:D2` style with owner rank
   shown separately.
8. No later curriculum semantics leak into this slice.
9. `npm run verify` passes before landing.
