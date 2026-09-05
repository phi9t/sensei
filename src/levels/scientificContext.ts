import type { AlgorithmFamily, LevelConfig } from '../engine/types';

interface ScientificContext {
  readonly title: string;
  readonly url: string;
  readonly locator: string;
  readonly mechanism: string;
  readonly boundary: string;
}

const gpipe: ScientificContext = {
  title: 'GPipe',
  url: 'https://arxiv.org/abs/1811.06965v5',
  locator: 'Huang et al. · 2019 · batch splitting and pipeline execution',
  mechanism: 'A batch is split into microbatches that traverse sequential model partitions.',
  boundary:
    'This lesson models the operation order. Recomputation, communication, gradient accumulation buffers and optimizer steps are omitted.',
};
const megatron: ScientificContext = {
  title: 'Efficient Large-Scale Language Model Training on GPU Clusters Using Megatron-LM',
  url: 'https://arxiv.org/abs/2104.04473v5',
  locator: 'Narayanan et al. · 2021 · pipeline scheduling',
  mechanism:
    'Warmup, alternating forward/backward work and virtual stages change pipeline utilization and activation residency.',
  boundary:
    'Reference orders are Sensei heuristics. Ragged microbatch rounds and stage costs are local exercises, not a reproduction of Megatron runtime scheduling.',
};
const blocks: ScientificContext = {
  title: 'Pipeline Parallelism with Controllable Memory',
  url: 'https://arxiv.org/abs/2405.15362v4',
  locator: 'Qi et al. · v4 · §2–3, building blocks and V-shaped placement',
  mechanism:
    'Repeated operation offsets and stage placement trade activation lifetimes against pipeline gaps.',
  boundary:
    'A valid local pattern does not establish V-Min, V-Half or V-ZB equivalence. Paper memory formulas require their stated split-gradient, placement and timing assumptions.',
};
const grouped: ScientificContext = {
  title: 'Breadth-First Pipeline Parallelism',
  url: 'https://arxiv.org/abs/2211.05953',
  locator: 'Lamy-Poirier · MLSys 2023 · pipeline and sharded data parallelism',
  mechanism: 'Grouping work can reuse gathered parameters across microbatches.',
  boundary:
    'This is a group-order and residency exercise. It omits data-parallel ranks, collective bandwidth, gradient reduction and optimizer state; it does not predict training throughput.',
};

export const SCIENTIFIC_CONTEXT: Readonly<Record<AlgorithmFamily, ScientificContext>> = {
  foundations: gpipe,
  gpipe,
  'one-f-one-b': megatron,
  'interleaved-one-f-one-b': megatron,
  'building-block': blocks,
  'zero-bubble': {
    title: 'Zero Bubble Pipeline Parallelism',
    url: 'https://arxiv.org/abs/2401.10241v1',
    locator: 'Qi et al. · 2024 · §2 and §4, split backward and optimizer synchronization',
    mechanism:
      'Input-gradient work advances the backward dependency chain; weight-gradient work can be deferred to fill idle time.',
    boundary:
      'H1/H2/deep references here are local warmup heuristics, not verified reproductions of the paper schedules. Zero internal idle excludes fill/drain and does not establish zero end-to-end training bubble. Optimizer synchronization is omitted.',
  },
  grouped,
  'fsdp-residency': grouped,
  dualpipe: {
    title: 'DeepSeek-V3 Technical Report',
    url: 'https://arxiv.org/html/2412.19437v2#S3.SS2.SSS1',
    locator: 'DeepSeek-AI · 2025 · §3.2.1, DualPipe',
    mechanism:
      'Bidirectional scheduling overlaps compatible forward/backward computation and communication phases.',
    boundary:
      'Sensei uses abstract directional slots and shared capacity. It does not model GPU kernels, expert communication, parameter duplication or measured overlap durations. Slot utilization is not GPU utilization.',
  },
};

export function scientificContextFor(level: LevelConfig): ScientificContext {
  return level.topology?.placement === 'v-shape'
    ? blocks
    : SCIENTIFIC_CONTEXT[level.algorithm.family];
}
