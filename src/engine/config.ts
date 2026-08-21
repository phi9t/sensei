import type { LevelConfig } from './types';

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
  if (config.stageCount !== config.rankCount) {
    throw new Error('stageCount must equal rankCount');
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
