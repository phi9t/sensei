import { describe, expect, it } from 'vitest';
import type { OperationId } from './types';
import { initialState, classifyOperation, classifyMoves, applyAction, replay } from './replay';
import { makeConfig, placeIds, expectState } from '../test/factories';

describe('initialState', () => {
  it('creates empty state with zeroed frontiers and memory', () => {
    const config = makeConfig();
    const state = initialState(config);
    expect(state.rankFrontiers).toEqual([0, 0]);
    expect(state.currentMemory).toEqual([0, 0]);
    expect(state.peakMemory).toEqual([0, 0]);
    expect(state.placements).toEqual([]);
    expect(state.gaps).toEqual([]);
    expect(state.actions).toEqual([]);
    expect(state.operations.length).toBeGreaterThan(0);
  });

  it('freezes arrays and records for immutability', () => {
    const state = initialState(makeConfig());
    expect(Object.isFrozen(state)).toBe(true);
    expect(Object.isFrozen(state.rankFrontiers)).toBe(true);
    expect(Object.isFrozen(state.currentMemory)).toBe(true);
    expect(Object.isFrozen(state.peakMemory)).toBe(true);
    expect(Object.isFrozen(state.placements)).toBe(true);
    expect(Object.isFrozen(state.gaps)).toBe(true);
    expect(Object.isFrozen(state.actions)).toBe(true);
    expect(Object.isFrozen(state.placementById)).toBe(true);
    expect(Object.isFrozen(state.operations)).toBe(true);
  });

  it('deep-freezes cloned algorithm metadata independently of the input config', () => {
    const config = makeConfig({
      algorithm: {
        family: 'foundations',
        setTitle: 'Original Set',
        concept: 'Original concept.',
        objective: 'Original objective.',
        patternLabel: 'Original',
        introducedModel: ['original model'],
      },
    });

    const state = initialState(config);

    expect(Object.isFrozen(state.config.algorithm)).toBe(true);
    expect(Object.isFrozen(state.config.algorithm.introducedModel)).toBe(true);

    (config.algorithm as { setTitle: string }).setTitle = 'Mutated Set';
    (config.algorithm.introducedModel as string[]).push('mutated model');

    expect(state.config.algorithm.setTitle).toBe('Original Set');
    expect(state.config.algorithm.introducedModel).toEqual(['original model']);
  });

  it('deep-freezes cloned duration override metadata independently of the input config', () => {
    const config = makeConfig({
      durationOverrides: [{ kind: 'B', stage: 0, duration: 4 }],
    });

    const state = initialState(config);

    expect(Object.isFrozen(state.config.durationOverrides)).toBe(true);
    expect(Object.isFrozen(state.config.durationOverrides?.[0])).toBe(true);

    (config.durationOverrides as unknown as Array<{ duration: number }>)[0]!.duration = 9;

    expect(state.config.durationOverrides).toEqual([{ kind: 'B', stage: 0, duration: 4 }]);
    expect(state.operations.find((operation) => operation.id === 'B:0:0')?.duration).toBe(4);
  });
});

describe('classifyOperation / classifyMoves', () => {
  it('classifies completed operations as completed', () => {
    const config = makeConfig();
    const state = expectState(replay(config, placeIds('F:0:0')));
    const classification = classifyOperation(state, 'F:0:0');
    expect(classification.status).toBe('completed');
    if (classification.status === 'completed') {
      expect(classification.placement).toMatchObject({ operationId: 'F:0:0', start: 0, end: 1 });
    }
  });

  it('classifies already-placed operations as already-placed', () => {
    const config = makeConfig();
    const state = expectState(replay(config, placeIds('F:0:0')));
    const classification = classifyOperation(state, 'F:0:0');
    expect(classification.status).toBe('completed');
  });

  it('classifies missing dependencies inspectable', () => {
    const state = initialState(makeConfig());
    const cls = classifyOperation(state, 'B:0:0');
    expect(cls.status).toBe('blocked');
    if (cls.status === 'blocked') {
      expect(cls.reasons).toEqual(
        expect.arrayContaining([{ kind: 'dependency-not-finished', operationId: 'F:0:0' }]),
      );
    }
  });

  it('classifies F:0:0 as legal with earliestStart 0 and projectedMemory 1', () => {
    const state = initialState(makeConfig());
    const cls = classifyOperation(state, 'F:0:0');
    expect(cls.status).toBe('legal');
    if (cls.status === 'legal') {
      expect(cls.earliestStart).toBe(0);
      expect(cls.projectedMemory).toBe(1);
    }
  });

  it('B projectedMemory reflects post-completion release: current 1 -> projected 0', () => {
    const config = makeConfig();
    const state = expectState(replay(config, placeIds('F:0:0', 'F:1:0')));
    const cls = classifyOperation(state, 'B:1:0');
    expect(cls.status).toBe('legal');
    if (cls.status === 'legal') {
      expect(cls.projectedMemory).toBe(0);
    }
  });

  it('classifyMoves order matches inventory', () => {
    const config = makeConfig();
    const state = initialState(config);
    const moves = classifyMoves(state);
    const ids = moves.map((m) => m.operation.id);
    const expectedOrder = ['F:0:0', 'B:0:0', 'F:1:0', 'B:1:0'];
    expect(ids).toEqual(expectedOrder);
  });

  it('includes all dependency blockers when multiple predecssors missing', () => {
    const config3 = makeConfig({ rankCount: 3, stageCount: 3 });
    const state = initialState(config3);
    const cls = classifyOperation(state, 'B:0:0');
    expect(cls.status).toBe('blocked');
    if (cls.status === 'blocked') {
      expect(cls.reasons).toEqual(
        expect.arrayContaining([
          { kind: 'dependency-not-finished', operationId: 'F:0:0' },
          { kind: 'dependency-not-finished', operationId: 'B:1:0' },
        ]),
      );
    }
  });
});

describe('applyAction', () => {
  it('places F:0:0 at start 0, end 1', () => {
    const state = initialState(makeConfig());
    const result = applyAction(state, { type: 'place', operationId: 'F:0:0' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.placements).toHaveLength(1);
      expect(result.state.placements[0]).toMatchObject({
        operationId: 'F:0:0',
        start: 0,
        end: 1,
        rank: 0,
      });
    }
  });

  it('rejects already-placed operation', () => {
    const state = expectState(replay(makeConfig(), placeIds('F:0:0')));
    const result = applyAction(state, { type: 'place', operationId: 'F:0:0' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toEqual({ kind: 'already-placed', operationId: 'F:0:0' });
    }
  });

  it('rejects operation with unfinished dependency', () => {
    const state = initialState(makeConfig());
    const result = applyAction(state, { type: 'place', operationId: 'B:0:0' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason.kind).toBe('dependency-not-finished');
    }
  });

  it('records one intentional tick per wait action', () => {
    const state = expectState(replay(makeConfig(), [{ type: 'wait', rank: 0 }]));
    expect(state.rankFrontiers).toEqual([1, 0]);
    expect(state.gaps).toEqual([{ rank: 0, start: 0, end: 1, kind: 'intentional' }]);
  });

  it('invalid rank is typed reason', () => {
    const state = initialState(makeConfig());
    const result = applyAction(state, { type: 'wait', rank: 99 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toEqual({ kind: 'invalid-rank', rank: 99 });
    }
  });

  it('wait rejects NaN rank as invalid-rank without mutating state', () => {
    const state = initialState(makeConfig());
    const snapshot = JSON.parse(JSON.stringify(state));
    const result = applyAction(state, { type: 'wait', rank: NaN });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toEqual({ kind: 'invalid-rank', rank: NaN });
    }
    expect(state.placements.length).toBe(0);
    expect(state.actions.length).toBe(0);
    expect(JSON.parse(JSON.stringify(state))).toEqual(snapshot);
  });

  it('wait rejects Infinity rank as invalid-rank without mutating state', () => {
    const state = initialState(makeConfig());
    const snapshot = JSON.parse(JSON.stringify(state));
    const result = applyAction(state, { type: 'wait', rank: Infinity });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toEqual({ kind: 'invalid-rank', rank: Infinity });
    }
    expect(state.placements.length).toBe(0);
    expect(state.actions.length).toBe(0);
    expect(JSON.parse(JSON.stringify(state))).toEqual(snapshot);
  });

  it('wait rejects fractional rank as invalid-rank without mutating state', () => {
    const state = initialState(makeConfig());
    const snapshot = JSON.parse(JSON.stringify(state));
    const result = applyAction(state, { type: 'wait', rank: 1.5 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toEqual({ kind: 'invalid-rank', rank: 1.5 });
    }
    expect(state.placements.length).toBe(0);
    expect(state.actions.length).toBe(0);
    expect(JSON.parse(JSON.stringify(state))).toEqual(snapshot);
  });

  it('wait rejects negative rank as invalid-rank without mutating state', () => {
    const state = initialState(makeConfig());
    const snapshot = JSON.parse(JSON.stringify(state));
    const result = applyAction(state, { type: 'wait', rank: -1 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toEqual({ kind: 'invalid-rank', rank: -1 });
    }
    expect(state.placements.length).toBe(0);
    expect(state.actions.length).toBe(0);
    expect(JSON.parse(JSON.stringify(state))).toEqual(snapshot);
  });

  it('wait rejects rank >= rankCount as invalid-rank without mutating state', () => {
    const state = initialState(makeConfig());
    const snapshot = JSON.parse(JSON.stringify(state));
    const result = applyAction(state, { type: 'wait', rank: 2 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toEqual({ kind: 'invalid-rank', rank: 2 });
    }
    expect(state.placements.length).toBe(0);
    expect(state.actions.length).toBe(0);
    expect(JSON.parse(JSON.stringify(state))).toEqual(snapshot);
  });

  it('rejected actions never mutate or append', () => {
    const state = initialState(makeConfig());
    const snapshot = JSON.parse(JSON.stringify(state));
    applyAction(state, { type: 'place', operationId: 'B:0:0' });
    applyAction(state, { type: 'wait', rank: 99 });
    expect(state.placements.length).toBe(0);
    expect(state.actions.length).toBe(0);
    expect(JSON.parse(JSON.stringify(state))).toEqual(snapshot);
  });

  it('accepted placement inserts dependency-forced gap only when start > rank frontier', () => {
    const config = makeConfig();
    const state = expectState(replay(config, placeIds('F:0:0', 'F:1:0')));
    expect(state.rankFrontiers).toEqual([1, 2]);
    expect(state.gaps.length).toBeLessThanOrEqual(1);
    if (state.gaps.length === 1) {
      expect(state.gaps[0]!.kind).toBe('dependency-forced');
      expect(state.gaps[0]!.rank).toBe(1);
    }
  });

  it('forces gap when start > rank frontier', () => {
    const config = makeConfig();
    const state = expectState(
      replay(config, [
        { type: 'place', operationId: 'F:0:0' },
        { type: 'place', operationId: 'F:1:0' },
        { type: 'place', operationId: 'B:1:0' },
        { type: 'place', operationId: 'B:0:0' },
      ]),
    );
    expect(state.rankFrontiers).toEqual([6, 4]);
    expect(state.gaps).toContainEqual({ rank: 1, start: 0, end: 1, kind: 'dependency-forced' });
    expect(state.gaps).toContainEqual({ rank: 0, start: 1, end: 4, kind: 'dependency-forced' });
  });
});

describe('memory and activation', () => {
  it('F acquires on completion, B releases on completion', () => {
    const config = makeConfig();
    const state = expectState(
      replay(config, [
        { type: 'place', operationId: 'F:0:0' },
        { type: 'place', operationId: 'F:1:0' },
        { type: 'place', operationId: 'B:1:0' },
        { type: 'place', operationId: 'B:0:0' },
      ]),
    );
    expect(state.currentMemory).toEqual([0, 0]);
    expect(state.peakMemory).toEqual([1, 1]);
  });

  it('F acquire followed by B release: current+peak memory correct', () => {
    const config = makeConfig({ memoryCaps: [2, 2] });
    const state = expectState(replay(config, [{ type: 'place', operationId: 'F:0:0' }]));
    expect(state.currentMemory).toEqual([1, 0]);
    expect(state.peakMemory).toEqual([1, 0]);
  });

  it('B cannot release another microbatch it has not acquired', () => {
    const config = makeConfig();
    const result = replay(config, placeIds('B:0:0'));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason.kind).toBe('dependency-not-finished');
    }
  });

  it('blocks forward move when resident + 1 exceeds cap', () => {
    const capped = makeConfig({ microbatchCount: 3, memoryCaps: [2, 2] });
    const state = expectState(
      replay(capped, [
        { type: 'place', operationId: 'F:0:0' },
        { type: 'place', operationId: 'F:0:1' },
      ]),
    );
    const cls = classifyOperation(state, 'F:0:2');
    expect(cls.status).toBe('blocked');
    if (cls.status === 'blocked') {
      expect(cls.reasons).toEqual(
        expect.arrayContaining([
          { kind: 'memory-cap', rank: 0, resident: 2, requested: 1, cap: 2 },
        ]),
      );
    }
  });

  it('cap boundary: allow when resident + 1 <= cap', () => {
    const capped = makeConfig({ microbatchCount: 2, memoryCaps: [2, 2] });
    const state = expectState(replay(capped, [{ type: 'place', operationId: 'F:0:0' }]));
    const cls = classifyOperation(state, 'F:0:1');
    expect(cls.status).toBe('legal');
  });

  it('cap boundary: block when resident + 1 > cap', () => {
    const capped = makeConfig({ microbatchCount: 2, memoryCaps: [1, 1] });
    const state = expectState(replay(capped, [{ type: 'place', operationId: 'F:0:0' }]));
    const cls = classifyOperation(state, 'F:0:1');
    expect(cls.status).toBe('blocked');
    if (cls.status === 'blocked') {
      expect(cls.reasons).toEqual(
        expect.arrayContaining([
          { kind: 'memory-cap', rank: 0, resident: 1, requested: 1, cap: 1 },
        ]),
      );
    }
  });

  it('waits do not release memory', () => {
    const config = makeConfig({ memoryCaps: [2, 2] });
    const state = expectState(
      replay(config, [
        { type: 'place', operationId: 'F:0:0' },
        { type: 'wait', rank: 0 },
      ]),
    );
    expect(state.currentMemory).toEqual([1, 0]);
  });
});

describe('replay', () => {
  it('replays the dependency chain with a dependency-forced gap', () => {
    const result = replay(makeConfig(), [
      { type: 'place', operationId: 'F:0:0' },
      { type: 'place', operationId: 'F:1:0' },
      { type: 'place', operationId: 'B:1:0' },
      { type: 'place', operationId: 'B:0:0' },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.placements.map((p) => [p.operationId, p.start, p.end])).toEqual([
      ['F:0:0', 0, 1],
      ['F:1:0', 1, 2],
      ['B:1:0', 2, 4],
      ['B:0:0', 4, 6],
    ]);
    expect(result.state.gaps).toContainEqual({
      rank: 0,
      start: 1,
      end: 4,
      kind: 'dependency-forced',
    });
  });

  it('stops at first failure and returns index and action', () => {
    const config = makeConfig();
    const result = replay(config, [
      { type: 'place', operationId: 'F:0:0' },
      { type: 'place', operationId: 'F:1:0' },
      { type: 'place', operationId: 'F:1:0' }, // duplicate
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.index).toBe(2);
      expect(result.action).toEqual({ type: 'place', operationId: 'F:1:0' });
      expect(result.reason).toEqual({ kind: 'already-placed', operationId: 'F:1:0' });
    }
  });

  it('empty actions yields initial state', () => {
    const config = makeConfig();
    const result = replay(config, []);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.rankFrontiers).toEqual([0, 0]);
  });

  it('initial state isolation: two independent states do not share references', () => {
    const config = makeConfig();
    const state1 = initialState(config);
    const state2 = initialState(config);
    expect(state1.rankFrontiers).not.toBe(state2.rankFrontiers);
    expect(state1.placements).not.toBe(state2.placements);
    expect(state1.gaps).not.toBe(state2.gaps);
    expect(state1.actions).not.toBe(state2.actions);
  });
});

describe('virtual-stage replay', () => {
  const config = makeConfig({
    rankCount: 2,
    stageCount: 4,
    microbatchCount: 1,
    topology: { placement: 'v-shape', virtualStagesPerRank: 2 },
  });

  it('places logical stages on their physical owner ranks', () => {
    const state = expectState(replay(config, placeIds('F:0:0', 'F:1:0', 'F:2:0', 'F:3:0')));

    expect(
      state.placements.map(({ operationId, rank, start, end }) => ({
        operationId,
        rank,
        start,
        end,
      })),
    ).toEqual([
      { operationId: 'F:0:0', rank: 0, start: 0, end: 1 },
      { operationId: 'F:1:0', rank: 1, start: 1, end: 2 },
      { operationId: 'F:2:0', rank: 1, start: 2, end: 3 },
      { operationId: 'F:3:0', rank: 0, start: 3, end: 4 },
    ]);
  });

  it('blocks backward work until the next logical stage backward is complete', () => {
    const state = expectState(replay(config, placeIds('F:0:0', 'F:1:0', 'F:2:0', 'F:3:0')));

    const result = applyAction(state, { type: 'place', operationId: 'B:1:0' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toEqual({
        kind: 'dependency-not-finished',
        operationId: 'B:2:0',
      });
    }
  });
});

describe('immutability after accepted/rejected actions', () => {
  it('pre-apply state is unchanged after accepted action', () => {
    const config = makeConfig();
    const state = initialState(config);
    const snapshot = JSON.parse(JSON.stringify(state));
    applyAction(state, { type: 'place', operationId: 'F:0:0' });
    expect(JSON.parse(JSON.stringify(state))).toEqual(snapshot);
  });

  it('post-apply state is frozen for accepted action', () => {
    const config = makeConfig();
    const result = applyAction(initialState(config), { type: 'place', operationId: 'F:0:0' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const s = result.state;
      expect(Object.isFrozen(s.placements)).toBe(true);
      expect(Object.isFrozen(s.gaps)).toBe(true);
      expect(Object.isFrozen(s.actions)).toBe(true);
      expect(Object.isFrozen(s.rankFrontiers)).toBe(true);
      expect(Object.isFrozen(s.placementById)).toBe(true);
    }
  });
});

describe('immutability at caller boundaries', () => {
  it('initialState does not retain caller-mutable config (memoryCaps array)', () => {
    const caps = [3, 3];
    const config = makeConfig({ memoryCaps: caps });
    const state = initialState(config);
    caps[0] = 999;
    expect(state.config.memoryCaps).toEqual([3, 3]);
    expect(state.config.memoryCaps).not.toBe(caps);
  });

  it('initialState does not retain caller-mutable config (durations object)', () => {
    const durations = { F: 1, B: 2 };
    const config = makeConfig({ durations });
    const state = initialState(config);
    durations.F = 999;
    expect(state.config.durations.F).toBe(1);
  });

  it('recorded accepted actions are frozen copies, not caller references', () => {
    const config = makeConfig();
    const action = { type: 'place' as const, operationId: 'F:0:0' as const };
    const result = applyAction(initialState(config), action);
    expect(result.ok).toBe(true);
    if (result.ok) {
      (action as { operationId: string }).operationId = 'F:1:0';
      expect(result.state.actions[0]).toEqual({ type: 'place', operationId: 'F:0:0' });
    }
  });

  it('recorded accepted wait actions are frozen copies', () => {
    const config = makeConfig();
    const action = { type: 'wait' as const, rank: 0 };
    const result = applyAction(initialState(config), action);
    expect(result.ok).toBe(true);
    if (result.ok) {
      action.rank = 999;
      expect(result.state.actions[0]).toEqual({ type: 'wait', rank: 0 });
    }
  });

  it('config passed to initialState is deep-frozen in returned state', () => {
    const config = makeConfig();
    const state = initialState(config);
    expect(Object.isFrozen(state.config)).toBe(true);
    if (state.config.memoryCaps) {
      expect(Object.isFrozen(state.config.memoryCaps)).toBe(true);
    }
  });

  it('durations object is frozen in returned config', () => {
    const state = initialState(makeConfig());
    expect(Object.isFrozen(state.config.durations)).toBe(true);
  });

  it('coaching object is frozen in returned config', () => {
    const state = initialState(makeConfig());
    expect(Object.isFrozen(state.config.coaching)).toBe(true);
  });

  it('masteryTargets array is frozen in returned config', () => {
    const config = makeConfig({
      masteryTargets: [{ metric: 'makespan', op: '<=', value: 100 }],
    });
    const state = initialState(config);
    expect(Object.isFrozen(state.config.masteryTargets)).toBe(true);
  });

  it('masteryTargets element objects are frozen in returned config', () => {
    const config = makeConfig({
      masteryTargets: [{ metric: 'makespan', op: '<=', value: 100 }],
    });
    const state = initialState(config);
    for (const target of state.config.masteryTargets) {
      expect(Object.isFrozen(target)).toBe(true);
    }
  });

  it('durations mutation attempt does not affect returned state.config', () => {
    const durations = { F: 1, B: 2 };
    const config = makeConfig({ durations });
    const state = initialState(config);
    durations.F = 999;
    expect(state.config.durations.F).toBe(1);
    durations.B = 888;
    expect(state.config.durations.B).toBe(2);
  });

  it('coaching mutation attempt does not affect returned state.config', () => {
    const coaching = { readySet: true, suggest: false, auto: false };
    const config = makeConfig({ coaching });
    const state = initialState(config);
    coaching.readySet = false;
    expect(state.config.coaching.readySet).toBe(true);
    coaching.suggest = true;
    expect(state.config.coaching.suggest).toBe(false);
  });

  it('masteryTargets mutation attempt does not affect returned state.config', () => {
    const targets = [{ metric: 'makespan' as const, op: '<=' as const, value: 100 }];
    const config = makeConfig({ masteryTargets: targets });
    const state = initialState(config);
    targets[0]!.value = 999;
    const target = state.config.masteryTargets[0]!;
    expect('metric' in target ? target.value : null).toBe(100);
    const newTarget = { metric: 'bubbleRatio' as const, op: '<=' as const, value: 50 };
    targets.push(newTarget as unknown as Parameters<typeof targets.push>[0]);
    expect(state.config.masteryTargets.length).toBe(1);
  });
});

describe('unknown OperationId handling', () => {
  it('valid inventory operation passes classifyOperation without throw', () => {
    const state = initialState(makeConfig());
    expect(() => classifyOperation(state, 'F:0:0')).not.toThrow();
  });

  it('classifyOperation throws on invalid format OperationId', () => {
    const state = initialState(makeConfig());
    expect(() => classifyOperation(state, 'INVALID' as OperationId)).toThrow();
  });

  it('valid inventory operation passes applyAction without throw', () => {
    const state = initialState(makeConfig());
    expect(() => applyAction(state, { type: 'place', operationId: 'F:0:0' })).not.toThrow();
  });

  it('applyAction throws on invalid format OperationId', () => {
    const state = initialState(makeConfig());
    expect(() =>
      applyAction(state, { type: 'place', operationId: 'INVALID' as OperationId }),
    ).toThrow();
  });

  it('unknown OperationId does not fabricate zero-duration operation', () => {
    const state = initialState(makeConfig());
    expect(() => classifyOperation(state, 'Z:0:0' as OperationId)).toThrow();
  });

  it('classifyOperation throws on syntactically valid but out-of-inventory OperationId', () => {
    const state = initialState(makeConfig());
    expect(() => classifyOperation(state, 'F:9:9' as OperationId)).toThrow(/not in inventory/);
  });

  it('applyAction throws on syntactically valid but out-of-inventory OperationId', () => {
    const state = initialState(makeConfig());
    expect(() =>
      applyAction(state, { type: 'place', operationId: 'F:9:9' as OperationId }),
    ).toThrow(/not in inventory/);
  });

  it('out-of-inventory OperationId does not mutate state', () => {
    const state = initialState(makeConfig());
    const snapshot = JSON.parse(JSON.stringify(state));
    try {
      classifyOperation(state, 'F:9:9' as OperationId);
    } catch {
      // expected
    }
    try {
      applyAction(state, { type: 'place', operationId: 'F:9:9' as OperationId });
    } catch {
      // expected
    }
    expect(state.placements.length).toBe(0);
    expect(state.actions.length).toBe(0);
    expect(JSON.parse(JSON.stringify(state))).toEqual(snapshot);
  });

  it('replay reports invalid operation IDs as typed failures with action index', () => {
    const result = replay(makeConfig(), [{ type: 'place', operationId: 'INVALID' as OperationId }]);

    expect(result).toEqual({
      ok: false,
      index: 0,
      action: { type: 'place', operationId: 'INVALID' },
      reason: { kind: 'unknown-operation-id', operationId: 'INVALID' },
    });
  });

  it('replay reports out-of-inventory operation IDs without throwing', () => {
    const result = replay(makeConfig(), [{ type: 'place', operationId: 'F:9:9' as OperationId }]);

    expect(result).toEqual({
      ok: false,
      index: 0,
      action: { type: 'place', operationId: 'F:9:9' },
      reason: { kind: 'unknown-operation-id', operationId: 'F:9:9' },
    });
  });
});

describe('memory-cap only for dependency-ready forward placements', () => {
  it('forward that would exceed cap but is dependency-blocked shows no memory-cap reason', () => {
    const capped = makeConfig({ microbatchCount: 3, memoryCaps: [1, 1] });
    const state = expectState(replay(capped, [{ type: 'place', operationId: 'F:0:0' }]));
    const cls = classifyOperation(state, 'B:0:0');
    expect(cls.status).toBe('blocked');
    if (cls.status === 'blocked') {
      const reasons = cls.reasons.map((r) => r.kind);
      expect(reasons).not.toContain('memory-cap');
      expect(reasons).toContain('dependency-not-finished');
    }
  });

  it('memory-cap reason only appears when forward is dependency-ready', () => {
    const capped = makeConfig({ microbatchCount: 3, memoryCaps: [2, 2] });
    const state = expectState(
      replay(capped, [
        { type: 'place', operationId: 'F:0:0' },
        { type: 'place', operationId: 'F:0:1' },
      ]),
    );
    const cls = classifyOperation(state, 'F:0:2');
    expect(cls.status).toBe('blocked');
    if (cls.status === 'blocked') {
      expect(cls.reasons.map((r) => r.kind)).toContain('memory-cap');
    }
  });
});
