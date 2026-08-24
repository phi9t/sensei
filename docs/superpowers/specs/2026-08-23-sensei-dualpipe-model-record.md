# Sensei DualPipe Model Record

**Status:** Approved for implementation

**Date:** 2026-08-23

**Curriculum slice:** SENSEI-CURR-11

**Builds on:**

- `docs/superpowers/specs/2026-08-21-sensei-ux-and-algorithm-curriculum-spec.md`
- `docs/superpowers/specs/2026-08-21-sensei-full-curriculum-implementation-design.md`
- `docs/superpowers/specs/2026-08-22-sensei-rest-curriculum-execution-design.md`
- `docs/superpowers/issues/2026-08-22-sensei-full-curriculum-issues.md`

## Decision

DualPipe is a bidirectional operation model, not a label over the current
one-direction engine. The implementation must introduce explicit direction,
direction-aware dependencies, and rank resource compatibility before any
playable DualPipe level is visible.

Use a level-scoped operation identity extension for DualPipe only:

```text
F:stage:microbatch:asc
B:stage:microbatch:asc
F:stage:microbatch:desc
B:stage:microbatch:desc
```

Existing non-DualPipe levels keep the durable IDs they already use:

```text
F:stage:microbatch
B:stage:microbatch
W:stage:microbatch
```

Every derived DualPipe `Operation` also exposes a parsed `direction` field so
engine, policy, persistence, UI, and tests do not repeatedly parse direction
from strings. Microbatch IDs remain numeric learner-facing batch identity and
must not encode direction.

## Operation Direction

Add a level capability similar to other optional engine axes:

```ts
type PipelineDirection = 'asc' | 'desc';

interface DualPipeModel {
  readonly enabled: true;
  readonly directions: readonly PipelineDirection[];
  readonly resourceModel: DualPipeResourceModel;
  readonly crossDirectionDependencies?: readonly DualPipeDependencyEdge[];
}
```

The default direction for existing operation IDs is implicit one-direction
`asc`, but that default is not serialized into existing IDs. Direction is
required in DualPipe IDs and required on every DualPipe operation object.

Visible block codes stay compact:

```text
F0:S0:B1
B3:S3:B0
```

Direction is shown as a separate compact badge or lane marker and in accessible
text. The code itself must not become `F0:S0:B1:asc`; learners already use
`F0:S0:B1` as the stable block identity pattern.

## Dependencies

Generate DualPipe dependencies in the same central operation/dependency module
used by the rest of the engine. For a pipeline with stages `0..lastStage`:

```text
previousStage('asc', s) = s - 1
nextStage('asc', s) = s + 1

previousStage('desc', s) = s + 1
nextStage('desc', s) = s - 1
```

Forward dependencies:

```text
F(dir, s, m) depends on F(dir, previousStage(dir, s), m)
when previousStage(dir, s) exists.
```

Backward dependencies:

```text
B(dir, s, m) depends on F(dir, s, m).
B(dir, s, m) depends on B(dir, nextStage(dir, s), m)
when nextStage(dir, s) exists.
```

If a future split-gradient DualPipe level needs `W`, it inherits the existing
split rule:

```text
W(dir, s, m) depends on B(dir, s, m).
```

Opposite-direction dependencies are never inferred from equal stage IDs,
microbatch IDs, visual pairing, or timing. Any cross-direction edge must be
declared in `dualPipe.crossDirectionDependencies` and compiled into ordinary
predecessor edges during operation derivation.

Executable invariants before UI work:

- Every derived DualPipe operation ID is unique.
- Every DualPipe operation ID parses and formats without losing direction.
- Every DualPipe operation has an explicit direction.
- Every generated predecessor ID exists in the operation inventory.
- Current non-DualPipe IDs continue to parse, replay, persist, and render
  unchanged.

## Pairing And Resources

Model paired work as true concurrent occupancy when resource compatibility
allows it. Do not add a durable `placePair` action and do not model DualPipe as a
visual macro over two serial placements.

Learner actions remain ordinary actions:

```ts
type Action = { type: 'place'; operationId: OperationId } | { type: 'wait'; rank: number };
```

Replay may derive an overlap or pair from two compatible opposite-direction
placements on the same rank. That derived pair can drive board rendering,
coaching, recognition, and score details, but it is not persisted.

Replace the single exclusive rank frontier with explicit per-rank resource
availability for DualPipe levels. The current engine is equivalent to one
exclusive compute pool per rank. DualPipe levels may define two directional
slots plus a shared rank capacity:

```ts
interface DualPipeResourceModel {
  readonly directionalSlots: number;
  readonly sharedCapacity: number;
}
```

The first playable model should be intentionally small:

- one operation consumes one directional slot for its direction;
- one operation consumes one shared unit;
- opposite directions may overlap on the same rank when both a directional slot
  and shared capacity are available;
- same-direction operations on the same rank remain ordered by that direction's
  resource availability.

Replay computes each placement's earliest feasible start from dependency
completion and resource availability. For non-DualPipe levels, existing
`rankFrontiers` behavior remains unchanged. For DualPipe levels, `rankFrontiers`
is a derived maximum over rank resource timelines so existing board and score
surfaces can keep working while resource-specific tests prove overlap behavior.

Executable invariants:

- No placement overlaps an incompatible resource interval on the same rank.
- Compatible opposite-direction placements may overlap only when the resource
  model allows it.
- Same-direction placements on one rank cannot overlap.
- Completion still means every operation in the level inventory is placed
  exactly once.
- Bubble/capacity metrics use the level resource model and cannot go negative.

## Persistence And Versioning

Persistence remains `LevelConfig + Action[]` unless a later model record changes
the durable action schema. DualPipe direction and derived pairing are recovered
from the level's operation inventory and each action's `operationId`.

No persisted URL or local-storage payload may include:

- parsed direction fields;
- resource timelines;
- pair metadata;
- policy comparison metadata;
- derived score details beyond the existing stored ranking tuple.

Schema implications:

- If action shape stays `{ type: 'place', operationId }`, keep the global URL
  schema stable.
- DualPipe levels must use new level versions and strict operation ID
  validation so stale attempts quarantine instead of silently replaying against
  changed direction semantics.
- If a future implementation adds any new action type, bump the persistence
  schema, update the storage key, and add migration/quarantine tests.

Required persistence tests:

- old non-DualPipe URLs still decode;
- DualPipe URLs round-trip with direction-bearing operation IDs;
- stale DualPipe level versions quarantine;
- derived direction, pair, and resource metadata are not serialized.

## Policy And Scoring

DualPipe policies are policy-relative heuristics, not optimal search. Initial
policy work should include:

- a one-direction baseline projection using the existing one-direction schedule
  model where possible;
- a bidirectional DualPipe reference that prefers legal opposite-direction
  overlap when resources allow it;
- recognition that compares per-rank operation order including direction
  identity;
- completion feedback that says "reference" or "baseline", never "optimal".

Scoring must keep existing metrics unchanged for all current levels. DualPipe
capacity math must account for the configured resource model. If a level allows
two compatible operations to occupy one rank at the same time, the denominator
for bubble/capacity metrics must reflect that capacity so useful overlap does
not produce negative bubble.

## UI Constraints

Keep the cockpit focused on placing blocks.

Required UI behavior:

- ready queue remains grouped by microbatch and pass stack;
- visible block code remains `F0:S0:B1`;
- direction appears as a separate compact non-color cue and in accessible text;
- board can show overlap without nesting cards or adding a rules panel;
- move inspector names direction, owner rank, duration, dependencies, and any
  resource conflict concisely;
- score rail remains scoreboard-first with comparison details behind disclosure.

The first DualPipe levels should be small enough to fit a 13-inch laptop view
without shrinking labels below the existing readable compact block size.

## Playable Curriculum Envelope

SENSEI-CURR-12 should implement three original, clean-room levels after this
record:

| Level             | Concept                                                | Required engine signal                                        |
| ----------------- | ------------------------------------------------------ | ------------------------------------------------------------- |
| Two Directions    | Two streams move in opposite stage order.              | Direction-aware dependencies complete without overlap.        |
| DualPipe Balance  | Compatible opposite-direction work can reduce bubbles. | Lower bubble than one-direction baseline.                     |
| DualPipe Conflict | Pairing can be blocked by rank resource limits.        | Resource-aware replay delays or rejects incompatible overlap. |

These level names may change, but the concepts and tests must remain.

## Clean-Room Boundary

This record is derived from Sensei's local curriculum specs, local issue pack,
and the current engine architecture. It does not copy upstream DualPipe
implementation code, prose, diagrams, screenshots, CSS, level data, or fixtures.

Implementation may use external/vendor materials only for conceptual
orientation. New code, prose, test fixtures, and visual treatment must be
original to this repository.

## Verifier

Before any DualPipe playable level is considered complete, the implementation
must pass:

```bash
npm run verify
```

Required focused coverage before the full verifier:

- `src/engine/operations.test.ts`: direction ID parse/format, unique operation
  inventory, `asc` and `desc` dependency rules, explicit cross-direction edges.
- `src/engine/replay.test.ts`: compatible overlap, same-direction exclusion,
  resource-forced delay or blocker, no duplicate placement.
- `src/engine/score.test.ts`: nonnegative bubble/capacity math for concurrent
  resources and unchanged existing-level scoring.
- `src/engine/policies.test.ts` and
  `src/engine/policyComparison.test.ts`: DualPipe projection, recognition,
  unmatched schedules, one-direction baseline comparison.
- `tests/persistence.test.ts`: old URL compatibility, DualPipe URL round-trip,
  stale version quarantine, no derived metadata persistence.
- `src/levels/levels.test.ts`: level order, frozen config, original fixtures,
  golden rows.
- `src/components/GameShell.test.tsx` and accessibility/responsive tests:
  compact code, direction cues, overlap rendering, keyboard reachability, and no
  long rules panel.

## Post-Execution Review

Date: 2026-08-23

- Verifier: focused DualPipe coverage passed, then `npm run verify` passed with
  20 test files and 409 tests passing, followed by a successful production
  build.
- Invariants: all preserved. Existing non-DualPipe IDs remain unchanged;
  DualPipe IDs carry `asc` or `desc`; visible compact block codes remain
  `F0:S0:B1`; learner persistence remains canonical `Action[]`.
- Levels: `Two Directions`, `DualPipe Balance`, and `DualPipe Conflict` are
  original playable levels backed by fixtures, golden score rows, policy
  comparisons, public-control game-flow coverage, persistence coverage, and
  compact UI tests.
- Resource model: DualPipe replay now derives earliest starts from dependency
  completion plus per-rank directional slots and shared capacity. Capacity-one
  levels serialize otherwise compatible overlap; capacity-two levels allow
  opposite-direction work to overlap where legal.
- UI: direction is a compact separate cue (`Up` / `Down`) and accessible text,
  not part of the learner-facing `F0:S0:B1` code. Schedule rows reserve
  DualPipe sublanes so overlap is visible without adding a rules panel.
- Plan corrections:
  - The public-control game-flow helper had to include the optional direction
    phrase in its accessible-name regexp, otherwise DualPipe `asc` and `desc`
    buttons with the same compact code were ambiguous.
  - `dualpipe-one-direction` needed explicit cross-direction dependency edges
    to force all `asc` work before `desc` work without inventing a new action
    type or serializing derived model state.
  - `DualPipe Conflict` is clearer as a resource-capacity lesson with
    `sharedCapacity: 1`, mastered makespan `12`, and peak activation memory `4`.
