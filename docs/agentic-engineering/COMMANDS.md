# Agentic Command Map

These adapters wrap the repository's existing commands. They do not replace the
canonical npm scripts in `package.json`.

## Canonical Repository Commands

| Purpose                    | Command                 | Notes                                                                 |
| -------------------------- | ----------------------- | --------------------------------------------------------------------- |
| Setup                      | `npm ci`                | Lockfile-exact install from `package-lock.json`.                      |
| Development server         | `npm run dev`           | Starts Vite for local play.                                           |
| Formatter check            | `npm run format:check`  | Runs `prettier --check .`.                                            |
| Lint                       | `npm run lint`          | Runs `eslint .`.                                                      |
| Typecheck                  | `npm run typecheck`     | Runs `tsc -b --pretty false`.                                         |
| Unit and integration tests | `npm test`              | Runs all Vitest suites, including jsdom UI tests.                     |
| Build                      | `npm run build`         | Runs TypeScript build, Vite build, and service-worker generation.     |
| Full verification          | `npm run verify`        | Runs formatter, lint, typecheck, tests, and build.                    |
| Release check              | `npm run release:check` | Runs `npm ci`, full verification, whitespace check, and status check. |

The test suite runs locally without GPUs, databases, Kubernetes, or remote
services. `npm ci` uses the configured npm registry and is the only bootstrap
command expected to fetch dependencies.

## Agentic Adapters

| Adapter                         | Behavior                                                                                |
| ------------------------------- | --------------------------------------------------------------------------------------- |
| `scripts/agentic/setup`         | Runs `npm ci` and writes setup logs under `.agentic/logs/`.                             |
| `scripts/agentic/check-fast`    | Runs formatter check, lint, typecheck, and tests.                                       |
| `scripts/agentic/check-full`    | Runs `npm run verify` and `git diff --check`.                                           |
| `scripts/agentic/review-branch` | Runs `check-full`, then `roborev review --branch --base master --wait --quiet`.         |
| `scripts/agentic/doctor`        | Checks tools, branch safety, hooks, ignored runtime paths, scripts, and placeholders.   |
| `scripts/agentic/new-worktree`  | Claims a Kata issue, creates a `kata/<id>-<slug>` worktree, runs setup and fast checks. |
| `scripts/agentic/task-start`    | Shows and claims the issue, records branch metadata, and writes a local run manifest.   |
| `scripts/agentic/task-finish`   | Runs completion checks and closes Kata with commit and test evidence.                   |

All adapters resolve the Git root before running and can be called from any
subdirectory.

The TOML configuration files are intentionally listed in `.prettierignore`
because this repository does not configure a Prettier TOML parser. They are
validated by smoke tests, `scripts/agentic/doctor`, and roborev review.

## npm Aliases

```bash
npm run agentic:doctor
npm run agentic:setup
npm run agentic:check-fast
npm run agentic:check-full
npm run agentic:review-branch
npm run agentic:test
```

`npm run agentic:test` runs the smoke tests for the agentic scripts and
configuration:

```bash
vitest run tests/agentic/agentic-scripts.test.mjs
```

## roborev Commands

Local review is mandatory:

```bash
roborev review <sha>
roborev wait --sha <sha> --quiet
roborev review --branch --base master --wait --quiet
roborev show <sha>
roborev compact --wait --quiet
roborev close <review-id>
roborev export reviews --profile metadata
```

Do not run `roborev refine` by default. Do not install global roborev agent
hooks or remote CI unless the human explicitly authorizes that external
mutation.

## AgentsView

AgentsView is optional on this host. When installed, humans can inspect daily
usage and correlate sessions with Kata refs in branch names and run manifests:

```bash
agentsview usage daily --all --json
```
