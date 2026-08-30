# Agentic Engineering Architecture

## Repository Stack

Sensei is a private TypeScript web app:

- runtime: Node.js `>=24.13.0`, npm `>=11.7.0`;
- app framework: React 19 and Vite 8;
- tests: Vitest with jsdom and Testing Library;
- formatting: Prettier;
- linting: ESLint with TypeScript and React Hooks rules;
- build: `tsc -b`, `vite build`, and `scripts/generate-service-worker.mjs`.

The existing source boundary remains unchanged: the pure scheduling engine owns
legality, replay, scoring, and generated schedules; React renders engine state.

## Control Planes

| Plane                      | Sensei implementation                              | Authority                                  |
| -------------------------- | -------------------------------------------------- | ------------------------------------------ |
| Intent                     | Kata project `sensei` and `.kata.toml`             | Human plus claimed Kata issues             |
| Design                     | `docs/superpowers/specs/`                          | Human-approved specs and applicable skills |
| Planning                   | `docs/superpowers/plans/`                          | Exact execution plans with verifier steps  |
| Execution                  | Git worktree per writer                            | One trusted writer per branch/worktree     |
| Deterministic verification | `scripts/agentic/*` and existing npm scripts       | Repository toolchain                       |
| Adversarial verification   | roborev with `gemini`                              | Independent review plane                   |
| Observability              | `.agentic/runs/` manifests and optional AgentsView | Local, non-committed evidence              |
| Integration                | Human                                              | Merge, push, release, deploy, cleanup      |

## Kata Binding

`.kata.toml` binds every checkout and linked worktree to project `sensei`. The
bootstrap branch initially allowed Kata to infer the worktree directory name,
then renamed the project to `sensei` so future work does not depend on the
temporary worktree path.

Kata records:

- issue intent and task decomposition;
- ownership and work attention state;
- implementation rulings;
- review findings that require work;
- completion evidence with commit SHA and test command.

## roborev Reviewer

roborev is configured in `.roborev.toml` with:

- `agent = "gemini"`;
- `kata_context.mode = "current"`;
- local snapshots in ignored `.roborev/`;
- review findings hooked back into Kata with labels `roborev` and `from-review`.

The selected reviewer is `gemini` because `roborev check-agents` reported
`gemini` and `codex` healthy, while `claude` failed authentication. The primary
implementation family for this bootstrap is TraeCode/Codex-style, so `gemini`
is the available independent reviewer.

Remote roborev CI is intentionally disabled. Enabling it requires an explicit
human decision because it can comment on external repositories and consume
provider credentials.

## Git Hook Strategy

There is no configured `core.hooksPath` in the bootstrap baseline. In a linked
worktree, `git rev-parse --git-path hooks/post-commit` resolves to the common
repository hook directory under the main checkout's `.git/hooks`.

`roborev init --agent gemini` may install or repair that local post-commit hook.
That hook is local Git metadata, not a committed repository file. Existing hook
behavior must be inspected before and after installation. If a future hook
manager is added, roborev must chain through it rather than replacing it.

## Runtime Artifacts

Committed configuration:

- `.kata.toml`;
- `.roborev.toml`;
- `agentic.toml`.

Ignored runtime state:

- `.agentic/`;
- `.roborev/`;
- `.kata.local.toml`;
- `.worktrees/`;
- generated `dist/`;
- `node_modules/`;
- TypeScript build-info files.

Run manifests live under `.agentic/runs/<kata-id>/manifest.json` and are
machine-readable evidence, not source.

## Rollback

Rollback is ordinary Git review:

1. Keep the bootstrap branch and worktree intact.
2. Inspect the diff against `master`.
3. Revert or discard only this branch if the human rejects the bootstrap.

Do not delete the worktree, force-delete the branch, reset `master`, or remove
Kata project state without explicit human authority.

## Acceptance Tests

The bootstrap is acceptable when:

- `npm ci` is idempotent;
- `scripts/agentic/doctor` exits `0`;
- `scripts/agentic/check-fast` exits `0`;
- `scripts/agentic/check-full` exits `0`;
- `scripts/agentic/review-branch` exits `0`;
- smoke tests in `tests/agentic/agentic-scripts.test.mjs` pass;
- each completed Kata child has commit and test evidence;
- no push, merge, deployment, publication, destructive cleanup, or secret change
  occurred.
