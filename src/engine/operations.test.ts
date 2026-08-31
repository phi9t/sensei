import { describe, expect, it } from 'vitest';
import {
  deriveOperations,
  operationNotationKey,
  parseOperationId,
  predecessorsOf,
} from './operations';
import type { OperationId } from './types';
import { makeConfig } from '../test/factories';

describe('deriveOperations', () => {
  it('orders by stage, then F before B, then microbatch', () => {
    const config = makeConfig();
    const operations = deriveOperations(config);
    const ids = operations.map((op) => op.id);
    expect(ids).toEqual(['F:0:0', 'B:0:0', 'F:1:0', 'B:1:0']);
  });

  it('orders within a stage by kind then microbatch', () => {
    const config = makeConfig({ microbatchCount: 2 });
    const operations = deriveOperations(config);
    const ids = operations.map((op) => op.id);
    expect(ids).toEqual(['F:0:0', 'F:0:1', 'B:0:0', 'B:0:1', 'F:1:0', 'F:1:1', 'B:1:0', 'B:1:1']);
  });

  it('does not derive W operations for fused backward levels', () => {
    const config = makeConfig({ microbatchCount: 2 });
    const ids = deriveOperations(config).map((op) => op.id);

    expect(ids).not.toContain('W:0:0');
    expect(ids).toHaveLength(config.stageCount * config.microbatchCount * 2);
  });

  it('derives W operations only when split backward is enabled', () => {
    const config = makeConfig({
      durations: { F: 1, B: 1, W: 1 },
      operationModel: { backward: 'split' },
    });

    expect(deriveOperations(config).map((op) => op.id)).toEqual([
      'F:0:0',
      'B:0:0',
      'W:0:0',
      'F:1:0',
      'B:1:0',
      'W:1:0',
    ]);
  });

  it('uses rank equal to stage in V1', () => {
    const config = makeConfig();
    const operations = deriveOperations(config);
    expect(operations.map((op) => op.rank)).toEqual([0, 0, 1, 1]);
  });

  it('derives wrap topology ranks while preserving logical operation IDs', () => {
    const config = makeConfig({
      rankCount: 2,
      stageCount: 4,
      microbatchCount: 1,
      topology: { placement: 'wrap', virtualStagesPerRank: 2 },
    });

    expect(deriveOperations(config).map(({ id, stage, rank }) => ({ id, stage, rank }))).toEqual([
      { id: 'F:0:0', stage: 0, rank: 0 },
      { id: 'B:0:0', stage: 0, rank: 0 },
      { id: 'F:1:0', stage: 1, rank: 1 },
      { id: 'B:1:0', stage: 1, rank: 1 },
      { id: 'F:2:0', stage: 2, rank: 0 },
      { id: 'B:2:0', stage: 2, rank: 0 },
      { id: 'F:3:0', stage: 3, rank: 1 },
      { id: 'B:3:0', stage: 3, rank: 1 },
    ]);
  });

  it('derives v-shape topology ranks while preserving logical operation IDs', () => {
    const config = makeConfig({
      rankCount: 2,
      stageCount: 4,
      microbatchCount: 1,
      topology: { placement: 'v-shape', virtualStagesPerRank: 2 },
    });

    expect(deriveOperations(config).map(({ id, stage, rank }) => ({ id, stage, rank }))).toEqual([
      { id: 'F:0:0', stage: 0, rank: 0 },
      { id: 'B:0:0', stage: 0, rank: 0 },
      { id: 'F:1:0', stage: 1, rank: 1 },
      { id: 'B:1:0', stage: 1, rank: 1 },
      { id: 'F:2:0', stage: 2, rank: 1 },
      { id: 'B:2:0', stage: 2, rank: 1 },
      { id: 'F:3:0', stage: 3, rank: 0 },
      { id: 'B:3:0', stage: 3, rank: 0 },
    ]);
  });

  it('derives DualPipe operations with explicit direction-bearing IDs', () => {
    const config = makeConfig({
      rankCount: 2,
      stageCount: 2,
      microbatchCount: 1,
      dualPipeModel: {
        enabled: true,
        directions: ['asc', 'desc'],
        resourceModel: { directionalSlots: 1, sharedCapacity: 2 },
      },
    });

    expect(
      deriveOperations(config).map(({ id, stage, rank, direction }) => ({
        id,
        stage,
        rank,
        direction,
      })),
    ).toEqual([
      { id: 'F:0:0:asc', stage: 0, rank: 0, direction: 'asc' },
      { id: 'B:0:0:asc', stage: 0, rank: 0, direction: 'asc' },
      { id: 'F:0:0:desc', stage: 0, rank: 0, direction: 'desc' },
      { id: 'B:0:0:desc', stage: 0, rank: 0, direction: 'desc' },
      { id: 'F:1:0:asc', stage: 1, rank: 1, direction: 'asc' },
      { id: 'B:1:0:asc', stage: 1, rank: 1, direction: 'asc' },
      { id: 'F:1:0:desc', stage: 1, rank: 1, direction: 'desc' },
      { id: 'B:1:0:desc', stage: 1, rank: 1, direction: 'desc' },
    ]);
  });

  it('uses configured durations', () => {
    const config = makeConfig();
    const operations = deriveOperations(config);
    expect(operations.map((op) => op.duration)).toEqual([1, 2, 1, 2]);
  });

  it('uses stage-specific duration overrides before base durations', () => {
    const config = makeConfig({
      rankCount: 2,
      stageCount: 2,
      microbatchCount: 2,
      durationOverrides: [{ kind: 'B', stage: 0, duration: 4 }],
    });

    const durationsById = Object.fromEntries(
      deriveOperations(config).map((operation) => [operation.id, operation.duration]),
    );

    expect(durationsById).toMatchObject({
      'F:0:0': 1,
      'F:0:1': 1,
      'B:0:0': 4,
      'B:0:1': 4,
      'F:1:0': 1,
      'B:1:0': 2,
    });
  });

  it('applies duration overrides by logical stage, not physical rank', () => {
    const config = makeConfig({
      rankCount: 2,
      stageCount: 4,
      microbatchCount: 1,
      topology: { placement: 'v-shape', virtualStagesPerRank: 2 },
      durationOverrides: [{ kind: 'B', stage: 3, duration: 5 }],
    });

    expect(
      deriveOperations(config).map(({ id, rank, duration }) => ({ id, rank, duration })),
    ).toEqual([
      { id: 'F:0:0', rank: 0, duration: 1 },
      { id: 'B:0:0', rank: 0, duration: 2 },
      { id: 'F:1:0', rank: 1, duration: 1 },
      { id: 'B:1:0', rank: 1, duration: 2 },
      { id: 'F:2:0', rank: 1, duration: 1 },
      { id: 'B:2:0', rank: 1, duration: 2 },
      { id: 'F:3:0', rank: 0, duration: 1 },
      { id: 'B:3:0', rank: 0, duration: 5 },
    ]);
  });

  it('handles multi-rank ordering', () => {
    const config = makeConfig({ rankCount: 3, stageCount: 3 });
    const operations = deriveOperations(config);
    const ids = operations.map((op) => op.id);
    expect(ids).toEqual(['F:0:0', 'B:0:0', 'F:1:0', 'B:1:0', 'F:2:0', 'B:2:0']);
  });

  it('freezes each operation and the operations array', () => {
    const config = makeConfig();
    const operations = deriveOperations(config);
    expect(Object.isFrozen(operations)).toBe(true);
    for (const op of operations) {
      expect(Object.isFrozen(op)).toBe(true);
    }
  });

  it('throws on invalid config before deriving operations', () => {
    expect(() => deriveOperations({ ...makeConfig(), stageCount: 0 })).toThrow(
      /stageCount must be/,
    );
  });
});

describe('operationNotationKey', () => {
  it('uses D to mark the data or microbatch segment in compact operation labels', () => {
    expect(operationNotationKey(['F', 'B'])).toBe('(F/B, stage_id, data_id)');
    expect(operationNotationKey(['F', 'B', 'W'])).toBe('(F/B/W, stage_id, data_id)');
  });
});

describe('parseOperationId', () => {
  it('parses valid IDs', () => {
    expect(parseOperationId('F:0:0')).toEqual({ kind: 'F', stage: 0, microbatch: 0 });
    expect(parseOperationId('B:1:2')).toEqual({ kind: 'B', stage: 1, microbatch: 2 });
    expect(parseOperationId('W:2:3')).toEqual({ kind: 'W', stage: 2, microbatch: 3 });
    expect(parseOperationId('F:99:99')).toEqual({ kind: 'F', stage: 99, microbatch: 99 });
    expect(parseOperationId('F:1:2:desc')).toEqual({
      kind: 'F',
      stage: 1,
      microbatch: 2,
      direction: 'desc',
    });
  });

  it('rejects leading-zero forms', () => {
    expect(() => parseOperationId('F:01:0')).toThrow(/Invalid operation ID/);
    expect(() => parseOperationId('F:0:01')).toThrow(/Invalid operation ID/);
    expect(() => parseOperationId('B:00:0')).toThrow(/Invalid operation ID/);
    expect(() => parseOperationId('F:1:00')).toThrow(/Invalid operation ID/);
    expect(() => parseOperationId('F:0:0:up' as OperationId)).toThrow(/Invalid operation ID/);
  });

  it('rejects malformed IDs', () => {
    expect(() => parseOperationId('bad-id' as OperationId)).toThrow();
    expect(() => parseOperationId('X:0:0' as OperationId)).toThrow();
    expect(() => parseOperationId('F:0:' as OperationId)).toThrow();
    expect(() => parseOperationId('F::0' as OperationId)).toThrow();
  });
});

describe('predecessorsOf', () => {
  const config = makeConfig();
  const splitConfig = makeConfig({
    durations: { F: 1, B: 1, W: 1 },
    operationModel: { backward: 'split' },
  });

  it('F:1:0 depends on F:0:0 (forward previous-stage)', () => {
    expect(predecessorsOf('F:1:0', config)).toEqual(['F:0:0']);
  });

  it('B:1:0 depends on F:1:0 (backward same-stage forward)', () => {
    expect(predecessorsOf('B:1:0', config)).toEqual(['F:1:0']);
  });

  it('split W depends on same-stage input-gradient B', () => {
    expect(predecessorsOf('W:1:0', splitConfig)).toEqual(['B:1:0']);
  });

  it('split B keeps input-gradient dependencies independent from W', () => {
    expect(predecessorsOf('B:0:0', splitConfig)).toEqual(['F:0:0', 'B:1:0']);
  });

  it('rejects W predecessors for fused backward levels', () => {
    expect(() => predecessorsOf('W:0:0', config)).toThrow(/not valid for fused backward levels/);
  });

  it('B:0:0 depends on F:0:0 and B:1:0 (backward next-stage)', () => {
    expect(predecessorsOf('B:0:0', config)).toEqual(['F:0:0', 'B:1:0']);
  });

  it('F:0:0 has no predecessors (first stage)', () => {
    expect(predecessorsOf('F:0:0', config)).toEqual([]);
  });

  it('B:0:0 only depends on F:0:0 when it is the last stage', () => {
    const singleRank = makeConfig({ rankCount: 1, stageCount: 1 });
    expect(predecessorsOf('B:0:0', singleRank)).toEqual(['F:0:0']);
  });

  it('B:1:1 under 3 stages/2 batches depends on [F:1:1, B:2:1]', () => {
    const config3 = makeConfig({ rankCount: 3, stageCount: 3, microbatchCount: 2 });
    expect(predecessorsOf('B:1:1', config3)).toEqual(['F:1:1', 'B:2:1']);
  });

  it('keeps virtual-stage dependencies on logical stage order', () => {
    const config = makeConfig({
      rankCount: 2,
      stageCount: 4,
      topology: { placement: 'v-shape', virtualStagesPerRank: 2 },
    });

    expect(predecessorsOf('F:2:0', config)).toEqual(['F:1:0']);
    expect(predecessorsOf('B:1:0', config)).toEqual(['F:1:0', 'B:2:0']);
    expect(predecessorsOf('B:3:0', config)).toEqual(['F:3:0']);
  });

  it('uses opposite stage flow for desc DualPipe dependencies', () => {
    const config = makeConfig({
      rankCount: 3,
      stageCount: 3,
      dualPipeModel: {
        enabled: true,
        directions: ['asc', 'desc'],
        resourceModel: { directionalSlots: 1, sharedCapacity: 2 },
      },
    });

    expect(predecessorsOf('F:1:0:asc', config)).toEqual(['F:0:0:asc']);
    expect(predecessorsOf('F:1:0:desc', config)).toEqual(['F:2:0:desc']);
    expect(predecessorsOf('B:1:0:asc', config)).toEqual(['F:1:0:asc', 'B:2:0:asc']);
    expect(predecessorsOf('B:1:0:desc', config)).toEqual(['F:1:0:desc', 'B:0:0:desc']);
  });

  it('adds explicit cross-direction dependencies without inferring visual pairs', () => {
    const config = makeConfig({
      rankCount: 2,
      stageCount: 2,
      dualPipeModel: {
        enabled: true,
        directions: ['asc', 'desc'],
        resourceModel: { directionalSlots: 1, sharedCapacity: 2 },
        crossDirectionDependencies: [{ from: 'B:0:0:asc', to: 'F:1:0:desc' }],
      },
    });

    expect(predecessorsOf('F:1:0:desc', config)).toEqual(['B:0:0:asc']);
    expect(predecessorsOf('F:0:0:desc', config)).toEqual(['F:1:0:desc']);
  });

  it('produces deterministic order without duplicates', () => {
    const config3 = makeConfig({ rankCount: 3, stageCount: 3, microbatchCount: 2 });
    const preds = predecessorsOf('B:0:0', config3);
    expect(new Set(preds).size).toBe(preds.length);
    expect(preds).toEqual(['F:0:0', 'B:1:0']);
  });

  it('validates stage is within config bounds', () => {
    expect(() => predecessorsOf('F:5:0' as OperationId, config)).toThrow();
  });

  it('validates microbatch is within config bounds', () => {
    expect(() => predecessorsOf('F:0:5' as OperationId, config)).toThrow();
  });

  it('mentions stageCount not rankCount in stage bounds error', () => {
    expect(() => predecessorsOf('F:5:0' as OperationId, config)).toThrow(/stageCount/);
  });

  it('throws on invalid config before checking dependencies', () => {
    expect(() => predecessorsOf('F:0:0', { ...makeConfig(), stageCount: 0 })).toThrow(
      /stageCount must be/,
    );
  });
});
