import { describe, expect, it } from 'vitest';
import { deriveOperations, predecessorsOf } from './operations';
import type { OperationId } from './types';
import { makeConfig } from '../test/factories';

describe('deriveOperations', () => {
  it('orders by stage, then F before B, then microbatch', () => {
    const config = makeConfig();
    const operations = deriveOperations(config);
    const ids = operations.map((op) => op.id);
    expect(ids).toEqual(['F:0:0', 'B:0:0', 'F:1:0', 'B:1:0']);
  });

  it('uses rank equal to stage in V1', () => {
    const config = makeConfig();
    const operations = deriveOperations(config);
    expect(operations.map((op) => op.rank)).toEqual([0, 0, 1, 1]);
  });

  it('uses configured durations', () => {
    const config = makeConfig();
    const operations = deriveOperations(config);
    expect(operations.map((op) => op.duration)).toEqual([1, 2, 1, 2]);
  });

  it('handles multi-microbatch ordering', () => {
    const config = makeConfig({ microbatchCount: 2 });
    const operations = deriveOperations(config);
    const ids = operations.map((op) => op.id);
    expect(ids).toEqual(['F:0:0', 'B:0:0', 'F:0:1', 'B:0:1', 'F:1:0', 'B:1:0', 'F:1:1', 'B:1:1']);
  });

  it('handles multi-rank ordering', () => {
    const config = makeConfig({ rankCount: 3, stageCount: 3 });
    const operations = deriveOperations(config);
    const ids = operations.map((op) => op.id);
    expect(ids).toEqual(['F:0:0', 'B:0:0', 'F:1:0', 'B:1:0', 'F:2:0', 'B:2:0']);
  });
});

describe('predecessorsOf', () => {
  const config = makeConfig();

  it('F:1:0 depends on F:0:0 (forward previous-stage)', () => {
    expect(predecessorsOf('F:1:0', config)).toEqual(['F:0:0']);
  });

  it('B:1:0 depends on F:1:0 (backward same-stage forward)', () => {
    expect(predecessorsOf('B:1:0', config)).toEqual(['F:1:0']);
  });

  it('B:0:0 depends on F:0:0 and B:1:0 (backward next-stage)', () => {
    expect(predecessorsOf('B:0:0', config)).toEqual(['F:0:0', 'B:1:0']);
  });

  it('F:0:0 has no predecessors (first stage)', () => {
    expect(predecessorsOf('F:0:0', config)).toEqual([]);
  });

  it('B:0:0 only depends on F:0:0 when it is the last stage', () => {
    // With rankCount=1, B:0:0 depends only on F:0:0 (no next stage)
    const singleRank = makeConfig({ rankCount: 1, stageCount: 1 });
    expect(predecessorsOf('B:0:0', singleRank)).toEqual(['F:0:0']);
  });

  it('produces deterministic order without duplicates', () => {
    const config3 = makeConfig({ rankCount: 3, stageCount: 3, microbatchCount: 2 });
    // B:0:0 should have F:0:0, B:1:0 (no duplicates)
    const preds = predecessorsOf('B:0:0', config3);
    expect(new Set(preds).size).toBe(preds.length);
    expect(preds).toEqual(['F:0:0', 'B:1:0']);
  });

  it('validates operation ID format', () => {
    expect(() => predecessorsOf('bad-id' as OperationId, config)).toThrow();
  });

  it('validates stage is within config bounds', () => {
    expect(() => predecessorsOf('F:5:0' as OperationId, config)).toThrow();
  });

  it('validates microbatch is within config bounds', () => {
    expect(() => predecessorsOf('F:0:5' as OperationId, config)).toThrow();
  });
});
