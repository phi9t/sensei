import type { LevelConfig, Operation, OperationId, OperationKind } from './types';
import { validateLevelConfig } from './config';
import { ownerRankForStage } from './topology';

export function durationForOperation(
  config: LevelConfig,
  kind: OperationKind,
  stage: number,
): number {
  const override = config.durationOverrides?.find(
    (candidate) => candidate.kind === kind && candidate.stage === stage,
  );
  const duration = override?.duration ?? config.durations[kind];
  if (duration === undefined) {
    throw new Error(`No duration configured for ${kind} operations`);
  }
  return duration;
}

export function isSplitBackwardLevel(config: LevelConfig): boolean {
  return (config.operationModel?.backward ?? 'fused') === 'split';
}

export function operationKindsForLevel(config: LevelConfig): readonly OperationKind[] {
  return isSplitBackwardLevel(config) ? (['F', 'B', 'W'] as const) : (['F', 'B'] as const);
}

export function releasesActivation(config: LevelConfig, kind: OperationKind): boolean {
  return isSplitBackwardLevel(config) ? kind === 'W' : kind === 'B';
}

export function deriveOperations(config: LevelConfig): readonly Operation[] {
  validateLevelConfig(config);
  const ops: Operation[] = [];
  const kinds = operationKindsForLevel(config);
  for (let stage = 0; stage < config.stageCount; stage++) {
    for (const kind of kinds) {
      for (let microbatch = 0; microbatch < config.microbatchCount; microbatch++) {
        ops.push(
          Object.freeze({
            id: `${kind}:${stage}:${microbatch}`,
            kind,
            stage,
            rank: ownerRankForStage(config, stage),
            microbatch,
            duration: durationForOperation(config, kind, stage),
          }),
        );
      }
    }
  }
  return Object.freeze(ops);
}

export function parseOperationId(id: OperationId): {
  kind: OperationKind;
  stage: number;
  microbatch: number;
} {
  const match = /^(F|B|W):(0|[1-9]\d*):(0|[1-9]\d*)$/.exec(id);
  if (!match) {
    throw new Error(`Invalid operation ID: ${id}`);
  }
  return {
    kind: match[1] as OperationKind,
    stage: Number.parseInt(match[2]!, 10),
    microbatch: Number.parseInt(match[3]!, 10),
  };
}

export function predecessorsOf(id: OperationId, config: LevelConfig): readonly OperationId[] {
  validateLevelConfig(config);
  const parsed = parseOperationId(id);

  if (parsed.stage < 0 || parsed.stage >= config.stageCount) {
    throw new Error(
      `Operation ID ${id} stage ${parsed.stage} out of bounds for stageCount ${config.stageCount}`,
    );
  }
  if (parsed.microbatch < 0 || parsed.microbatch >= config.microbatchCount) {
    throw new Error(
      `Operation ID ${id} microbatch ${parsed.microbatch} out of bounds for microbatchCount ${config.microbatchCount}`,
    );
  }

  const result: OperationId[] = [];

  if (parsed.kind === 'F') {
    if (parsed.stage > 0) {
      result.push(`F:${parsed.stage - 1}:${parsed.microbatch}`);
    }
  } else if (parsed.kind === 'B') {
    result.push(`F:${parsed.stage}:${parsed.microbatch}`);
    if (parsed.stage < config.stageCount - 1) {
      result.push(`B:${parsed.stage + 1}:${parsed.microbatch}`);
    }
  } else {
    if (!isSplitBackwardLevel(config)) {
      throw new Error(`Operation ID ${id} is not valid for fused backward levels`);
    }
    result.push(`B:${parsed.stage}:${parsed.microbatch}`);
  }

  return result;
}
