import type { LevelConfig, OperationId, PlaceOperationAction } from '../engine/types';

export function makeConfig(overrides: Partial<LevelConfig> = {}): LevelConfig {
  return {
    id: 'test',
    version: 1,
    title: 'Test',
    rankCount: 2,
    stageCount: 2,
    microbatchCount: 1,
    durations: { F: 1, B: 2 },
    memoryCaps: null,
    masteryTargets: [],
    coaching: { readySet: true, suggest: false, auto: false },
    ...overrides,
  };
}

export function placeIds(...operationIds: OperationId[]): PlaceOperationAction[] {
  return operationIds.map((operationId) => ({ type: 'place', operationId }));
}
