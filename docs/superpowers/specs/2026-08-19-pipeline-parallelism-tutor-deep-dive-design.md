# Pipeline Parallelism Tutor Deep Dive — Design

**Status:** Superseded by `2026-08-19-sensei-pipeline-game-design.md`

**Date:** 2026-08-19

**Primary source pin:**
`ezyang/pipeline-parallelism-tutor@4cf0b7247ee9334a3795af746dfd745fb5562601`

> This companion-only direction was superseded when Sensei pivoted to an
> original playable game. Its source and licensing analysis remains historical
> context; it is not the implementation contract.

## 1. Outcome

Create a canonical, reader-facing companion that explains how the existing
Pipeline Parallelism Tutor uses visual state, legal moves, level progression,
and analytical feedback to teach pipeline scheduling. The artifact must work at
two levels simultaneously:

1. teach pipeline scheduling from visual intuition through schedule geometry,
   dependencies, memory, policies, and engine implementation; and
2. dissect why the game's interaction and curriculum design make those ideas
   learnable.

The companion will be a single-file, zero-build HTML document at:

```text
docs/deep-dives/pipeline-parallelism-tutor.html
```

The detailed evidence base remains separate at
`docs/research/pipeline-parallelism-tutor-source-study.md`.

## 2. Audience and teaching posture

The canonical reader is an MTS persona: a CS PhD in ML, a mathematics or CS
undergraduate foundation, and more than ten years of industry experience across
applied ML and distributed systems.

The opening nevertheless uses an **ELI-intern on-ramp**. This affects ordering,
not technical ceiling. The document begins with concrete visual intuition,
reuses the same schedule as the explanation deepens, and reaches source- and
algorithm-level rigor without a discontinuous jump into an unrelated advanced
section. It does not spend time re-teaching backpropagation, asymptotic notation,
or basic distributed-systems vocabulary.

## 3. Scope

### Included

- The visual grammar of ranks, discrete time, microbatch colors, `F/B/W`
  operations, idle cells, memory strips, highlights, and metrics.
- A realism-calibrated primary specimen in which an unsplit backward operation
  occupies about twice the modeled compute time of a forward operation.
- The player's loop from selecting a move through legality validation, state
  mutation, rendering, scoring, recognition, and coaching.
- The actual 11-level curriculum in `js/levels.js`, including which new idea,
  constraint, representation, or assistance mechanism each level introduces.
- Dependency legality, forced versus voluntary idle, fill/steady-state/drain,
  memory caps, and schedule metrics.
- Repository-modeled GPipe, 1F1B, zero-bubble, grouped, virtual-pipeline, ragged,
  split-gradient, building-block, and FSDP-residency mechanics.
- A source-backed analysis of progressive disclosure, ghost moves, memory
  externalization, event-bounded automation, free editing, and analytical
  completion feedback.
- Explicit simulator boundaries and unresolved questions.

### Deferred

- A generalized Sensei world engine or plugin contract.
- Other distributed-training dimensions such as TP, CP/SP, EP, or a complete
  5D-parallelism curriculum.
- Codebase-learning worlds for Codex, SGLang, or other repositories.
- Instrumenting, modifying, or forking the upstream game.
- Claims that repository labels exactly reproduce the cited research papers.
- Modeling a real distributed runtime, network, kernel variance, or failures.

These are future directions, not requirements that shape the first artifact.

## 4. Upstream and licensing boundary

The upstream source is publicly readable but has no license file at the pinned
commit. GitHub reports `license: null`, and its license endpoint returns 404.
This does not establish permission to copy, modify, or redistribute upstream
implementation text, code, screenshots, CSS, or assets.

The first artifact therefore:

- records the repository URL, full commit, observation date, and license status;
- links to immutable source lines;
- reconstructs representative schedules with original HTML, CSS, and text;
- describes ideas and behavior in repo-authored language; and
- does not commit upstream source bytes.

A playable mirror or modified teaching fork requires explicit permission or a
subsequent upstream license. The word *legal* in the teaching material always
means valid under schedule invariants; licensing statements use *licensed* or
*permitted* to avoid collision.

## 5. Artifact architecture

### 5.1 Canonical companion

`docs/deep-dives/pipeline-parallelism-tutor.html` is the primary teaching
surface. It is self-contained: inline CSS, inline JavaScript, deterministic
fixtures, and no build step. It may use web fonts as an enhancement, but the
content and interactions must remain usable with system-font fallbacks and no
network access.

### 5.2 Evidence base

`docs/research/pipeline-parallelism-tutor-source-study.md` remains the exhaustive
source study and claim ledger. The HTML selects the evidence needed for the
learning journey rather than duplicating all research prose.

### 5.3 Provenance receipt

The HTML's first section records:

- repository and default branch;
- exact 40-character commit;
- observation date and source boundary;
- missing-license status; and
- the distinction between source fact, executable contract, interpretation,
  and simulator boundary.

The commit literal is centralized once in JavaScript. Source anchors store only
SHA-free paths and line fragments, and initialization expands every anchor to
the same immutable commit.

### 5.4 Original schedule fixtures

The companion uses a small set of repo-authored, deterministic schedule
fixtures. Each fixture contains configuration, ordered actions, placements,
memory timeline, relevant policy decisions, and expected metrics. Fixtures are
derived independently from the behavior described by upstream source and tests;
they do not copy source code.

## 6. Reader journey

One recurring schedule acts as a specimen. Each chapter exposes another layer
of the same object before introducing the minimum additional example needed for
an advanced mechanism.

### 00. Source and provenance

State the pin, evidence boundary, licensing caveat, simulator/runtime
distinction, and how to read evidence labels.

### 01. Read the board

Introduce ranks, discrete time, microbatches, `F/B/W`, and idle space. Block
width is meaningful from the beginning: the primary specimen uses the upstream
`honest` duration model, `F = 1` and unsplit `B = 2`. The reader should be able
to narrate a schedule left to right before seeing an equation.

### 02. What makes a move legal?

Derive the direct dependency DAG and rank/memory constraints. Distinguish an
impossible move, forced idle, and voluntary delay. Establish that a legal
schedule can still be inefficient.

### 03. Why pipelining helps

Move from one microbatch to several. Explain fill, steady state, drain,
makespan, total bubble, and internal bubble from schedule geometry and then
show the formulas.

### 04. The memory wall

Show why forward operations accumulate saved activations, when `B` or `W`
releases them, and why an otherwise dependency-correct move may be rejected by
the memory cap.

### 05. Strategies emerge

Compare named strategies as different priority orderings over the currently
legal ready set. Contrast GPipe, 1F1B, zero-bubble, and grouped behavior without
presenting names as magic recipes or global optimizers. Define par as the
configured policy reference.

### 06. Change the representation

Move from individual block placement to periodic building blocks. Explain
tiling by residues, trajectory lifespan, and peak-memory reasoning before a
pattern is stamped across microbatches.

### 07. Traverse the advanced levels

Trace virtual stages and placement geometry, ragged rounds, nonuniform backward
cost, split `B/W`, deeper warmup, and the final FSDP residency/cache lesson.
Keep the FSDP all-gather model explicitly durationless and abstract.
When backward is split, render `B` and `W` as distinct compute blocks rather
than retaining one synthetic double-width backward block.

### 08. Inside the teaching machine

Follow one click through the ordered action log, replay model, ready check,
`apply`, derived state, rendering, scoring, recognition, critical path, and
coaching. Show why the pure engine seam supports both browser and terminal
frontends.

### 09. Why the game works

Analyze progressive disclosure of both concepts and tools; ghost previews;
memory strips; structured failure causes; `run until strange`; reversible
invalid free editing; and completion feedback that diagnoses rather than merely
rewards.

### 10. Where the model stops

Summarize fixed discrete durations, mostly free communication, abstract memory,
policy-relative par, order-based recognition, unverified paper correspondence,
and the absence of measured accessibility or learning efficacy.

Every chapter follows the same explanatory contract:

```text
what you see
  -> what rule it represents
  -> where the engine enforces it
  -> what the learner is meant to notice
```

## 7. Interaction and visual contract

### 7.1 Schedule panels

Representative panels provide:

- step forward and backward through an ordered action log;
- toggles for dependencies, ready set, memory, critical path, and policy choice;
- inspection of every idle interval as forced or voluntary;
- blocking-dependency explanations where an idle is forced;
- aligned strategy comparison on one time axis; and
- a source lens linking visible behavior to exact immutable source lines.

The panels are explanatory replay widgets, not a reimplementation of the full
upstream game. They do not accept arbitrary schedules in the first release.

### 7.2 Level map

An interactive level map covers all 11 code-defined levels. Each entry names:

- the prior mental model;
- the newly introduced concept or constraint;
- newly unlocked assistance or representation;
- the intended observation; and
- the source/configuration anchor.

The map calls out that the README's shorter list is stale relative to
`js/levels.js`.

### 7.3 Visual grammar

- Horizontal position means discrete time.
- A row means a physical rank.
- Fill color means microbatch identity.
- A block label identifies operation kind and logical stage.
- Block width means modeled compute duration. The default explanatory fixture
  uses `F = 1`, `B = 2`; a legend states that this is the repository's
  realism-oriented approximation, not a universal measured ratio.
- Outline or glow means readiness, dependency relation, or critical path.
- A thin strip shows hidden activation memory or weight residency.
- An empty interval means idle capacity and always admits a diagnosis.

Color never carries meaning alone. Labels, patterns, outlines, or text provide
the same distinction. A compact legend remains visible near every schedule.

### 7.4 Document navigation

The single-file HTML includes sticky chapter navigation, responsive top
navigation, scroll progress, keyboard-accessible controls, copyable source
anchors, back-to-top, and print rules. Above-fold content is visible without
JavaScript or reveal animation. Reduced-motion preference disables transitions.

## 8. Evidence contract

Every non-obvious mechanism statement receives one of four labels:

| Label | Meaning |
|---|---|
| `SOURCE` | Directly established by upstream code, README, workflow, or level text. |
| `EXECUTABLE CONTRACT` | Asserted by an upstream test at the pinned commit. |
| `INTERPRETATION` | Sensei's analysis of the teaching or interaction mechanism. |
| `SIMULATOR BOUNDARY` | A limitation or divergence from a real distributed runtime. |

`INTERPRETATION` claims cite their observable source basis but remain clearly
separate from author-stated intent. Paper names are repository labels unless a
future, separately scoped paper audit verifies correspondence.

## 9. Deterministic data flow

Each replay widget follows this local flow:

```text
fixture configuration + ordered actions
  -> selected action prefix
  -> placements and rank frontiers
  -> derived dependencies, memory, and metrics
  -> schedule panel and explanation pane
```

Controls mutate only the selected prefix or visible overlays. They do not fetch
remote data or execute upstream code. Reloading restores the documented initial
state; malformed fixture data produces an explicit in-document error rather
than a blank panel.

## 10. Verification and acceptance criteria

The artifact is complete when all of the following hold:

### Content

- All 11 code-defined levels appear in order with concept, constraint,
  assistance, intended observation, and source anchor.
- The recurring specimen can be followed from intern-level board reading to
  the engine trace without changing notation.
- The primary specimen renders unsplit backward blocks at twice the width of
  forward blocks, and every metric uses those same durations.
- Split-gradient examples replace the unsplit backward representation with
  separately labeled `B` and `W` blocks.
- The document distinguishes legal from efficient, par from optimal, source
  fact from interpretation, and simulator from runtime.
- Every non-obvious mechanism claim resolves to the source-study ledger or a
  new exact commit-pinned line citation.
- No unverified claim is made about correspondence to external papers or
  measured pedagogical efficacy.

### Interaction

- Step and rewind are deterministic and bounded at both ends.
- Every overlay toggle is keyboard operable and exposes state through text, not
  color alone.
- Each displayed idle interval has a forced/voluntary diagnosis.
- Strategy comparison uses a common axis and states metric accounting
  boundaries.
- Source-lens links all contain the unified 40-character commit after document
  initialization.

### Technical quality

- HTML parses without duplicate IDs or broken same-page anchors.
- The document remains readable at a 764-pixel IDE browser width and in print.
- Above-fold content is visible without IntersectionObserver execution.
- Reduced-motion mode removes reveal and scrolling animation.
- A local validator checks fixture shape, expected metrics, complete level
  coverage, evidence labels, immutable links, and unique IDs.
- No upstream source bytes, copied screenshots, CSS, or assets enter the
  repository.

## 11. Failure handling

- If a source line moves, the immutable old link remains valid; repinning is a
  deliberate source-audit operation, not an automatic update.
- If JavaScript fails, prose, static first-frame schedules, provenance, and
  source links remain readable.
- If a deterministic fixture disagrees with an expected metric, validation
  fails and identifies the fixture and metric; the displayed value is not
  silently accepted.
- If upstream later adds a license, the repository records that as a new dated
  observation before reconsidering vendoring.

## 12. Decision record

Three approaches were considered:

1. an annotated companion deep dive;
2. a fetched playable mirror with surrounding annotations; and
3. a modified teaching fork with in-game overlays.

The companion was selected because it can explain the visual and game
progression deeply while preserving a clean source/evidence boundary and
avoiding unlicensed redistribution. A playable mirror or teaching fork remains
possible only after the licensing boundary changes.

The first artifact deliberately studies one successful game before defining
abstractions for other training mechanisms or codebase worlds.
