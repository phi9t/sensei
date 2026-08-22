import { describe, expect, it } from 'vitest';
import { MASTERED_ACTIONS, LEGAL_ACTIONS } from '../levels/fixtures';
import { getLevel } from '../levels/levels';
import { replay } from './replay';
import { projectReferencePolicy, recognizeSchedule } from './policies';

describe('reference policy projection', () => {
  it('projects the current-engine GPipe AFAB reference schedule', () => {
    const projected = projectReferencePolicy(getLevel('gpipe-afab'), 'gpipe-afab');

    expect(projected.ok).toBe(true);
    if (projected.ok) {
      expect(projected.actions).toEqual(MASTERED_ACTIONS['gpipe-afab']);
      expect(projected.state.placements).toHaveLength(projected.state.operations.length);
    }
  });

  it('projects the current-engine 1F1B reference schedules', () => {
    for (const levelId of [
      'warm-up-then-alternate',
      'tie-at-the-frontier',
      'memory-capped-one-f-one-b',
    ] as const) {
      const projected = projectReferencePolicy(getLevel(levelId), 'one-f-one-b');

      expect(projected.ok).toBe(true);
      if (projected.ok) {
        expect(projected.actions).toEqual(MASTERED_ACTIONS[levelId]);
        expect(projected.state.placements).toHaveLength(projected.state.operations.length);
      }
    }
  });

  it('returns a structured failure when a policy cannot complete a level', () => {
    const projected = projectReferencePolicy(getLevel('memory-wall'), 'gpipe-afab');

    expect(projected).toEqual({
      ok: false,
      policyId: 'gpipe-afab',
      reason: {
        kind: 'blocked',
        operationId: 'F:0:3',
        blockReason: { kind: 'memory-cap', rank: 0, resident: 3, requested: 1, cap: 3 },
      },
    });
  });
});

describe('reference policy recognition', () => {
  it('recognizes exact GPipe AFAB and 1F1B schedules', () => {
    const gpipe = replay(getLevel('gpipe-afab'), MASTERED_ACTIONS['gpipe-afab']);
    const oneFOneB = replay(
      getLevel('warm-up-then-alternate'),
      MASTERED_ACTIONS['warm-up-then-alternate'],
    );

    expect(gpipe.ok).toBe(true);
    expect(oneFOneB.ok).toBe(true);
    if (gpipe.ok) {
      expect(recognizeSchedule(gpipe.state)).toMatchObject({
        kind: 'matched',
        policyId: 'gpipe-afab',
        label: 'GPipe AFAB',
        exact: true,
      });
    }
    if (oneFOneB.ok) {
      expect(recognizeSchedule(oneFOneB.state)).toMatchObject({
        kind: 'matched',
        policyId: 'one-f-one-b',
        label: '1F1B',
        exact: true,
      });
    }
  });

  it('recognizes policy order even when intentional idle changes exact timing', () => {
    const replayResult = replay(getLevel('gpipe-afab'), LEGAL_ACTIONS['gpipe-afab']);

    expect(replayResult.ok).toBe(true);
    if (replayResult.ok) {
      expect(recognizeSchedule(replayResult.state)).toMatchObject({
        kind: 'matched',
        policyId: 'gpipe-afab',
        exact: false,
      });
    }
  });

  it('reports unmatched complete schedules without claiming optimality', () => {
    const replayResult = replay(getLevel('gpipe-afab'), [
      ...MASTERED_ACTIONS['gpipe-afab'].slice(0, 12),
      { type: 'place', operationId: 'B:2:3' },
      { type: 'place', operationId: 'B:1:3' },
      { type: 'place', operationId: 'B:0:3' },
      ...MASTERED_ACTIONS['gpipe-afab'].slice(12, 21),
    ]);

    expect(replayResult.ok).toBe(true);
    if (replayResult.ok) {
      expect(recognizeSchedule(replayResult.state)).toEqual({
        kind: 'unmatched',
        candidatePolicyIds: ['gpipe-afab', 'one-f-one-b'],
      });
    }
  });
});
