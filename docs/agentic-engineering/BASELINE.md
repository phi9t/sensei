# Agentic Bootstrap Baseline

## Snapshot

| Field              | Value                                                                        |
| ------------------ | ---------------------------------------------------------------------------- |
| Repository         | `/Users/bytedance/workspace/sensei`                                          |
| Bootstrap worktree | `/Users/bytedance/workspace/sensei/.worktrees/agentic-engineering-bootstrap` |
| Bootstrap branch   | `chore/agentic-engineering-bootstrap`                                        |
| Base branch        | `master`                                                                     |
| Base SHA           | `637f8b172fb153197223841500d6f32418061173`                                   |
| Kata project       | `sensei`                                                                     |
| Primary agent      | `traecode`                                                                   |
| Review agent       | `gemini`                                                                     |

## Tool Versions

| Tool       | Observed version               |
| ---------- | ------------------------------ |
| Node.js    | `v24.13.0`                     |
| npm        | `11.7.0`                       |
| Kata       | `kata v0.14.3`                 |
| roborev    | `roborev v0.64.0`              |
| AgentsView | `agentsview v0.41.1`           |
| bwrap      | unavailable on this macOS host |

## Installed Agent Availability

`roborev check-agents` reported:

- `codex`: healthy;
- `gemini`: healthy;
- `claude-code`: installed as `claude`, but failed authentication with an
  expired OAuth token;
- `cursor`: installed as `agent`, but blocked by workspace trust prompt;
- other roborev agent commands unavailable.

`gemini` is the resolved independent reviewer for this bootstrap.

## Pre-Existing Main Checkout Changes

The original checkout was dirty before bootstrap work began. These files were
not staged, stashed, reset, or copied into the bootstrap branch:

```text
M package.json
M src/engine/buildingBlocks.test.ts
M src/engine/buildingBlocks.ts
M src/engine/types.ts
?? .agents/README.md
?? .agents/templates/intent.md
?? .agents/templates/plan.md
?? .agents/templates/review.md
?? .agents/templates/spec.md
?? AGENTS.md
?? CLAUDE.md
?? docs/agentic-engineering.md
?? docs/research/2026-08-25-controllable-memory-paper-notes.md
?? docs/research/2026-08-26-pipeline-scheduling-algorithmic-approaches.md
?? docs/research/evidence/2405.15362v4.pdf
?? docs/superpowers/plans/2026-08-25-controllable-memory-schedule-mechanism.md
?? docs/superpowers/plans/2026-08-26-sensei-exact-schedule-oracle.md
?? docs/superpowers/plans/2026-08-26-sensei-optimizer-model-export.md
?? docs/superpowers/plans/2026-08-26-sensei-schedule-synthesis-toolkit.md
?? docs/superpowers/specs/2026-08-25-controllable-memory-schedule-mechanism.md
?? docs/superpowers/specs/2026-08-26-sensei-exact-schedule-oracle.md
?? docs/superpowers/specs/2026-08-26-sensei-optimizer-model-export.md
?? docs/superpowers/specs/2026-08-26-sensei-schedule-synthesis-toolkit.md
?? scripts/agent-status.mjs
?? src/components/PipelineLessonPanel.tsx
?? src/engine/exactOracle.test.ts
?? src/engine/exactOracle.ts
?? src/engine/optimizerModel.test.ts
?? src/engine/optimizerModel.ts
?? src/engine/scheduleSynthesis.test.ts
?? src/engine/scheduleSynthesis.ts
```

## Baseline Verification

Setup command:

```bash
npm ci
```

Outcome: passed. npm installed 247 packages and reported 0 vulnerabilities.

Full baseline command:

```bash
npm run verify
```

Outcome: passed before bootstrap source edits.

Evidence:

- `npm run format:check`: passed;
- `npm run lint`: passed;
- `npm run typecheck`: passed;
- `npm test`: 21 files passed, 434 tests passed;
- `npm run build`: `tsc -b`, Vite build, and service-worker generation passed.

The jsdom accessibility suite printed a known canvas warning:

```text
Not implemented: HTMLCanvasElement's getContext() method: without installing the canvas npm package
```

The command still exited `0`.

## Hook Baseline

- `core.hooksPath`: unset.
- `git rev-parse --git-path hooks/post-commit` resolves to
  `/Users/bytedance/workspace/sensei/.git/hooks/post-commit`.
- Before roborev setup, no active post-commit hook existed; only Git sample
  hooks were present.

## Tool Mismatches Recorded In Kata

- `kata --version` is unsupported; use `kata version`.
- `kata quickstart --format contract` is unsupported in Kata `v0.14.3`; use
  `kata quickstart --format agent`.
- `roborev --version` is unsupported; use `roborev version`.

## Local Requirements

- Tests do not require GPUs, databases, Kubernetes, or remote services.
- Dependency setup requires npm registry access.
- Hostile-code sandboxing is unavailable because `bwrap` is not installed on
  this macOS host.

## Bootstrap Execution Evidence

The following evidence was collected in the bootstrap worktree before sealing
this final evidence update. The final handoff reruns the verifier against the
evidence commit's own `HEAD`.

| Check                           | Command                                                                             | Outcome                                                                 |
| ------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Linked worktree Kata binding    | `git worktree add ... --detach HEAD && kata --workspace ... list --agent`           | passed; temporary worktree resolved the same `sensei` Kata issue ledger |
| Agentic smoke tests             | `npm run agentic:test`                                                              | passed; 1 test file, 8 tests                                            |
| Agentic doctor                  | `scripts/agentic/doctor`                                                            | passed; tools, hooks, ignored runtime paths, and adapters verified      |
| Fast deterministic gate         | `scripts/agentic/check-fast`                                                        | passed; format, lint, typecheck, and 22 Vitest files / 442 tests        |
| Full deterministic gate         | `scripts/agentic/check-full`                                                        | passed; `npm run verify`, production build, and `git diff --check`      |
| Branch review gate              | `scripts/agentic/review-branch`                                                     | passed; reran full gate and roborev branch review                       |
| Latest per-commit roborev check | `roborev wait --sha d3efbc442494c5ed1ffbdc4e623060f5e744d04c --quiet`               | passed                                                                  |
| Latest branch roborev review    | `roborev show 34` for `637f8b172fb153197223841500d6f32418061173..d3efbc442494c5...` | passed; no issues found                                                 |

## Review Resolution Notes

- roborev job `3` was addressed by commit `a440557`, which added the missing
  Kata instruction reference, ignore rules, and TOML Prettier exclusions.
- roborev job `9` was addressed by commit `ed9a1c6`, which added the missing
  roborev runtime ignore and documented review-plane integration.
- roborev job `12` was addressed by commit `9c767ae`; the `rg` fallback was
  fixed and the manifest-writing path received regression coverage.
- roborev job `22` was addressed by commit `95687e1`, which added the missing
  architecture-level sandbox and remote execution summary.
- roborev job `25` was addressed by commits `3f03af2` and `8f3e7a7`, which
  removed positional `node -e` argument dependence and formatted the test.
- roborev job `29` was addressed by commit `0b4850c`, which preserves
  `started_at` when refreshing an existing run manifest.
- roborev job `31` was addressed by commit `d3efbc4`, which guards missing
  manifest paths and keeps manifest creation coverage separate from refresh
  coverage.

roborev jobs `19` and `21` failed at the runner/tool layer because the
Antigravity headless agent lacked read-file permission. No global agent profile
was changed. The same commit was reviewed by a Codex fallback in job `22`, and
later Gemini per-commit plus branch reviews passed.
