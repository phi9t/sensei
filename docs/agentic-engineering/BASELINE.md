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
