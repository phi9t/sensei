import { describe, expect, it } from 'vitest';
import { getLevel } from '../levels/levels';
import { expandBuildingBlockPlan, type BuildingBlockPlan } from './buildingBlocks';
import { replay } from './replay';
import { score } from './score';
import { findBuildingBlockCandidates, squeezeActionsByRankOrder } from './scheduleSynthesis';
import type { LevelConfig } from './types';

const BASE_LEVEL: LevelConfig = Object.freeze({
  id: 'test-synthesis',
  version: 1,
  title: 'Test Synthesis',
  rankCount: 2,
  stageCount: 2,
  microbatchCount: 3,
  durations: Object.freeze({ F: 1, B: 2 }),
  memoryCaps: null,
  masteryTargets: Object.freeze([]),
  coaching: Object.freeze({ readySet: true, suggest: false, auto: false }),
  algorithm: Object.freeze({
    family: 'building-block',
    setTitle: 'Building Blocks',
    concept: 'Test synthesis.',
    objective: 'Build candidate schedules.',
    patternLabel: 'Periodic',
    introducedModel: Object.freeze(['periodic trajectory']),
  }),
});

const VALID_PLAN: BuildingBlockPlan = Object.freeze({
  period: 3,
  trajectory: Object.freeze([
    Object.freeze({ operationId: 'F:0:0', offset: 0 }),
    Object.freeze({ operationId: 'F:1:0', offset: 1 }),
    Object.freeze({ operationId: 'B:1:0', offset: 2 }),
    Object.freeze({ operationId: 'B:0:0', offset: 4 }),
  ]),
});

describe('squeezeActionsByRankOrder', () => {
  it('squeezes a stamped building-block action log while preserving rank order', () => {
    const expanded = expandBuildingBlockPlan(BASE_LEVEL, VALID_PLAN);
    expect(expanded.ok).toBe(true);
    if (!expanded.ok) return;

    const result = squeezeActionsByRankOrder(BASE_LEVEL, expanded.actions);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.squeezed.actions.every((action) => action.type === 'place')).toBe(true);
    expect(result.removedIntentionalIdle).toBeGreaterThan(0);
    expect(result.squeezed.score.makespan).toBeLessThanOrEqual(result.original.score.makespan);
    expect(result.rankOrders).toEqual([
      ['F:0:0', 'F:0:1', 'B:0:0', 'F:0:2', 'B:0:1', 'B:0:2'],
      ['F:1:0', 'B:1:0', 'F:1:1', 'B:1:1', 'F:1:2', 'B:1:2'],
    ]);
  });

  it('returns source replay failure for invalid action logs', () => {
    expect(
      squeezeActionsByRankOrder(BASE_LEVEL, [{ type: 'place', operationId: 'B:0:0' }]),
    ).toMatchObject({
      ok: false,
      reason: { kind: 'source-replay-failed' },
    });
  });

  it('returns a structured unsupported result for DualPipe levels', () => {
    expect(squeezeActionsByRankOrder(getLevel('dualpipe-balance'), [])).toMatchObject({
      ok: false,
      reason: { kind: 'unsupported-dual-pipe' },
    });
  });
});

describe('findBuildingBlockCandidates', () => {
  it('discovers replayable building-block candidates sorted by score', () => {
    const result = findBuildingBlockCandidates(BASE_LEVEL, {
      minPeriod: 3,
      maxPeriod: 3,
      maxOffset: 4,
      maxRepresentativeOperations: 4,
      maxAssignments: 5_000,
      maxCandidates: 4,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.candidates.length).toBeGreaterThan(0);
    expect(result.candidates[0]?.plan).toEqual(VALID_PLAN);
    for (const candidate of result.candidates) {
      expect(candidate.analysis.validation.ok).toBe(true);
      expect(candidate.expanded.actions.length).toBeGreaterThan(candidate.squeezed.actions.length);
      const replayed = replay(BASE_LEVEL, candidate.squeezed.actions);
      expect(replayed.ok).toBe(true);
      if (replayed.ok) {
        expect(score(replayed.state)).toEqual(candidate.squeezed.score);
      }
    }
  });

  it('returns structured unsupported results for residency levels', () => {
    expect(findBuildingBlockCandidates(getLevel('gather-once-reuse'))).toMatchObject({
      ok: false,
      reason: { kind: 'unsupported-residency' },
    });
  });

  it('returns a structured limit result for too many representative operations', () => {
    expect(
      findBuildingBlockCandidates(getLevel('zero-bubble-h1'), {
        maxRepresentativeOperations: 4,
      }),
    ).toMatchObject({
      ok: false,
      reason: {
        kind: 'too-many-representative-operations',
        representativeOperationCount: 6,
        maxRepresentativeOperations: 4,
      },
    });
  });

  it('returns search exhaustion when assignment budget is too small', () => {
    expect(
      findBuildingBlockCandidates(BASE_LEVEL, {
        minPeriod: 3,
        maxPeriod: 3,
        maxOffset: 4,
        maxRepresentativeOperations: 4,
        maxAssignments: 1,
      }),
    ).toMatchObject({
      ok: false,
      reason: { kind: 'search-exhausted', maxAssignments: 1 },
      stats: { assignmentsVisited: 1 },
    });
  });

  it('returns a structured unsupported result for DualPipe levels', () => {
    expect(findBuildingBlockCandidates(getLevel('dualpipe-balance'))).toMatchObject({
      ok: false,
      reason: { kind: 'unsupported-dual-pipe' },
    });
  });
});
