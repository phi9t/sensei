import type { LevelConfig, Operation, OperationId } from './types';

export function deriveOperations(config: LevelConfig): readonly Operation[] {
  const ops: Operation[] = [];
  const kinds = ['F', 'B'] as const;
  for (let stage = 0; stage < config.stageCount; stage++) {
    for (const kind of kinds) {
      for (let microbatch = 0; microbatch < config.microbatchCount; microbatch++) {
        ops.push({
          id: `${kind}:${stage}:${microbatch}`,
          kind,
          stage,
          rank: stage,
          microbatch,
          duration: config.durations[kind],
        });
      }
    }
  }
  return ops;
}

function parseOperationId(id: OperationId): {
  kind: 'F' | 'B';
  stage: number;
  microbatch: number;
} {
  const match = /^(F|B):(\d+):(\d+)$/.exec(id);
  if (!match) {
    throw new Error(`Invalid operation ID: ${id}`);
  }
  return {
    kind: match[1] as 'F' | 'B',
    stage: Number.parseInt(match[2]!, 10),
    microbatch: Number.parseInt(match[3]!, 10),
  };
}

export function predecessorsOf(id: OperationId, config: LevelConfig): readonly OperationId[] {
  const parsed = parseOperationId(id);

  if (parsed.stage < 0 || parsed.stage >= config.stageCount) {
    throw new Error(
      `Operation ID ${id} stage ${parsed.stage} out of bounds for rankCount ${config.rankCount}`,
    );
  }
  if (parsed.microbatch < 0 || parsed.microbatch >= config.microbatchCount) {
    throw new Error(
      `Operation ID ${id} microbatch ${parsed.microbatch} out of bounds for microbatchCount ${config.microbatchCount}`,
    );
  }

  const result: OperationId[] = [];

  if (parsed.kind === 'F') {
    // F(s,m) depends on F(s-1,m) unless s is first stage
    if (parsed.stage > 0) {
      result.push(`F:${parsed.stage - 1}:${parsed.microbatch}`);
    }
  } else {
    // B(s,m) depends on F(s,m)
    result.push(`F:${parsed.stage}:${parsed.microbatch}`);
    // B(s,m) also depends on B(s+1,m) unless s is last stage
    if (parsed.stage < config.stageCount - 1) {
      result.push(`B:${parsed.stage + 1}:${parsed.microbatch}`);
    }
  }

  return result;
}
