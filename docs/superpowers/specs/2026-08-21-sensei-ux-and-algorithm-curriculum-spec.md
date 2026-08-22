# Sensei UX Decisions and Algorithm Curriculum Spec

**Status:** Draft for implementation planning

**Date:** 2026-08-21

**Related docs:**

- `docs/design-patterns/game-cockpit-layout.md`
- `docs/superpowers/specs/2026-08-19-sensei-pipeline-game-design.md`
- `docs/superpowers/specs/2026-08-21-sensei-cockpit-layout-design.md`
- `docs/superpowers/specs/2026-08-21-sensei-batch-stacks-and-curriculum-design.md`
- `docs/research/pipeline-parallelism-tutor-source-study.md`

## Outcome

Capture the current Sensei game UI decisions as a durable product contract, then
define the next curriculum ladder for teaching pipeline-parallelism algorithms
through playable block placement.

The next build phase should preserve the current cockpit aesthetic and learning
loop while expanding the engine only where a level needs new executable
semantics.

## Product Thesis

Sensei is a technical learning game for pipeline scheduling. The learner should
learn algorithms by placing blocks, seeing the schedule geometry change, and
then reading a concise diagnosis of the result.

The UI should feel like a dense scheduling cockpit:

- the board is the primary object;
- the ready queue is a compact parts bin;
- the command rail is attached to the schedule;
- the score rail answers "did this improve?";
- explanations appear at the moment of inspection, not as a large rules panel.

This is intentionally not a landing page, static tutorial, or general dashboard.

## Adopted UX/UI Decisions

### 1. Preserve The Cockpit Layout

The stable screen model is:

```text
+--------------------------------------------------------------------------------+
| TOP RAIL                                                                        |
| Sensei | level selector | placed/total                                          |
+--------------------------------------------------------------------------------+
| LEVEL GUIDE                                                       | SCORE RAIL   |
| one algorithm hint + mastery target                               | inspector    |
+-------------------------------------------------------------------| scoreboard   |
| READY QUEUE                                                       | details      |
| compact batch lanes; FWD and BWD vertical stacks                  |              |
+--------------------------------------------------------------------------------+
| COMMAND RAIL                                                                      |
| Schedule | Undo Redo | Place Clear | Wait R0 R1 R2 | Ready Hint Auto | Share Reset |
| feedback line attached to the rail                                                 |
+--------------------------------------------------------------------------------+
| SCHEDULE BOARD                                                                    |
| dominant lower workspace; rank timelines; memory strips; gaps; placed blocks       |
+--------------------------------------------------------------------------------+
```

The layout is optimized for a 13-inch laptop first, then narrow responsive
stacking. The board must stay visually dominant over the inventory.

### 2. Keep The Game About Placing Blocks

The first-screen job is not "read the rules." It is:

1. choose a block;
2. see whether it is ready;
3. place it;
4. inspect the consequence.

Rules and algorithm theory belong in compact level guidance, selected-block
inspection, and optional details. Do not add a long visible rules panel.

### 3. Use A Stable Operation Identity

Visible operation names use:

```text
F0:S0:B1
```

The notation key remains visible once:

```text
(F/B, stage_id, micro_batch_id)
```

The same operation identity must travel through:

- ready queue token;
- legal preview;
- placed board block;
- selected move inspector;
- blocker references.

Full accessible labels stay explicit:

```text
Place F stage 0 microbatch 1, 1 tick, Ready
Inspect B stage 1 microbatch 2, 2 ticks, Blocked
Inspect F stage 0 microbatch 0, 1 tick, Completed
```

### 4. Make The Ready Queue Phase-Aware

Each microbatch lane has two vertical stacks:

```text
Batch 2  |  1 ready
+---------+---------+
| FWD     | BWD     |
| F0:S0:B2| B0:S0:B2|
| F1:S1:B2| B1:S1:B2|
| F2:S2:B2| B2:S2:B2|
+---------+---------+
```

Lane phase is derived from engine classifications:

| Phase     | Condition                                 | UI treatment                            |
| --------- | ----------------------------------------- | --------------------------------------- |
| `ready`   | at least one legal operation in the batch | prominent border and ready count        |
| `waiting` | no legal operations, not complete         | receded lane, still inspectable         |
| `done`    | every operation in the batch is completed | compressed and quiet, still inspectable |

Completed blocks must remain reachable until the board supports direct
block-by-block inspection.

### 5. Make The Score Rail Scoreboard-First

The score rail starts with four high-signal cards:

```text
+----------+----------+
| Makespan | Bubble   |
+----------+----------+
| Memory   | Status   |
+----------+----------+
```

The detailed metric table stays behind a disclosure. The summary tuple remains
available because ranking is lexicographic:

```text
makespan -> peakActivationMemory -> intentionalIdle -> actionCount
```

The score rail should diagnose progress, not explain every formula by default.

### 6. Keep Feedback Visible And Local

Command feedback is attached visually to the command rail and remains a live
status region. It confirms place, wait, ready-set, hint, auto, share, undo, redo,
clear, and reset actions without interrupting play.

Feedback text should be short and causal:

- `Placed F stage 0 microbatch 1 on rank 0.`
- `B stage 1 microbatch 0 is blocked by 2 blockers.`
- `Automation stopped at a memory boundary before F0:S0:B3.`

### 7. Board Polish Rules

The schedule board is the primary workspace.

Requirements:

- placed blocks are larger than ready queue tokens;
- rank rows are easy to scan, using subtle bands if needed;
- memory strips align to rank time;
- forced gaps and intentional waits remain visually distinct;
- board horizontal scroll is local to the board region;
- labels stay readable without overflow;
- color never carries meaning alone.

## Algorithm Curriculum Scope

This spec covers the algorithm families named in the current Sensei direction
and source study:

- dependency legality and pipeline fill/drain;
- GPipe AFAB;
- 1F1B;
- memory-constrained 1F1B behavior;
- building-block / periodic schedule representation;
- interleaved 1F1B with virtual pipeline stages;
- ragged virtual-pipeline schedules;
- nonuniform backward cost;
- zero-bubble split-backward variants;
- grouped / BF-PP style schedules;
- deeper warmup variants;
- FSDP-style residency and all-gather counting;
- DualPipe / bidirectional pipeline variants.

This is not a claim that Sensei covers every paper or production pipeline
runtime. It is the full curriculum envelope for the algorithm families already
requested and already identified in the repo's source study.

## Curriculum Model

Add explicit level metadata before adding new mechanics:

```ts
interface AlgorithmLevelMetadata {
  family:
    | 'foundations'
    | 'gpipe'
    | 'one-f-one-b'
    | 'building-block'
    | 'interleaved-one-f-one-b'
    | 'zero-bubble'
    | 'grouped'
    | 'fsdp-residency'
    | 'dualpipe';
  concept: string;
  objective: string;
  introducedModel: readonly string[];
  expectedPattern: string;
  referencePolicy: string | null;
}
```

This metadata feeds the level guide, level picker, tests, and future algorithm
map. It does not replace executable engine rules.

## Level Ladder

### Set 0: Foundations

Purpose: teach the physical model before naming algorithms.

| Level | Name                | New concept                        | Engine model                         | Mastery signal                              |
| ----- | ------------------- | ---------------------------------- | ------------------------------------ | ------------------------------------------- |
| 0.1   | Dependency Chain    | forward then backward dependencies | current `F/B`, one microbatch        | legal completion, no intentional idle       |
| 0.2   | Fill The Pipe       | fill, steady work, drain           | current `F/B`, multiple microbatches | lower makespan and bubble                   |
| 0.3   | Backward Is Heavier | duration asymmetry                 | current `F=1`, `B=2`                 | avoids local choices that lengthen the tail |
| 0.4   | Memory Wall         | activation lifetime and cap        | current memory cap                   | legal completion under cap                  |

These are the existing first-release levels. They remain the beginner ladder.

### Set 1: GPipe AFAB

Purpose: make the all-forward/all-backward policy explicit.

New level: **GPipe AFAB**

- Topology: 3-4 ranks, 4-8 microbatches.
- Operations: unsplit `F` and `B`.
- Policy target: place all forwards in wave order, then all backwards in reverse
  stage order.
- Learner insight: GPipe fills the pipe cleanly but holds many activations until
  the backward phase.
- UI needs: phase marker for `all forward`, `all backward`, and drain; reference
  ghost optional after completion.
- Acceptance: completed schedule can be recognized as AFAB by per-rank operation
  order.

### Set 2: 1F1B

Purpose: teach warmup, steady alternation, and lower activation pressure.

New levels:

| Level | Name                   | New concept                      | Engine model                     | Mastery signal                                 |
| ----- | ---------------------- | -------------------------------- | -------------------------------- | ---------------------------------------------- |
| 2.1   | Warm Up Then Alternate | first 1F1B policy                | current `F/B`, more microbatches | lower peak memory than AFAB                    |
| 2.2   | Tie At The Frontier    | multiple legal ready choices     | current `F/B`                    | choose backward when it preserves the pipeline |
| 2.3   | Memory-Capped 1F1B     | memory pressure as policy driver | current memory cap               | avoids memory deadlock and excess idle         |

Policy target: after warmup, prioritize `B` before `F` among legal operations
on the earliest available rank.

### Set 3: Building Blocks

Purpose: change the learner's unit of reasoning from individual moves to a
repeatable microbatch trajectory.

New levels:

| Level | Name              | New concept                             | Engine model                       | Mastery signal                                |
| ----- | ----------------- | --------------------------------------- | ---------------------------------- | --------------------------------------------- |
| 3.1   | One Trajectory    | one-microbatch schedule shape           | building-block candidate validator | valid residues per rank                       |
| 3.2   | Stamp The Pattern | repeat a trajectory across microbatches | building-block expansion           | projected makespan and memory match expansion |
| 3.3   | Too-Eager Pattern | memory violation before expansion       | building-block memory predictor    | reject unsafe periodic plan                   |

Engine additions:

- represent one trajectory as ordered operation offsets;
- validate no two blocks occupy the same residue modulo the per-rank work
  interval;
- derive projected peak activation memory before expansion;
- expand a valid pattern into ordinary actions for replay.

### Set 4: Interleaved 1F1B

Purpose: introduce virtual stages and show why stage-to-rank mapping changes the
shape of the schedule.

New levels:

| Level | Name             | New concept                            | Engine model                      | Mastery signal                        |
| ----- | ---------------- | -------------------------------------- | --------------------------------- | ------------------------------------- |
| 4.1   | Virtual Stages   | each rank owns multiple logical stages | `P` ranks, `V > 1` virtual chunks | legal schedule with correct ownership |
| 4.2   | Interleaved 1F1B | alternating local stage chunks         | virtual-stage dependencies        | matches interleaved reference order   |
| 4.3   | Ragged Rounds    | uneven tail and non-perfect tiling     | virtual-stage ragged cases        | diagnose par versus optimal           |

Engine additions:

- separate logical stage from physical rank;
- support stage placement strategies such as wrap and V-shaped placement;
- render rank lanes that host multiple stage identities;
- extend operation codes to preserve compact readability, likely
  `F0:S4:B2` for pass/stage/microbatch while a separate rank label shows owner.

### Set 5: Nonuniform Cost

Purpose: teach that algorithm quality depends on operation cost, not just
operation count.

New level: **Heavy Backward Tail**

- Topology: virtual or non-virtual pipeline.
- Operations: unsplit `F/B`.
- Durations: backward remains heavier; optionally allow stage-specific
  durations once the engine supports them.
- Learner insight: an order that looks balanced by count can still leave a long
  critical path.
- Acceptance: score explains makespan gate and critical tail.

Engine additions are optional if fixed `F=1`, `B=2` is enough for the first
version. Stage-specific durations should be added only with tests and visible
legend support.

### Set 6: Zero-Bubble Split Backward

Purpose: teach why splitting backward work creates fillable bubble slots.

New levels:

| Level | Name           | New concept                         | Engine model                              | Mastery signal                      |
| ----- | -------------- | ----------------------------------- | ----------------------------------------- | ----------------------------------- |
| 6.1   | Split Backward | `B` and `W` are separate operations | add operation kind `W`                    | legal split-gradient completion     |
| 6.2   | ZB-H1          | move weight work into bubbles       | policy `B > F > W` with quota             | lower internal bubble               |
| 6.3   | ZB-H2          | parallelogram-like schedule         | split-gradient plus reference recognition | zero or near-zero internal bubble   |
| 6.4   | ZeroPP Variant | deeper zero-bubble comparison       | split-gradient policy variant             | compare bubble and memory trade-off |

Engine additions:

- extend `OperationKind` from `F | B` to include `W`;
- model `B` as input-gradient work and `W` as weight-gradient work;
- keep activation release on `W` for split-gradient levels;
- distinguish total bubble from internal bubble;
- update rendering patterns so `F`, `B`, and `W` are visually distinct.

UI additions:

- ready queue gains a third vertical stack only for split levels;
- notation key becomes level-aware but still compact;
- board legend states which operation releases activation.

### Set 7: Grouped / BF-PP

Purpose: teach group-major scheduling and why batching policy changes memory and
communication behavior.

New levels:

| Level | Name           | New concept                        | Engine model                           | Mastery signal                  |
| ----- | -------------- | ---------------------------------- | -------------------------------------- | ------------------------------- |
| 7.1   | Group The Pipe | schedule microbatches in groups    | group metadata over current operations | match group-major reference     |
| 7.2   | BF-PP Pressure | grouped forward/backward under cap | group policy + memory cap              | reduce gathers or memory stalls |

Engine additions:

- level metadata for group size and group policy;
- policy projection that orders by group, then pass, then stage;
- recognition by per-rank operation order and group boundaries.

This set can land before full FSDP residency if it only teaches grouping as a
schedule order. It should wait for Set 8 if the level claims all-gather effects.

### Set 8: FSDP Residency

Purpose: teach weight residency as a separate resource from activation memory.

New levels:

| Level | Name               | New concept                    | Engine model                                      | Mastery signal                            |
| ----- | ------------------ | ------------------------------ | ------------------------------------------------- | ----------------------------------------- |
| 8.1   | Gather Once, Reuse | weight residency cache         | residency state + gather counter                  | fewer gathers without illegal memory      |
| 8.2   | Group Too Wide     | residency deadlock             | memory admission includes activations and weights | diagnose impossible group breadth         |
| 8.3   | Regather Storm     | trade memory for communication | compare 1F1B and grouped schedules                | lower gather count at acceptable makespan |

Engine additions:

- track resident weight units per rank/stage;
- count all-gather events;
- model reshard/eviction as durationless unless a later spec adds
  communication time;
- include gather count in score and attempt tuple only for FSDP levels.

UI additions:

- memory strip can show activation and weight residency separately;
- scoreboard adds `Gathers` when the metric exists;
- inspector explains whether a move gathers, reuses, or evicts weights.

### Set 9: DualPipe / Bidirectional Flow

Purpose: teach bidirectional pipeline scheduling as a distinct family with
opposite-direction work and stronger resource conflicts.

New levels:

| Level | Name              | New concept                                        | Engine model                    | Mastery signal                           |
| ----- | ----------------- | -------------------------------------------------- | ------------------------------- | ---------------------------------------- |
| 9.1   | Two Directions    | two microbatch streams move in opposite directions | bidirectional dependency graph  | complete without rank overlap            |
| 9.2   | DualPipe Balance  | pair opposite-direction work to reduce bubbles     | bidirectional policy projection | lower bubble than one-direction baseline |
| 9.3   | DualPipe Conflict | resource conflict between paired work              | rank resource constraints       | choose pairings that avoid stalls        |

Engine additions:

- represent direction as part of operation identity or level-local metadata;
- allow dependencies to flow both increasing and decreasing stage order;
- model per-rank resource conflicts for simultaneous or paired operations;
- decide whether paired blocks are true concurrent work or a visual macro over
  two serial operations before implementation.

DualPipe should not be implemented as a label over the current one-direction
engine. It needs an explicit model decision first.

## Algorithm Map UI

Add a compact curriculum map, not a new rules page.

Placement:

- top rail level selector shows current set and level title;
- level guide shows one sentence for the current algorithm family;
- a small "pattern target" chip can show `AFAB`, `1F1B`, `ZB-H1`, or `DualPipe`
  once the level has a reference policy;
- completed levels can expose a collapsed comparison against the reference
  schedule.

Do not show every future algorithm on the main play screen. A separate level map
or docs page may list the full ladder.

## Engine Roadmap

Implement in dependency order:

1. **Metadata-only curriculum shell:** add algorithm family, objective, and
   pattern labels for existing levels.
2. **Reference policies and recognition:** project GPipe and 1F1B schedules from
   the current engine; compare by per-rank operation order.
3. **Building-block representation:** validate and stamp periodic trajectories.
4. **Virtual stages:** separate logical stage ownership from physical rank.
5. **Split backward:** add `W`, split-gradient dependencies, release semantics,
   and internal bubble.
6. **Grouped policies:** add group-size metadata and BF-PP style projection.
7. **FSDP residency:** add weight cache state and all-gather counting.
8. **DualPipe:** add bidirectional flow and explicit resource-conflict rules.

Each step must include fixtures, scoring expectations, UI labels, and at least
one level that forces the new concept to matter.

## Data And API Changes

### Level Config

Extend `LevelConfig` conservatively:

```ts
interface LevelConfig {
  // existing fields stay stable
  algorithm?: AlgorithmLevelMetadata;
  topology?: PipelineTopology;
  operationModel?: OperationModel;
  referencePolicies?: readonly ReferencePolicyConfig[];
}
```

Initial additions should be optional so existing persisted attempts continue to
load. Persisted level versioning must increment for any change that alters
operation inventory, dependencies, durations, memory behavior, or scoring.

### Operation Identity

Current IDs:

```text
F:stage:microbatch
B:stage:microbatch
```

Future split-gradient IDs can extend the operation kind:

```text
W:stage:microbatch
```

DualPipe must decide whether direction belongs in the operation ID or the level
metadata. Do not overload `microbatch` to encode direction.

### Scoring

Current score remains:

```text
makespan, totalWork, capacity, bubbleRatio, intentionalIdle,
currentMemory, peakActivationMemory
```

Future optional metrics:

- `internalBubble`;
- `criticalPathLength`;
- `allGatherCount`;
- `referenceDelta`;
- `policyRecognition`.

Do not collapse metrics into a hidden aggregate score.

## Teaching Surface Requirements

Every algorithm level needs:

- one-sentence level guide;
- explicit mastery target;
- compact pattern label;
- engine-backed ready/blocked/completed states;
- completion feedback that names the recognized strategy when available;
- at least one blocker or comparison that demonstrates the new concept.

Every new algorithm family needs:

- a source or design note explaining the model boundary;
- at least one golden mastered fixture;
- at least one legal-but-not-mastered fixture when meaningful;
- tests for reference-policy projection;
- tests for persistence compatibility and level-version handling if the
  operation inventory changes.

## Clean-Room Boundary

Sensei can use general domain concepts and the existing source study as
orientation. It must not copy upstream implementation code, prose, CSS,
screenshots, fixtures, or exact level definitions from the unlicensed reference
repository.

Allowed:

- algorithm names such as GPipe, 1F1B, zero-bubble, BF-PP, FSDP, and DualPipe;
- independently authored level configs and explanations;
- original policies implemented from documented domain understanding;
- links to source-study evidence when describing what the reference models.

Required:

- every new level fixture must be original;
- every source-derived claim must cite the research doc or a new source-study
  entry;
- paper correspondence must not be asserted unless separately verified.

## Acceptance Criteria

This spec is satisfied when:

1. the current UI decisions are reflected in the design-pattern doc and this
   spec;
2. the level ladder covers every named family in the current requested scope;
3. each future family identifies the engine behavior needed before UI work;
4. no future level depends on a visible long rules panel;
5. operation identity remains compact and accessible;
6. score and comparison remain transparent, not aggregate-only;
7. clean-room constraints remain explicit.

## Suggested Implementation Issues

1. Add algorithm metadata to existing levels and surface pattern chips in the
   level guide.
2. Add GPipe and 1F1B reference-policy projection over the current engine.
3. Add strategy recognition and completion feedback for AFAB and 1F1B.
4. Add the building-block validator and expansion path.
5. Add virtual-stage topology and interleaved 1F1B levels.
6. Add split-gradient `W` operations and zero-bubble levels.
7. Add grouped policy levels and optional group-size metadata.
8. Add FSDP residency scoring and UI strips.
9. Write the DualPipe model decision record before implementation.
