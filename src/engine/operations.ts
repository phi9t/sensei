import type {
  LevelConfig,
  Operation,
  OperationId,
  OperationKind,
  PipelineDirection,
} from './types';
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

export function directionsForLevel(config: LevelConfig): readonly PipelineDirection[] {
  return config.dualPipeModel ? config.dualPipeModel.directions : (['asc'] as const);
}

export function releasesActivation(config: LevelConfig, kind: OperationKind): boolean {
  return isSplitBackwardLevel(config) ? kind === 'W' : kind === 'B';
}

export function deriveOperations(config: LevelConfig): readonly Operation[] {
  validateLevelConfig(config);
  const ops: Operation[] = [];
  const kinds = operationKindsForLevel(config);
  const directions = directionsForLevel(config);
  for (let stage = 0; stage < config.stageCount; stage++) {
    for (const direction of directions) {
      for (const kind of kinds) {
        for (let microbatch = 0; microbatch < config.microbatchCount; microbatch++) {
          const id = operationIdFor(config, kind, stage, microbatch, direction);
          ops.push(
            Object.freeze({
              id,
              kind,
              stage,
              rank: ownerRankForStage(config, stage),
              microbatch,
              ...(config.dualPipeModel ? { direction } : {}),
              duration: durationForOperation(config, kind, stage),
            }),
          );
        }
      }
    }
  }
  return Object.freeze(ops);
}

export function parseOperationId(id: OperationId): {
  kind: OperationKind;
  stage: number;
  microbatch: number;
  direction?: PipelineDirection;
} {
  const match = /^(F|B|W):(0|[1-9]\d*):(0|[1-9]\d*)(?::(asc|desc))?$/.exec(id);
  if (!match) {
    throw new Error(`Invalid operation ID: ${id}`);
  }
  return {
    kind: match[1] as OperationKind,
    stage: Number.parseInt(match[2]!, 10),
    microbatch: Number.parseInt(match[3]!, 10),
    ...(match[4] ? { direction: match[4] as PipelineDirection } : {}),
  };
}

export function operationIdFor(
  config: LevelConfig,
  kind: OperationKind,
  stage: number,
  microbatch: number,
  direction: PipelineDirection = 'asc',
): OperationId {
  return config.dualPipeModel
    ? `${kind}:${stage}:${microbatch}:${direction}`
    : `${kind}:${stage}:${microbatch}`;
}

function directionForParsed(
  parsed: ReturnType<typeof parseOperationId>,
  config: LevelConfig,
): PipelineDirection {
  if (config.dualPipeModel) {
    if (!parsed.direction) {
      throw new Error('DualPipe operation IDs must include direction');
    }
    return parsed.direction;
  }
  if (parsed.direction) {
    throw new Error('directional operation IDs require dualPipeModel');
  }
  return 'asc';
}

function previousStage(direction: PipelineDirection, stage: number): number {
  return direction === 'asc' ? stage - 1 : stage + 1;
}

function nextStage(direction: PipelineDirection, stage: number): number {
  return direction === 'asc' ? stage + 1 : stage - 1;
}

function stageExists(stage: number, config: LevelConfig): boolean {
  return stage >= 0 && stage < config.stageCount;
}

export function predecessorsOf(id: OperationId, config: LevelConfig): readonly OperationId[] {
  validateLevelConfig(config);
  const parsed = parseOperationId(id);
  const direction = directionForParsed(parsed, config);

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
    const previous = previousStage(direction, parsed.stage);
    if (stageExists(previous, config)) {
      result.push(operationIdFor(config, 'F', previous, parsed.microbatch, direction));
    }
  } else if (parsed.kind === 'B') {
    result.push(operationIdFor(config, 'F', parsed.stage, parsed.microbatch, direction));
    const next = nextStage(direction, parsed.stage);
    if (stageExists(next, config)) {
      result.push(operationIdFor(config, 'B', next, parsed.microbatch, direction));
    }
  } else {
    if (!isSplitBackwardLevel(config)) {
      throw new Error(`Operation ID ${id} is not valid for fused backward levels`);
    }
    result.push(operationIdFor(config, 'B', parsed.stage, parsed.microbatch, direction));
  }

  for (const edge of config.dualPipeModel?.crossDirectionDependencies ?? []) {
    if (edge.to === id) {
      result.push(edge.from);
    }
  }

  return Object.freeze(result);
}
