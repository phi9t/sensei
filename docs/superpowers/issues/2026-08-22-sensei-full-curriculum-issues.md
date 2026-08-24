# Sensei Full Curriculum Issue Pack

**Status:** Draft issue pack for tracker publication

**Source docs:**

- `docs/superpowers/specs/2026-08-21-sensei-ux-and-algorithm-curriculum-spec.md`
- `docs/superpowers/specs/2026-08-21-sensei-full-curriculum-implementation-design.md`
- `docs/research/pipeline-parallelism-tutor-source-study.md`
- `docs/design-patterns/game-cockpit-layout.md`

## Publishing Note

This repository does not currently expose a remote or an agent issue-tracker
configuration. Until `docs/agents/issue-tracker.md` exists, this file is the
local source of agent-ready implementation issues. If a tracker is configured
later, publish these issues in dependency order and preserve the issue IDs below
as stable local aliases.

## Proposed Breakdown

1. **SENSEI-CURR-00: Configure Agent Issue Tracking**
   - **Blocked by:** None
   - **User stories covered:** Maintainers can hand future curriculum slices to
     fresh agents without depending on conversation history.

2. **SENSEI-CURR-01: Add Reference Policy Projection And Recognition**
   - **Blocked by:** None
   - **User stories covered:** Learners can complete AFAB or 1F1B schedules and
     get compact feedback naming the recognized strategy.

3. **SENSEI-CURR-02: Add Current-Engine Policy Comparison Feedback**
   - **Blocked by:** SENSEI-CURR-01
   - **User stories covered:** Learners can compare their completed schedule
     against a policy-relative reference without a long rules panel.

4. **SENSEI-CURR-03: Add Building-Block Validation And Expansion**
   - **Blocked by:** SENSEI-CURR-01
   - **User stories covered:** Learners can reason about a periodic trajectory,
     validate it, stamp it across microbatches, and play the expanded schedule.

5. **SENSEI-CURR-04: Add Virtual-Stage Topology**
   - **Blocked by:** SENSEI-CURR-01
   - **User stories covered:** Learners can place blocks when logical stages no
     longer map one-to-one to physical ranks.

6. **SENSEI-CURR-05: Add Interleaved 1F1B Levels**
   - **Blocked by:** SENSEI-CURR-04
   - **User stories covered:** Learners can learn virtual-stage interleaving,
     including ragged rounds, through playable levels.

7. **SENSEI-CURR-06: Add Nonuniform Duration Support**
   - **Blocked by:** SENSEI-CURR-04
   - **User stories covered:** Learners can see that schedule quality depends
     on operation cost and critical tails, not just operation count.

8. **SENSEI-CURR-07: Add Split-Backward W Operations**
   - **Blocked by:** SENSEI-CURR-06
   - **User stories covered:** Learners can place `F`, `B`, and `W` blocks and
     see activation release move from unsplit backward to weight-gradient work.

9. **SENSEI-CURR-08: Add Zero-Bubble Curriculum**
   - **Blocked by:** SENSEI-CURR-07
   - **User stories covered:** Learners can use split backward work to fill
     bubbles and compare zero-bubble variants with transparent metrics.

10. **SENSEI-CURR-09: Add Grouped And BF-PP Curriculum**
    - **Blocked by:** SENSEI-CURR-01
    - **User stories covered:** Learners can schedule group-major microbatch
      blocks and compare grouped ordering against 1F1B without FSDP claims.

11. **SENSEI-CURR-10: Add FSDP Residency Curriculum**
    - **Blocked by:** SENSEI-CURR-09
    - **User stories covered:** Learners can trade weight residency, activation
      memory, and all-gather count in playable grouped schedules.

12. **SENSEI-CURR-11: Write DualPipe Model Record**
    - **Blocked by:** SENSEI-CURR-04
    - **User stories covered:** Maintainers can approve the bidirectional
      operation identity, dependency, and resource model before code depends on
      it.

13. **SENSEI-CURR-12: Add DualPipe Playable Levels**
    - **Blocked by:** SENSEI-CURR-11
    - **User stories covered:** Learners can schedule bidirectional pipeline
      work and compare it against a one-direction baseline.

## SENSEI-CURR-00: Configure Agent Issue Tracking

## What to build

Configure the repository's agent workflow documents so `/to-issues`,
`/implement`, `/triage`, and `/code-review` know where issues live, which labels
mean agent-ready work, and where domain context should be read from.

## Acceptance criteria

- [ ] The repo has `docs/agents/issue-tracker.md`,
      `docs/agents/triage-labels.md`, and `docs/agents/domain.md`.
- [ ] The selected issue tracker is explicit: GitHub, GitLab, local markdown, or
      another named workflow.
- [ ] The five triage roles are mapped to concrete labels or local equivalents:
      `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, and
      `wontfix`.
- [ ] The domain-doc layout points agents to the root `CONTEXT.md` and any ADR
      directory that exists or is created.
- [ ] An `AGENTS.md` or existing agent-instruction file contains an Agent
      skills section linking to the three docs.

## Blocked by

None - can start immediately.

## SENSEI-CURR-01: Add Reference Policy Projection And Recognition

## What to build

Add engine-backed reference policies for the current unsplit `F/B` model and
use them to recognize completed schedules as GPipe AFAB, 1F1B, or unmatched. A
policy is a deterministic heuristic over the legal ready set, not a claim of
global optimality.

## Acceptance criteria

- [ ] A pure engine module can project complete legal action logs for AFAB and
      1F1B on current-engine level configs.
- [ ] Projection returns structured failure or deadlock information instead of
      looping or throwing for ordinary invalid policy states.
- [ ] Recognition compares per-rank operation order and reports a policy name,
      plus whether timing exactly matches the projected reference.
- [ ] Existing coaching automation remains behaviorally unchanged unless it is
      deliberately routed through the new policy API with equivalent tests.
- [ ] Completion feedback can name the recognized strategy in the existing
      feedback/status surface without adding a long visible rules panel.
- [ ] Tests cover AFAB projection, 1F1B projection, unmatched schedules, exact
      versus order-only matches, and clean-room original fixtures.
- [ ] `npm run verify` passes.

## Blocked by

None - can start immediately.

## SENSEI-CURR-02: Add Current-Engine Policy Comparison Feedback

## What to build

Show a compact, policy-relative comparison after completion for current-engine
levels. The comparison should explain the learner's schedule against the
recognized or configured reference policy using the existing cockpit surfaces.

## Acceptance criteria

- [ ] Completed current-engine attempts can display recognized policy,
      reference makespan, peak activation memory, and deltas from the current
      attempt.
- [ ] The comparison is clearly policy-relative and never labels the reference
      as globally optimal.
- [ ] The score rail remains scoreboard-first, with detailed comparison behind a
      disclosure or similarly compact affordance.
- [ ] The feedback line can name the recognized strategy and one concise reason
      for a missed mastery condition.
- [ ] Accessibility tests verify the comparison is reachable by keyboard and
      does not rely on color alone.
- [ ] Responsive tests preserve the board as the dominant lower workspace.
- [ ] `npm run verify` passes.

## Blocked by

- SENSEI-CURR-01

## SENSEI-CURR-03: Add Building-Block Validation And Expansion

## What to build

Add a building-block plan representation that lets a learner describe one
microbatch trajectory, validate its periodic residues and memory implications,
then expand it into a replayable action log for a playable level.

## Acceptance criteria

- [ ] A `BuildingBlockPlan` representation captures period and per-operation
      offsets without replacing the canonical action log used by replay,
      persistence, undo, and share links.
- [ ] Validation returns structured violations for unknown operations, duplicate
      residues on a rank, unsatisfied dependencies, and predicted memory cap
      failures.
- [ ] A valid plan can expand into ordinary actions that replay to a complete
      schedule.
- [ ] At least one playable level teaches stamping a trajectory across
      microbatches.
- [ ] The UI introduces only level-local pattern validation affordances and keeps
      block placement as the primary interaction.
- [ ] Tests cover valid expansion, invalid tiling, memory prediction before
      expansion, persistence of the expanded action log, and responsive layout.
- [ ] `npm run verify` passes.

## Blocked by

- SENSEI-CURR-01

## SENSEI-CURR-04: Add Virtual-Stage Topology

## What to build

Separate logical stage identity from physical rank ownership so levels can have
more logical stages than ranks. Preserve all one-to-one behavior for existing
levels while adding wrap and V-shaped placement options.

## Acceptance criteria

- [ ] Level configuration can express one-to-one, wrap, and V-shaped topology,
      including multiple logical stages owned by one physical rank.
- [ ] Existing one-to-one levels replay, score, persist, and render unchanged.
- [ ] Operation derivation and dependency checks use logical stage identity,
      while placement legality uses physical rank ownership.
- [ ] Compact operation labels remain readable in `F0:S4:B2` style, with owner
      rank shown separately by lane.
- [ ] Ready queue grouping and schedule board rendering remain usable when one
      rank owns multiple stage identities.
- [ ] At least one playable level forces the learner to reason about virtual
      stage ownership.
- [ ] Tests cover wrap mapping, V-shaped mapping, dependency correctness,
      fixture replay, persistence versioning, and no-overflow responsive behavior.
- [ ] `npm run verify` passes.

## Blocked by

- SENSEI-CURR-01

## SENSEI-CURR-05: Add Interleaved 1F1B Levels

## What to build

Use virtual-stage topology to add interleaved 1F1B curriculum levels, including
a clean introductory level and a ragged-round level where the reference policy
is useful but not necessarily optimal.

## Acceptance criteria

- [ ] Interleaved 1F1B reference projection works over virtual-stage topology.
- [ ] Recognition can distinguish ordinary 1F1B from interleaved 1F1B by
      per-rank operation order.
- [ ] The level catalog includes at least `Virtual Stages`, `Interleaved 1F1B`,
      and `Ragged Rounds` or equivalent original names.
- [ ] The ragged level copy and feedback distinguish policy par from global
      optimality.
- [ ] Fixtures are original and include mastered plus legal-but-not-mastered
      paths where meaningful.
- [ ] The ready queue and board remain compact and readable on a 13-inch laptop
      viewport.
- [ ] `npm run verify` passes.

## Blocked by

- SENSEI-CURR-04

## SENSEI-CURR-06: Add Nonuniform Duration Support

## What to build

Relax the V1 fixed-duration restriction only as far as needed to teach
nonuniform operation cost. Add a playable level where a schedule that looks
balanced by operation count still loses to a critical-tail-aware schedule.

## Acceptance criteria

- [ ] Level configuration can represent duration variants needed by this
      curriculum slice while keeping existing levels at `F=1`, `B=2`.
- [ ] Validation rejects malformed duration models with explicit errors.
- [ ] Operation width, inspector text, score details, and accessibility labels
      reflect duration differences.
- [ ] A playable `Heavy Backward Tail` or equivalent original level demonstrates
      the concept with mastered and legal-but-not-mastered fixtures.
- [ ] Scoring remains transparent: makespan, bubble, memory, and intentional
      idle are still visible without a hidden aggregate.
- [ ] Persistence and URL decoding reject or quarantine incompatible historical
      attempts when a level's duration semantics change.
- [ ] `npm run verify` passes.

## Blocked by

- SENSEI-CURR-04

## SENSEI-CURR-07: Add Split-Backward W Operations

## What to build

Extend the operation model with `W` weight-gradient operations for split
backward levels. In split-gradient levels, `B` represents input-gradient work
and activation release happens at `W`.

## Acceptance criteria

- [ ] `OperationKind`, operation derivation, dependency rules, replay, scoring,
      persistence codec, fixtures, and accessible labels support `W` where enabled.
- [ ] Existing unsplit levels continue to use only `F/B` and preserve their
      current behavior.
- [ ] Split levels render ready queue stacks for `FWD`, `BWD`, and `WGT`, with
      a level-aware notation key `(F/B/W, stage_id, micro_batch_id)`.
- [ ] Activation memory release is tested on `W`, not `B`, for split-gradient
      levels.
- [ ] At least one playable split-backward level can be completed and mastered.
- [ ] URL and local persistence remain versioned and recoverable for both
      unsplit and split attempts.
- [ ] `npm run verify` passes.

## Blocked by

- SENSEI-CURR-06

## SENSEI-CURR-08: Add Zero-Bubble Curriculum

## What to build

Add zero-bubble levels over the split-gradient model. These levels should teach
how `W` work can fill bubbles, and should score internal bubble separately from
naive total bubble where that distinction matters.

## Acceptance criteria

- [ ] Scoring can compute and display internal bubble for levels that enable the
      metric.
- [ ] Reference policies for ZB-H1, ZB-H2, and one deeper zero-bubble variant
      can project legal complete schedules or return structured failures.
- [ ] Recognition can name matched zero-bubble variants by per-rank operation
      order.
- [ ] The score rail adds internal-bubble detail only for levels that use it.
- [ ] The level catalog includes original playable zero-bubble levels with
      mastered and legal-but-not-mastered fixtures.
- [ ] The UI keeps `F`, `B`, and `W` visually distinct without relying on color
      alone.
- [ ] `npm run verify` passes.

## Blocked by

- SENSEI-CURR-07

## SENSEI-CURR-09: Add Grouped And BF-PP Curriculum

## What to build

Add group metadata and group-major policy projection so learners can schedule
microbatches in groups and compare grouped order against 1F1B on schedule shape,
memory, and bubble. Do not claim FSDP communication effects in this issue.

## Acceptance criteria

- [ ] Level configuration can express group size and group labels without
      changing operation identity.
- [ ] Group-major reference policy orders by group, pass, and stage over the
      current legal ready set.
- [ ] Recognition can report a grouped schedule and distinguish it from 1F1B
      where their per-rank orders differ.
- [ ] Group boundaries are visible in the ready queue or schedule board with a
      compact marker.
- [ ] At least one playable grouped level compares memory and bubble against a
      1F1B baseline.
- [ ] UI copy avoids FSDP residency or all-gather claims until residency exists.
- [ ] `npm run verify` passes.

## Blocked by

- SENSEI-CURR-01

## SENSEI-CURR-10: Add FSDP Residency Curriculum

## What to build

Add a weight-residency resource model, all-gather counting, and
residency-aware memory admission. Use it to teach why grouped schedules can
trade memory pressure against gather count.

## Acceptance criteria

- [ ] The engine tracks activation memory separately from resident weight units.
- [ ] A move can gather, reuse, evict, or block on residency-aware memory
      admission with structured reasons.
- [ ] Score includes `allGatherCount` only for levels that enable residency, and
      the attempt-ranking tuple is extended or versioned intentionally.
- [ ] The score rail adds a `Gathers` card only for residency levels.
- [ ] Memory strips can show activation and weight residency without making the
      board visually busy.
- [ ] Levels demonstrate gather reuse, too-wide group failure, and regather
      storms with original fixtures.
- [ ] Persistence compatibility tests cover any action, score, or tuple shape
      changes.
- [ ] `npm run verify` passes.

## Blocked by

- SENSEI-CURR-09

## SENSEI-CURR-11: Write DualPipe Model Record

## What to build

Write and approve a model record for DualPipe before implementation. The record
must decide how bidirectional operation identity, dependency direction, paired
work, and rank resource conflicts are represented.

## Execution note

Completed by `docs/superpowers/specs/2026-08-23-sensei-dualpipe-model-record.md`.

## Acceptance criteria

- [x] The model record explicitly decides whether direction belongs in
      operation IDs, operation fields, or level-local metadata.
- [x] The record states that microbatch IDs must not be overloaded to encode
      direction.
- [x] The record chooses whether paired work is true concurrent occupancy or a
      visual macro over serial operations.
- [x] Dependency rules for both directions are written as executable invariants
      before UI work begins.
- [x] Persistence and URL-versioning implications are called out.
- [x] The record includes clean-room provenance and avoids copying upstream code,
      prose, fixtures, or diagrams.

## Blocked by

- SENSEI-CURR-04

## SENSEI-CURR-12: Add DualPipe Playable Levels

## What to build

Implement playable DualPipe levels from the approved model record so learners
can schedule opposite-direction work and reason about balance and resource
conflict against a one-direction baseline.

## Execution note

Completed with `Two Directions`, `DualPipe Balance`, and `DualPipe Conflict`.
The implementation keeps learner actions as ordinary `Action[]` placements with
direction-bearing DualPipe operation IDs, while visible block codes remain in
`F0:S0:B1` form.

## Acceptance criteria

- [x] Operation derivation supports the approved bidirectional model.
- [x] Dependency checks cover both increasing-stage and decreasing-stage flows.
- [x] Rank resource conflicts are represented and tested for paired or
      concurrent work.
- [x] The board can show bidirectional flow without overloading the compact
      `F0:S0:B1` operation code.
- [x] The curriculum includes at least `Two Directions`, `DualPipe Balance`, and
      `DualPipe Conflict` or equivalent original names.
- [x] Completion feedback compares against a one-direction baseline and names
      the recognized DualPipe strategy when applicable.
- [x] Persistence, accessibility, responsive layout, and clean-room tests are
      updated for the new operation model.
- [x] `npm run verify` passes.

## Blocked by

- SENSEI-CURR-11
