import { describe, expect, it } from 'vitest';
import { getLevel } from '../levels/levels';
import { makeConfig } from '../test/factories';
import { exportOptimizerModel, type OptimizerModelExportResult } from './optimizerModel';

function expectModel(result: OptimizerModelExportResult) {
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error(`unexpected optimizer model export failure: ${result.reason.kind}`);
  }
  return result.model;
}

describe('exportOptimizerModel', () => {
  it('exports a replay-derived interval model for ordinary schedules', () => {
    const model = expectModel(exportOptimizerModel(makeConfig()));

    expect(model.metadata).toMatchObject({
      format: 'sensei.optimizer-model.v1',
      levelId: 'test',
      levelVersion: 1,
    });
    expect(model.timeHorizon).toEqual({ lowerBound: 6, upperBound: 6 });
    expect(model.operations).toEqual([
      { id: 'F:0:0', kind: 'F', stage: 0, rank: 0, microbatch: 0, duration: 1 },
      { id: 'B:0:0', kind: 'B', stage: 0, rank: 0, microbatch: 0, duration: 2 },
      { id: 'F:1:0', kind: 'F', stage: 1, rank: 1, microbatch: 0, duration: 1 },
      { id: 'B:1:0', kind: 'B', stage: 1, rank: 1, microbatch: 0, duration: 2 },
    ]);
    expect(model.dependencies.map((edge) => `${edge.from}->${edge.to}`).sort()).toEqual([
      'B:1:0->B:0:0',
      'F:0:0->B:0:0',
      'F:0:0->F:1:0',
      'F:1:0->B:1:0',
    ]);
    expect(model.resources).toEqual([
      { id: 'rank:0', kind: 'exclusive-rank', rank: 0, capacity: 1 },
      { id: 'rank:1', kind: 'exclusive-rank', rank: 1, capacity: 1 },
    ]);
    expect(model.resourceRequirements).toContainEqual({
      operationId: 'F:0:0',
      resourceId: 'rank:0',
      demand: 1,
    });
    expect(model.activationMemory.constraints[0]).toMatchObject({
      id: 'activation:0',
      rank: 0,
      capacity: null,
    });
    expect(
      model.activationMemory.events.map((event) => `${event.operationId}:${event.kind}`).sort(),
    ).toEqual([
      'B:0:0:activation-release',
      'B:1:0:activation-release',
      'F:0:0:activation-acquire',
      'F:1:0:activation-acquire',
    ]);
    expect(Object.isFrozen(model.operations[0])).toBe(true);
  });

  it('models split backward activation release at W instead of B', () => {
    const model = expectModel(
      exportOptimizerModel(
        makeConfig({
          durations: { F: 1, B: 1, W: 1 },
          operationModel: { backward: 'split' },
        }),
      ),
    );

    expect(model.operations.map((operation) => operation.id)).toEqual([
      'F:0:0',
      'B:0:0',
      'W:0:0',
      'F:1:0',
      'B:1:0',
      'W:1:0',
    ]);
    expect(model.activationMemory.events).toContainEqual({
      operationId: 'W:0:0',
      kind: 'activation-release',
      at: 'end',
      rank: 0,
      stage: 0,
      microbatch: 0,
      delta: -1,
    });
    expect(
      model.activationMemory.events.some(
        (event) => event.operationId === 'B:0:0' && event.kind === 'activation-release',
      ),
    ).toBe(false);
  });

  it('exports DualPipe shared and directional rank resources without solving them', () => {
    const model = expectModel(exportOptimizerModel(getLevel('two-directions')));

    expect(model.resources).toEqual(
      expect.arrayContaining([
        { id: 'rank:0:shared', kind: 'shared-rank', rank: 0, capacity: 2 },
        {
          id: 'rank:0:direction:asc',
          kind: 'directional-rank',
          rank: 0,
          direction: 'asc',
          capacity: 1,
        },
        {
          id: 'rank:0:direction:desc',
          kind: 'directional-rank',
          rank: 0,
          direction: 'desc',
          capacity: 1,
        },
      ]),
    );
    expect(
      model.resourceRequirements
        .filter((requirement) => requirement.operationId === 'F:0:0:asc')
        .map((requirement) => requirement.resourceId)
        .sort(),
    ).toEqual(['rank:0:direction:asc', 'rank:0:shared']);
    expect(model.metadata.assumptions).toContain(
      'DualPipe operations consume one shared rank slot and one direction-specific rank slot.',
    );
  });

  it('keeps residency out of the static optimizer model until cache-state variables exist', () => {
    expect(exportOptimizerModel(getLevel('gather-once-reuse'))).toEqual({
      ok: false,
      reason: {
        kind: 'unsupported-residency',
        detail: 'Residency requires stateful cache and eviction variables, not only intervals.',
      },
    });
  });
});
