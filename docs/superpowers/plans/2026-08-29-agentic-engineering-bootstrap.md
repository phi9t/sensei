# Agentic Engineering Bootstrap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish Kata-backed intent, roborev-backed review, worktree isolation, deterministic command adapters, and human-owned integration for Sensei.

**Architecture:** Keep the app untouched. Add repo-local operating contracts, machine-readable configuration, command adapters around existing npm gates, smoke tests, and documentation. Use Kata for live state and roborev for independent branch review.

**Tech Stack:** Node.js `v24.13.0`, npm `11.7.0`, TypeScript, React, Vite, Vitest, Bash, Kata `v0.14.3`, roborev `v0.64.0`.

---

## Task 1: Record Baseline And Kata Binding

**Files:**

- Create: `.kata.toml`
- Modify: `.gitignore`
- Create: `docs/agentic-engineering/BASELINE.md`
- Create: `docs/agentic-engineering/COMMANDS.md`
- Create: `docs/superpowers/specs/2026-08-29-agentic-engineering-bootstrap-design.md`
- Create: `docs/superpowers/plans/2026-08-29-agentic-engineering-bootstrap.md`

- [x] **Step 1: Create the isolated bootstrap worktree**

Run:

```bash
git worktree add .worktrees/agentic-engineering-bootstrap \
  -b chore/agentic-engineering-bootstrap \
  637f8b172fb153197223841500d6f32418061173
```

Expected: worktree created from clean committed `HEAD`.

- [x] **Step 2: Run setup and full baseline**

Run:

```bash
npm ci
npm run verify
```

Expected: setup passes; full verification passes before bootstrap edits.

- [x] **Step 3: Initialize Kata**

Run:

```bash
export KATA_AUTHOR="traecode@$(hostname -s):agentic-bootstrap"
kata init --with-agents
kata projects rename agentic-engineering-bootstrap sensei
kata init --replace --project sensei --with-agents
kata quickstart --format agent
```

Expected: `.kata.toml` binds to project `sensei`; Kata guidance is present.

- [x] **Step 4: Create epic and child issues**

Create `kata#m08q` plus children `pxcs`, `y3v5`, `aqva`, `n5rk`, `6xf9`,
`19pe`, `871q`, `nxcn`, and `vkqd`.

- [x] **Step 5: Verify linked worktree project resolution**

Run:

```bash
tmp=".worktrees/kata-binding-smoke"
git worktree add "$tmp" --detach HEAD
kata --workspace "$tmp" list --agent
git worktree remove "$tmp"
```

Expected: temporary worktree resolves project `sensei`.

- [x] **Step 6: Commit**

Run:

```bash
git add .kata.toml .gitignore docs/agentic-engineering/BASELINE.md \
  docs/agentic-engineering/COMMANDS.md \
  docs/superpowers/specs/2026-08-29-agentic-engineering-bootstrap-design.md \
  docs/superpowers/plans/2026-08-29-agentic-engineering-bootstrap.md
git commit -m "chore(agentic): bind repository to Kata" \
  -m "Record Sensei's bootstrap baseline, command map, and Kata project binding." \
  -m "Kata: kata#y3v5"
```

Expected: commit succeeds.

## Task 2: Install Repository Operating Contract

**Files:**

- Create: `CONSTITUTION.md`
- Modify: `AGENTS.md`
- Create: `CLAUDE.md`
- Create: `docs/agentic-engineering/README.md`
- Create: `docs/agentic-engineering/ARCHITECTURE.md`
- Create: `docs/agentic-engineering/WORKFLOW.md`
- Create: `docs/agentic-engineering/REMOTE_EXECUTION.md`

- [x] **Step 1: Vendor the pinned constitution**

Copy `CONSTITUTION.md` from `kenn-io/constitution` tag `v2026.08.11`,
peeled commit `48df1551c31fbbb783560e11006b61a43ef897fe`.

Expected: provenance and attribution remain in the file.

- [x] **Step 2: Merge root agent instructions**

Update `AGENTS.md` to keep the Kata-managed block and add the Sensei operating
contract, mandatory skills table, Git isolation rules, commit protocol, roborev
protocol, prohibited actions, and Sensei-specific clean-room/engine/UI/docs
rules.

- [x] **Step 3: Add Claude adapter**

Create `CLAUDE.md` containing:

```markdown
@AGENTS.md
```

- [x] **Step 4: Add workflow documentation**

Create the `docs/agentic-engineering/` docs listed above.

- [x] **Step 5: Verify formatting**

Run:

```bash
npx prettier --check CONSTITUTION.md AGENTS.md CLAUDE.md docs/agentic-engineering/*.md
```

Expected: all files match Prettier formatting.

- [x] **Step 6: Commit**

Run:

```bash
git add CONSTITUTION.md AGENTS.md CLAUDE.md docs/agentic-engineering/README.md \
  docs/agentic-engineering/ARCHITECTURE.md docs/agentic-engineering/WORKFLOW.md \
  docs/agentic-engineering/REMOTE_EXECUTION.md
git commit -m "chore(agentic): add repository operating contract" \
  -m "Install the shared agent contract, constitution mirror, and Sensei workflow docs." \
  -m "Kata: kata#aqva"
```

Expected: commit succeeds.

## Task 3: Configure roborev Review Plane

**Files:**

- Create: `.roborev.toml`
- Modify: `.gitignore`
- Update: `docs/agentic-engineering/ARCHITECTURE.md`
- Update: `docs/agentic-engineering/WORKFLOW.md`

- [x] **Step 1: Resolve review agent**

Run:

```bash
roborev check-agents
```

Expected: `gemini` and `codex` healthy; configure `gemini`.

- [x] **Step 2: Write `.roborev.toml`**

Use `agent = "gemini"`, `snapshot_dir = ".roborev"`, `kata_context.mode =
"current"`, and a Kata review hook with labels `roborev` and `from-review`.

- [x] **Step 3: Initialize roborev hook**

Run:

```bash
roborev init --agent gemini
roborev status
```

Expected: daemon reachable and post-commit hook installed.

- [x] **Step 4: Verify hook content**

Run:

```bash
hook="$(git rev-parse --git-path hooks/post-commit)"
test -x "$hook"
grep -n 'roborev post-commit' "$hook"
```

Expected: hook invokes roborev.

- [x] **Step 5: Commit**

Run:

```bash
git add .roborev.toml .gitignore docs/agentic-engineering/ARCHITECTURE.md \
  docs/agentic-engineering/WORKFLOW.md
git commit -m "chore(agentic): configure task-aware roborev reviews" \
  -m "Configure local roborev branch review with Kata context and ignored snapshots." \
  -m "Kata: kata#n5rk"
```

Expected: commit succeeds and post-commit roborev review is enqueued.

## Task 4: Add Deterministic Command And Lifecycle Adapters

**Files:**

- Create: `agentic.toml`
- Create: `scripts/agentic/lib.sh`
- Create: `scripts/agentic/doctor`
- Create: `scripts/agentic/setup`
- Create: `scripts/agentic/check-fast`
- Create: `scripts/agentic/check-full`
- Create: `scripts/agentic/review-branch`
- Create: `scripts/agentic/new-worktree`
- Create: `scripts/agentic/task-start`
- Create: `scripts/agentic/task-finish`
- Modify: `package.json`

- [x] **Step 1: Write failing smoke tests**

Create `tests/agentic/agentic-scripts.test.mjs` and run:

```bash
npx vitest run tests/agentic/agentic-scripts.test.mjs
```

Expected failure before implementation: missing scripts/config/docs.

- [x] **Step 2: Add command adapters and config**

Add executable Bash scripts and `agentic.toml` with actual values:

- `base_branch = "master"`;
- `worktree_root = ".worktrees"`;
- `runtime_root = ".agentic"`;
- `review_agent = "gemini"`.

- [x] **Step 3: Add npm aliases**

Run:

```bash
npm pkg set scripts.agentic:doctor="scripts/agentic/doctor" \
  scripts.agentic:setup="scripts/agentic/setup" \
  scripts.agentic:check-fast="scripts/agentic/check-fast" \
  scripts.agentic:check-full="scripts/agentic/check-full" \
  scripts.agentic:review-branch="scripts/agentic/review-branch" \
  scripts.agentic:test="vitest run tests/agentic/agentic-scripts.test.mjs"
```

- [x] **Step 4: Verify focused smoke tests pass**

Run:

```bash
npm run agentic:test
```

Expected: all agentic smoke tests pass.

- [x] **Step 5: Verify fast gate**

Run:

```bash
scripts/agentic/check-fast
```

Expected: formatter, lint, typecheck, and tests pass.

- [x] **Step 6: Commit**

Run:

```bash
git add agentic.toml scripts/agentic package.json tests/agentic/agentic-scripts.test.mjs
git commit -m "chore(agentic): add deterministic task lifecycle commands" \
  -m "Add command adapters, lifecycle helpers, npm aliases, and smoke coverage." \
  -m "Kata: kata#6xf9"
```

Expected: commit succeeds and roborev review is enqueued.

## Task 5: Final Verification, Review, And Handoff

**Files:**

- Update: `docs/agentic-engineering/BASELINE.md`
- Update: `docs/superpowers/plans/2026-08-29-agentic-engineering-bootstrap.md`
- Kata issue comments and closures

- [x] **Step 1: Run doctor**

Run:

```bash
scripts/agentic/doctor
```

Expected: exits `0`.

- [x] **Step 2: Run full deterministic gate**

Run:

```bash
scripts/agentic/check-full
```

Expected: exits `0`.

- [x] **Step 3: Run roborev branch gate**

Run:

```bash
scripts/agentic/review-branch
```

Expected: exits `0`. If it fails, inspect exact findings with `roborev show`,
use `receiving-code-review`, and address valid blocking items.

- [x] **Step 4: Backfill review for earlier commits**

Run:

```bash
roborev review --branch --base master --wait --quiet
```

Expected: all bootstrap commits pass review.

- [ ] **Step 5: Close completed Kata children**

Run `kata close` for each completed child with commit and test evidence. Leave
any blocked external-only work open with a concrete comment.

- [x] **Step 6: Append post-execution review**

Append a section below with:

- plan mismatches found during execution;
- tool-version surprises;
- verification evidence;
- any plan changes that future agents should inherit.

- [ ] **Step 7: Final handoff**

Run:

```bash
git status --porcelain=v1 -uall
git log --oneline --decorate master..HEAD
```

Expected: branch is preserved, nothing pushed, nothing merged.

## Verifier

Required verifier before success claim:

```bash
npm run agentic:test
scripts/agentic/doctor
scripts/agentic/check-fast
scripts/agentic/check-full
scripts/agentic/review-branch
git status --porcelain=v1 -uall
```

## Post-Execution Review

### What Changed From The Initial Plan

- Kata `v0.14.3` does not support `kata quickstart --format contract`; this
  bootstrap used `kata quickstart --format agent` and recorded the ruling in
  Kata.
- The worktree path caused Kata to infer `agentic-engineering-bootstrap` as the
  project name at first. The project was renamed and rebound to `sensei` so
  the committed `.kata.toml` is repository-oriented instead of
  worktree-oriented.
- `roborev --version` and `kata --version` are not valid on the installed tool
  versions. The repository adapters and docs use `roborev version` and
  `kata version`.
- `npx prettier --check .` cannot parse the committed TOML files or the pinned
  constitution mirror in this repository setup, so `.prettierignore` excludes
  `.kata.toml`, `.roborev.toml`, `agentic.toml`, and `CONSTITUTION.md`.
- Headless Gemini/Antigravity roborev failed for two jobs when global
  read-file permissions were unavailable. The bootstrap did not edit global
  agent profiles; it used a bounded Codex fallback review for the affected
  commit and later passed Gemini per-commit and branch reviews.

### Review-Driven Improvements

- roborev job `3` identified missing Kata binding support files. Commit
  `a440557` added `AGENTS.md`, `.gitignore`, and `.prettierignore`.
- roborev job `9` identified missing roborev review-plane documentation and
  ignore rules. Commit `ed9a1c6` added them.
- roborev job `12` identified an `rg` availability failure path in
  `scripts/agentic/doctor`. Commit `9c767ae` added a `grep` fallback.
- roborev job `22` identified that architecture docs needed the sandbox and
  remote execution summary, not only the dedicated remote execution doc. Commit
  `95687e1` added that summary.
- roborev jobs `25`, `29`, and `31` hardened run-manifest behavior: the helper
  now avoids positional `node -e` argument dependence, preserves `started_at`
  when refreshing manifests, guards missing manifest paths, and keeps creation
  and refresh smoke coverage separate.

### Verification Evidence

Before the final evidence commit, the bootstrap passed:

```bash
npm run agentic:test
scripts/agentic/doctor
scripts/agentic/check-fast
scripts/agentic/check-full
scripts/agentic/review-branch
```

The latest implementation-head evidence was:

- `npm run agentic:test`: 1 file passed, 8 tests passed.
- `scripts/agentic/doctor`: exited `0`.
- `scripts/agentic/check-fast`: format, lint, typecheck, and 22 Vitest files /
  442 tests passed.
- `scripts/agentic/check-full`: `npm run verify`, production build, and
  `git diff --check` passed.
- `scripts/agentic/review-branch`: reran the full gate and passed roborev
  branch review.
- `roborev show 34`: branch range
  `637f8b172fb153197223841500d6f32418061173..d3efbc442494c5ed1ffbdc4e623060f5e744d04c`
  had no review findings.

The final handoff must rerun the verifier after committing this evidence
update, because this section itself changes the branch head.

### Future Plan Improvements

- Prefer environment variables or JSON files over `node -e` positional
  arguments in Bash helpers. It is easier to review and avoids runtime-version
  assumptions.
- Treat committed evidence docs as pre-final snapshots unless they are written
  after all repository changes. The live handoff and Kata closure should carry
  the final head SHA and final verifier output.
- Keep review-generated Kata issues open until the fixing commit has both
  deterministic evidence and a passing roborev review. Then close both the
  review record and the Kata issue explicitly.
