# Sensei Pipeline Scheduling

Think of each pipeline rank as a worker lane and each microbatch as a parcel that must visit those lanes in dependency order. Sensei makes that scheduling problem playable: choose the next forward (`F`) or backward (`B`) operation, inspect why blocked moves are illegal, and watch the schedule, idle gaps, and activation memory evolve.

Under that approachable surface is a deterministic replay simulator. A level fixes the dependency DAG, durations, microbatch count, optional memory caps, coaching tools, and mastery targets. The ordered action log is replayed into placements, typed gaps, activation residency, completion, and ranking metrics. React renders that state; it does not redefine scheduling truth.

## What the game teaches

Sensei introduces one constraint at a time:

1. Build a **legal** dependency chain before optimizing it.
2. Fill and drain a multi-microbatch pipeline.
3. Account for asymmetric compute: `F = 1` tick and `B = 2` ticks.
4. Schedule under activation-memory caps, where a dependency-ready forward can still be memory-blocked.

The current model deliberately stays small: one physical rank per stage, integer time, forward/backward operations, and four levels. This makes every move explainable before we extend the same game language to broader parallelism.

## Text walkthrough

The page is arranged as a compact scheduling cockpit:

- **Level guide:** a short level note and goal stay above play without becoming a rules panel.
- **Ready queue:** every operation remains visible. Legal blocks can be placed; blocked and completed blocks stay focusable so the inspector can explain them. Names use `(F/B, stage_id, data_id)`.
- **Schedule command rail:** undo, redo, place, clear, wait, coaching, sharing, and reset stay close to the schedule, with a thin feedback line for the latest interaction.
- **Schedule board:** the timeline shows placed operations, dependency-forced or intentional gaps, and per-rank activation memory.
- **Score rail:** the move inspector and metrics stay together so selection state, completion, makespan, bubble ratio, activation peaks, and the ranking tuple remain scannable.

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

Every level uses `F = 1`, `B = 2`, and one rank per stage. Exact definitions live in [`src/levels/levels.ts`](src/levels/levels.ts).

| ID                    | Title               | Ranks/stages | Microbatches | Memory caps | Coaching (`ready`, `hint`, `auto`) | Mastery targets                                                          |
| --------------------- | ------------------- | -----------: | -----------: | ----------- | ---------------------------------- | ------------------------------------------------------------------------ |
| `dependency-chain`    | Dependency Chain    |          2/2 |            1 | none        | no, no, no                         | makespan `<= 6`; intentional idle `<= 0`                                 |
| `fill-the-pipe`       | Fill the Pipe       |          2/2 |            3 | none        | yes, no, no                        | makespan `<= 12`; intentional idle `<= 0`                                |
| `backward-is-heavier` | Backward Is Heavier |          3/3 |            3 | none        | yes, yes, no                       | makespan `<= 15`; intentional idle `<= 0`                                |
| `memory-wall`         | Memory Wall         |          3/3 |            4 | `[3, 2, 1]` | yes, yes, yes                      | makespan `<= 18`; intentional idle `<= 0`; peak activation memory `<= 3` |

## Controls and accessibility

With a pointer, click an operation to place it or inspect its blockers. The remaining buttons append rank-local idle, navigate history, expose the level's coaching affordances, share, or reset.

With a keyboard, use `Tab`/`Shift+Tab` to move through the native level picker, operation buttons, and controls, then `Enter` to activate a focused button. Blocked operation buttons remain enabled and announce as inspectable, so they stay keyboard-inspectable. The app also provides polite live feedback and honors `prefers-reduced-motion`.

## Offline behavior

Offline support is production-only. After the first successful production load, `/sw.js` installs a content-digested application-shell cache containing `/`, `/index.html`, and the current emitted JavaScript/CSS assets. Current static assets are cache-first; same-origin navigations are network-first with cached `/index.html` fallback. Non-GET, cross-origin, and arbitrary runtime/API data are not intercepted.

Registration occurs after page load and reports `ready`, `unavailable`, or `unsupported`. The latter two produce a non-blocking notice; online play continues if caching is unavailable. A successful new shell is populated before older `sensei-shell-*` caches are removed.

## Metrics and ranking

The formulas in [`src/engine/score.ts`](src/engine/score.ts) are:

```text
makespan = max(rankFrontiers)
totalWork = sum(duration of every placed operation)
capacity = rankCount * makespan
bubbleRatio = capacity == 0 ? 0 : (capacity - totalWork) / capacity
intentionalIdle = sum(end - start for gaps whose kind is intentional)
peakActivationMemoryByRank = replayed peak resident activations per rank
peakActivationMemory = max(peakActivationMemoryByRank)
```

Completion requires exactly one placement for every inventory operation. Mastery requires completion plus every level target using exact JavaScript `<=` comparison. Attempts are ordered lexicographically by:

```text
(makespan, peakActivationMemory, intentionalIdle, actionCount)
```

Lower is better at the first differing field.

## Upstream inspiration and clean-room boundary

Sensei was informed by a source study of [`ezyang/pipeline-parallelism-tutor`](https://github.com/ezyang/pipeline-parallelism-tutor) pinned at commit `4cf0b7247ee9334a3795af746dfd745fb5562601`; see [`docs/research/pipeline-parallelism-tutor-source-study.md`](docs/research/pipeline-parallelism-tutor-source-study.md). At that pin the study found no license file, GitHub metadata reported `license: null`, and the license endpoint returned `404`.

That missing-license observation is why this repository is a clean-room implementation, not a vendor or textual fork. Sensei contains no vendored upstream source, HTML/CSS, screenshots, fixtures, wording, palette, or presentation assets. Its engine, level fixtures, prose, visual tokens, React structure, coaching rules, and tests were independently implemented here. The reproducible boundary receipt is [`docs/clean-room-audit.md`](docs/clean-room-audit.md).
