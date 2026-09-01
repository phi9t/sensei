# Sensei Optimizer Model Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a stable offline optimizer model export for pipeline scheduling
without adding a solver dependency to Sensei.

**Architecture:** `src/engine/optimizerModel.ts` derives operations and
dependencies from existing engine APIs, then serializes resources, activation
memory events, objective metadata, and horizon bounds. The module is data-only:
it does not choose a schedule and does not duplicate replay legality.

**Tech Stack:** TypeScript, Vitest, existing Sensei engine modules.

---

## File Structure

- Create: `src/engine/optimizerModel.ts`
  - Public export result types and `exportOptimizerModel(config)`.
- Create: `src/engine/optimizerModel.test.ts`
  - Focused tests for ordinary, split-backward, DualPipe, and residency
    boundaries.
- Create: `docs/superpowers/specs/2026-08-26-sensei-optimizer-model-export.md`
  - Contract and model semantics.
- Create: `docs/superpowers/plans/2026-08-26-sensei-optimizer-model-export.md`
  - This executable implementation plan.
- Do not modify: `src/components/PipelineLessonPanel.tsx`.

## Task 1: Write Optimizer Export Tests

**Files:**

- Create: `src/engine/optimizerModel.test.ts`

- [x] **Step 1: Add imports and result helper**

  ```ts
  import { describe, expect, it } from 'vitest';
  import { getLevel } from '../levels/levels';
  import { makeConfig } from '../test/factories';
  import { exportOptimizerModel, type OptimizerModelExportResult } from './optimizerModel';

  function expectModel(result: OptimizerModelExportResult) {
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(`unexpected optimizer model export failure: ${result.reason.kind}`);
    }
    return result.model;
  }
  ```

- [x] **Step 2: Add ordinary interval model test**

  Verify the default two-stage level exports:

  ```text
  operations: F:0:0, B:0:0, F:1:0, B:1:0
  dependencies: F:0:0 -> F:1:0, F:0:0 -> B:0:0, F:1:0 -> B:1:0, B:1:0 -> B:0:0
  resources: rank:0, rank:1
  timeHorizon: lowerBound 6, upperBound 6
  activation events: F acquires, B releases
  ```

- [x] **Step 3: Add split backward memory-event test**

  Verify split backward exports `W` operations and activation release events on
  `W`, not `B`.

- [x] **Step 4: Add DualPipe resource test**

  Verify a DualPipe level exports shared rank resources and direction-specific
  rank resources, and that each directional operation consumes both.

- [x] **Step 5: Add residency unsupported test**

  Verify residency returns:

  ```ts
  {
    ok: false,
    reason: {
      kind: 'unsupported-residency',
      detail: 'Residency requires stateful cache and eviction variables, not only intervals.',
    },
  }
  ```

- [x] **Step 6: Run the focused test and confirm failure**

  Run:

  ```bash
  npm test -- src/engine/optimizerModel.test.ts
  ```

  Expected before implementation: fail because `optimizerModel.ts` does not
  exist.

## Task 2: Implement Export Types And Static Model

**Files:**

- Create: `src/engine/optimizerModel.ts`

- [x] **Step 1: Add public types**

  Define `OptimizerModel`, `OptimizerOperation`, `OptimizerDependency`,
  `OptimizerResource`, `OptimizerResourceRequirement`,
  `OptimizerActivationMemoryModel`, `OptimizerObjectiveTerm`,
  `OptimizerTimeHorizon`, and `OptimizerModelExportResult`.

- [x] **Step 2: Add operation and dependency export helpers**

  Use:

  ```ts
  deriveOperations(config);
  predecessorsOf(operation.id, config);
  ```

  to ensure exported IDs, stages, ranks, durations, directions, and dependency
  edges match current engine semantics.

- [x] **Step 3: Add rank-resource export helpers**

  Ordinary levels export `rank:${rank}` resources with capacity 1. DualPipe
  levels export `rank:${rank}:shared` plus
  `rank:${rank}:direction:${direction}` resources, using capacities from
  `dualPipeModel.resourceModel`.

- [x] **Step 4: Add activation memory model**

  Export rank-local activation constraints and operation-end events. `F`
  produces `+1`; fused `B` produces `-1`; split `W` produces `-1`.

- [x] **Step 5: Add objective and horizon helpers**

  Export objective metadata in `attemptRankingTuple` order. Export
  `upperBound = sum(operation.duration)` and
  `lowerBound = max(resource work bound, critical path bound)`.

- [x] **Step 6: Add residency guard**

  Return structured `unsupported-residency` because cache-state and eviction
  variables need a separate model.

## Task 3: Verify And Review

**Files:**

- Modify: `docs/superpowers/plans/2026-08-26-sensei-optimizer-model-export.md`

- [x] **Step 1: Run focused tests**

  Run:

  ```bash
  npm test -- src/engine/exactOracle.test.ts src/engine/optimizerModel.test.ts
  ```

  Expected: pass.

- [x] **Step 2: Run typecheck**

  Run:

  ```bash
  npm run typecheck
  ```

  Expected: pass.

- [ ] **Step 3: Run full verification**

  Run:

  ```bash
  npm run verify
  ```

  Expected: pass.

- [ ] **Step 4: Post-execution review**

  Confirm:

  ```text
  The export uses engine-derived operations and dependencies.
  The module has no solver/runtime dependency.
  Residency is intentionally unsupported.
  Any CP-SAT/MILP runner remains offline/dev tooling.
  ```
