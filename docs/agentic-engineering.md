# Agentic Engineering Workflow

This repo uses bounded agent execution with human-owned authority. The goal is
to increase implementation and verification bandwidth without letting agents
silently own product direction, architecture, destructive state changes, or
merge decisions.

## Operating Model

```text
human intent
  -> spec
  -> adversarial spec review
  -> implementation plan
  -> bounded implementation
  -> verification
  -> review packet
  -> human land/merge
```

The constitution for all agents is [`../AGENTS.md`](../AGENTS.md). Claude-style
agents should enter through [`../CLAUDE.md`](../CLAUDE.md), which points to the
same shared instructions.

## Control Planes

| Plane         | Repo tool                                              | Purpose                              |
| ------------- | ------------------------------------------------------ | ------------------------------------ |
| Intent        | `.agents/templates/intent.md`                          | Durable task framing                 |
| Reasoning     | `docs/superpowers/specs/`, `.agents/templates/spec.md` | Behavior contract                    |
| Execution     | `docs/superpowers/plans/`, `.agents/templates/plan.md` | Bounded work plan                    |
| Verification  | npm scripts, tests, `.agents/templates/review.md`      | Evidence and admission               |
| Observability | `npm run agent:status`                                 | Local worktree and artifact overview |
| Human control | explicit staging/commits/merge                         | Authority boundary                   |

## Artifact Lifecycle

Use execution artifacts while they are useful, then distill lasting knowledge
into architecture docs, code, and tests.

```text
scratch notes / discussion
  -> intent
  -> spec
  -> plan
  -> implementation
  -> tests
  -> review packet
  -> durable docs only when the knowledge should guide future work
```

Do not keep every agent trace forever as project guidance. Durable guidance
belongs in `AGENTS.md`, docs, tests, or code comments only when it reduces future
reader load.

## Recommended Flow

1. Start with intent for broad or ambiguous work.
   - Use `.agents/templates/intent.md`.
   - Capture outcome, scope, authority boundaries, and done criteria.
2. Write a spec for behavior-affecting work.
   - Use `.agents/templates/spec.md`.
   - Mark claim strength: `SOURCE`, `EXECUTABLE CONTRACT`, `INTERPRETATION`,
     `SIMULATOR BOUNDARY`, or `MISSING`.
3. Review the spec before implementation.
   - Ask what is ambiguous.
   - Ask what could damage clean-room boundaries or existing user work.
   - Ask what executable check would catch a wrong implementation.
4. Write an implementation plan.
   - Use `.agents/templates/plan.md`.
   - Include focused and broad verification.
   - Split parallel work only when write sets do not overlap.
5. Implement through small slices.
   - Read current files before editing.
   - Keep scheduling semantics in `src/engine`.
   - Keep UI rendering derived from replay/score state.
6. Verify reality.
   - Run focused tests first.
   - Run broader checks for shared behavior.
   - Review the diff for unintended scope.
7. Create a review packet for large changes.
   - Use `.agents/templates/review.md`.
   - Include what changed, evidence, risks, and human decision needed.

## Local Commands

```bash
npm run agent:status
npm run agent:check
```

`agent:status` is a quick local control-plane snapshot. It reports branch,
status, staged/untracked files, recent commits, and available agent templates.

`agent:check` validates the agent docs/templates formatting and checks the diff
for whitespace errors. It is intentionally lighter than `npm run verify`.

Use full gates when implementation changes shared behavior:

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run verify
git diff --check
```

## Sensei Guardrails

- Preserve the clean-room boundary documented in `README.md` and
  `docs/clean-room-audit.md`.
- Keep `Action[]` as the durable learner artifact.
- Generated schedules must replay through `replay(config, actions)`.
- Do not duplicate scheduling legality outside engine contracts unless an
  adapter proves the compressed model is equivalent and tests replay the output.
- State objective and claim strength for schedule optimality claims.
- Keep the play surface focused on block placement; move durable explanation
  into docs or compact inspectors.

## Human-Owned Decisions

Agents may prepare evidence, patches, tests, review packets, and candidate
commits. Humans own:

- product direction;
- broad architectural commitments;
- destructive git operations;
- deployment to live environments;
- final merge/land decisions.
