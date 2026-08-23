import type { LevelConfig, PipelineTopologyPlacement } from './types';

const TOPOLOGY_PLACEMENTS = new Set<PipelineTopologyPlacement>(['one-to-one', 'wrap', 'v-shape']);

function isTopologyPlacement(value: string): value is PipelineTopologyPlacement {
  return TOPOLOGY_PLACEMENTS.has(value as PipelineTopologyPlacement);
}

function isFinitePositiveInteger(value: number): boolean {
  return Number.isInteger(value) && Number.isFinite(value) && value > 0;
}

function isFinitePositive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

export function validateLevelConfig(config: LevelConfig): void {
  if (!isFinitePositiveInteger(config.rankCount)) {
    throw new Error('rankCount must be a positive finite integer');
  }
  if (!isFinitePositiveInteger(config.stageCount)) {
    throw new Error('stageCount must be a positive finite integer');
  }
  if (!isFinitePositiveInteger(config.microbatchCount)) {
    throw new Error('microbatchCount must be a positive finite integer');
  }
  if (!isFinitePositive(config.durations.F)) {
    throw new Error('F duration must be a positive finite number');
  }
  if (!isFinitePositive(config.durations.B)) {
    throw new Error('B duration must be a positive finite number');
  }
  if (!isFinitePositiveInteger(config.durations.F)) {
    throw new Error('F duration must be a positive finite integer');
  }
  if (!isFinitePositiveInteger(config.durations.B)) {
    throw new Error('B duration must be a positive finite integer');
  }
  if (config.durations.F !== 1 || config.durations.B !== 2) {
    throw new Error('V1 durations must be F=1 and B=2');
  }

  const topology = config.topology ?? { placement: 'one-to-one' as const, virtualStagesPerRank: 1 };

  if (!isTopologyPlacement(topology.placement)) {
    throw new Error('topology placement must be one-to-one, wrap, or v-shape');
  }
  if (!isFinitePositiveInteger(topology.virtualStagesPerRank)) {
    throw new Error('virtualStagesPerRank must be a positive finite integer');
  }
  if (topology.placement === 'one-to-one') {
    if (topology.virtualStagesPerRank !== 1) {
      throw new Error('one-to-one topology requires virtualStagesPerRank to equal 1');
    }
    if (config.stageCount !== config.rankCount) {
      throw new Error('one-to-one topology requires stageCount to equal rankCount');
    }
  } else {
    if (topology.virtualStagesPerRank <= 1) {
      throw new Error('virtual topology requires virtualStagesPerRank greater than 1');
    }
    if (config.stageCount !== config.rankCount * topology.virtualStagesPerRank) {
      throw new Error(
        'virtual topology requires stageCount to equal rankCount times virtualStagesPerRank',
      );
    }
  }
  if (config.memoryCaps !== null) {
    if (config.memoryCaps.length !== config.rankCount) {
      throw new Error('memoryCaps length must equal rankCount');
    }
    for (const cap of config.memoryCaps) {
      if (!isFinitePositiveInteger(cap)) {
        throw new Error('memoryCaps values must be positive finite integers');
      }
    }
  }
}
