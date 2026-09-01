import { describe, expect, it } from 'vitest';
import { getLevel } from '../levels/levels';
import { expectState, makeConfig, placeIds } from '../test/factories';
import { findExactSchedule, findExactScheduleFrontier } from './exactOracle';
import { replay } from './replay';
import { attemptRankingTuple, compareAttempts, type AttemptRankingTuple } from './score';

function allGatherValue(tuple: AttemptRankingTuple): number {
  return tuple.allGatherCount ?? 0;
}

function dominates(left: AttemptRankingTuple, right: AttemptRankingTuple): boolean {
  const noWorse =
    left.makespan <= right.makespan &&
    left.peakActivationMemory <= right.peakActivationMemory &&
    allGatherValue(left) <= allGatherValue(right) &&
    left.intentionalIdle <= right.intentionalIdle &&
    left.actionCount <= right.actionCount;
  const strictlyBetter =
    left.makespan < right.makespan ||
    left.peakActivationMemory < right.peakActivationMemory ||
    allGatherValue(left) < allGatherValue(right) ||
    left.intentionalIdle < right.intentionalIdle ||
    left.actionCount < right.actionCount;

  return noWorse && strictlyBetter;
}

describe('findExactSchedule', () => {
  it('finds the exact dependency-chain schedule', () => {
    const result = findExactSchedule(makeConfig());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.actions).toEqual(placeIds('F:0:0', 'F:1:0', 'B:1:0', 'B:0:0'));
    expect(result.score).toMatchObject({
      makespan: 6,
      peakActivationMemory: 1,
      complete: true,
    });
    expect(result.stats.completeSchedules).toBeGreaterThan(0);
  });

  it('ranks an interleaved schedule ahead of all-forward/all-backward by memory', () => {
    const config = makeConfig({ microbatchCount: 3 });
    const afab = expectState(
      replay(
        config,
        placeIds(
          'F:0:0',
          'F:0:1',
          'F:0:2',
          'F:1:0',
          'F:1:1',
          'F:1:2',
          'B:1:0',
          'B:0:0',
          'B:1:1',
          'B:0:1',
          'B:1:2',
          'B:0:2',
        ),
      ),
    );

    const result = findExactSchedule(config);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(compareAttempts(result.ranking, attemptRankingTuple(afab))).toBeLessThan(0);
    expect(result.ranking.makespan).toBe(attemptRankingTuple(afab).makespan);
    expect(result.ranking.peakActivationMemory).toBeLessThan(
      attemptRankingTuple(afab).peakActivationMemory,
    );
    expect(result.actions).toHaveLength(result.state.operations.length);
    expect(result.stats.prunedByDominance).toBeGreaterThan(0);
  });

  it('returns actions that ordinary replay reproduces exactly', () => {
    const config = makeConfig({ microbatchCount: 2 });

    const result = findExactSchedule(config);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const replayed = replay(config, result.actions);
    expect(replayed.ok).toBe(true);
    if (replayed.ok) {
      expect(replayed.state.placements).toEqual(result.state.placements);
      expect(attemptRankingTuple(replayed.state)).toEqual(result.ranking);
    }
  });

  it('respects replay memory caps while searching', () => {
    const result = findExactSchedule(makeConfig({ microbatchCount: 2, memoryCaps: [1, 1] }), {
      maxOperations: 8,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.peakMemory).toEqual([1, 1]);
    expect(result.state.currentMemory).toEqual([0, 0]);
  });

  it('supports split F/B/W schedules and releases activation at W', () => {
    const result = findExactSchedule(
      makeConfig({
        durations: { F: 1, B: 1, W: 1 },
        operationModel: { backward: 'split' },
        microbatchCount: 2,
      }),
      { maxOperations: 12 },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.operations.some((operation) => operation.kind === 'W')).toBe(true);
    expect(result.state.currentMemory).toEqual([0, 0]);
    expect(result.score.complete).toBe(true);
  });

  it('returns structured unsupported results for DualPipe and residency levels', () => {
    expect(findExactSchedule(getLevel('dualpipe-balance'))).toMatchObject({
      ok: false,
      reason: { kind: 'unsupported-dual-pipe' },
    });
    expect(findExactSchedule(getLevel('gather-once-reuse'))).toMatchObject({
      ok: false,
      reason: { kind: 'unsupported-residency' },
    });
  });

  it('returns a structured limit result before searching oversized levels', () => {
    expect(findExactSchedule(getLevel('gpipe-afab'), { maxOperations: 4 })).toMatchObject({
      ok: false,
      reason: { kind: 'too-many-operations', operationCount: 24, maxOperations: 4 },
      stats: { operationCount: 24, statesVisited: 0 },
    });
  });
});

describe('findExactScheduleFrontier', () => {
  it('returns replayable nondominated schedules sorted by the ranking tuple', () => {
    const config = makeConfig({ microbatchCount: 3 });
    const best = findExactSchedule(config, { maxOperations: 12 });

    const result = findExactScheduleFrontier(config, { maxOperations: 12 });

    expect(best.ok).toBe(true);
    expect(result.ok).toBe(true);
    if (!best.ok || !result.ok) return;
    expect(result.frontier.length).toBeGreaterThan(0);
    expect(result.frontier[0]?.ranking).toEqual(best.ranking);
    for (let index = 1; index < result.frontier.length; index += 1) {
      expect(
        compareAttempts(result.frontier[index - 1]!.ranking, result.frontier[index]!.ranking),
      ).toBeLessThanOrEqual(0);
    }

    for (const schedule of result.frontier) {
      const key = JSON.stringify(schedule.ranking);
      const replayed = replay(config, schedule.actions);
      expect(replayed.ok).toBe(true);
      if (replayed.ok) {
        expect(attemptRankingTuple(replayed.state)).toEqual(schedule.ranking);
      }
      expect(result.frontier.filter((other) => JSON.stringify(other.ranking) === key)).toHaveLength(
        1,
      );
    }

    for (let left = 0; left < result.frontier.length; left += 1) {
      for (let right = 0; right < result.frontier.length; right += 1) {
        if (left === right) {
          continue;
        }
        expect(dominates(result.frontier[left]!.ranking, result.frontier[right]!.ranking)).toBe(
          false,
        );
      }
    }
  });

  it('returns structured unsupported and limit results', () => {
    expect(findExactScheduleFrontier(getLevel('dualpipe-balance'))).toMatchObject({
      ok: false,
      reason: { kind: 'unsupported-dual-pipe' },
    });
    expect(findExactScheduleFrontier(getLevel('gather-once-reuse'))).toMatchObject({
      ok: false,
      reason: { kind: 'unsupported-residency' },
    });
    expect(findExactScheduleFrontier(getLevel('gpipe-afab'), { maxOperations: 4 })).toMatchObject({
      ok: false,
      reason: { kind: 'too-many-operations', operationCount: 24, maxOperations: 4 },
      stats: { operationCount: 24, statesVisited: 0 },
    });
  });
});
