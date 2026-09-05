# Scientific UI evidence and boundaries

Reviewed 2026-09-04. This document separates source evidence, executable local
contracts, and missing fidelity evidence. No source implementation, figures,
visual assets, or fixtures were copied. Preserve the clean-room audit.

| Primary source                                                                                                                                     | Supported mechanism                                                                                                         | Local boundary                                                                                                       |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| [GPipe v5](https://arxiv.org/abs/1811.06965v5), batch splitting                                                                                    | Microbatches traverse sequential model partitions                                                                           | No recomputation or optimizer/communication timing                                                                   |
| [Megatron-LM v5](https://arxiv.org/abs/2104.04473v5), pipeline scheduling                                                                          | Composition of parallelism and interleaved pipeline scheduling                                                              | Local reference heuristics and ragged-round exercises are not runtime reproductions                                  |
| [Zero Bubble v1](https://arxiv.org/abs/2401.10241v1), split backward                                                                               | Input and parameter gradients can be scheduled separately; optimizer synchronization also matters to end-to-end zero bubble | H1/H2/deep policy names are not backed by paper-equivalence tests; internal idle excludes fill/drain                 |
| [Controllable Memory v4](https://arxiv.org/abs/2405.15362v4), §2–3                                                                                 | Building blocks, repetition and placement trade memory against bubbles                                                      | A valid authored pattern alone does not establish V-Min/V-Half/V-ZB fidelity; see the existing paper notes           |
| [Breadth-First Pipeline Parallelism](https://arxiv.org/abs/2211.05953), MLSys 2023                                                                 | Pipeline and fully sharded data parallelism can be combined                                                                 | Local grouping/residency omits DP ranks, reductions, bandwidth, optimizer state and transient allocations            |
| [DeepSeek-V3 v2 §3.2.1](https://arxiv.org/html/2412.19437v2#S3.SS2.SSS1) and [author DualPipe repository](https://github.com/deepseek-ai/DualPipe) | Bidirectional scheduling and compatible computation–communication overlap                                                   | Abstract slots are not GPU compute capacity; model omits kernel phases, communication time and duplicated parameters |

## Executable contracts

The local engine remains the authority for F/B/W dependencies, resource
compatibility, activation release and replay legality. The UI labels its stored
activation convention explicitly: F end to B/W end, one abstract unit. It does
not claim to implement the paper's full activation-lifespan accounting.

Weight residency timeline effects now occur at F start, matching the requirement
that weights are available before the operation. Gather duration remains zero.
Tests cover acquisition after idle, reuse, rank-specific current memory/caps,
and split W release. These tests establish local behavior, not hardware accuracy.

The comparison chart replays the reference with its own projected configuration.
For the DualPipe balance fixture, the learner schedule takes 9 ticks and the
capacity-one baseline takes 18. Replaying the baseline with capacity two would
silently change the experiment; a regression test prevents that.

`tests/scientific-ui.test.tsx` covers source disclosure, model qualifications,
semantic colors, reachable operation controls, selection geometry, memory labels,
and reference rendering. Existing engine and game-flow suites remain in place.
The former CSS-source regex tests encoded the old dimensions and palette and
were replaced with these behavior checks plus real browser layout measurement.

## Missing evidence

Paper-accurate H1/H2/interleaved/BF-PP order reproduction, full tensor memory,
communication resources, optimizer synchronization and real training speedups
remain unverified or outside the model. New claims need independently authored,
source-anchored fixtures and a clearly stated objective before being advertised.

## Browser verification

Measured on the final UI: 1280×720 foundations board top 357.9px; queue content
height equals its visible height. At 390×844, document width equals viewport
width and all operation targets are at least 44px tall. Checked completed
foundations, split-gradient, residency, virtual-stage and DualPipe fixtures.
The reference chart reports an 18-tick capacity-one baseline for the 9-tick
DualPipe balance example. The residency table separates weights from stored
activation peaks and gives each rank its own cap.

## Learn-and-practice follow-up

The primary source and a reading question are now prominent immediately below
the timeline. Every curriculum family has independently written concept prose,
a conceptual algorithm walkthrough and a practice prompt. The dependency trace
uses `predecessorsOf` and placement times from the current replay. Direction is
part of each bidirectional trace label. Inspecting a gate updates the same
selection as the timeline and inspector without placing work.

Sources rechecked for the walkthroughs: GPipe §2/Figure 2; Megatron-LM
§2.2.1–2.2.2/Figure 4; Zero Bubble §2/Figure 3 and §4; Controllable Memory §2–3;
BF-PP §4/Appendix C; DeepSeek-V3 §3.2.1/Figures 4–5. The Zero Bubble arXiv v1
locator uses 2024. Strategies are conceptual, not paper-exact ordering claims.

The bubble derivation reads `score` and explains the distinction between unused
scheduled capacity and a paper's bubble-to-ideal-compute ratio. Empty runs do
not show a percentage; partial runs are visibly provisional. Reading/practice
jump buttons preserve the shared Action[] URL and move keyboard focus.

Browser checks covered 375, 768, 1024 and 1440 CSS-pixel widths, including
completed DualPipe and foundational reading views. No document-level horizontal
overflow was observed. A laptop popup clipping issue was corrected by clamping
its horizontal position; help becomes a bottom sheet on mobile. Temporary
viewport overrides are removed after verification. Native 200% browser zoom
was not verified because the automation surface rejected the zoom shortcuts;
text-spacing overrides were not independently exercised.

`npm run verify` passed 520 tests in 27 files, formatting, lint, typecheck,
production build and offline artifact checks. Additional focused checks cover
the final popup placement/dismissal, direction labels and lesson-change keys.
The new interaction suite covers visible sources for all 25 levels, keyboard
help dismissal, shared selection, score derivation, preserved URLs, completion,
Undo/Redo and next lesson. Axe found no serious or critical violations in the
expanded reading/help state. These checks establish local behavior and
accessibility contracts, not measured learning effectiveness.
