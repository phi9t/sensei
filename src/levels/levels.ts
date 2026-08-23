import type { AlgorithmLevelMetadata, LevelConfig, MasteryTarget } from '../engine/types';

export const LEVEL_IDS = [
  'dependency-chain',
  'fill-the-pipe',
  'backward-is-heavier',
  'memory-wall',
  'gpipe-afab',
  'warm-up-then-alternate',
  'tie-at-the-frontier',
  'memory-capped-one-f-one-b',
  'stamp-the-pattern',
  'virtual-stages',
] as const;

export type LevelId = (typeof LEVEL_IDS)[number];

function freezeTargets(targets: readonly MasteryTarget[]): readonly MasteryTarget[] {
  return Object.freeze(targets.map((target) => Object.freeze({ ...target })));
}

function freezeAlgorithm(metadata: AlgorithmLevelMetadata): AlgorithmLevelMetadata {
  return Object.freeze({
    ...metadata,
    introducedModel: Object.freeze([...metadata.introducedModel]),
  });
}

function freezeBuildingBlock(
  buildingBlock: NonNullable<LevelConfig['buildingBlock']>,
): NonNullable<LevelConfig['buildingBlock']> {
  return Object.freeze({
    ...buildingBlock,
    plan: Object.freeze({
      ...buildingBlock.plan,
      trajectory: Object.freeze(
        buildingBlock.plan.trajectory.map((operation) => Object.freeze({ ...operation })),
      ),
    }),
  });
}

function freezeTopology(
  topology: NonNullable<LevelConfig['topology']>,
): NonNullable<LevelConfig['topology']> {
  return Object.freeze({ ...topology });
}

function freezeLevel(config: LevelConfig): LevelConfig {
  const { buildingBlock, topology, ...baseConfig } = config;
  const frozen = {
    ...baseConfig,
    durations: Object.freeze({ ...config.durations }),
    memoryCaps: config.memoryCaps === null ? null : Object.freeze([...config.memoryCaps]),
    masteryTargets: freezeTargets(config.masteryTargets),
    coaching: Object.freeze({ ...config.coaching }),
    algorithm: freezeAlgorithm(config.algorithm),
    ...(buildingBlock ? { buildingBlock: freezeBuildingBlock(buildingBlock) } : {}),
    ...(topology ? { topology: freezeTopology(topology) } : {}),
  } satisfies LevelConfig;

  return Object.freeze(frozen);
}

const LEVELS_BY_ID: Readonly<Record<LevelId, LevelConfig>> = Object.freeze({
  'dependency-chain': freezeLevel({
    id: 'dependency-chain',
    version: 1,
    title: 'Dependency Chain',
    rankCount: 2,
    stageCount: 2,
    microbatchCount: 1,
    durations: { F: 1, B: 2 },
    memoryCaps: null,
    masteryTargets: [
      { metric: 'makespan', op: '<=', value: 6 },
      { metric: 'intentionalIdle', op: '<=', value: 0 },
    ],
    coaching: { readySet: false, suggest: false, auto: false },
    algorithm: {
      family: 'foundations',
      setTitle: 'Foundations',
      concept: 'Read the dependency chain before placing backward work.',
      objective: 'Finish the only microbatch without inserting idle.',
      patternLabel: null,
      introducedModel: ['forward dependency', 'backward dependency'],
    },
  }),
  'fill-the-pipe': freezeLevel({
    id: 'fill-the-pipe',
    version: 1,
    title: 'Fill the Pipe',
    rankCount: 2,
    stageCount: 2,
    microbatchCount: 3,
    durations: { F: 1, B: 2 },
    memoryCaps: null,
    masteryTargets: [
      { metric: 'makespan', op: '<=', value: 12 },
      { metric: 'intentionalIdle', op: '<=', value: 0 },
    ],
    coaching: { readySet: true, suggest: false, auto: false },
    algorithm: {
      family: 'foundations',
      setTitle: 'Foundations',
      concept: 'Place forward blocks to fill the pipeline before draining it.',
      objective: 'Overlap microbatches while keeping every move legal.',
      patternLabel: 'Fill/Drain',
      introducedModel: ['pipeline fill', 'pipeline drain', 'bubble'],
    },
  }),
  'backward-is-heavier': freezeLevel({
    id: 'backward-is-heavier',
    version: 1,
    title: 'Backward Is Heavier',
    rankCount: 3,
    stageCount: 3,
    microbatchCount: 3,
    durations: { F: 1, B: 2 },
    memoryCaps: null,
    masteryTargets: [
      { metric: 'makespan', op: '<=', value: 15 },
      { metric: 'intentionalIdle', op: '<=', value: 0 },
    ],
    coaching: { readySet: true, suggest: true, auto: false },
    algorithm: {
      family: 'foundations',
      setTitle: 'Foundations',
      concept: 'Backward work is heavier, so the tail dominates sloppy schedules.',
      objective: 'Keep the heavier backward tail short.',
      patternLabel: 'F=1 B=2',
      introducedModel: ['duration asymmetry', 'critical tail'],
    },
  }),
  'memory-wall': freezeLevel({
    id: 'memory-wall',
    version: 1,
    title: 'Memory Wall',
    rankCount: 3,
    stageCount: 3,
    microbatchCount: 4,
    durations: { F: 1, B: 2 },
    memoryCaps: [3, 2, 1],
    masteryTargets: [
      { metric: 'makespan', op: '<=', value: 18 },
      { metric: 'intentionalIdle', op: '<=', value: 0 },
      { metric: 'peakActivationMemory', op: '<=', value: 3 },
    ],
    coaching: { readySet: true, suggest: true, auto: true },
    algorithm: {
      family: 'foundations',
      setTitle: 'Foundations',
      concept: 'Activation memory can block otherwise legal forward work.',
      objective: 'Respect per-rank memory caps without adding idle.',
      patternLabel: 'Memory cap',
      introducedModel: ['activation lifetime', 'memory admission'],
    },
  }),
  'gpipe-afab': freezeLevel({
    id: 'gpipe-afab',
    version: 2,
    title: 'GPipe AFAB',
    rankCount: 3,
    stageCount: 3,
    microbatchCount: 4,
    durations: { F: 1, B: 2 },
    memoryCaps: null,
    masteryTargets: [
      { kind: 'schedule-pattern', pattern: 'afab' },
      { metric: 'makespan', op: '<=', value: 18 },
      { metric: 'intentionalIdle', op: '<=', value: 0 },
      { metric: 'peakActivationMemory', op: '<=', value: 4 },
    ],
    coaching: { readySet: true, suggest: true, auto: true },
    algorithm: {
      family: 'gpipe',
      setTitle: 'GPipe',
      concept: 'Run all forward work first, then drain all backward work.',
      objective: 'Build the AFAB shape and notice the activation memory it holds.',
      patternLabel: 'AFAB',
      introducedModel: ['all-forward/all-backward policy', 'activation accumulation'],
    },
  }),
  'warm-up-then-alternate': freezeLevel({
    id: 'warm-up-then-alternate',
    version: 1,
    title: 'Warm Up Then Alternate',
    rankCount: 3,
    stageCount: 3,
    microbatchCount: 4,
    durations: { F: 1, B: 2 },
    memoryCaps: null,
    masteryTargets: [
      { metric: 'makespan', op: '<=', value: 18 },
      { metric: 'intentionalIdle', op: '<=', value: 0 },
      { metric: 'peakActivationMemory', op: '<=', value: 3 },
    ],
    coaching: { readySet: true, suggest: true, auto: true },
    algorithm: {
      family: 'one-f-one-b',
      setTitle: '1F1B',
      concept: 'Warm up the pipe, then alternate backward and forward work.',
      objective: 'Match GPipe makespan while holding fewer activations.',
      patternLabel: '1F1B',
      introducedModel: ['warmup', 'steady alternation', 'memory reduction'],
    },
  }),
  'tie-at-the-frontier': freezeLevel({
    id: 'tie-at-the-frontier',
    version: 1,
    title: 'Tie at the Frontier',
    rankCount: 2,
    stageCount: 2,
    microbatchCount: 4,
    durations: { F: 1, B: 2 },
    memoryCaps: null,
    masteryTargets: [
      { metric: 'makespan', op: '<=', value: 15 },
      { metric: 'intentionalIdle', op: '<=', value: 0 },
      { metric: 'peakActivationMemory', op: '<=', value: 2 },
    ],
    coaching: { readySet: true, suggest: true, auto: true },
    algorithm: {
      family: 'one-f-one-b',
      setTitle: '1F1B',
      concept: 'When forward and backward are both ready, backward can protect memory.',
      objective: 'Choose the backward move at frontier ties.',
      patternLabel: '1F1B',
      introducedModel: ['ready-set tie', 'backward priority'],
    },
  }),
  'memory-capped-one-f-one-b': freezeLevel({
    id: 'memory-capped-one-f-one-b',
    version: 1,
    title: 'Memory-Capped 1F1B',
    rankCount: 3,
    stageCount: 3,
    microbatchCount: 5,
    durations: { F: 1, B: 2 },
    memoryCaps: [3, 2, 1],
    masteryTargets: [
      { metric: 'makespan', op: '<=', value: 21 },
      { metric: 'intentionalIdle', op: '<=', value: 0 },
      { metric: 'peakActivationMemory', op: '<=', value: 3 },
    ],
    coaching: { readySet: true, suggest: true, auto: true },
    algorithm: {
      family: 'one-f-one-b',
      setTitle: '1F1B',
      concept: 'Memory caps turn backward priority into an admission policy.',
      objective: 'Keep the 1F1B rhythm under a tight last-rank cap.',
      patternLabel: '1F1B + cap',
      introducedModel: ['memory-constrained 1F1B', 'admission pressure'],
    },
  }),
  'stamp-the-pattern': freezeLevel({
    id: 'stamp-the-pattern',
    version: 1,
    title: 'Stamp The Pattern',
    rankCount: 2,
    stageCount: 2,
    microbatchCount: 3,
    durations: { F: 1, B: 2 },
    memoryCaps: null,
    masteryTargets: [
      { metric: 'makespan', op: '<=', value: 12 },
      { metric: 'intentionalIdle', op: '<=', value: 2 },
      { metric: 'peakActivationMemory', op: '<=', value: 2 },
    ],
    coaching: { readySet: true, suggest: true, auto: true },
    algorithm: {
      family: 'building-block',
      setTitle: 'Building Blocks',
      concept: 'Repeat one trajectory across microbatches.',
      objective: 'Validate the pattern, stamp it, and inspect the completed schedule.',
      patternLabel: 'Periodic',
      introducedModel: ['periodic trajectory', 'pattern stamping'],
    },
    buildingBlock: {
      label: 'Two-rank periodic trajectory',
      plan: {
        period: 3,
        trajectory: [
          { operationId: 'F:0:0', offset: 0 },
          { operationId: 'F:1:0', offset: 1 },
          { operationId: 'B:1:0', offset: 2 },
          { operationId: 'B:0:0', offset: 4 },
        ],
      },
    },
  }),
  'virtual-stages': freezeLevel({
    id: 'virtual-stages',
    version: 1,
    title: 'Virtual Stages',
    rankCount: 2,
    stageCount: 4,
    microbatchCount: 2,
    topology: { placement: 'v-shape', virtualStagesPerRank: 2 },
    durations: { F: 1, B: 2 },
    memoryCaps: null,
    masteryTargets: [
      { metric: 'makespan', op: '<=', value: 16 },
      { metric: 'intentionalIdle', op: '<=', value: 0 },
      { metric: 'peakActivationMemory', op: '<=', value: 4 },
    ],
    coaching: { readySet: true, suggest: true, auto: true },
    algorithm: {
      family: 'interleaved-one-f-one-b',
      setTitle: 'Virtual Stages',
      concept: 'One physical rank can own multiple logical stages.',
      objective: 'Follow logical dependencies while placing work on the owning rank lane.',
      patternLabel: 'V-shape',
      introducedModel: ['logical stage', 'physical rank ownership', 'virtual pipeline stage'],
    },
  }),
});

export function getLevel(id: LevelId): LevelConfig {
  const level = LEVELS_BY_ID[id];
  if (!level) {
    throw new Error(`Unknown level: ${String(id)}`);
  }
  return level;
}
