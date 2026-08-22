import { describe, expect, it } from 'vitest';
import type { Action } from './types';
import { LEGAL_ACTIONS, MASTERED_ACTIONS } from '../levels/fixtures';
import { getLevel } from '../levels/levels';
import { replay } from './replay';
import { compareToReferencePolicy } from './policyComparison';

function replayComplete(levelId: Parameters<typeof getLevel>[0], actions: readonly Action[]) {
  const result = replay(getLevel(levelId), actions);
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error('unreachable replay failure');
  }
  return result.state;
}

describe('policy comparison', () => {
  it('returns exact zero deltas for the GPipe AFAB reference schedule', () => {
    const state = replayComplete('gpipe-afab', MASTERED_ACTIONS['gpipe-afab']);

    expect(compareToReferencePolicy(state)).toEqual({
      policyId: 'gpipe-afab',
      label: 'GPipe AFAB',
      match: 'exact',
      current: {
        makespan: 18,
        peakActivationMemory: 4,
        intentionalIdle: 0,
        actionCount: 24,
      },
      reference: {
        makespan: 18,
        peakActivationMemory: 4,
        intentionalIdle: 0,
        actionCount: 24,
      },
      delta: {
        makespan: 0,
        peakActivationMemory: 0,
        intentionalIdle: 0,
        actionCount: 0,
      },
    });
  });

  it('reports order-only matches when intentional idle changes timing', () => {
    const state = replayComplete('gpipe-afab', LEGAL_ACTIONS['gpipe-afab']);
    const comparison = compareToReferencePolicy(state);

    expect(comparison).toMatchObject({
      policyId: 'gpipe-afab',
      label: 'GPipe AFAB',
      match: 'order-only',
    });
    expect(comparison?.delta.makespan).toBe(1);
    expect(comparison?.delta.intentionalIdle).toBe(1);
  });

  it('compares unmatched complete schedules against the family reference', () => {
    const state = replayComplete('gpipe-afab', [
      ...MASTERED_ACTIONS['gpipe-afab'].slice(0, 12),
      { type: 'place', operationId: 'B:2:3' },
      { type: 'place', operationId: 'B:1:3' },
      { type: 'place', operationId: 'B:0:3' },
      ...MASTERED_ACTIONS['gpipe-afab'].slice(12, 21),
    ]);

    const comparison = compareToReferencePolicy(state);

    expect(comparison).toMatchObject({
      policyId: 'gpipe-afab',
      label: 'GPipe AFAB',
      match: 'unmatched',
    });
    expect(comparison?.current.makespan).toBeGreaterThanOrEqual(
      comparison?.reference.makespan ?? 0,
    );
  });

  it('returns null for incomplete schedules', () => {
    const result = replay(getLevel('gpipe-afab'), MASTERED_ACTIONS['gpipe-afab'].slice(0, 4));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(compareToReferencePolicy(result.state)).toBeNull();
    }
  });

  it('does not label foundation levels as algorithm references', () => {
    const state = replayComplete('dependency-chain', MASTERED_ACTIONS['dependency-chain']);

    expect(compareToReferencePolicy(state)).toBeNull();
  });
});
