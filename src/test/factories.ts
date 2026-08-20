import type { LevelConfig, OperationId, PlaceOperationAction } from '../engine/types';
import type { ReplayResult, ScheduleState } from '../engine/replay';

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

export function expectState(result: ReplayResult): ScheduleState {
  if (!result.ok) {
    throw new Error(`replay failed at action ${result.index}: ${result.reason.kind}`);
  }
  return result.state;
}
