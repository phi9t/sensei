# Controllable-Memory Schedule Construction Plan

**Goal:** Convert the paper's building-block framework into a Sensei-native
schedule construction mechanism.

**Spec:** `docs/superpowers/specs/2026-08-25-controllable-memory-schedule-mechanism.md`

## Source Boundary

- Primary paper: `https://arxiv.org/pdf/2405.15362v4`.
- Local source: Sensei engine, levels, tests, and existing research docs.
- Do not reuse external implementation code or figures.
- Do not claim hardware throughput from Sensei's deterministic simulator.

## Current Slice

- [x] Fetch and extract the arXiv v4 PDF.
- [x] Create paper research note at
      `docs/research/2026-08-25-controllable-memory-paper-notes.md`.
- [x] Add `BuildingBlockAnalysis` domain types.
- [x] Add `analyzeBuildingBlockPlan(config, plan)`.
- [x] Test fused-backward lifespan, split-backward `W` release, collision
      status, and stable-phase bubble detection.

## Verification

Run:

```bash
npm test -- src/engine/buildingBlocks.test.ts
npm run typecheck
npm run format:check
```

If this expands to UI or level catalog changes, also run:

```bash
npm test -- src/components/GameShell.test.tsx tests/responsive-css.test.mjs tests/accessibility.test.tsx
npm run verify
```

## Follow-On Implementation Sequence

1. **UI inspection:** teach `PatternCheck` to show compact analyzer output:
   peak bound, stable bubble, and memory-bottleneck rank.
2. **Authored V-shape levels:** add split-backward `V-Min`, `V-Half`, and
   `V-ZB` building-block lessons with explicit paper-derived caveats.
3. **Squeeze pass:** derive a compact action log that preserves per-rank
   operation order and reports removed idle.
4. **Offset family generator:** build V-shape plans from topology plus
   `delta0`/`delta1` parameters, then validate through the analyzer.
5. **Adaptive search:** search the constrained offset family under memory caps,
   report best-found candidates, and compare against GPipe/1F1B/ZB references.
6. **Non-uniform repeat model:** decide whether official interleaved 1F1B needs
   multi-period plans or a documented uniform-period equivalent.

## Post-Execution Review

- The analyzer is a mechanism, not just prose: it returns data future UI and
  generators can consume.
- Validation remains the gate for executable expansion.
- Lifespan-derived memory is now inspectable without changing gameplay.
- Squeezing, reordering, and adaptive search remain separate future phases,
  which keeps this slice small and verifiable.
