import { describe, expect, it } from 'vitest';
import { replay } from './replay';
import type { MasteryTarget } from './types';
import { attemptRankingTuple, compareAttempts, score, type AttemptRankingTuple } from './score';
import { expectState, makeConfig, placeIds } from '../test/factories';

describe('score', () => {
  it('scores the mastered dependency chain exactly', () => {
    const config = makeConfig({
      masteryTargets: [
        { metric: 'makespan', op: '<=', value: 6 },
        { metric: 'intentionalIdle', op: '<=', value: 0 },
      ],
    });

    const state = expectState(replay(config, placeIds('F:0:0', 'F:1:0', 'B:1:0', 'B:0:0')));

    expect(score(state)).toEqual({
      makespan: 6,
      totalWork: 6,
      capacity: 12,
      bubbleRatio: 0.5,
      intentionalIdle: 0,
      peakActivationMemoryByRank: [1, 1],
      peakActivationMemory: 1,
      complete: true,
      mastered: true,
    });
  });

  it('scores total work and bubble ratio from operation duration overrides', () => {
    const config = makeConfig({
      durationOverrides: [{ kind: 'B', stage: 0, duration: 4 }],
      masteryTargets: [{ metric: 'makespan', op: '<=', value: 8 }],
    });
    const state = expectState(replay(config, placeIds('F:0:0', 'F:1:0', 'B:1:0', 'B:0:0')));

    expect(score(state)).toEqual({
      makespan: 8,
      totalWork: 8,
      capacity: 16,
      bubbleRatio: 0.5,
      intentionalIdle: 0,
      peakActivationMemoryByRank: [1, 1],
      peakActivationMemory: 1,
      complete: true,
      mastered: true,
    });
  });

  it('scores the empty state as zero with complete false and mastered false', () => {
    const state = expectState(replay(makeConfig(), []));

    expect(score(state)).toEqual({
      makespan: 0,
      totalWork: 0,
      capacity: 0,
      bubbleRatio: 0,
      intentionalIdle: 0,
      peakActivationMemoryByRank: [0, 0],
      peakActivationMemory: 0,
      complete: false,
      mastered: false,
    });
  });

  it('omits all-gather count unless residency scoring is enabled', () => {
    const state = expectState(replay(makeConfig(), placeIds('F:0:0')));

    expect(score(state).allGatherCount).toBeUndefined();
    expect(attemptRankingTuple(state)).not.toHaveProperty('allGatherCount');
  });

  it('scores FSDP residency all-gathers and supports mastery targets', () => {
    const config = makeConfig({
      microbatchCount: 2,
      memoryCaps: [3, 3],
      residencyModel: { weightUnit: 1 },
      masteryTargets: [{ metric: 'allGatherCount', op: '<=', value: 2 }],
    });
    const state = expectState(
      replay(config, placeIds('F:0:0', 'F:0:1', 'F:1:0', 'B:1:0', 'B:0:0')),
    );

    expect(score(state)).toMatchObject({
      allGatherCount: 2,
      mastered: false,
    });
    expect(attemptRankingTuple(state)).toMatchObject({
      allGatherCount: 2,
      actionCount: 5,
    });
  });

  it('scores in-progress schedules from placed work and current frontier capacity', () => {
    const config = makeConfig({ microbatchCount: 2 });
    const state = expectState(
      replay(config, [
        { type: 'place', operationId: 'F:0:0' },
        { type: 'wait', rank: 0 },
        { type: 'place', operationId: 'F:1:0' },
      ]),
    );

    expect(score(state)).toEqual({
      makespan: 2,
      totalWork: 2,
      capacity: 4,
      bubbleRatio: 0.5,
      intentionalIdle: 1,
      peakActivationMemoryByRank: [1, 1],
      peakActivationMemory: 1,
      complete: false,
      mastered: false,
    });
  });

  it('omits internal bubble unless a level enables the zero-bubble score model', () => {
    const state = expectState(replay(makeConfig(), placeIds('F:0:0', 'F:1:0', 'B:1:0', 'B:0:0')));

    expect(score(state).internalBubbleRatio).toBeUndefined();
  });

  it('scores internal bubble inside each rank active interval when enabled', () => {
    const config = makeConfig({
      microbatchCount: 2,
      scoreModel: { internalBubble: true },
      masteryTargets: [{ metric: 'internalBubbleRatio', op: '<=', value: 0 }],
    });
    const state = expectState(
      replay(config, [
        { type: 'place', operationId: 'F:0:0' },
        { type: 'wait', rank: 0 },
        { type: 'place', operationId: 'F:0:1' },
      ]),
    );

    expect(score(state)).toMatchObject({
      makespan: 3,
      totalWork: 2,
      capacity: 6,
      bubbleRatio: 2 / 3,
      internalBubbleRatio: 1 / 3,
      intentionalIdle: 1,
    });
  });

  it('incomplete schedules are never mastered even when current metrics satisfy targets', () => {
    const config = makeConfig({
      masteryTargets: [{ metric: 'makespan', op: '<=', value: 10 }],
    });
    const state = expectState(replay(config, placeIds('F:0:0')));

    expect(score(state)).toMatchObject({
      makespan: 1,
      complete: false,
      mastered: false,
    });
  });

  it('evaluates every supported mastery metric/operator combination', () => {
    const passingState = expectState(
      replay(
        makeConfig({
          masteryTargets: [
            { metric: 'makespan', op: '<=', value: 6 },
            { metric: 'bubbleRatio', op: '<=', value: 0.5 },
            { metric: 'intentionalIdle', op: '<=', value: 0 },
            { metric: 'peakActivationMemory', op: '<=', value: 1 },
          ],
        }),
        placeIds('F:0:0', 'F:1:0', 'B:1:0', 'B:0:0'),
      ),
    );

    expect(score(passingState).mastered).toBe(true);

    const failingCases: Array<{
      target: MasteryTarget;
      expectedMetric: keyof Pick<
        ReturnType<typeof score>,
        'makespan' | 'bubbleRatio' | 'intentionalIdle' | 'peakActivationMemory'
      >;
      expectedValue: number;
    }> = [
      {
        target: { metric: 'makespan', op: '<=', value: 5 },
        expectedMetric: 'makespan',
        expectedValue: 6,
      },
      {
        target: { metric: 'bubbleRatio', op: '<=', value: 0.49 },
        expectedMetric: 'bubbleRatio',
        expectedValue: 0.5,
      },
      {
        target: { metric: 'intentionalIdle', op: '<=', value: -1 },
        expectedMetric: 'intentionalIdle',
        expectedValue: 0,
      },
      {
        target: { metric: 'peakActivationMemory', op: '<=', value: 0 },
        expectedMetric: 'peakActivationMemory',
        expectedValue: 1,
      },
    ];

    for (const { target, expectedMetric, expectedValue } of failingCases) {
      const state = expectState(
        replay(
          makeConfig({ masteryTargets: [target] }),
          placeIds('F:0:0', 'F:1:0', 'B:1:0', 'B:0:0'),
        ),
      );
      const result = score(state);
      expect(result[expectedMetric]).toBe(expectedValue);
      expect(result.mastered).toBe(false);
    }
  });

  it('ranks equal residency attempts by all-gather count before idle and action count', () => {
    const base: AttemptRankingTuple = {
      makespan: 10,
      peakActivationMemory: 2,
      allGatherCount: 1,
      intentionalIdle: 0,
      actionCount: 6,
    };

    expect(
      compareAttempts(base, {
        ...base,
        allGatherCount: 2,
        intentionalIdle: 0,
        actionCount: 4,
      }),
    ).toBeLessThan(0);
  });

  it('does not mutate the state or its exposed arrays while scoring', () => {
    const state = expectState(replay(makeConfig(), placeIds('F:0:0', 'F:1:0')));
    const before = structuredClone(state);

    const result = score(state);

    expect(structuredClone(state)).toEqual(before);
    expect(Object.isFrozen(result)).toBe(true);
    expect(result.peakActivationMemoryByRank).toEqual([1, 1]);
    expect(Object.isFrozen(result.peakActivationMemoryByRank)).toBe(true);
    expect(result.peakActivationMemoryByRank).not.toBe(state.peakMemory);
  });

  it('returns a frozen top-level result that rejects mutation attempts', () => {
    const state = expectState(replay(makeConfig(), placeIds('F:0:0', 'F:1:0')));
    const result = score(state);

    expect(() => {
      (
        result as {
          makespan: number;
        }
      ).makespan = 999;
    }).toThrow();
    expect(() => {
      (result.peakActivationMemoryByRank as number[])[0] = 999;
    }).toThrow();
    expect(result.makespan).toBe(2);
    expect(result.peakActivationMemoryByRank).toEqual([1, 1]);
  });

  it('marks corrupt duplicate placements as incomplete', () => {
    const goodState = expectState(
      replay(makeConfig(), placeIds('F:0:0', 'F:1:0', 'B:1:0', 'B:0:0')),
    );
    const duplicatePlacement = Object.freeze({ ...goodState.placements[0]! });
    const corruptState = Object.freeze({
      ...goodState,
      placements: Object.freeze([...goodState.placements, duplicatePlacement]),
    });

    expect(score(corruptState).complete).toBe(false);
    expect(score(corruptState).mastered).toBe(false);
  });
});

describe('attemptRankingTuple', () => {
  it('exposes the lexicographic ranking tuple for the UI', () => {
    const state = expectState(replay(makeConfig(), placeIds('F:0:0', 'F:1:0', 'B:1:0', 'B:0:0')));

    expect(attemptRankingTuple(state)).toEqual({
      makespan: 6,
      peakActivationMemory: 1,
      intentionalIdle: 0,
      actionCount: 4,
    });
  });

  it('returns a frozen tuple that rejects mutation attempts', () => {
    const state = expectState(replay(makeConfig(), placeIds('F:0:0', 'F:1:0', 'B:1:0', 'B:0:0')));
    const tuple = attemptRankingTuple(state);

    expect(Object.isFrozen(tuple)).toBe(true);
    expect(() => {
      (
        tuple as {
          actionCount: number;
        }
      ).actionCount = 999;
    }).toThrow();
    expect(tuple.actionCount).toBe(4);
  });
});

describe('compareAttempts', () => {
  it('ranks attempts lexicographically without a hidden aggregate', () => {
    expect(
      compareAttempts(
        { makespan: 18, peakActivationMemory: 3, intentionalIdle: 0, actionCount: 24 },
        { makespan: 19, peakActivationMemory: 1, intentionalIdle: 0, actionCount: 24 },
      ),
    ).toBeLessThan(0);
  });

  it('breaks ties by peak activation memory, then intentional idle, then action count', () => {
    const base: AttemptRankingTuple = {
      makespan: 10,
      peakActivationMemory: 2,
      intentionalIdle: 1,
      actionCount: 5,
    };

    expect(
      compareAttempts(base, {
        ...base,
        peakActivationMemory: 3,
      }),
    ).toBeLessThan(0);
    expect(
      compareAttempts(base, {
        ...base,
        intentionalIdle: 2,
      }),
    ).toBeLessThan(0);
    expect(
      compareAttempts(base, {
        ...base,
        actionCount: 6,
      }),
    ).toBeLessThan(0);
  });

  it('returns zero for identical tuples', () => {
    const tuple: AttemptRankingTuple = {
      makespan: 6,
      peakActivationMemory: 1,
      intentionalIdle: 0,
      actionCount: 4,
    };

    expect(compareAttempts(tuple, tuple)).toBe(0);
  });

  it('returns positive when the left tuple loses lexicographically', () => {
    expect(
      compareAttempts(
        { makespan: 20, peakActivationMemory: 1, intentionalIdle: 0, actionCount: 10 },
        { makespan: 19, peakActivationMemory: 9, intentionalIdle: 9, actionCount: 99 },
      ),
    ).toBeGreaterThan(0);
  });
});
