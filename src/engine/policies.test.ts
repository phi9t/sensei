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

  it('projects interleaved 1F1B over virtual-stage topology', () => {
    const projected = projectReferencePolicy(getLevel('virtual-stages'), 'interleaved-one-f-one-b');

    expect(projected.ok).toBe(true);
    if (projected.ok) {
      expect(projected.actions).toEqual(MASTERED_ACTIONS['virtual-stages']);
      expect(projected.state.placements).toEqual([
        { operationId: 'F:0:0', rank: 0, start: 0, end: 1 },
        { operationId: 'F:0:1', rank: 0, start: 1, end: 2 },
        { operationId: 'F:1:0', rank: 1, start: 1, end: 2 },
        { operationId: 'F:2:0', rank: 1, start: 2, end: 3 },
        { operationId: 'F:3:0', rank: 0, start: 3, end: 4 },
        { operationId: 'B:3:0', rank: 0, start: 4, end: 6 },
        { operationId: 'F:1:1', rank: 1, start: 3, end: 4 },
        { operationId: 'F:2:1', rank: 1, start: 4, end: 5 },
        { operationId: 'F:3:1', rank: 0, start: 6, end: 7 },
        { operationId: 'B:3:1', rank: 0, start: 7, end: 9 },
        { operationId: 'B:2:0', rank: 1, start: 6, end: 8 },
        { operationId: 'B:1:0', rank: 1, start: 8, end: 10 },
        { operationId: 'B:0:0', rank: 0, start: 10, end: 12 },
        { operationId: 'B:2:1', rank: 1, start: 10, end: 12 },
        { operationId: 'B:1:1', rank: 1, start: 12, end: 14 },
        { operationId: 'B:0:1', rank: 0, start: 14, end: 16 },
      ]);
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

  it('distinguishes interleaved 1F1B from ordinary 1F1B on virtual-stage rank order', () => {
    const level = getLevel('interleaved-one-f-one-b');
    const interleaved = replay(level, MASTERED_ACTIONS['interleaved-one-f-one-b']);
    const ordinary = projectReferencePolicy(level, 'one-f-one-b');

    expect(interleaved.ok).toBe(true);
    expect(ordinary.ok).toBe(true);
    if (!interleaved.ok || !ordinary.ok) {
      return;
    }

    expect(ordinary.actions).not.toEqual(MASTERED_ACTIONS['interleaved-one-f-one-b']);
    expect(ordinary.state.rankFrontiers).toEqual([32, 30]);

    expect(recognizeSchedule(interleaved.state)).toMatchObject({
      kind: 'matched',
      policyId: 'interleaved-one-f-one-b',
      label: 'Interleaved 1F1B',
      exact: true,
    });
    expect(recognizeSchedule(ordinary.state)).toMatchObject({
      kind: 'matched',
      policyId: 'one-f-one-b',
      label: '1F1B',
      exact: true,
    });
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
