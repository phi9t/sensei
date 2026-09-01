# Controllable-Memory Schedule Construction Spec

**Status:** Initial mechanism landed as engine analysis.

**Paper:** Penghui Qi, Xinyi Wan, Nyamdavaa Amar, Min Lin,
["Pipeline Parallelism with Controllable Memory"](https://arxiv.org/pdf/2405.15362v4),
arXiv:2405.15362v4.

**Research note:** `docs/research/2026-08-25-controllable-memory-paper-notes.md`

## Goal

Give Sensei a principled mechanism for building pipeline-parallel schedules from
repeated building blocks, rather than treating GPipe, 1F1B, zero-bubble,
interleaved schedules, and V-shape schedules as unrelated hand-coded policies.

The mechanism must support three uses:

- explain why an authored pattern is legal or illegal;
- predict activation-memory pressure from stage lifespans and repeat period;
- later synthesize candidate schedules from memory and bubble targets.

## Source-Grounded Model

The paper's schedule-construction framework has four phases:

1. **Building block:** lay out one representative microbatch trajectory.
2. **Repeating:** stamp the block at repeat interval `T` and reject collisions.
3. **Squeezing:** remove redundant idle without changing pass order.
4. **Reordering:** optionally improve warm-up/cool-down under the same peak
   memory envelope.

Sensei already had phase 1 and a first version of phase 2 through
`BuildingBlockPlan.period`, `BuildingBlockPlan.trajectory`,
`validateBuildingBlockPlan`, and `expandBuildingBlockPlan`.

This spec makes the missing analytical layer explicit.

## Engine Contract

Add a pure analyzer:

```ts
function analyzeBuildingBlockPlan(
  config: LevelConfig,
  plan: BuildingBlockPlan,
): BuildingBlockAnalysis;
```

The result contains:

- the existing structural validation result;
- whether the template is complete;
- whether it can repeat without same-rank residue collision;
- whether `period` exceeds rank-local work and therefore creates stable-phase
  bubbles;
- per-stage activation lifespans from `F` acquisition to activation release at
  fused `B` or split `W`;
- per-rank work, stable bubble, summed lifespan, and a period-derived peak
  activation bound.

The analyzer is read-only. It does not place work, mutate levels, persist state,
or alter player actions.

## Mechanism Vocabulary

- **Template:** one representative block over microbatch `0`.
- **Offset:** start time of one operation inside the template.
- **Period:** repeat interval between stamped microbatches.
- **Collision:** two repeated operations occupy the same rank/tick residue.
- **Lifespan:** `releaseEnd - forwardStart` for one logical stage.
- **Peak bound:** `ceil(lifespan / period)` per stage, summed on each rank.
- **Stable bubble:** `max(0, period - rankWork)` for a rank in the repeated
  rectangle.
- **Squeeze opportunity:** a valid repeated order with stable or edge bubbles
  that can potentially be compacted without changing operation order.

## Design Principles

- Keep `Action[]` as the durable learner artifact. Generated or analyzed
  patterns expand back into ordinary replay actions.
- Keep policy references heuristic and policy-relative. The paper's adaptive
  scheduler is constrained search, not proof of global optimality.
- Separate legality from compactness. Collision-free repetition is necessary;
  squeezing and warm-up/cool-down reordering are optimization phases.
- Make memory explainable before making it automatic. Learners should first see
  how lifespans create activation pressure, then later tune offsets.
- Treat empirical MFU claims as paper evidence only. Sensei's deterministic
  engine can teach bubbles, memory, and placement causality, but not hardware
  throughput unless a measured runtime model is added.

## Future Work

1. **Expose analysis in the UI:** add compact pattern details to
   `PatternCheck`, such as peak bound, stable bubble, and longest-lifespan rank.
2. **Add V-shape authored levels:** introduce `V-Min`, `V-Half`, and `V-ZB`
   as split-backward building-block levels that use existing `v-shape` topology.
3. **Add squeeze analysis:** compute the earliest legal schedule preserving
   per-rank operation order and report removable idle.
4. **Add offset-family generation:** synthesize candidate V-shape blocks from
   `delta0`, `delta1`, and topology, then validate through the same analyzer.
5. **Add adaptive search:** search a constrained offset family under a memory
   target, label results as best-found within that family, and compare against
   existing references.
6. **Handle non-uniform repeat:** represent official interleaved 1F1B either as
   a multi-period plan or as a documented uniform-period equivalent.

## Acceptance

- `analyzeBuildingBlockPlan` is pure and tested.
- Existing `validateBuildingBlockPlan` and `expandBuildingBlockPlan` behavior
  remains unchanged.
- Split-backward lifespan analysis releases activations at `W`, not `B`.
- Stable-phase bubble detection distinguishes a period/work mismatch from
  collision validity.
- Paper claims are kept in a cited research note, not embedded as unsupported
  UI copy.
