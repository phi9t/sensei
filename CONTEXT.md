# Sensei domain language

## Schedule

An assignment of operations to discrete time intervals on physical ranks. A
schedule includes deliberate and forced idle time.

## Operation

One unit of modeled work for a logical pipeline stage and microbatch. V1 models
forward (`F`) and unsplit backward (`B`) operations. Split weight-gradient (`W`)
operations are future vocabulary, not part of the current executable model. An
operation's horizontal width denotes its modeled compute duration; operation
count alone does not denote equal work.

## Move

A learner action that appends an operation or idle interval to one rank's
timeline.

## Legal move

A move that preserves all current simulator invariants: the operation belongs
to the chosen rank, its dependencies have completed, the rank is available,
and the memory constraint permits it. Legal means valid under the modeled
computation rules, not legally permitted in the licensing sense.

## Ready set

The operations that are legal candidates at the current frontier of a rank. A
scheduling policy orders this set; it does not choose from impossible work.

## Strategy

An ordering policy for choosing among legal moves. A strategy may be valid but
inefficient. Named strategies in the tutor are policy-generated references, not
proofs of global optimality.

## Bubble

Idle rank capacity within a schedule. A forced bubble follows from unavailable
legal work; a voluntary bubble results from choosing to wait despite available
work. Bubble and internal bubble use different accounting boundaries.

## Dependency-forced gap

An idle interval derived when a placed operation cannot start at its rank
frontier because a predecessor finishes later. It is not a learner action and
does not count as intentional idle.

## Intentional idle

One discrete tick appended by a learner wait action at a rank frontier. It is
replayable, undoable, and counted by the intentional-idle metric.

## Memory-blocked move

A dependency-ready forward operation whose completion would make its owning
rank exceed the activation-memory cap. It is a blocked operation state, not an
elapsed idle interval. An incomplete attempt with no legal operation is in
deadlock; the deadlock is memory-caused when at least one dependency-ready move
is memory-blocked.

## Par

The score produced by a level's configured reference policy. Par is a teaching
reference and can sometimes be beaten; it is not synonymous with optimal.

## Evidence label

A marker identifying why a statement is trustworthy: `SOURCE`, `EXECUTABLE
CONTRACT`, `INTERPRETATION`, or `SIMULATOR BOUNDARY`.

## Level

A configured scheduling problem with a topology, operation durations,
microbatches, optional memory cap, coaching capabilities, and transparent
mastery targets.

## Legal completion

A completed level in which every required operation appears exactly once and no
schedule invariant is violated. Legal completion unlocks progression.

## Mastery

A legal completion that also meets the level's explicit optimization targets.
Mastery records deeper achievement but never blocks access to the next level.

## Interesting boundary

A point at which automation should return control to the learner: more than one
operation is legal at the minimum earliest-start time, the next unique operation
would introduce a dependency-forced gap, a dependency-ready operation is
memory-blocked, the schedule completes, or the attempt deadlocks.

## Clean-room implementation

An original implementation informed by observed behavior and general ideas but
containing no copied upstream code, text, styling, level definitions, fixtures,
screenshots, or assets.
