import type { LevelConfig } from './types';

export function validateLevelConfig(config: LevelConfig): void {
  if (config.rankCount <= 0) {
    throw new Error('rankCount must be positive');
  }
  if (config.stageCount <= 0) {
    throw new Error('stageCount must be positive');
  }
  if (config.microbatchCount <= 0) {
    throw new Error('microbatchCount must be positive');
  }
  if (config.durations.F <= 0) {
    throw new Error('F duration must be positive');
  }
  if (config.durations.B <= 0) {
    throw new Error('B duration must be positive');
  }
  if (config.stageCount !== config.rankCount) {
    throw new Error('stageCount must equal rankCount');
  }
  if (config.memoryCaps !== null) {
    if (config.memoryCaps.length !== config.rankCount) {
      throw new Error('memoryCaps length must equal rankCount');
    }
    for (const cap of config.memoryCaps) {
      if (cap < 1) {
        throw new Error('memoryCaps values must be positive');
      }
    }
  }
}
