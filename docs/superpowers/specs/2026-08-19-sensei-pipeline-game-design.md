# Sensei Pipeline Scheduling Game — Design

**Status:** Approved design

**Date:** 2026-08-19

**Supersedes:** `2026-08-19-pipeline-parallelism-tutor-deep-dive-design.md`

## 1. Outcome

Build the first playable Sensei game: an original, browser-based pipeline
scheduling tutor that teaches correctness before optimization. Learners place
forward and backward operations onto rank timelines, inspect why moves are legal
or blocked, and improve completed schedules against transparent performance and
memory targets.

The first release is a four-level vertical slice. It proves the complete
learning loop—rules, scheduling, feedback, progression, coaching, persistence,
and mastery—without prematurely generalizing Sensei into a framework for other
parallelism dimensions or codebases.

## 2. Product posture

### 2.1 Audience

The canonical reader-player is an MTS persona: a CS PhD in ML, mathematics or
CS undergraduate training, and more than ten years across applied ML and
distributed systems.

The game nevertheless begins with an **ELI-intern on-ramp**. It starts with
concrete spatial causality and smoothly raises the ceiling to dependency DAGs,
schedule geometry, cost accounting, memory pressure, and policy trade-offs. It
does not equate accessible presentation with reduced technical rigor.

### 2.2 Learning contract

Every level separates two achievements:

1. **Legal completion:** finish all required operations without violating an
   invariant. This unlocks progression.
2. **Mastery:** meet explicit optimization targets such as makespan, bubble,
   intentional idle, or peak activation memory. This records deeper achievement
   but never gates the next level.

The game teaches the sequence:

```text
possible operations
  -> legal moves
  -> legal schedules
  -> efficient legal schedules
  -> explainable strategies
```

## 3. Clean-room boundary

Sensei is inspired by `ezyang/pipeline-parallelism-tutor`, studied at immutable
commit `4cf0b7247ee9334a3795af746dfd745fb5562601`. The pinned upstream tree has no
license file; GitHub reports `license: null`, and its license endpoint returns
404. Public readability does not establish permission to copy, modify, or
redistribute the implementation.

Sensei therefore uses a **clean-room spiritual fork**:

- implement an original engine, curriculum, interaction model, visual language,
  prose, tests, and fixtures;
- credit the upstream project as inspiration and retain the immutable research
  study for provenance;
- copy no upstream code, text, CSS, HTML structure, level definitions, test
  fixtures, screenshots, or assets; and
- use the general scheduling domain and independently derived behavior as the
  basis of implementation.

The clean-room audit permits overlap in domain concepts and their natural
pedagogical order—dependencies precede pipelining, compute asymmetry precedes
cost optimization, and memory pressure follows activation lifetime. It requires
independent derivation of topology, microbatch counts, targets, fixtures, prose,
visuals, and implementation. `F = 1`, `B = 2` is an explicitly chosen domain
approximation, not copied expression.

The first release deliberately diverges rather than seeking feature parity.

## 4. Scope

### Included

- A pure TypeScript simulator for `F` and unsplit `B` operations.
- Fixed reality-oriented operation durations: `F = 1`, `B = 2`.
- Physical ranks, logical stages, microbatches, dependency readiness, rank
  frontiers, intentional idle, activation memory, and memory caps.
- A place-the-next-operation interaction with inspectable blocked moves.
- Four original levels covering dependencies, pipelining, asymmetric compute,
  and memory-constrained scheduling.
- Legal and mastery progress, transparent scores, progressive coaching, undo,
  redo, reset, local persistence, and shareable replay.
- React with SVG/HTML rendering in a technical-tabletop visual style.
- Pointer and keyboard play, responsive layout, reduced motion, offline use, and
  automated accessibility checks.

### Deferred

- Virtual pipeline stages and interleaving.
- Split input-gradient and weight-gradient operations.
- Tensor, context/sequence, expert, data, or HSDP parallelism.
- FSDP weight residency and collective communication modeling.
- Arbitrary free-form timeline editing.
- A generic Sensei world API, plugin system, or content DSL.
- Codebase-learning worlds for Codex, SGLang, or other repositories.
- Multiplayer, accounts, server-side progress, or analytics.

These are future product directions, not extension requirements for the first
engine. Clean seams are required; generic abstractions are not.

## 5. Technical foundation

### 5.1 Stack

- TypeScript in strict mode.
- Vite for development and static production builds.
- React for the game shell and derived UI state.
- SVG for schedule geometry and overlays.
- HTML for controls, explanations, metrics, and accessibility semantics.
- A TypeScript test runner with property-based testing support.

The final application is a static site. No network is required after its assets
load.

### 5.2 Module boundaries

```text
src/engine/       pure scheduling domain and state transitions
src/levels/       four original validated level configurations
src/coaching/     explanations, suggestions, bounded automation
src/persistence/  versioned local and URL replay formats
src/offline/      versioned application-shell cache registration
src/app/          React orchestration and command handling
src/components/   board, tray, inspector, metrics, controls, level shell
src/styles/       original technical-tabletop tokens and responsive layout
```

Only `src/engine/` owns schedule truth. React consumes immutable projections and
issues commands. Components do not duplicate dependency, memory, legality, or
scoring rules.

## 6. Engine architecture

The engine is a pure TypeScript state machine with no React, DOM, SVG, timers,
storage, or network dependencies. Its canonical computation is:

```text
LevelConfig + ordered Action[] -> ScheduleState
```

### 6.1 Domain types

- `Operation`: kind (`F` or `B`), logical stage, physical rank, microbatch, and
  duration.
- `PlaceOperationAction`: append one operation at the owning rank's earliest
  legal frontier.
- `InsertIdleAction`: append exactly one tick of intentional idle to one rank.
- `Action`: the discriminated union of those commands.
- `Placement`: operation plus rank and half-open interval `[start, end)`.
- `ScheduleState`: placements, rank frontiers, completed dependencies, live
  activations, current and peak memory, classified idle intervals, and action
  history.
- `LegalMove`: an operation, earliest placement, dependencies satisfied, and
  projected memory consequence.
- `BlockedMove`: an operation plus one or more typed blocker reasons, including
  dependency-not-finished and memory-cap admission failure.
- `Score`: makespan, total work, bubble ratio, intentional idle, current memory,
  and per-rank and global peak activation memory.
- `MasteryTarget`: a named metric, comparison operator, threshold, and displayed
  accounting explanation.
- `LevelConfig`: topology, microbatch count, operation durations, optional
  per-rank memory caps, goals, mastery targets, and coaching capabilities.

For V1, topology is one-to-one and order preserving: logical stage `s` is owned
by physical rank `s`, and `stageCount === rankCount`. Every level configuration
must satisfy that invariant. Multiple or virtual stages per rank are deferred.

### 6.2 Command path

```text
deriveOperations(config)
  -> replay(config, actions)
  -> classifyMoves(state)
  -> validate(action, state)
  -> apply(action, state)
  -> score(state)
```

`apply` returns a new immutable state or a structured blocked result. An ordinary
illegal move never partly mutates state and never throws. Invalid configuration
and programmer-contract violations may return explicit validation errors at
their boundaries.

Undo and redo select an action prefix and replay it. This makes attempts
deterministic, serializable, testable, and shareable. Policies consume only the
engine's legal ready set, so coaching cannot bypass learner rules.

### 6.3 Dependency and memory rules

For a stage `s` and microbatch `m`:

- `F(s,m)` depends on `F(s-1,m)` unless `s` is the first stage.
- `B(s,m)` depends on `F(s,m)`.
- `B(s,m)` also depends on `B(s+1,m)` unless `s` is the last stage.
- An operation runs only on its owning rank and only after that rank's frontier.
- `F(s,m)` acquires one activation unit when the forward placement finishes.
- `B(s,m)` releases that activation when the backward placement finishes.
- A forward move is admissible on rank `r` exactly when activation units from
  other live forwards at its completion, plus this move's one new unit, are less
  than or equal to `cap(r)`. Otherwise it is memory-blocked even when its data
  dependencies are satisfied.

Memory is derived from timestamped placement-completion events, not from the
order in which actions happened to be appended across different ranks. V1 caps
are per-rank and each rank is serial, so acquisition and release events on one
rank never collide at the same timestamp; no cross-rank tie-break affects
admission.

Time is discrete. Placements occupy half-open intervals. The primary model uses
`F = 1` and `B = 2`, so backward blocks are visibly and numerically twice the
duration of forward blocks. This is a useful approximation, not a universal
measured hardware ratio.

### 6.4 Scoring

- `makespan`: maximum rank frontier after the final operation.
- `totalWork`: sum of all operation durations.
- `capacity`: rank count multiplied by makespan.
- `bubbleRatio`: `1 - totalWork / capacity`.
- `intentionalIdle`: duration inserted by learner idle actions.
- `peakActivationMemoryByRank`: maximum live activation units observed on each
  rank.
- `peakActivationMemory`: maximum across ranks.

The UI always displays the accounting boundary with the value. Targets refer to
these definitions directly; the game never uses an unexplained aggregate score.
Dependency-forced gaps and memory-blocked selections do not contribute to
`intentionalIdle`; only explicit one-tick `InsertIdleAction`s do.

## 7. Four-level curriculum

Each level is original Sensei content, not an upstream level transcription.

### Level 1 — The dependency chain

- Two ranks, one stage per rank, one microbatch.
- `F = 1`, `B = 2`; no binding memory cap.
- Teaches forward flow downstream and backward flow upstream.
- Blocked selections explain the exact missing predecessor.
- Legal completion is the primary goal; mastery requires no intentional idle.

### Level 2 — Fill the pipe

- Two ranks and multiple microbatches.
- Introduces fill, overlap, steady work, drain, makespan, and bubble.
- The first completed attempt unlocks the ready-set hint.
- Legal completion accepts any valid schedule.
- Mastery sets transparent makespan and bubble targets derived from a checked
  golden schedule.

### Level 3 — Backward is heavier

- More stages create simultaneous legal choices and asymmetric tails.
- `B` tiles appear double-width in the tray, preview, and board.
- Teaches that operation counts are not compute cost and that local choices
  reshape the downstream critical path.
- One-step coaching becomes available and explains its local trade-off.
- Mastery targets makespan and intentional idle.

### Level 4 — The memory wall

- Multiple microbatches and a binding per-rank activation cap.
- Dependency-ready forwards may remain illegal because they would exceed memory.
- Teaches activation lifetime and a 1F1B-like balance between throughput and
  memory.
- `run until interesting` becomes available.
- Legal completion requires a memory-safe schedule.
- Mastery combines makespan and peak-memory targets without hiding either metric
  inside a weighted score.

Progress unlocks on legal completion, never on mastery. A learner can return to
any unlocked level and improve the best recorded attempt.

## 8. Game surface

The screen has five stable regions:

```text
level goal + legal/mastered progress
operation tray
rank timeline board + move inspector
metrics + target deltas
undo / redo / hint / run until interesting / reset
```

### 8.1 Operation tray

The tray lists all remaining operations. Ready, blocked, completed, and selected
states are distinguishable through text, shape, border, and color. Blocked
operations remain focusable and inspectable; they are never hidden behind a
disabled control with no explanation. Tile width previews modeled duration, so
`B` is twice `F` from the learner's first encounter.

### 8.2 Schedule board

- Horizontal position means discrete time.
- Each row means one physical rank.
- Fill color identifies microbatch, with text/pattern redundancy.
- Label and shape identify `F` versus `B`.
- Horizontal width means compute duration.
- Outline or glow means selected, ready, dependency-related, or critical.
- Empty intervals are diagnosed as dependency-forced or intentional idle.
- Dependency-ready operations rejected by memory admission are shown as
  memory-blocked; memory blocking is a move state, not automatically an elapsed
  interval.
- A thin aligned strip shows activation memory over time for each rank.

A dependency-forced gap is created implicitly when a placed operation's earliest
dependency-safe start is later than its rank frontier. It is not stored as an
action. A learner creates intentional idle through a rank-local **wait one tick**
control at that rank's frontier; every invocation emits one `InsertIdleAction`,
and repeated waits remain separate replayable actions. An incomplete attempt
with no legal operation is deadlocked; it is diagnosed as memory deadlock when
at least one dependency-ready operation is memory-blocked. That is a terminal
attempt state, not a time interval that would eventually unblock itself.

SVG owns geometry and overlays. Accessible HTML descriptions expose the same
state without requiring visual inspection.

### 8.3 Move inspector

Selecting any operation shows:

- owning rank and duration;
- required predecessors and their status;
- earliest start if legal;
- every blocker if illegal;
- projected memory acquisition or release;
- projected target deltas; and
- the relevant scheduling concept in plain language.

### 8.4 Metrics and controls

Metrics update after every action and show both current value and target delta.
Controls expose their keyboard shortcuts and availability reasons. Each rank's
frontier exposes the wait-one-tick command to pointer and keyboard input. Reset
affects only the active attempt. Clearing all progress is a separate confirmed
action.

## 9. Interaction loop

1. The learner selects an operation tile.
2. The board previews its earliest placement on the owning rank.
3. A legal move can be committed.
4. A blocked move stays selected while the inspector explains every blocker.
5. A commit recomputes dependencies, activation memory, scores, completion, and
   mastery deltas from the engine state.
6. Undo or redo selects another action prefix and replays deterministically.

Pointer and keyboard interaction use the same commands. Keyboard-only play must
be capable of completing and mastering every level.

## 10. Coaching

Coaching consumes typed engine results and produces structured explanations. It
does not infer legality from the rendered board.

### 10.1 Assistance ladder

1. `explainBlockedMove` translates all blockers into causal explanations.
2. `revealReadySet` identifies currently legal choices after the level-defined
   unlock condition.
3. `suggestMove` ranks only the legal ready set and returns a move plus a local
   reason and predicted deltas.
4. `runUntilInteresting` automates only unambiguous stretches and returns control
   at a defined interesting boundary.

### 10.2 Interesting boundaries

At each step, automation computes `earliestStart` for every legal operation and
finds the minimum. It may continue only when exactly one legal operation has that
minimum and placing it starts at its rank's current frontier. This predicate is a
pure function of `ScheduleState`. Automation stops before:

- two or more legal operations share the minimum `earliestStart`;
- the unique earliest operation would introduce a dependency-forced gap;
- at least one dependency-ready operation is memory-blocked; or
- the next placement would complete the schedule.

It also stops with a diagnostic result if no operation can progress and the
schedule is incomplete. Every automated step places exactly one previously
unplaced operation; forced gaps are derived from that placement and automation
never inserts learner wait actions. Iteration is therefore bounded by the number
of remaining operations. A memory deadlock is an expected, undo-recoverable
attempt outcome; automation reports it with the actions that must be reconsidered
rather than treating it as an engine failure. Mastery is evaluated after
completion and therefore does not require a separate pre-placement stop.

Suggestions describe the local trade-off; they do not claim global optimality.

## 11. Persistence and replay

Persistence uses a versioned schema containing:

- schema version;
- level identifier and level-definition version;
- ordered actions;
- legal/mastery outcome; and
- score summary for display and migration diagnostics.

Browser storage records unlocked levels, best legal attempt, and best mastered
attempt. A compact URL payload reproduces one level and action sequence. On load,
the engine replays actions and recomputes truth; persisted score summaries are
never trusted over replay.

Within each category, attempts are ranked lexicographically by lower makespan,
then lower peak activation memory, then lower intentional idle, then fewer
actions. The UI displays this tuple whenever it labels an attempt “best”; there
is no hidden weighted aggregate.

Unknown versions, malformed payloads, invalid level identifiers, and inconsistent
actions yield an explicit recovery message. Bad URL state does not overwrite
valid local progress. Replay identifies the first inconsistent action index and
typed reason.

An attempt whose `level-definition version` differs from the current level is
historical and is never replayed against the new definition automatically. It is
retained for export, excluded from current best-attempt ranking, and accompanied
by a restart notice. Explicit migrations may translate a named old version to a
new action log; the migrated log must pass normal replay before it replaces
the historical record or enters current ranking.

## 12. Visual identity and accessibility

Sensei uses a **technical tabletop** identity:

- warm, paper-like neutral surfaces for the board;
- dark diagnostic panels for code-like reasoning and metrics;
- tactile tiles with restrained microbatch colors;
- monospace numerals for timelines and accounting; and
- motion only when it clarifies placement or changed state.

Color never carries meaning alone. Focus order follows goal, tray, board,
inspector, metrics, and controls. All controls have visible focus, accessible
names, and text equivalents for visual overlays. Reduced-motion preference
removes transitions. At a 764-pixel IDE pane the board remains readable; narrower
layouts stack the inspector and permit bounded board scrolling without hiding
labels or controls.

## 13. Failure behavior

- Ordinary illegal moves return typed blockers and never crash or partly mutate
  state.
- Invalid level definitions fail validation before a level opens.
- Replay stops at the first inconsistent action and reports its index and reason.
- Policy deadlock becomes a diagnostic state rather than an infinite loop.
- Memory deadlock is presented as a recoverable attempt outcome with undo and
  reset actions, not as a crashed engine.
- Malformed persisted state is quarantined from valid local progress.
- A React error boundary shows a recoverable shell and preserves the serialized
  active attempt where possible.
- Missing browser storage falls back to session-only play with a visible notice.
- The application registers a versioned service worker after a successful first
  load. It atomically caches the application shell and same-build static assets,
  retains the previous complete cache until the new one succeeds, and serves the
  cached shell on later offline reloads. A cache failure leaves online play
  intact and produces a non-blocking offline-unavailable notice.

## 14. Verification strategy

### 14.1 Engine examples and unit tests

- dependency construction and operation inventory;
- rank ownership and earliest start;
- `F = 1`, `B = 2` duration and half-open placement;
- activation acquisition, release, admission, and peak tracking;
- ready and blocked classification with multiple reasons;
- dependency-forced versus intentional idle;
- dependency-forced gaps, memory-blocked moves, and memory deadlock;
- completion, mastery, and score accounting; and
- invalid configuration and malformed replay diagnostics.

### 14.2 Property tests over bounded small configurations

- replay is deterministic;
- accepted actions preserve all invariants;
- undo followed by redo recovers identical state;
- a completed schedule contains every operation exactly once;
- policies choose only legal moves;
- memory never exceeds a configured cap in accepted states;
- bubble remains within `[0,1]`; and
- `totalWork <= rankCount * makespan` for completed schedules.

### 14.3 Golden level fixtures

Every level has at least:

- one legal, non-mastered action log;
- one mastered action log;
- expected makespan, bubble, intentional idle, and memory metrics; and
- expected assistance unlocks and interesting-boundary stops; and
- expected best-attempt ranking tuples and level-version handling where relevant.

Golden fixtures are original Sensei artifacts and are independently checked by
the engine.

### 14.4 UI and interaction tests

- blocked operations remain keyboard-focusable and inspectable;
- previews use the owning rank and correct duration;
- backward tiles render at twice forward width;
- pointer and keyboard commands produce identical action logs;
- keyboard-only play can complete and master every level;
- undo, redo, and reset preserve deterministic replay;
- coaching stops at every specified interesting boundary;
- metrics and target deltas update after each action;
- progress survives reload; and
- malformed URL state recovers without damaging local progress.

### 14.5 Release gates

- formatting, linting, and strict type checking;
- unit, property, golden, component, and interaction tests;
- production build and offline static-asset smoke test;
- service-worker upgrade and failed-cache rollback tests;
- automated accessibility checks and a keyboard-only playthrough;
- responsive checks at desktop, 764-pixel IDE, and narrow mobile widths;
- unique DOM/SVG identifiers and reduced-motion verification; and
- clean-room audit for copied upstream code, text, styling, fixtures, screenshots,
  or assets; the audit permits domain concepts and checks independent derivation
  of the concrete level and presentation artifacts.

## 15. Acceptance criteria

V1 is complete when:

1. all four original levels can be legally completed and mastered with pointer
   or keyboard input;
2. the engine and UI consistently render and score `F = 1`, `B = 2`;
3. illegal moves expose structured, causal explanations;
4. dependency-ready but memory-blocked operations are visible in level 4;
5. suggestions choose only legal work and `run until interesting` stops at every
   specified boundary;
6. legal/mastery progress and best attempts survive reload and replay exactly;
7. displayed metrics match golden fixtures and state their accounting boundary;
8. the static build is usable offline and at the target responsive widths;
9. automated and manual accessibility gates pass; and
10. the repository contains no copied upstream implementation or presentation
    artifacts.

## 16. Decisions and alternatives

### Selected

- Original clean-room implementation rather than a literal fork.
- Four-level vertical slice rather than a single level or full curriculum.
- Place-next-operation interaction rather than drag/drop or free-form editing.
- Two-stage legal/mastered progression rather than a hard par gate.
- Progressive coaching rather than always-on or minimal guidance.
- TypeScript, Vite, React, and SVG/HTML rather than vanilla JavaScript, Canvas,
  or Rust/Wasm.
- Pure simulator plus React game shell rather than React-owned domain state or a
  generic multi-world framework.

### Why

This combination proves the entire learning and product loop while keeping the
scheduling truth independently testable. It lets Sensei learn from an existing
game without inheriting unlicensed implementation artifacts, and it gives future
worlds evidence from one excellent, working game before any shared abstraction is
designed.
