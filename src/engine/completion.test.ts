import { describe, expect, it } from 'vitest';
import { LEVEL_IDS, getLevel } from '../levels/levels';
import { MASTERED_ACTIONS } from '../levels/fixtures';
import { initialState, replay } from './replay';
import { score } from './score';
import { completeFromCurrentState } from './completion';

describe('completeFromCurrentState', () => {
  it('preserves the current action prefix and returns a replayable best completion', () => {
    const level = getLevel('dependency-chain');
    const prefix = [{ type: 'place' as const, operationId: 'F:0:0' as const }];
    const current = replay(level, prefix);

    expect(current.ok).toBe(true);
    if (!current.ok) return;

    const result = completeFromCurrentState(current.state);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.actions).toEqual([
      { type: 'place', operationId: 'F:1:0' },
      { type: 'place', operationId: 'B:1:0' },
      { type: 'place', operationId: 'B:0:0' },
    ]);
    expect(result.strategy).toBe('exact');
    expect(result.optimality).toBe('proven');
    expect(score(result.state)).toMatchObject({ complete: true, mastered: true });
    expect(result.state.actions.slice(0, prefix.length)).toEqual(prefix);
  });

  it('finds a replay-validated completion for every curriculum model', () => {
    for (const levelId of LEVEL_IDS) {
      const result = completeFromCurrentState(initialState(getLevel(levelId)));

      expect(result.ok, levelId).toBe(true);
      if (!result.ok) continue;
      expect(score(result.state).complete, levelId).toBe(true);
      expect(replay(getLevel(levelId), result.state.actions), levelId).toEqual({
        ok: true,
        state: result.state,
      });
    }
  });

  it('continues every curriculum model from an existing legal prefix', () => {
    for (const levelId of LEVEL_IDS) {
      const level = getLevel(levelId);
      const fixture = MASTERED_ACTIONS[levelId];
      const prefix = fixture.slice(0, Math.max(1, Math.floor(fixture.length / 2)));
      const current = replay(level, prefix);

      expect(current.ok, levelId).toBe(true);
      if (!current.ok) continue;
      const result = completeFromCurrentState(current.state);

      expect(result.ok, levelId).toBe(true);
      if (!result.ok) continue;
      expect(result.state.actions.slice(0, prefix.length), levelId).toEqual(prefix);
      expect(score(result.state).complete, levelId).toBe(true);
    }
  });
});
