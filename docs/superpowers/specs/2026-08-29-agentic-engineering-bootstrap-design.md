# Agentic Engineering Bootstrap Design

**Status:** Approved for implementation

**Date:** 2026-08-29

**Kata epic:** `kata#m08q`

## Goal

Install a production-grade, human-controlled agentic engineering workflow for
Sensei. The workflow uses Kata as the intent ledger, roborev as the independent
review plane, Git worktrees as the trusted concurrency boundary, Superpowers as
the development methodology, and deterministic repository commands as the
verification spine.

## Detected Repository Stack

Sensei is a TypeScript/React/Vite game:

- Node.js `v24.13.0` and npm `11.7.0`;
- React `19.2.8`;
- Vite `8.2.1`;
- TypeScript project references via `tsc -b`;
- Vitest `4.1.11` with jsdom and Testing Library;
- ESLint and Prettier;
- generated production artifacts under ignored `dist/`.

The canonical commands already exist in `package.json`. The bootstrap adds
wrappers around those commands instead of replacing them.

## Existing Command Entry Points

| Purpose           | Command                 |
| ----------------- | ----------------------- |
| setup             | `npm ci`                |
| formatter check   | `npm run format:check`  |
| lint              | `npm run lint`          |
| typecheck         | `npm run typecheck`     |
| tests             | `npm test`              |
| build             | `npm run build`         |
| full verification | `npm run verify`        |
| release check     | `npm run release:check` |

Tests are local and do not require GPUs, databases, Kubernetes, or remote
services. `npm ci` requires registry access.

## Files To Create Or Modify

- Create `.kata.toml` binding to Kata project `sensei`.
- Create `.roborev.toml` using review agent `gemini`.
- Create `CONSTITUTION.md` copied from `kenn-io/constitution` tag
  `v2026.08.11`.
- Update `AGENTS.md` with the shared operating contract while preserving the
  Kata-managed block.
- Create `CLAUDE.md` as `@AGENTS.md`.
- Create `agentic.toml` with resolved local defaults.
- Create `docs/agentic-engineering/{README,ARCHITECTURE,WORKFLOW,COMMANDS,BASELINE,REMOTE_EXECUTION}.md`.
- Create `scripts/agentic/{lib.sh,doctor,setup,check-fast,check-full,review-branch,new-worktree,task-start,task-finish}`.
- Create `tests/agentic/agentic-scripts.test.mjs`.
- Update `.gitignore` to ignore `.agentic/` and `.roborev/`.
- Update `package.json` with `agentic:*` npm aliases.

## Git Hook Strategy

`core.hooksPath` is unset. In the linked bootstrap worktree, Git resolves
`hooks/post-commit` through the repository common Git directory. `roborev init`
can therefore install a local post-commit hook that applies to this repository's
worktrees, but the hook itself is uncommitted Git metadata.

Existing active hook behavior is absent in the baseline. If future hook managers
appear, roborev must chain instead of replacing them.

## Kata Project Binding

Kata project `sensei` is the system of record for live task state. The bootstrap
creates one epic and nine children:

- `kata#m08q`: bootstrap epic;
- `kata#pxcs`: command and baseline audit;
- `kata#y3v5`: Kata binding;
- `kata#aqva`: operating contract;
- `kata#n5rk`: roborev linkage;
- `kata#6xf9`: deterministic command adapters;
- `kata#19pe`: task lifecycle helpers;
- `kata#871q`: sandbox and remote policy;
- `kata#nxcn`: smoke tests;
- `kata#vkqd`: final verification and handoff.

Every bootstrap commit includes exactly one primary `Kata: kata#<short-id>`
footer unless a commit genuinely satisfies multiple children.

## roborev Reviewer Selection

`roborev check-agents` found `codex` and `gemini` healthy. `claude-code` is
installed through `claude` but currently fails authentication, and Cursor is
blocked by a workspace-trust prompt. The configured review agent is therefore
`gemini`, which is independent from this session's TraeCode/Codex-style primary
implementation harness.

Local roborev review is mandatory. Remote roborev CI remains disabled.

## Trusted And Untrusted Execution

Trusted mode uses one Git worktree per writer and ordinary user permissions.
This is a concurrency boundary only.

Untrusted mode fails closed on this macOS host because `bwrap` is unavailable.
Do not run unknown generated code as though it were sandboxed.

## Runtime Artifacts And Observability

Runtime records go under ignored `.agentic/runs/<kata-id>/manifest.json`.
roborev snapshots go under ignored `.roborev/`. AgentsView is available and can
be used by humans to correlate session cost with Kata IDs, branch names, and run
manifests.

## CI Interaction

This bootstrap does not add remote CI. Existing CI or future CI should call
`scripts/agentic/check-full` only when that does not duplicate an equivalent
existing job. AI review in remote CI requires explicit human authorization.

## Rollback Strategy

The bootstrap is isolated on branch `chore/agentic-engineering-bootstrap` from
base SHA `637f8b172fb153197223841500d6f32418061173`. Human rollback is to reject
or discard this branch. Agents must not delete the branch, remove the worktree,
or reset `master` without explicit authority.

## Acceptance Tests

- `npm ci` is idempotent.
- `npm run agentic:test` passes.
- `scripts/agentic/doctor` exits `0`.
- `scripts/agentic/check-fast` exits `0`.
- `scripts/agentic/check-full` exits `0`.
- `scripts/agentic/review-branch` exits `0`.
- A temporary linked worktree resolves the same Kata project.
- roborev reviews the bootstrap branch without blocking findings.
- No push, merge, deployment, publication, destructive cleanup, or secret change
  occurs.

## Spec Self-Review

- Placeholder scan: no unresolved fill-in markers or reviewer values are
  present.
- Scope check: the design is limited to repo-local workflow, docs, scripts,
  config, hooks, and smoke tests.
- Authority check: integration and external side effects remain human-owned.
- Stack check: every command maps to an existing Sensei npm command or an
  installed local CLI.
