# Sensei Agentic Engineering

Sensei uses a human-controlled agentic engineering workflow:

```text
human intent -> Kata issue -> spec/plan -> isolated worktree -> code/tests/docs
             -> deterministic checks -> roborev review -> human integration
```

The goal is execution bandwidth without handing agents integration authority.
Kata records live intent and state. Git worktrees isolate writers. Repository
scripts provide deterministic checks. roborev provides an independent review
plane. Humans keep authority over merge, push, deployment, publication,
destructive cleanup, and credentials.

## Start Here

1. Read `AGENTS.md`.
2. Inspect the current Kata issue with `kata show <ref> --agent`.
3. Create an isolated worktree with `scripts/agentic/new-worktree <ref> <slug>`.
4. Run `scripts/agentic/task-start <ref>` inside that worktree.
5. Use the workflow in `docs/agentic-engineering/WORKFLOW.md`.
6. Finish with `scripts/agentic/task-finish <ref> --message "<what changed>" --test "scripts/agentic/check-full"`.

## Documents

- `ARCHITECTURE.md` describes the planes and authority boundaries.
- `WORKFLOW.md` describes task intake, implementation, review, and completion.
- `COMMANDS.md` maps repository checks to deterministic command adapters.
- `BASELINE.md` records the bootstrap preflight and tool versions.
- `REMOTE_EXECUTION.md` defines trusted and untrusted execution rules.
