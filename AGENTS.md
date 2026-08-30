<!-- BEGIN KATA (managed by `kata init --with-agents`) -->

## kata issue tracker

This project uses [kata](https://github.com/kenn-io/kata) as its shared issue
ledger. Run `kata quickstart` at the start of each session for the full agent
contract. The short version:

- Search before creating: `kata search "<keywords>" --agent`.
- Prefer updating existing issues over duplicates (`kata comment`, `kata label add`, `kata edit`).
- Default to `--agent` for ordinary reads and mutations; use `--json` only when a script needs structured data.
- Close only verified work: `kata close <ref> --done --message "<scope + verification>" --commit <sha>`.
- If work is incomplete, label `needs-review` and comment what remains rather than closing.
- Never `kata delete` or `kata purge` without explicit user authorization.

## kata work.* conventions (agent orchestration)

When working a kata-tracked issue, keep its `work.*` metadata truthful
(see https://katatracker.com/operations/agent-orchestration/ for the full recipe):

- On claim/start: `kata meta set <ref> work.attention ok`; if the work has a
  dedicated branch, stamp it once with `kata meta set <ref> work.branch <branch>`.
- Signal live state: `kata meta set <ref> work.attention stuck|needs-human|ok`
  plus a one-line `work.attention_msg` saying why. Raise `stuck` when you cannot
  proceed, `needs-human` when you want review; clear back to `ok` when unblocked.
- Never stop with the signal stale: close the issue, or leave the attention
  pair reflecting the hand-off.
- Coordinators read `work.*` on issues they delegated; only the working agent
  writes them. `work.*` on closed issues is meaningless.

<!-- END KATA -->

# Agent Operating Contract

This repository uses a human-controlled agentic engineering workflow. Scale
agent execution, not agent authority.

## Instruction Precedence

1. Direct human instruction
2. Repository-specific instructions in this file
3. Approved spec and implementation plan
4. Applicable skills
5. Agent defaults

## Required Reading

- `CONSTITUTION.md`
- `docs/agentic-engineering/WORKFLOW.md`
- `docs/agentic-engineering/COMMANDS.md`
- Applicable design and implementation plan
- Current Kata issue

## Task Ledger

Kata is the system of record for work intent and status. Do not create a
private Markdown checklist as a substitute. Claim work before mutation and close
only with commit and test evidence.

## Mandatory Skills

| Skill                            | Trigger                                           | Required behavior                                               |
| -------------------------------- | ------------------------------------------------- | --------------------------------------------------------------- |
| `using-superpowers`              | Start of every agent session                      | Inspect available skills before acting                          |
| `using-git-worktrees`            | Before repository mutation                        | Detect existing isolation; create or reuse a safe worktree      |
| `writing-plans`                  | Approved multi-step requirements exist            | Produce exact files, interfaces, tests, commands, and commits   |
| `executing-plans`                | Bootstrap plan execution                          | Execute the bootstrap sequentially with checkpoints             |
| `brainstorming`                  | Future architectural/new-subsystem work           | Explore alternatives and obtain human design approval           |
| `test-driven-development`        | Any behavior change or script logic               | RED -> verify failure -> GREEN -> verify pass -> refactor       |
| `systematic-debugging`           | Any unexpected result or failed check             | Root-cause investigation before proposing a fix                 |
| `requesting-code-review`         | After each logical task and before finish         | Independent review against exact requirements                   |
| `receiving-code-review`          | Review feedback arrives                           | Verify technical claims; do not accept or reject performatively |
| `verification-before-completion` | Before commit, task closure, PR, or success claim | Fresh full evidence before assertions                           |
| `subagent-driven-development`    | Future approved plan with separable tasks         | Fresh sequential implementer per task plus independent review   |
| `dispatching-parallel-agents`    | Two or more independent read-only investigations  | No overlapping mutation ownership                               |
| `finishing-a-development-branch` | All work and reviews pass                         | Human selects PR, local merge, or preserved branch              |

If three attempted fixes fail on the same root problem, apply
`systematic-debugging` again and question the architecture before patching more.

## Git Isolation

- Never implement on `master` or any detected base branch.
- One writer per worktree.
- Do not modify another agent's worktree.
- Preserve existing user work.
- Never reset, amend, force-push, or destructively clean without explicit
  authority.
- Use `.worktrees/` for repo-local trusted worktrees; it is ignored.
- Stage explicit paths only. Do not use blanket `git add .`.

## Test-First Changes

Behavior changes require a failing test observed before implementation.
Exceptions require explicit human authority. Configuration-only and
documentation-only changes are verified by formatting, linting, script smoke
tests, and review.

## Commit Protocol

Every task commit must contain:

```text
Kata: kata#<short-id>
```

Commits must be small enough for independent review. Do not combine unrelated
cleanup.

## roborev Protocol

Every commit must receive roborev review. A failed review blocks task closure.
Address exact review IDs; do not indiscriminately fix all open reviews.

Use `gemini` as the configured independent reviewer on this host. `claude` is
installed but currently fails roborev health checks because its OAuth token is
expired; `codex` is the primary coding-agent family for this session.

## Completion Gate

Before claiming completion:

1. Run `scripts/agentic/check-full`.
2. Run `scripts/agentic/review-branch`.
3. Inspect the final diff.
4. Close Kata with commit and test evidence.
5. Leave merge, push, deploy, publish, and worktree cleanup to the human unless
   explicitly authorized.

## Prohibited Actions

- Merge any branch.
- Push unless a task explicitly authorizes a pull request.
- Force-push.
- Deploy, publish, release, or tag.
- Alter branch protection.
- Add or rotate remote secrets.
- Use `sudo`.
- Rewrite, amend, or squash existing commits.
- Run `git reset --hard`, `git clean -fdx`, or destructive checkout commands.
- Discard, stash, overwrite, or relocate pre-existing user work.
- Remove another agent's worktree.
- Enable a daemon that comments on or mutates external repositories.
- Expose SSH agents, cloud credentials, Kubernetes credentials, or host home
  directories inside an untrusted execution sandbox.

## Durable Learning

Put stable project guidance here or in linked repository documentation. Do not
rely on private model memory. Turn a repeated specialized workflow into a
reviewed skill only after it has repeated.

## Sensei-Specific Rules

### Clean-Room Boundary

- Sensei is a clean-room implementation inspired by
  `ezyang/pipeline-parallelism-tutor`; do not copy upstream source, fixtures,
  HTML/CSS, screenshots, wording, palette, or presentation assets.
- Preserve the documented boundary in `README.md` and
  `docs/clean-room-audit.md`.
- Treat research notes as evidence and design context, not permission to vendor
  upstream implementation text.

### Engine Truth

- Keep scheduling semantics in the pure engine. React renders state; it does
  not redefine legality, scoring, or memory behavior.
- Prefer these engine contracts over duplicated logic:
  - `deriveOperations(config)`
  - `predecessorsOf(operationId, config)`
  - `initialState(config)`
  - `classifyMoves(state)`
  - `applyAction(state, action)`
  - `replay(config, actions)`
  - `score(state)`
- Generated schedules and solver/oracle output must replay through `replay`
  before being trusted.
- Keep `Action[]` as the durable learner artifact.

### Scheduling Model

- Operation notation is `(F/B/W, stage_id, micro_batch_id)`. UI labels may use
  compact forms such as `F0:S1:B2` when space is tight.
- Treat split `W` activation release, DualPipe resources, and residency models
  as explicit model boundaries. Do not silently approximate them in generic
  scheduling code.
- For "best schedule" claims, state the objective: makespan, peak activation
  memory, all-gather count, idle, action count, lexicographic ranking, or Pareto
  frontier.
- Keep exact oracles small and bounded. Use offline optimizer export for hard
  shared-resource cases instead of adding browser runtime solver dependencies.

### UI And Learning Surface

- Keep the main game surface focused on placing blocks.
- Avoid visible rule dumps in the primary play area; put explanation in compact
  guidance, inspectors, or docs.
- Preserve a compact cockpit layout: level guide, ready queue, thin controls,
  large schedule board, and score/inspector rail.
- Use terminal-friendly ASCII diagrams in docs and explanations when they make
  schedules, tensors, or collectives clearer.

### Documentation

- Put implementation plans under `docs/superpowers/plans/`.
- Put design specs under `docs/superpowers/specs/`.
- Put research synthesis and evidence notes under `docs/research/`.
- Mark claim strength clearly: source evidence, executable contract,
  interpretation, simulator boundary, or missing evidence.
