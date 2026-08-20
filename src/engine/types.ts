export type OperationKind = 'F' | 'B';

export type OperationId = `${OperationKind}:${number}:${number}`;

export interface Operation {
  id: OperationId;
  kind: OperationKind;
  stage: number;
  rank: number;
  microbatch: number;
  duration: number;
}

export interface PlaceOperationAction {
  type: 'place';
  operationId: OperationId;
}

export interface InsertIdleAction {
  type: 'wait';
  rank: number;
}

export type Action = PlaceOperationAction | InsertIdleAction;

export interface MasteryTarget {
  metric: 'makespan' | 'bubbleRatio' | 'intentionalIdle' | 'peakActivationMemory';
  op: '<=';
  value: number;
}

export interface LevelConfig {
  id: string;
  version: number;
  title: string;
  rankCount: number;
  stageCount: number;
  microbatchCount: number;
  durations: Record<OperationKind, number>;
  memoryCaps: readonly number[] | null;
  masteryTargets: readonly MasteryTarget[];
  coaching: { readySet: boolean; suggest: boolean; auto: boolean };
}
