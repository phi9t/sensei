import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { applyAction, initialState, replay } from './replay';
import { score } from './score';
import { legalReplayArbitrary } from '../test/factories';

describe('engine properties', () => {
  it('replaying the same legal input twice yields the same result and bounded accounting', () => {
    fc.assert(
      fc.property(legalReplayArbitrary, ({ config, actions }) => {
        const first = replay(config, actions);
        const second = replay(config, actions);
        expect(second).toEqual(first);
        if (!first.ok) {
          return;
        }

        expect(
          first.state.currentMemory.every(
            (resident, rank) =>
              config.memoryCaps === null || resident <= (config.memoryCaps[rank] ?? 0),
          ),
        ).toBe(true);

        const result = score(first.state);
        expect(result.bubbleRatio).toBeGreaterThanOrEqual(0);
        expect(result.bubbleRatio).toBeLessThanOrEqual(1);
        expect(result.totalWork).toBeLessThanOrEqual(result.capacity);
      }),
      { numRuns: 200, verbose: 1 },
    );
  });

  it('replaying prefixes matches earlier immutable states and replaying the full log restores the same state', () => {
    fc.assert(
      fc.property(legalReplayArbitrary, ({ config, actions }) => {
        const states = [initialState(config)];
        let state = states[0]!;

        for (const action of actions) {
          const step = applyAction(state, action);
          expect(step.ok).toBe(true);
          if (!step.ok) {
            return;
          }
          state = step.state;
          states.push(state);
        }

        for (let index = 0; index <= actions.length; index++) {
          const prefix = actions.slice(0, index);
          const replayed = replay(config, prefix);
          expect(replayed).toEqual({ ok: true, state: states[index]! });
        }

        const replayedFull = replay(config, actions);
        expect(replayedFull).toEqual({ ok: true, state });
      }),
      { numRuns: 150, verbose: 1 },
    );
  });

  it('completed schedules contain every operation exactly once', () => {
    fc.assert(
      fc.property(legalReplayArbitrary, ({ config, actions }) => {
        const result = replay(config, actions);
        expect(result.ok).toBe(true);
        if (!result.ok) {
          return;
        }

        const scored = score(result.state);
        if (!scored.complete) {
          return;
        }

        expect(result.state.placements).toHaveLength(result.state.operations.length);
        expect(
          new Set(result.state.placements.map((placement) => placement.operationId)).size,
        ).toBe(result.state.operations.length);
        expect(result.state.placements.map((placement) => placement.operationId).sort()).toEqual(
          result.state.operations.map((operation) => operation.id).sort(),
        );
      }),
      { numRuns: 150, verbose: 1 },
    );
  });
});
