# Sensei clean-room and release audit

Checked branch: `feature/pipeline-game`

Checked date: 2026-08-19

Browser: Chrome for Testing `147.0.7727.57`, driven by `agent-browser` against the production Vite preview

## Boundary

Permitted domain-level overlap is limited to pipeline-scheduling ideas: dependency DAGs, ranks/stages, microbatches, `F = 1` and `B = 2`, activation lifetime/caps, and a legal-before-efficient curriculum.

Sensei's independently derived concrete choices include:

- level IDs/titles, 2/2 and 3/3 topologies, microbatch counts `1/3/3/4`, caps `[3, 2, 1]`, and mastery targets in [`src/levels/levels.ts`](../src/levels/levels.ts);
- mastered and deliberately non-mastered legal action logs in [`src/levels/fixtures.ts`](../src/levels/fixtures.ts);
- all prose, React panel structure, CSS tokens/patterns, responsive behavior, and accessibility semantics;
- typed engine/replay/scoring/persistence contracts and their tests; and
- the local automation stops `choice`, `dependency-gap`, `memory-boundary`, `would-complete`, `memory-deadlock`, and `deadlock`.

Prohibited and absent artifacts are upstream source, HTML/CSS, screenshots, fixtures, copied text, palettes, and static/presentation assets. The upstream pin and observations exist only in attribution/research documentation. No upstream bytes are vendored.

## Clean-room scans

These commands were run from the repository root after the documentation was written:

```bash
rg -n 'run until strange|proposal ghost|BF-PP|ZeroPP|ZB-H[12]' src tests README.md
rg -n 'ezyang/pipeline-parallelism-tutor' src tests
```

Both exited with status `1` and no output, which is ripgrep's expected no-match result. Attribution appears only in `README.md` and `docs/`.

## Manual acceptance ledger

The checks used `npx vite preview --host 127.0.0.1 --port 4173` and real DOM/button interaction. The production server and isolated browser sessions were stopped afterward.

| Check                 | Observed evidence                                                                                                                                                                                                                                                     |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Production preview    | Exact worktree preview returned HTTP 200 and rendered `Sensei Pipeline Scheduling`.                                                                                                                                                                                   |
| Pointer journeys      | All four levels reached legal mastered completion using the source-backed action orders. Level 4 ended at tuple `18 -> 3 -> 0 -> 24`.                                                                                                                                 |
| Legal without mastery | Level 2 with one leading rank-0 wait completed at `13 -> 3 -> 1 -> 13`, showed `Mastery pending`, and still unlocked Level 3.                                                                                                                                         |
| Keyboard journey      | In a fresh isolated session, native focus plus `Enter` completed Level 1 in order and showed legal/mastered completion. Automated keyboard tests additionally cover `Tab` traversal.                                                                                  |
| Blocked inspection    | Before any move, `B:0:0` stayed focusable and listed blockers `F:0:0` and `B:1:0`.                                                                                                                                                                                    |
| Backward cost         | Rendered inventory geometry measured `F = 48px`, `B = 96px`; labels and metrics reported durations 1 and 2.                                                                                                                                                           |
| Memory wall           | After `F:0:0`, `F:0:1`, `F:0:2`, `F:0:3` remained focusable and the inspector reported `memory-cap rank=0 resident=3 cap=3`.                                                                                                                                          |
| Responsive widths     | At 1280px, 764px, and 390px all seven regions and reset control remained present. A live check found 47px page overflow at 390px; commit `b47c04f` added a regression test and reduced document `scrollWidth` to exactly 390px while retaining board-local scrolling. |
| Reduced motion        | With `prefers-reduced-motion: reduce`, the media query matched and a button's computed transition and animation durations were both `0s`.                                                                                                                             |
| Offline reload        | With an activated worker and cache `sensei-shell-5b606334c51d386e`, the preview server was stopped and the same 390px page reloaded with the correct title, heading, activated worker, and no document overflow.                                                      |

## Release gate

The release sequence is:

```bash
npm ci
npm run verify
git diff --check
git status --short
```

The recorded result for this release was:

- `npm ci`: success from `package-lock.json`;
- `npm run verify`: success for Prettier, ESLint, TypeScript, the complete Vitest suite, Vite production build, and generated `dist/sw.js`;
- `git diff --check`: no whitespace errors;
- pre-documentation-commit status: only `README.md` and `docs/clean-room-audit.md` were untracked.

## Source receipts

- Domain vocabulary and clean-room decision: [`CONTEXT.md`](../CONTEXT.md)
- Upstream pin and missing-license observation: [`docs/research/pipeline-parallelism-tutor-source-study.md`](research/pipeline-parallelism-tutor-source-study.md)
- Level and golden schedules: [`src/levels`](../src/levels)
- Engine and scoring truth: [`src/engine`](../src/engine)
- Coaching predicates: [`src/coaching/coaching.ts`](../src/coaching/coaching.ts)
- Persistence and unlock rules: [`src/persistence`](../src/persistence), [`src/app/useGame.ts`](../src/app/useGame.ts)
- Offline implementation and executable contract: [`src/offline/register.ts`](../src/offline/register.ts), [`scripts/generate-service-worker.mjs`](../scripts/generate-service-worker.mjs), [`tests/offline.test.mjs`](../tests/offline.test.mjs)
- Accessibility/game flow: [`src/components/GameShell.test.tsx`](../src/components/GameShell.test.tsx), [`tests/accessibility.test.tsx`](../tests/accessibility.test.tsx), [`tests/game-flow.test.tsx`](../tests/game-flow.test.tsx)
