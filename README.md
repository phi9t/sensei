# Sensei Pipeline Scheduling

Think of each pipeline rank as a worker lane and each microbatch as a parcel that must visit those lanes in dependency order. Sensei makes that scheduling problem playable: choose the next forward (`F`) or backward (`B`) operation, inspect why blocked moves are illegal, and watch the schedule, idle gaps, and activation memory evolve.

Under that approachable surface is a deterministic replay simulator. A level fixes the dependency DAG, durations, microbatch count, optional memory caps, coaching tools, and mastery targets. The ordered action log is replayed into placements, typed gaps, activation residency, completion, and ranking metrics. React renders that state; it does not redefine scheduling truth.

## What the game teaches

Sensei introduces one constraint at a time:

1. Build a **legal** dependency chain before optimizing it.
2. Fill and drain a multi-microbatch pipeline.
3. Account for asymmetric compute: `F = 1` tick and `B = 2` ticks.
4. Schedule under activation-memory caps, where a dependency-ready forward can still be memory-blocked.

The curriculum now contains 25 levels: foundations, GPipe, 1F1B, periodic building blocks, virtual stages, interleaved scheduling, nonuniform costs, split backward and zero-bubble heuristics, grouping, weight residency, and simplified bidirectional resources. These are small, deterministic teaching models; they do not predict GPU throughput.

## Text walkthrough

The page is arranged as a compact scheduling cockpit:

- **Level guide:** a short level note and goal stay above play without becoming a rules panel.
- **Ready queue:** during practice, every operation remains available. Legal blocks can be placed; blocked and completed blocks stay focusable so the inspector can explain them. Color follows the microbatch across stages and passes; F/B/W text and textures distinguish work. Compact codes retain the existing stage/data notation. Completed attempts replace the queue with a result and next-lesson action; the timeline remains inspectable and Undo restores practice.
- **Schedule command rail:** undo, redo, place, clear, wait, coaching, sharing, and reset stay close to the schedule, with a thin feedback line for the latest interaction.
- **Schedule board:** the timeline shows placed operations, dependency-forced or intentional gaps, and per-rank stored activations. Selection traces immediate predecessors and the stored activation interval. Completed policy comparisons can be expanded into a reference timeline on the same time scale.
- **Score rail:** the inspector, metrics and rank-specific residency table explain the current selection without crowding the board. Empty runs have no bubble percentage; incomplete runs are labeled provisional.
- **Understand this schedule:** directly below the timeline, every lesson has a concept explanation, algorithm walkthrough, linked dependency trace, practice question and primary-source reading guide. The trace uses actual engine predecessors and shares selection with the board. The bubble derivation explains the live numerator and denominator. Source assumptions distinguish each exercise from the paper.
- **Inline help:** “How to read this” opens a dismissible explanation of stages, ranks, microbatches and time. It becomes a bottom sheet on mobile and supports keyboard, touch and Escape. Jump buttons move focus between theory, source guidance and practice without replacing shared attempt URLs.

A legal completion unlocks the next level. Mastery is optional and records the stronger result separately.

## Prerequisites and commands

Use a Node.js and npm toolchain compatible with the pinned lockfile. This release was verified with Node `24.13.0` and npm `11.7.0`; the package metadata requires at least those versions.

```bash
npm install
npm run dev
npm run verify
npm run verify:production
```

- `npm install` installs dependencies; use `npm ci` for a lockfile-exact release/CI install.
- `npm run dev` starts the Vite development server.
- `npm run verify` checks formatting, lint, types, all tests, the production build, generated service worker, and production static artifacts.
- `npm run verify:production` rechecks the built `dist/` metadata, install manifest, icon, security headers, cache policy, and service-worker shell contract. See [`docs/production-readiness.md`](docs/production-readiness.md) before release.

## Architecture

The pure scheduling core is intentionally separated from the UI:

- [`src/engine/config.ts`](src/engine/config.ts) validates level definitions.
- [`src/engine/operations.ts`](src/engine/operations.ts) builds the operation inventory and dependency DAG.
- [`src/engine/replay.ts`](src/engine/replay.ts) classifies and applies actions, creates typed gaps, and tracks current/peak activation memory.
- [`src/engine/score.ts`](src/engine/score.ts) computes completion, mastery, metrics, and attempt ordering.
- [`src/coaching/coaching.ts`](src/coaching/coaching.ts) derives ready sets, local explanations, suggestions, and automation stop reasons from replay state.

The React shell in [`src/app`](src/app) and [`src/components`](src/components) handles interaction and rendering. Persistence in [`src/persistence`](src/persistence) stores unlocks and canonical best attempts. Offline registration lives in [`src/offline/register.ts`](src/offline/register.ts), while [`scripts/generate-service-worker.mjs`](scripts/generate-service-worker.mjs) derives the application-shell cache from each production build.

## Levels

Exact definitions live in [`src/levels/levels.ts`](src/levels/levels.ts). A legal completion unlocks the next level; mastery adds level-specific constraints.

| Curriculum       | Levels | Model introduced                                                    |
| ---------------- | -----: | ------------------------------------------------------------------- |
| Foundations      |      4 | Dependencies, fill/drain, asymmetric backward cost, activation caps |
| GPipe            |      1 | All-forward/all-backward ordering                                   |
| 1F1B             |      3 | Alternation, ties, memory pressure                                  |
| Building blocks  |      1 | Periodic offsets and collision validation                           |
| Virtual stages   |      1 | Multiple logical stages on a physical rank                          |
| Interleaved 1F1B |      2 | Virtual-stage ordering and ragged rounds                            |
| Nonuniform cost  |      1 | Stage-specific operation duration                                   |
| Zero bubble      |      4 | Split B/W, deferred weight gradients, local warmup heuristics       |
| Grouped          |      2 | Microbatch grouping and group-major order                           |
| FSDP residency   |      3 | Abstract gathered-weight reuse, eviction and cap pressure           |
| DualPipe         |      3 | Abstract directional slots and shared capacity                      |

Most fused-backward levels use F=1 and B=2 ticks. Split-gradient levels use F=B=W=1. Nonuniform levels override individual stage costs. Reference policies are local heuristics; matching them does not establish equivalence to a paper implementation.

## Scientific model and sources

Every lesson displays a primary-source link and a guided reading question under
**Understand this schedule**, with expandable **Source & assumptions** for timing
and memory conventions. The evidence map is in
[`docs/research/2026-09-04-scientific-ui-evidence.md`](docs/research/2026-09-04-scientific-ui-evidence.md).

- A tick is an abstract time unit. Communication, recomputation and optimizer time are omitted.
- Stored activations use one unit per logical stage/microbatch, acquired at F completion and released at fused B completion or split W completion. This is a stored-output convention; transient compute allocations are omitted. Simultaneous acquisition precedes release for conservative peak scoring.
- A residency lesson acquires/reuses or evicts stage weights at forward start. Gathers take zero simulated time. The cap includes current activations and resident weights; the headline peak reports activations only. Per-rank values are frontier snapshots, not simultaneous telemetry.
- DualPipe uses direction slots and shared units. The one-direction baseline reduces shared capacity to one; the reference chart preserves this configuration. Slot utilization is not measured GPU utilization or communication overlap efficiency.
- Internal bubble excludes each rank's fill/drain interval. Zero internal idle is not a claim of zero end-to-end training bubble.
- All visual overlays read replay state. No legality, memory release rule or ranking is redefined by React. Persisted actions and level versions remain unchanged by this presentation update.

## Controls and accessibility

With a pointer, click an operation to place it or inspect its blockers. The remaining buttons append rank-local idle, navigate history, expose the level's coaching affordances, share, or reset.

With a keyboard, use `Tab`/`Shift+Tab` to move through the native level picker, operation buttons, and controls, then `Enter` to activate a focused button. Blocked operation buttons remain enabled and announce as inspectable, so they stay keyboard-inspectable. The app also provides polite live feedback and honors `prefers-reduced-motion`.

## Offline behavior

Offline support is production-only. After the first successful production load, the service worker installs a content-digested application-shell cache containing the deployment's root, index, and current emitted JavaScript/CSS assets. Current static assets are cache-first; in-scope navigations are network-first with a cached index fallback. Non-GET, cross-origin, and out-of-scope requests are not intercepted. Project deployments use their own cache namespace.

## GitHub Pages

Play at [phi9t.github.io/sensei](https://phi9t.github.io/sensei/).
The source repository is [phi9t/sensei](https://github.com/phi9t/sensei).

Pushes to `master` run the full verification suite, build for `/sensei/`, and
publish the `dist` artifact through GitHub Actions. The workflow uses the pinned
Node/npm toolchain. GitHub Pages must use **GitHub Actions** as its build source.

Run `npm run build:pages` to reproduce the Pages artifact locally. This sets the
asset base, install-manifest scope and service-worker cache paths to `/sensei/`
and verifies the generated files. `npm run build` still produces a root-hosted
build for other static hosts. GitHub Pages does not apply the `_headers` file;
those custom security/cache headers require a host that supports it.

Registration occurs after page load and reports `ready`, `unavailable`, or `unsupported`. The latter two produce a non-blocking notice; online play continues if caching is unavailable. A successful new shell is populated before older `sensei-shell-*` caches are removed.

## Metrics and ranking

The formulas in [`src/engine/score.ts`](src/engine/score.ts) are:

```text
makespan = max(rankFrontiers)
totalWork = sum(duration of every placed operation)
slotsPerRank = dualPipe ? min(sharedCapacity, directions * directionalSlots) : 1
capacity = rankCount * makespan * slotsPerRank
bubbleRatio = capacity == 0 ? 0 : (capacity - totalWork) / capacity
intentionalIdle = sum(end - start for gaps whose kind is intentional)
peakActivationMemoryByRank = replayed peak resident activations per rank
peakActivationMemory = max(peakActivationMemoryByRank)
```

Completion requires exactly one placement for every inventory operation. Mastery requires completion plus every level target using exact JavaScript `<=` comparison. Attempts are ordered lexicographically by:

```text
(makespan, peakActivationMemory, [allGatherCount for residency levels], intentionalIdle, actionCount)
```

Lower is better at the first differing field.

## Upstream inspiration and clean-room boundary

Sensei was informed by a source study of [`ezyang/pipeline-parallelism-tutor`](https://github.com/ezyang/pipeline-parallelism-tutor) pinned at commit `4cf0b7247ee9334a3795af746dfd745fb5562601`; see [`docs/research/pipeline-parallelism-tutor-source-study.md`](docs/research/pipeline-parallelism-tutor-source-study.md). At that pin the study found no license file, GitHub metadata reported `license: null`, and the license endpoint returned `404`.

That missing-license observation is why this repository is a clean-room implementation, not a vendor or textual fork. Sensei contains no vendored upstream source, HTML/CSS, screenshots, fixtures, wording, palette, or presentation assets. Its engine, level fixtures, prose, visual tokens, React structure, coaching rules, and tests were independently implemented here. The reproducible boundary receipt is [`docs/clean-room-audit.md`](docs/clean-room-audit.md).
