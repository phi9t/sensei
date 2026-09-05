# Scientific Cockpit Implementation Plan

**Goal:** Make the scheduling surface visually clear and explicit about scientific assumptions.

**Architecture:** Keep replay and scoring authoritative. Add presentation metadata by
algorithm family; derive selection overlays from existing operation dependencies.
Correct residency timeline event timing without changing durable actions.

**Tech stack:** React, TypeScript, SVG, CSS, Vitest, browser verification.

## Work sequence

- [x] Correct `computeWeightResidencyTimelineByRank` in `src/engine/replay.ts`
      to apply effects at `placement.start`; verify idle before acquisition,
      residency during forward work, reuse, and eviction in replay tests.
- [x] Add `src/levels/scientificContext.ts` and a compact disclosure component
      with primary sources and explicit model boundaries for every family.
- [x] Give microbatches stable colors in `operationVisuals.ts` and the tray;
      make SVG patterns transparent over the same categorical fill.
- [x] Reshape `app.css`, keeping queue content reachable, controls compact,
      text readable, and the board dominant on desktop and scrollable on mobile.
- [x] Add predecessor and stored-activation overlays to `ScheduleBoard.tsx`.
      Add an optional replay-validated reference schedule on the same time axis.
- [x] Correct `MetricsPanel.tsx` memory labels and add per-rank residency facts.
- [x] Refresh README, record primary-source evidence and simulator boundaries.
- [x] Run focused tests, then `npm run verify` and `git diff --check`.
      Inspect rendered foundations, split-gradient, residency, and DualPipe
      at desktop and mobile widths. Fix failures before reporting completion.

Implementation proceeds inline under the user's approval of the review direction.

## Verification result

`npm run verify` passed: formatting, lint, TypeScript, 488 tests across 26 files,
production build, and production artifact checks. `git diff --check` passed.

Browser checks covered foundations, split gradients, gathered weights, virtual
stages and DualPipe. At 1280×720 the populated foundations board starts at
357.9px; the queue has no vertical clipping. At 390×844 the document width is
390px and operation targets are 44px tall. The queue and board scroll locally.

The generated `.superpowers/` scratch directory is excluded from formatting;
its two existing mockups were left untouched.
