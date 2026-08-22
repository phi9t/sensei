import type { AlgorithmLevelMetadata, LevelConfig, MasteryTarget } from '../engine/types';

export const LEVEL_IDS = [
  'dependency-chain',
  'fill-the-pipe',
  'backward-is-heavier',
  'memory-wall',
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

function freezeLevel(config: LevelConfig): LevelConfig {
  const frozen: LevelConfig = {
    ...config,
    durations: Object.freeze({ ...config.durations }),
    memoryCaps: config.memoryCaps === null ? null : Object.freeze([...config.memoryCaps]),
    masteryTargets: freezeTargets(config.masteryTargets),
    coaching: Object.freeze({ ...config.coaching }),
    algorithm: freezeAlgorithm(config.algorithm),
  };

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
});

export function getLevel(id: LevelId): LevelConfig {
  const level = LEVELS_BY_ID[id];
  if (!level) {
    throw new Error(`Unknown level: ${String(id)}`);
  }
  return level;
}
