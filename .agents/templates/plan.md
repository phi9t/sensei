# Implementation Plan

## Objective

<!-- Concrete objective suitable for a coding agent goal. -->

## Inputs

- Intent:
- Spec:
- Relevant files:
- Constraints:

## Work Slices

1.
2.
3.

## Parallelization

Independent sidecar tasks:

-

Critical path tasks:

-

Do not assign overlapping write sets to parallel agents.

## Execution Checklist

- [ ] Read current files before editing.
- [ ] Preserve unrelated user or agent changes.
- [ ] Implement the smallest complete slice.
- [ ] Add or update tests at the risk boundary.
- [ ] Run focused verification.
- [ ] Run broader verification if shared behavior changed.
- [ ] Review diff for unintended scope.
- [ ] Update docs or architecture notes only when they are durable.

## Verifier

Focused checks:

```bash

```

Broad checks:

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run verify
git diff --check
```

## Post-Execution Review

After implementation, answer:

- Did the implementation satisfy the stated objective?
- Did any assumption in the spec turn out false?
- Did verification cover the highest-risk behavior?
- Did the plan cause unnecessary churn or context bloat?
- What should be changed in this plan/template before reusing it?
