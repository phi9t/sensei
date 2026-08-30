# Agentic Engineering Workflow

## Intake

Use Kata as the live task ledger:

```bash
kata ready --unowned --agent
kata next --unowned --agent
kata show <ref> --agent
kata claim <ref>
```

Every implementation issue must define:

- objective;
- non-goals;
- acceptance criteria;
- affected interfaces;
- verification commands;
- risk classification.

If a safe reversible decision is needed, record it on the issue:

```text
Ruling: <decision> - <reason> - <cost if wrong>
```

## Isolation

Create one branch and worktree per writing agent:

```bash
scripts/agentic/new-worktree <ref> <slug>
cd <printed-worktree>
scripts/agentic/task-start <ref>
```

Do not implement on `master`. Do not let two writers mutate the same worktree.
Do not use a worktree as a hostile-code sandbox.

## Design Routing

| Work type                                 | Required path                                                 |
| ----------------------------------------- | ------------------------------------------------------------- |
| Explanation, inspection, review           | Read-only; no mutation                                        |
| Small change in an existing flow          | Short design, then TDD                                        |
| New subsystem, interface, or architecture | `brainstorming` -> approved design -> `writing-plans`         |
| Bug or failed test                        | `systematic-debugging` -> reproducing failing test -> TDD     |
| Approved implementation plan              | `executing-plans` or sequential `subagent-driven-development` |
| Independent read-only investigations      | `dispatching-parallel-agents`                                 |

For this bootstrap, use `executing-plans` because Kata setup, instructions,
hooks, scripts, and verification share state.

## Implementation Loop

For each behavioral increment:

1. Write the failing test.
2. Run it and confirm the expected failure.
3. Implement the smallest change.
4. Run the focused test and confirm it passes.
5. Refactor while green.
6. Run `scripts/agentic/check-fast`.
7. Inspect the diff.
8. Commit with a Kata footer.
9. Wait for roborev.
10. Address blocking findings before the next increment.

Commit footer:

```text
Kata: kata#<short-id>
```

## Review

After each logical task, request an independent review with the exact Kata
issue, applicable spec/plan, and diff range. The reviewer does not receive the
implementation agent's full transcript. Critical and important findings block
progress until resolved or technically rebutted.

Local per-commit review:

```bash
SHA="$(git rev-parse HEAD)"
roborev wait --sha "$SHA" --quiet
```

Branch gate:

```bash
scripts/agentic/review-branch
```

Do not run blanket `roborev fix`. Use `roborev fix <specific-review-id>` only
after inspecting a concrete finding.

## Completion

Finish a task from its branch/worktree:

```bash
scripts/agentic/task-finish \
  <ref> \
  --message "<what is now true>" \
  --test "scripts/agentic/check-full"
```

The finish script runs the supplied test command, the full deterministic gate,
and the roborev branch gate before closing Kata with commit and test evidence.

Then use `finishing-a-development-branch`. The human chooses:

1. create a PR;
2. merge locally;
3. preserve the branch/worktree;
4. discard the work after explicit confirmation.

Do not infer this choice.

## Branch Landing

Local merge, push, PR creation, deployment, publication, release tagging,
branch protection changes, secret changes, force-push, and destructive cleanup
remain human-authorized. A passed task-finish gate is a handoff, not merge
permission.
