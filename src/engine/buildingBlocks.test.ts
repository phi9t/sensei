import { describe, expect, it } from 'vitest';
import { replay } from './replay';
import { score } from './score';
import {
  expandBuildingBlockPlan,
  validateBuildingBlockPlan,
  type BuildingBlockPlan,
} from './buildingBlocks';
import type { LevelConfig } from './types';

const BASE_LEVEL: LevelConfig = Object.freeze({
  id: 'test-building-block',
  version: 1,
  title: 'Test Building Block',
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
    concept: 'Test periodic trajectory.',
    objective: 'Stamp a trajectory.',
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

function planWithOffset(
  operationId: BuildingBlockPlan['trajectory'][number]['operationId'],
  offset: number,
): BuildingBlockPlan {
  return Object.freeze({
    period: VALID_PLAN.period,
    trajectory: Object.freeze(
      VALID_PLAN.trajectory.map((entry) =>
        Object.freeze({
          ...entry,
          offset: entry.operationId === operationId ? offset : entry.offset,
        }),
      ),
    ),
  });
}

function placementStarts(result: ReturnType<typeof replay>): Record<string, number> {
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error('expected replay success');
  }

  expect(score(result.state).complete).toBe(true);
  return Object.fromEntries(
    result.state.placements.map((placement) => [placement.operationId, placement.start]),
  );
}

describe('building-block plans', () => {
  it('validates and expands a periodic trajectory into a complete ordinary action log', () => {
    const validation = validateBuildingBlockPlan(BASE_LEVEL, VALID_PLAN);

    expect(validation).toEqual({
      ok: true,
      period: 3,
      violations: [],
      projectedPeakMemory: [2, 1],
    });

    const expanded = expandBuildingBlockPlan(BASE_LEVEL, VALID_PLAN);
    expect(expanded.ok).toBe(true);
    if (!expanded.ok) {
      throw new Error('expected expansion success');
    }

    expect(expanded.actions).toContainEqual({ type: 'wait', rank: 0 });
    expect(expanded.actions.filter((action) => action.type === 'place')).toHaveLength(
      BASE_LEVEL.stageCount * BASE_LEVEL.microbatchCount * 2,
    );

    expect(placementStarts(replay(BASE_LEVEL, expanded.actions))).toMatchObject({
      'F:0:0': 0,
      'F:1:0': 1,
      'B:1:0': 2,
      'F:0:1': 3,
      'B:0:0': 4,
      'F:1:1': 4,
      'B:1:1': 5,
      'F:0:2': 6,
      'B:0:1': 7,
      'F:1:2': 7,
      'B:1:2': 8,
      'B:0:2': 10,
    });
  });

  it('reports an invalid period without trying residue math', () => {
    const validation = validateBuildingBlockPlan(BASE_LEVEL, {
      period: 0,
      trajectory: VALID_PLAN.trajectory,
    });

    expect(validation.ok).toBe(false);
    expect(validation.violations).toContainEqual({ kind: 'invalid-period', period: 0 });
  });

  it.each([
    ['infinite', Infinity],
    ['NaN', NaN],
    ['fractional', 1.5],
    ['negative', -1],
  ])('reports an invalid %s offset', (_label, offset) => {
    const validation = validateBuildingBlockPlan(BASE_LEVEL, planWithOffset('B:0:0', offset));

    expect(validation.ok).toBe(false);
    expect(validation.violations).toContainEqual({
      kind: 'invalid-offset',
      operationId: 'B:0:0',
      offset,
    });
  });

  it('refuses to expand a plan with an infinite offset', () => {
    const invalidPlan = planWithOffset('B:0:0', Infinity);
    const validation = validateBuildingBlockPlan(BASE_LEVEL, invalidPlan);

    expect(expandBuildingBlockPlan(BASE_LEVEL, invalidPlan)).toEqual({
      ok: false,
      validation,
    });
  });

  it('reports unknown operations', () => {
    const validation = validateBuildingBlockPlan(BASE_LEVEL, {
      period: 3,
      trajectory: [
        { operationId: 'F:0:0', offset: 0 },
        { operationId: 'F:1:0', offset: 1 },
        { operationId: 'B:1:0', offset: 2 },
        { operationId: 'B:0:0', offset: 4 },
        { operationId: 'F:2:0', offset: 5 },
      ],
    });

    expect(validation.ok).toBe(false);
    expect(validation.violations).toContainEqual({
      kind: 'unknown-operation',
      operationId: 'F:2:0',
    });
  });

  it('reports duplicate representative operations', () => {
    const validation = validateBuildingBlockPlan(BASE_LEVEL, {
      period: 3,
      trajectory: [
        { operationId: 'F:0:0', offset: 0 },
        { operationId: 'F:0:0', offset: 1 },
        { operationId: 'F:1:0', offset: 2 },
        { operationId: 'B:1:0', offset: 3 },
        { operationId: 'B:0:0', offset: 5 },
      ],
    });

    expect(validation.ok).toBe(false);
    expect(validation.violations).toContainEqual({
      kind: 'duplicate-operation',
      operationId: 'F:0:0',
    });
  });

  it('reports missing representative operations', () => {
    const validation = validateBuildingBlockPlan(BASE_LEVEL, {
      period: 3,
      trajectory: [
        { operationId: 'F:0:0', offset: 0 },
        { operationId: 'F:1:0', offset: 1 },
        { operationId: 'B:1:0', offset: 2 },
      ],
    });

    expect(validation.ok).toBe(false);
    expect(validation.violations).toContainEqual({
      kind: 'missing-operation',
      operationId: 'B:0:0',
    });
  });

  it('reports duplicate occupied residues on the same rank', () => {
    const validation = validateBuildingBlockPlan(BASE_LEVEL, {
      period: 3,
      trajectory: [
        { operationId: 'F:0:0', offset: 0 },
        { operationId: 'B:0:0', offset: 3 },
      ],
    });

    expect(validation.ok).toBe(false);
    expect(validation.violations).toContainEqual({
      kind: 'duplicate-rank-residue',
      rank: 0,
      residue: 0,
      operationIds: ['F:0:0', 'B:0:0'],
    });
  });

  it('reports occupied residues repeated by one operation across stamped copies', () => {
    const validation = validateBuildingBlockPlan(BASE_LEVEL, {
      period: 1,
      trajectory: [{ operationId: 'B:0:0', offset: 0 }],
    });

    expect(validation.ok).toBe(false);
    expect(validation.violations).toContainEqual({
      kind: 'duplicate-rank-residue',
      rank: 0,
      residue: 0,
      operationIds: ['B:0:0', 'B:0:0'],
    });
  });

  it('reports dependencies that cannot be satisfied at stamped offsets', () => {
    const validation = validateBuildingBlockPlan(BASE_LEVEL, {
      period: 3,
      trajectory: [
        { operationId: 'F:0:0', offset: 0 },
        { operationId: 'F:1:0', offset: 0 },
        { operationId: 'B:1:0', offset: 2 },
        { operationId: 'B:0:0', offset: 4 },
      ],
    });

    expect(validation.ok).toBe(false);
    expect(validation.violations).toContainEqual({
      kind: 'unsatisfied-dependency',
      operationId: 'F:1:0',
      dependencyId: 'F:0:0',
    });
  });

  it('reports projected memory cap overflow and refuses expansion', () => {
    const cappedLevel: LevelConfig = Object.freeze({
      ...BASE_LEVEL,
      memoryCaps: Object.freeze([1, 1]),
    });

    const validation = validateBuildingBlockPlan(cappedLevel, VALID_PLAN);

    expect(validation.ok).toBe(false);
    expect(validation.violations).toContainEqual({
      kind: 'memory-cap',
      rank: 0,
      peak: 2,
      cap: 1,
    });

    const expanded = expandBuildingBlockPlan(cappedLevel, VALID_PLAN);
    expect(expanded).toEqual({ ok: false, validation });
  });
});
