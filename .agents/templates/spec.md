# Spec

## Status

Draft | Reviewed | Approved | Implemented

## Goal

<!-- User-visible or developer-visible outcome. -->

## Problem

<!-- Current behavior, missing capability, or failure mode. -->

## Non-Goals

-

## Behavioral Contract

<!-- Exact behavior the implementation must provide. Prefer examples. -->

## Engine / UI Boundary

<!-- State which layer owns truth. For scheduling behavior, replay/score own truth. -->

## Data And Types

<!-- New or changed types, shape examples, persistence fields, or API contracts. -->

## Failure Modes

<!-- Structured failures, unsupported cases, validation errors, and recovery behavior. -->

## Claim Strength

Mark major claims as one of:

- `SOURCE`: grounded in a cited external or repo source.
- `EXECUTABLE CONTRACT`: covered by tests or replay/build output.
- `INTERPRETATION`: reasoned from evidence but not executable.
- `SIMULATOR BOUNDARY`: true only inside Sensei's model.
- `MISSING`: known gap or unverified assumption.

## Acceptance

-

## Review Questions

- What would make this spec ambiguous to an implementation agent?
- What state, user work, or clean-room boundary could this accidentally damage?
- What test would fail if the implementation is wrong?
