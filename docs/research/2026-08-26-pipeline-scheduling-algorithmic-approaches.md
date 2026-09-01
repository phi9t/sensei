# Unified DP Design For Pipeline Schedule Construction

## Goal

Sensei should not grow separate scheduling systems for fixed-order evaluation,
counter DP, bitmask DP, repeated building blocks, and offline optimization.
Those algorithms are different state-space encodings for the same core problem:
build a legal pipeline schedule while preserving enough frontier information to
compare makespan, memory, gather cost, idle, and action count.

The merged design is:

```text
one Pareto search kernel
multiple schedule-space adapters
one ranking/dominance contract
one replay-backed validation path
one offline optimizer boundary for cases that stop being DP-shaped
```

The algorithms should be selected by level structure, not by caller preference.
Simple structured levels get compact DP state. General tiny levels get the
placed-set exact oracle. Repeated schedule families get template/profile search.
Hard interval-resource cases are exported for offline CP-SAT or MILP rather
than solved inside the browser game.

## Problem Statement

Pipeline-parallel schedule construction is a precedence-constrained resource
scheduling problem with inventory-like memory constraints.

Given:

- operations `F`, `B`, and optionally `W` for every logical stage,
  microbatch, and direction;
- dependency edges such as `F(s-1,m) -> F(s,m)`,
  `B(s+1,m) -> B(s,m)`, and `B(s,m) -> W(s,m)`;
- rank ownership for each logical stage;
- operation durations;
- rank capacity and optional bidirectional shared capacity;
- activation memory acquisition/release rules;
- optional residency or communication state;
- an objective such as makespan, peak activation memory, bubble, all-gather
  count, or a lexicographic/Pareto combination.

Find:

- one start time for every operation;
- an order of operations on every constrained rank/resource;
- memory and residency trajectories that never exceed caps.

This general form contains job-shop and resource-constrained project scheduling
as special cases, so a globally optimal solver will not scale in full generality.
The useful question is therefore not "which one DP should we use?" It is:
which state encoding is lossless for this level, and when do the remaining
choices require a general optimizer?

## Unification Thesis

There are three increasingly general representations:

1. **Fixed order:** each rank's operation order is already known.
2. **Bounded frontier:** only a small prefix/progress vector is unknown.
3. **General scheduling:** rank orders, resource conflicts, memory/residency,
   and topology choices are all decision variables.

The first two admit competitive-programming-style dynamic programming. The third
usually needs branch-and-bound, CP-SAT, MILP, or structured heuristic search.

The merge point is a common Pareto search kernel:

```ts
interface ScheduleSearchSpace<State, StateKey, Transition> {
  initial(): State;
  key(state: State): StateKey;
  isComplete(state: State): boolean;
  transitions(state: State): readonly Transition[];
  apply(state: State, transition: Transition): State;
  label(state: State): DominanceLabel;
  lowerBound?(state: State): Partial<AttemptRankingTuple>;
  schedule(state: State): SynthesisSchedule;
}
```

The kernel owns:

- visited-state accounting;
- Pareto labels per state key;
- dominance pruning;
- incumbent pruning from admissible lower bounds;
- complete-schedule frontier maintenance;
- deterministic tie-breaking and stats.

Each adapter owns:

- how progress is encoded;
- how legal transitions are enumerated;
- how a transition is applied;
- which restrictions make the encoding complete;
- how the resulting schedule is replay-validated.

This gives one correctness story without forcing every case into the same
state key. Counter DP is the compressed quotient of placed-set DP for prefix
pipelines. Fixed-order evaluation is the zero-choice special case. Profile and
parametric-offset search are compressed searches over repeated templates.

## Common Search Kernel

All in-process DP variants should share one frontier kernel. The kernel is not
responsible for pipeline-specific legality; it only knows how to explore a
state graph with Pareto pruning.

Inputs from an adapter:

- `initial`: the first state;
- `key(state)`: the equivalence class for dominance;
- `label(state)`: the resource frontier that future transitions can observe;
- `transitions(state)`: legal next decisions in deterministic order;
- `apply(state, transition)`: the next state;
- `isComplete(state)`: completion predicate;
- `ranking(state)`: final objective tuple;
- optional `lowerBound(state)`: admissible incumbent pruning.

Kernel behavior:

```text
frontier_by_key: Map<StateKey, ParetoSet<DominanceLabel>>
complete_frontier: ParetoSet<Schedule>

visit(state):
  if complete:
    insert schedule into complete_frontier
    update incumbent
    return

  if lower_bound loses to incumbent:
    prune
    return

  if label is dominated inside frontier_by_key[key(state)]:
    prune
    return

  remove labels dominated by this label
  for transition in transitions(state):
    visit(apply(state, transition))
```

The same kernel can run as DFS, priority search, or layered DP. DFS is simple
and matches the current exact oracle. Priority search is useful when a strong
lower bound exists. Layered DP is useful for counter states because every
transition increases progress by one operation.

Dominance is deliberately resource-centric, not action-log-centric:

```text
rank_frontiers
operation_end_times when successors can observe exact predecessor end times
current_activation_memory
peak_activation_memory
all_gather_count
optional resident-weight/cache state
```

The adapter may omit fields only when the omitted field is provably irrelevant
under that adapter's restrictions. For example, counter DP can derive concrete
predecessor end times from prefix counters plus compact per-stage end arrays,
while the generic placed-set adapter must keep `operation_end_times`.

## Adapter Spectrum

The algorithms form a spectrum of compression. Moving down the spectrum reduces
state count only by accepting stronger assumptions.

| Adapter                  | State key                  | Main win                               | Boundary                               |
| ------------------------ | -------------------------- | -------------------------------------- | -------------------------------------- |
| Fixed-order evaluator    | rank cursors               | Linear evaluation once order is fixed  | Cannot choose rank order               |
| Counter DP               | `f/b/w` prefix counts      | Replaces operation masks with counters | Requires monotone microbatch prefixes  |
| Placed-set DP            | placed operation set       | Works for arbitrary tiny DAGs          | Exponential in operation count         |
| Profile DP               | template scan/profile      | Searches repeated rectangles           | Requires bounded period/template shape |
| Parametric offset search | schedule-family parameters | Scales through strong family prior     | Best-found within family, not global   |
| CP-SAT/MILP export       | interval variables         | Handles hard resource interactions     | Offline solver boundary                |

The implementation should merge the DP algorithms at the kernel and
result-contract layer, while preserving separate adapters for the state
encodings.

## Case 1: Fixed Rank-Local Order

If every rank's operation sequence is fixed, there is no combinatorial
scheduling choice left. The schedule is the earliest feasible realization of a
disjunctive graph.

Build edges:

- dependency edges between operations;
- rank-order edges from each operation to the next operation on the same rank;
- optional resource-order edges for other fixed resources.

Then compute longest paths:

```text
start(op) = max_{pred in predecessors(op)} end(pred)
end(op) = start(op) + duration(op)
```

This is not really DP over choices; it is DAG evaluation. It is the right model
for:

- GPipe AFAB once the per-rank sequence is chosen;
- a projected reference policy whose operation order is fixed;
- a building block after expansion when its per-rank order is fixed;
- recognition candidates where we compare a learner schedule to a known rank
  order.

Complexity:

```text
O(|operations| + |edges|)
```

Use this whenever the schedule family has already selected the rank-local
orders. Do not pay for a solver when the remaining problem is just earliest
start propagation.

### Adapter Contract

State:

```text
cursors[r] = next operation index to emit on rank r
rank_frontiers[r]
operation_end[op]
memory state
```

Key:

```text
cursors
```

Transition:

```text
choose one rank r whose head operation is legal
place that head operation at its earliest feasible start
advance cursors[r]
```

This is what `squeezeActionsByRankOrder` does after extracting rank-local
orders from a replayed action log. It is a DP over cursor vectors, but with a
single greedy earliest-start realization once the order is fixed. If no head
operation is legal, the rank-order constraints contradict the dependency graph
or memory caps.

Use this adapter for:

- squeezing generated building-block schedules;
- normalizing authored policies before scoring;
- comparing learner schedules after the learner has fixed an order.

## Case 2: Counter DP For One-To-One Pipelines

For a one-direction, one-stage-per-rank pipeline with identical microbatch order,
we can avoid a bitmask over all operations. The state is a vector of completed
prefix counts.

For fused backward:

```text
state = (
  f[0..P-1],   // completed forwards per stage
  b[0..P-1],   // completed backwards per stage
  frontier[0..P-1],
  current_memory[0..P-1],
  peak_memory[0..P-1]
)
```

Legal transitions:

```text
place F(s):
  f[s] < M
  s == 0 or f[s-1] > f[s]
  memory[s] + 1 <= cap[s] if capped

place B(s):
  b[s] < f[s]
  s == P-1 or b[s+1] > b[s]
```

For split backward, add:

```text
bb[0..P-1]  // completed activation-gradient B
w[0..P-1]   // completed W

place B(s):
  bb[s] < f[s]
  s == P-1 or bb[s+1] > bb[s]

place W(s):
  w[s] < bb[s]
```

Activation memory is:

```text
f[s] - b[s]      // fused backward
f[s] - w[s]      // split backward
```

The DP stores a Pareto frontier per prefix-count state because two ways to reach
the same `(f,b,w)` counts can have incomparable rank frontier vectors or peak
memory. A label dominates another if it is no worse in every relevant resource:

```text
frontier_a[r] <= frontier_b[r] for all r
current_memory_a[r] <= current_memory_b[r] for all r
peak_memory_a[r] <= peak_memory_b[r] for all r
gathers_a <= gathers_b
```

This is a pure DP/shortest-path problem over a finite lattice of monotone
counter states.

Good for:

- small exact oracle levels;
- proving whether a handcrafted schedule is optimal for small `P,M`;
- generating fixtures for Sensei;
- comparing `F/B/W` policies under simple memory caps.

Limits:

- state count is roughly `O(M^(2P))` for fused and `O(M^(3P))` for split before
  pruning;
- Pareto labels can grow when objectives conflict;
- virtual stages and resource sharing enlarge the counter vector.

This is still viable for competitive-programming-sized inputs, such as
`P <= 4`, `M <= 8`, and small integer durations/caps.

### Why Counter DP Exists

Counter DP is not a separate theory from placed-set DP. It is a quotient of the
generic placed-set state space.

In the restricted one-to-one setting, every stage processes microbatches in
prefix order. If stage `s` has completed three forwards, the completed forwards
must be microbatches `0`, `1`, and `2`. There is no need to store an arbitrary
set:

```text
{F0:S0:B0, F0:S0:B1, F0:S0:B2}
```

The count is enough:

```text
f[s] = 3
```

The same applies to `b[s]` and, for split backward, `w[s]`. The counter state
therefore represents many bits of the placed-set mask with one integer.

### Adapter Contract

State:

```text
f[s]      completed forwards for stage s
b[s]      completed activation-gradient backwards for stage s
w[s]      completed weight-gradient ops for stage s, only in split mode
rank_frontiers[r]
current_memory[r]
peak_memory[r]
all_gather_count
backpointer/action_log
```

Key:

```text
f | b | w
```

Label:

```text
rank_frontiers
current_memory
peak_memory
all_gather_count
```

Transition generation:

```text
candidate F(s) has microbatch f[s]
candidate B(s) has microbatch b[s]
candidate W(s) has microbatch w[s]
```

Each candidate is legal only when the prefix dependency rules hold. The adapter
then computes earliest start from rank frontier plus dependency end times,
updates memory, and records a backpointer. For implementation discipline, the
counter adapter should still validate emitted actions through `replay` in tests
and debug builds.

Use this adapter when all of these are true:

- one-direction pipeline semantics;
- microbatch order is monotone per operation kind;
- stage-to-rank topology is fixed and simple enough to map counts to concrete
  operation IDs;
- no DualPipe shared-capacity overlap;
- no residency or cache eviction decision;
- activation memory is the normal `F` acquire and fused `B` or split `W`
  release.

## Case 3: Bitmask DP Over Ideals

For arbitrary small DAGs, use bitmask DP over down-closed placed sets:

```text
dp[mask] = Pareto set of labels after placing exactly mask
```

A transition adds any operation whose predecessors are already in `mask`.

Label fields:

```text
rank_frontiers
current_activation_memory
peak_activation_memory
resident_weights, if modeled
all_gather_count
action_log or backpointer
```

This is simple and exact, but exponential:

```text
O(2^N * N * pareto_width)
```

Use it for:

- debugging new dependency models;
- tiny DualPipe examples;
- validating a CP-SAT result;
- finding counterexamples to greedy policies.

Do not use it for real curriculum generation beyond small levels.

### Adapter Contract

State:

```text
ScheduleState from replay
```

Key:

```text
sorted placed operation IDs
```

Label:

```text
rank_frontiers
operation_end[op]
current_memory
peak_memory
all_gather_count
```

Transition:

```text
classifyMoves(state)
  -> keep legal placement moves
  -> applyAction(state, place(operationId))
```

This is the current exact oracle. It is the most trustworthy adapter because it
does not duplicate legality logic. It asks the replay engine which operations
are legal and lets `applyAction` compute timing, memory, gaps, and action logs.

Use this adapter for:

- proving small curriculum claims;
- generating exact fixtures;
- regression tests for new engine semantics;
- any small case where counter-prefix assumptions might be wrong.

## Case 4: Profile DP For Repeated Building Blocks

The paper's building-block view gives a different DP: instead of scheduling all
microbatches, search a small repeated rectangle.

Fix:

```text
d = rank count
T = repeat period
template cells = d x T
```

Fill each rank/time residue with at most one representative operation. The state
can scan cells in time order and track:

- which representative operations have been placed;
- partial dependency satisfaction inside the template;
- residue occupancy;
- per-stage forward offset;
- per-stage release offset;
- current/predicted lifespan bounds.

For a constant `T` and structured topology, the profile state can be small. This
is the competitive-programming analogue of tiling DP.

Validation after construction:

```text
complete template?
dependencies satisfied under stamping?
no duplicate rank residues?
peak memory <= cap using ceil(lifespan / T)?
rank work <= T?
```

This is the right shape for:

- V-shape schedule families;
- offset-family search;
- small period block synthesis;
- teaching why `T` controls collision and stable bubbles.

### Adapter Contract

State:

```text
scan position in the d x T template
placed representative operations
rank/residue occupancy
partial dependency state
forward offsets
release offsets
lifespan bounds
```

Key:

```text
scan position | placed representatives | compact dependency profile | occupancy profile
```

Transition:

```text
leave a cell empty
or place one representative operation in the current rank/residue cell
```

The profile adapter is useful when the template itself is the object of search.
It should produce a `BuildingBlockPlan`, then run the standard validation path:

```text
analyzeBuildingBlockPlan
expandBuildingBlockPlan
squeezeActionsByRankOrder
replay
score
```

This keeps template search separate from full schedule proof. The profile DP
proves optimality only within the chosen template shape and period bounds.

Important limitation: official interleaved 1F1B may use a non-uniform repeat
interval, so a single-period profile DP either needs a normalized equivalent or
a multi-period state.

## Case 5: Parametric Offset DP

The controllable-memory paper narrows search further. It does not enumerate
every cell in every rank. It constrains offsets by a small parameter family:

```text
delta0, delta1, optional split point K, local first-device permutation
```

Then for each candidate:

```text
construct block
validate collision
estimate peak memory from lifespan / period
expand/repeat
squeeze
reorder warm-up/cool-down
score bubble
```

If `T` is treated as constant and the offset family is structured, this becomes
near-linear in pipeline depth for each parameter choice. It is not a global
optimizer; it is a structured generator with a strong inductive bias.

Use this for:

- scalable schedule discovery;
- V-Min/V-Half/V-ZB style families;
- memory-targeted schedule search;
- producing a Pareto frontier for learners.

This is the most promising Sensei path after the exact oracle exists.

### Adapter Contract

State:

```text
parameter cursor
chosen offsets/shape parameters
derived partial template
bounded candidate list
```

Key:

```text
parameter assignment prefix
```

Transition:

```text
choose the next parameter value
derive candidate offsets
reject impossible residue/dependency patterns early
```

This is not global DP over all schedules. It is structured search over a family
that encodes a useful scheduling prior. The output must therefore be labeled as
best within the searched family and bounds, then validated by the same
building-block pipeline as profile DP.

## When DP Stops Being The Right Tool

Use a general optimizer when any of the following become first-class decisions.

### Arbitrary Rank Order

If the rank-local order itself is unconstrained, the solver must choose an order
among many operations sharing a resource. This is job-shop scheduling territory.
DP can still solve tiny instances, but the compact prefix counter structure is
gone unless you impose an order family.

### Heterogeneous Durations And Memory

If every stage/microbatch has different duration and activation size, simple
lifespan formulas still help as bounds, but DP labels multiply quickly. General
CP scheduling constraints are cleaner.

### Communication Resources

If `F(s,m) -> F(s+1,m)` creates an explicit send/recv with bandwidth capacity,
then computation and communication resources interact. You now schedule
operations on multiple resource pools with possible overlap. CP-SAT cumulative
or no-overlap constraints fit this better than hand-written DP.

### FSDP Residency And Cache Eviction

Residency introduces a cache policy:

```text
which stage weights stay resident?
which weights get evicted?
when do all-gathers happen?
```

If eviction is deterministic, it can be folded into DP state. If eviction is a
decision variable, the state includes subsets of resident weights and quickly
becomes combinatorial. Use branch-and-bound or CP-SAT for exact small cases.

### DualPipe And Shared Capacity

DualPipe adds direction-bearing operations and shared rank capacity. If capacity
is greater than one, rank occupancy is no longer a single linear sequence. The
state is a multi-resource interval schedule. DP is possible only for tiny bounded
profiles; CP-SAT is the natural exact model.

### Topology Search

If the algorithm can choose stage-to-rank placement, virtual-stage count, or
direction placement, it is solving partitioning plus scheduling. That should be
handled as an outer search or MILP/CP model, not folded into a simple schedule
DP.

### Mixed Objectives

Makespan, peak memory, all-gather count, communication volume, and bubble are
not the same objective. Exact DP must carry Pareto sets, which can grow large.
For serious multi-objective search, return a Pareto frontier and use optimizer
support for lexicographic or weighted objectives.

## General Optimization Boundary

The unified DP kernel should cover fixed-order, counter, placed-set, profile,
and bounded parametric search. It should stop at a data-export boundary when the
problem requires arbitrary interval-resource reasoning.

### Branch-And-Bound / A*

Branch-and-bound is a traversal strategy for the same kernel, not a separate
solver family. It is best when the state adapter is exact but large enough that
incumbent bounds matter.

State:

```text
placed set or prefix counters
rank frontiers
current memory
peak memory
resident weights
```

Transition:

```text
place one ready operation at its earliest legal start
```

Bounds:

```text
makespan >= max(rank_frontiers)
makespan >= remaining_work / total_capacity
makespan >= longest remaining dependency path
peak_memory >= current_memory
```

Dominance:

```text
same placed set
no-worse rank frontiers
no-worse current memory
no-worse peak memory
no-worse gathers
```

This is already how the placed-set exact oracle is shaped. The future merge is
to move this traversal and dominance maintenance into the common kernel so the
counter and profile adapters can reuse it.

### CP-SAT

Best exact formulation for interval scheduling.

Variables:

```text
start_i
end_i = start_i + duration_i
interval_i
```

Constraints:

```text
end_i <= start_j                  for dependency i -> j
NoOverlap(intervals_on_rank_r)    for capacity 1 ranks
Cumulative(intervals, demand, cap) for shared capacity
Reservoir or time-indexed memory  for activation/weight memory
```

Objective:

```text
minimize makespan
then minimize peak memory
then minimize gathers / idle
```

CP-SAT is the cleanest way to ask "what is optimal for this small concrete
level?" without committing to a hand-rolled search strategy.

### MILP

Useful when integrating with linear cost models or external optimization
pipelines.

Common encodings:

- pairwise order binaries for operations sharing a rank;
- time-indexed variables for small horizons;
- linearized memory occupancy;
- lexicographic objective via staged solves.

MILP is usually heavier than CP-SAT for pure interval scheduling but useful when
the surrounding system already speaks linear optimization.

The in-browser boundary remains data-only:

```text
exportOptimizerModel(config)
  -> operations
  -> dependencies
  -> resources
  -> activation-memory events
  -> objective metadata
  -> horizon bounds
```

External tools can solve the exported model, but the game runtime should not
depend on OR-Tools, MILP libraries, or solver binaries.

## Unified Sensei Architecture

Use one schedule-builder package with four layers.

### 1. Engine Semantics

The source of truth stays in the existing engine:

- `deriveOperations(config)` defines the operation inventory.
- `predecessorsOf(operationId, config)` defines dependencies.
- `classifyMoves(state)` defines legal moves.
- `applyAction(state, action)` defines timing, gaps, and memory updates.
- `replay(config, actions)` validates generated schedules.
- `score(state)` and `attemptRankingTuple(state)` define outcome metrics.

No DP adapter should silently fork these semantics. When an adapter uses a
compressed model for speed, it must replay-validate emitted actions in tests and
debug tooling.

### 2. Pareto Kernel

The shared kernel should provide:

- `findBest(searchSpace, options)`;
- `findFrontier(searchSpace, options)`;
- dominance-label insertion and pruning;
- complete-frontier insertion and equal-ranking collapse;
- state and transition counters;
- deterministic transition ordering;
- structured exhaustion results.

The current `findExactSchedule` and `findExactScheduleFrontier` are the first
implementation of this behavior. A later refactor should extract the generic
kernel without changing public oracle behavior.

### 3. Schedule-Space Adapters

Adapters choose the state representation:

- fixed-order adapter for squeezing and policy normalization;
- counter adapter for small monotone one-to-one levels;
- placed-set adapter for arbitrary tiny replay-backed DAGs;
- profile adapter for repeated `d x T` templates;
- parametric-offset adapter for V-shape and controllable-memory families.

All successful adapters return ordinary `Action[]` schedules or
`BuildingBlockPlan` values that expand into `Action[]`. This keeps learner
artifacts durable and keeps the UI centered on placing blocks.

### 4. Offline Optimizer Export

When no adapter is a faithful compact representation, export a model instead of
pretending the in-browser DP is general.

Use the exporter for:

- DualPipe shared and directional resource constraints;
- explicit communication resources;
- residency and cache-policy experiments after a stateful model exists;
- heterogeneous operation durations and memory sizes beyond small exact limits;
- topology or partition search.

## Decision Table

| Situation                              | Route                                             | Claim strength                         |
| -------------------------------------- | ------------------------------------------------- | -------------------------------------- |
| Fixed rank order                       | Fixed-order adapter                               | Exact for that order                   |
| One-to-one, small `P,M`, simple memory | Counter adapter                                   | Exact under prefix assumptions         |
| Arbitrary tiny DAG                     | Placed-set adapter                                | Exact until state cap                  |
| Small repeated period `T`              | Profile adapter                                   | Exact within template/period bounds    |
| V-shape controllable-memory family     | Parametric-offset adapter                         | Best within searched family            |
| Unconstrained rank ordering            | Placed-set if tiny, otherwise CP-SAT export       | Exact only if search completes         |
| Communication resources                | CP-SAT export                                     | Offline exact/approx depends on solver |
| FSDP eviction as a choice              | Future cache-state adapter or CP-SAT export       | Not supported by interval-only export  |
| DualPipe shared capacity               | CP-SAT export                                     | Offline interval-resource model        |
| Topology/device placement search       | Outer search plus CP/MILP export                  | Partitioning plus scheduling           |
| Multi-objective frontier               | Shared Pareto kernel or repeated optimizer solves | Frontier, not one universal best       |

## Practical Answer To "Best Schedule"

"Best" must be parameterized:

```text
best_makespan_under_memory_cap
best_peak_memory_under_makespan_cap
lexicographic(makespan, peak_memory, gathers, idle)
Pareto frontier over (makespan, peak_memory)
```

For Sensei, the best default is the Pareto frontier. A single optimal schedule
can hide the real lesson: GPipe, 1F1B, zero-bubble, V-Min, V-Half, V-ZB, FSDP
grouping, and DualPipe are different points in the same trade-off space.

## Merge Plan

1. Extract the current placed-set exact oracle traversal into a private Pareto
   kernel while preserving `findExactSchedule` and `findExactScheduleFrontier`.
2. Reimplement the current placed-set oracle as the first adapter. Its behavior
   should remain replay-backed and byte-for-byte compatible in public results
   except for harmless stats-order differences.
3. Add a fixed-order adapter or keep `squeezeActionsByRankOrder` as the initial
   fixed-order specialization. It should share ranking and schedule-freezing
   helpers with the kernel.
4. Add counter DP as an optional adapter selected only when a structural guard
   proves the level has monotone one-to-one prefix semantics.
5. Keep `findBuildingBlockCandidates` as the parametric-offset adapter for now,
   then introduce a profile adapter only when template search needs cell-level
   choices instead of offset enumeration.
6. Keep `exportOptimizerModel` as the hard-case boundary. Do not add a runtime
   solver dependency to the browser game.

## Verifier Plan

Every adapter must satisfy the same checks:

- returned `Action[]` replays through `replay(config, actions)`;
- `score(replayed.state)` matches the returned score;
- frontier results contain no dominated schedules;
- equal ranking tuples collapse to one representative unless a caller asks for
  all permutations;
- structured unsupported results are returned for model features outside the
  adapter boundary;
- bounded searches report exhaustion with partial candidates or `bestSoFar`
  when available.

Cross-adapter equivalence tests should compare:

- fixed-order squeeze against earliest-start DAG evaluation for authored
  schedules;
- counter DP against placed-set DP on small one-to-one `F/B` and `F/B/W` levels;
- profile or parametric candidates against placed-set DP when the expanded
  example is below the exact oracle operation cap;
- optimizer export dependency and resource shapes against `deriveOperations`
  and `predecessorsOf`.

Repository gates:

```bash
npm test -- src/engine/exactOracle.test.ts src/engine/scheduleSynthesis.test.ts
npm test -- src/engine/optimizerModel.test.ts src/engine/buildingBlocks.test.ts
npm run typecheck
npm run lint
npm run format:check
npm run verify
git diff --check
```

## Post-Execution Review Checklist

After implementing a new adapter or kernel extraction, review the plan itself:

- Did the adapter duplicate legality that should have stayed in replay?
- Did the state key omit a field that future transitions can observe?
- Did dominance compare every objective-relevant and future-relevant resource?
- Did a performance shortcut weaken the exactness claim?
- Are unsupported boundaries explicit and structured?
- Does the doc still state the correct claim strength for the adapter?
