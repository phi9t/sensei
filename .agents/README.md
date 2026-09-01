# Sensei Agentic Engineering Toolkit

This folder contains lightweight local tooling for human-directed agentic
engineering in this repository. It is intentionally repo-local and
provider-neutral.

The workflow is:

```text
intent
  -> spec
  -> adversarial spec review
  -> implementation plan
  -> bounded agent work
  -> verification
  -> review packet
  -> human land/merge
```

Use these files as operating artifacts:

- `templates/intent.md`: durable task intent before design work.
- `templates/spec.md`: behavior contract and boundaries.
- `templates/plan.md`: execution plan with verifier and post-execution review.
- `templates/review.md`: branch-level review packet before landing.
- `../docs/agentic-engineering.md`: full workflow and rules.

Use helper commands from `package.json`:

```bash
npm run agent:status
npm run agent:check
```

`agent:status` prints a concise worktree and artifact overview. `agent:check`
runs formatting on the shared agent docs/templates plus `git diff --check`.
