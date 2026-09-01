# Pipeline Parallelism with Controllable Memory: Sensei Notes

## Provenance

- Paper: Penghui Qi, Xinyi Wan, Nyamdavaa Amar, Min Lin, "Pipeline Parallelism with Controllable Memory," arXiv:2405.15362v4, 2024-11-04.
- Source cap: only `https://arxiv.org/pdf/2405.15362v4` and local Sensei docs/source under `/Users/bytedance/workspace/sensei`.
- Preserved PDF: `docs/research/evidence/2405.15362v4.pdf`, SHA-256 `f0f8068ddfcb34e806a8d1463f802a30eff017c7aa18149b201dab5b40f9b200`.
- Extraction path: fetched the v4 PDF with `curl -L https://arxiv.org/pdf/2405.15362v4`, then extracted text with `pdftotext -layout`; `pdfinfo` reported 21 pages.
- Local Sensei anchors consulted: `README.md`, `src/engine/types.ts`, `src/engine/buildingBlocks.ts`, `src/engine/operations.ts`, `src/engine/policies.ts`, `src/levels/levels.ts`, and the curriculum specs under `docs/superpowers/specs/`.
- Evidence rule: paper claims below cite paper page and section anchors; Sensei implications cite local source paths.

## Material Paper Claims

1. The paper frames pipeline schedules as repetitions of a smaller "building block"; a schedule is formed by laying out passes for one microbatch, repeating the block for more microbatches, squeezing redundant bubbles, and optionally reordering warm-up/cool-down work. (PDF p.2-p.3, Section 2 "How to Build a Pipeline")

2. A building block is defined by three main design factors: model partitioning, device placement, and offsets between `F`, `B`, and `W` passes. The paper follows Zero Bubble notation where `B` is backward for activations and `W` is backward for weights; fused-backward methods can be represented by grouping `B` and `W`. (PDF p.3, Section 2.1)

3. The paper assumes unit-time `F`, `B`, and `W` passes and integer offsets for its main analysis, explicitly trading generality for simpler reasoning about feasible building blocks. (PDF p.3, Section 2.1)

4. Activation lifespan is the time from the start of a stage's `F` pass until the end of its `B` or `W` pass; activation memory is allocated at `F` and retained until consumed by both backward components. (PDF p.3, Section 2.2)

5. Peak activation memory can be computed from building-block lifespan and repeat interval: for one stage, `peak memory <= ceil(l / T) * m`; for multiple stages on a device, the paper sums independent per-stage contributions as Equation 1. (PDF p.3-p.4, Section 2.2)

6. In an efficient pipeline, the repeat interval `T` should equal the units of computation in each stage of the building block: larger `T` creates stable-phase bubbles, while smaller `T` causes collisions. Interleaved 1F1B is called out as a subtle non-uniform-repeat exception. (PDF p.4, Section 2.2; PDF p.19, Appendix G)

7. A valid repeated building block must be collision-free: passes from different repeated blocks cannot overlap. The authors suggest post-hoc collision verification after designing a candidate block, or equivalently constraining a repeating `d x T` stable-phase rectangle. (PDF p.4, Section 2.3)

8. The paper argues existing schedules are often memory inefficient for two reasons: redundant dependency chains, especially when backward is fused, and imbalanced stage lifespans that create a device-level memory bottleneck. (PDF p.4, Section 3)

9. V-Shape building blocks target the imbalance by partitioning the model into twice as many stages as devices and placing the second half of stages in reverse device order, so long-lifespan and short-lifespan stages are collocated. (PDF p.4, Section 3; Figure 2)

10. The controllable-memory construction uses two uniform offset parameters, `delta0` and `delta1`, with balanced constraints across the two halves of `F` and `B` passes. Under uniform partitioning, the asymptotic device peak memory is approximately `((delta0 + delta1) / 6) * M`. (PDF p.5, Section 3.1; Equation 2)

11. The representative V-Shape family spans memory/throughput trade-offs: `V-Min` uses `delta0 = delta1 = 1` and reaches about `M/3` peak memory with about `4d` bubbles; `V-Half` uses `delta0 = 2`, `delta1 = 1` and reaches about `M/2` peak memory with about `3d` bubbles; `V-ZB` uses `delta0 = 4`, `delta1 = 2` and reaches approximately zero bubbles at `M` memory. (PDF p.5-p.6, Sections 3.1-3.2; Table 1)

12. `V-Min` can suffer repeating bubbles in real workloads when `F`, `B`, and `W` runtimes differ; `V-Half` is described as more robust in empirical cases, while `V-ZB` bubbles do not grow with more microbatches. (PDF p.6, Section 3.3; PDF p.17-p.18, Appendix E.1)

13. In experiments on Megatron-LM-style LLM training up to 40 A100 80G GPUs, the authors report that `V-ZB` gives the highest throughput in pure PP comparisons, while `V-Min` and `V-Half` reduce activation memory to about one-third and one-half of 1F1B, respectively. (PDF p.7-p.8, Sections 4.1-4.2; Figures 6-7)

14. Under memory pressure, saving activation memory can be converted into larger microbatch size and higher arithmetic intensity; the paper reports that `V-Half` can surpass `V-ZB` on larger models in those settings, while `V-Min`'s extra bubbles can outweigh its arithmetic-intensity gain. (PDF p.8-p.9, Section 4.3; Figure 8)

15. The adaptive scheduler appendix narrows search to structured offset families rather than exhaustive arbitrary schedules, then repeats the block, checks collision, squeezes, reorders, and selects the candidate with minimal bubbles under a memory limit. (PDF p.11-p.12, Appendix A)

## Extracted Mechanism Vocabulary

- **Building block:** A compact template of per-stage passes for one logical unit of scheduling. Sensei already has the analogous `BuildingBlockPlan` with `period` and `trajectory` in `src/engine/types.ts`.
- **Repeat interval / period (`T`):** The time spacing between stamped block instances. Sensei names this `period` and validates rank occupancy modulo period in `src/engine/buildingBlocks.ts`.
- **Offset:** The time coordinate of a pass inside the block. Sensei stores this as `BuildingBlockOperation.offset`.
- **Collision:** Two stamped passes occupying the same device/rank at the same time. Sensei's current approximation is `duplicate-rank-residue`, which detects repeated modulo-period occupancy before expansion.
- **Squeezing:** Removing redundant gaps without changing pass order. In Sensei terms this is distinct from period validation: expansion currently inserts waits to realize offsets, while replay/classification determines legal earliest starts.
- **Reordering:** Warm-up/cool-down rearrangement that improves throughput without raising stable-phase peak memory. Sensei's current policies are order heuristics; a future implementation should label reordering as a separate phase, not as a different memory law.
- **Lifespan:** The interval from `F` start to activation release at fused `B` or split `W`. Sensei already reflects the release distinction through `releasesActivation(config, kind)` in `src/engine/operations.ts`.
- **Stable phase:** The repeated middle region where the block pattern tiles. This maps to Sensei's use of modulo residues and projected peak memory, but Sensei does not yet expose stable-phase boundaries.
- **V-Shape placement:** A virtual-stage placement where the second half of logical stages maps back over devices in reverse order. Sensei already has `PipelineTopologyPlacement = 'v-shape'` and `virtualStagesPerRank` in `src/engine/types.ts`.
- **Balanced peak memory:** Collocating long-lifespan and short-lifespan stages on the same rank so summed lifespans are similar across ranks. Sensei can teach this with per-rank peak memory and virtual-stage ownership.
- **Controllable memory:** Choosing offsets to target a memory budget. Sensei currently validates a provided plan; it does not yet search or synthesize plans from a target cap.
- **Repeating bubble:** A stable-phase gap that scales with the number of microbatches, not just pipeline depth. Sensei's score reports bubble ratio, but does not currently classify bubble growth as `O(d)` versus `O(n)`.
- **Split backward (`B`/`W`):** Separating input-gradient work from weight-gradient work so activation release moves to `W`. Sensei already supports `OperationKind = 'F' | 'B' | 'W'` and split-backward levels.
- **Adaptive V scheduler:** A constrained offset search under a memory limit. This is a natural future extension of Sensei's building-block validator, but it requires search-space ownership and clear "heuristic, not optimal" labeling.

## Implications For Sensei's Building-Block Engine

1. **Sensei already has the right core abstraction.** The paper's building-block/offset/repeat vocabulary maps directly to `BuildingBlockPlan.period` and `trajectory` in `src/engine/types.ts`, and to validation/expansion in `src/engine/buildingBlocks.ts`. The research note supports keeping building blocks as engine data rather than UI-only lesson prose.

2. **Add lifespan-derived memory accounting as an inspectable concept.** Sensei currently projects peak memory by replay-style activation events in `projectedPeakMemory` (`src/engine/buildingBlocks.ts`). For controllable-memory lessons, the engine can additionally expose per-stage lifespan intervals and per-rank summed lifespan contribution so learners see why a block fits the cap, not just whether it passes.

3. **Separate "period validity" from "schedule compactness."** The paper distinguishes repeating without collision from squeezing redundant bubbles. Sensei's expansion can preserve authored offsets, but future policy comparison should show both the raw stamped schedule and a squeezed equivalent if the order allows it.

4. **V-Shape should become a memory-balance lesson, not just a topology label.** Local levels already use `topology: { placement: 'v-shape', virtualStagesPerRank: 2 }` in `src/levels/levels.ts`. The paper gives that topology a stronger rationale: pair long-lifespan and short-lifespan logical stages on the same physical rank to flatten peak memory.

5. **Controllable-memory variants need offset families.** Rather than hard-coding only `V-Min`, `V-Half`, and `V-ZB`, Sensei can model a small parameterized family with `delta0`, `delta1`, period, and derived plan. The UI should still present this as a compact pattern chip and validation result, consistent with existing cockpit rules.

6. **The current collision checker is a good first gate but not a full paper model.** `duplicate-rank-residue` catches same-rank modulo-period occupancy, and replay catches legal-dependency failures. Paper-style V blocks also need device-placement-aware lifespan summaries, stable-phase bubble classification, and support for non-uniform repeat exceptions such as official interleaved 1F1B.

7. **Split-backward levels are prerequisite for the strongest claims.** The paper's `V-Min`, `V-Half`, and `V-ZB` analysis assumes `F`, `B`, and `W` split semantics. Sensei already has `operationModel: { backward: 'split' }` and `W` levels, so controllable-memory lessons can build on that source surface rather than introducing a new operation model.

8. **Do not present paper schedules as globally optimal.** The paper uses constructive families and constrained search. Sensei's existing policy language in `src/engine/policies.ts` already treats references as heuristics and recognition targets; controllable-memory policies should keep the same "policy-relative" wording.

9. **Expose memory/throughput trade-offs as a Pareto surface.** Sensei scoring already includes makespan, bubble, internal bubble, peak activation memory, and all-gather count. A controllable-memory curriculum can compare `V-Min`, `V-Half`, `V-ZB`, 1F1B, and zero-bubble variants as choices on a memory/bubble frontier instead of as a single best schedule.

10. **Avoid importing system-performance claims directly into game scoring.** The paper's MFU gains depend on Megatron-LM, A100/RDMA hardware, microbatch size, TP/DP/PP grid search, and profiled `F/B/W` runtimes. Sensei can teach the mechanism, but local levels should not claim real MFU improvement unless backed by separate local measurement.

## Open Questions And Limitations

- The paper assumes equal stage compute/memory for the main derivation; Sensei already has nonuniform duration overrides, so controllable-memory lessons need to say when the simple `delta0/delta1` formulas stop matching local scoring.
- The main analysis assumes unit `F/B/W` time and integer offsets; Appendix A allows profiled runtimes in bubble calculation, but Sensei would need an explicit runtime model before teaching adaptive schedules.
- Official interleaved 1F1B has a non-uniform repeat interval in Appendix G. Sensei's current `BuildingBlockPlan.period` is uniform, so representing that schedule exactly may require either a multi-period plan or a normalized equivalent with clear caveats.
- `V-Min`'s repeating bubble can grow with microbatch count under non-equal `F/B/W` runtimes. Sensei should make this a visible failure mode rather than labeling `V-Min` as unconditionally better.
- The paper says V-Shape has doubled communication cost between pipeline stages, while calling it relatively small. Sensei does not currently model stage-to-stage communication, so this trade-off should remain an annotated limitation unless communication is added to the engine.
- The adaptive scheduler is a heuristic constrained search, not exhaustive optimal scheduling. Sensei should expose generated candidates as "best found under this search family," not as optimal schedules.
- The paper's empirical gains are measured in a specific Megatron-LM/A100/RDMA setup. Sensei's local engine is deterministic and pedagogical; throughput labels should remain abstract unless backed by local benchmarks.
- The paper's future-work note suggests continuous offsets or finer discretization for reducing memory further. Sensei currently uses integer ticks, so fractional or sub-tick offsets would be a separate model change with UI and replay implications.
