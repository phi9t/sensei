# Sensei domain language

## Schedule

An assignment of operations to discrete time intervals on physical ranks. A
schedule includes deliberate and forced idle time.

## Operation

One unit of modeled work for a logical pipeline stage and microbatch. The tutor
models forward (`F`), input-gradient backward (`B`), and, where gradients are
split, weight-gradient (`W`) operations. An operation's horizontal width denotes
its modeled compute duration; operation count alone does not denote equal work.

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

## Par

The score produced by a level's configured reference policy. Par is a teaching
reference and can sometimes be beaten; it is not synonymous with optimal.

## Evidence label

A marker identifying why a statement is trustworthy: `SOURCE`, `EXECUTABLE
CONTRACT`, `INTERPRETATION`, or `SIMULATOR BOUNDARY`.
