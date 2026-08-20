import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  applyAction,
  classifyMoves,
  initialState,
  replay,
  type MoveClassification,
} from './replay';
import { score } from './score';
import type { Action, LevelConfig, PlaceOperationAction } from './types';
import { expectApplied, legalReplayArbitrary, makeConfig } from '../test/factories';
import { classifyOperation } from './replay';
import { runUntilInteresting } from '../coaching/coaching';

const PROPERTY_RUNS = 150;
const MAX_WAIT_ACTIONS = 12;
const MAX_COMPLETE_CHOICES = 64;

type LegalMoveClassification = Extract<MoveClassification, { status: 'legal' }>;

const completeConfigArbitrary = fc
  .record({
    rankCount: fc.integer({ min: 1, max: 4 }),
    microbatchCount: fc.integer({ min: 1, max: 4 }),
    choices: fc.array(fc.nat(), { minLength: 1, maxLength: MAX_COMPLETE_CHOICES }),
  })
  .map(({ rankCount, microbatchCount, choices }) => {
    const config = makeConfig({
      rankCount,
      stageCount: rankCount,
      microbatchCount,
      memoryCaps: null,
    });
    const actions = completeActionsForConfig(config, choices);

    return { config, actions };
  });

const waitBearingReplayArbitrary = fc
  .record({
    rankCount: fc.integer({ min: 1, max: 4 }),
    microbatchCount: fc.integer({ min: 1, max: 4 }),
    cap: fc.option(fc.integer({ min: 1, max: 4 }), { nil: null }),
  })
  .chain(({ rankCount, microbatchCount, cap }) =>
    fc.record({
      rankCount: fc.constant(rankCount),
      microbatchCount: fc.constant(microbatchCount),
      cap: fc.constant(cap),
      waitRank: fc.integer({ min: 0, max: rankCount - 1 }),
      choices: fc.array(fc.nat(), { maxLength: MAX_WAIT_ACTIONS - 1 }),
    }),
  )
  .map(({ rankCount, microbatchCount, cap, waitRank, choices }) => {
    const config = makeConfig({
      rankCount,
      stageCount: rankCount,
      microbatchCount,
      memoryCaps: cap === null ? null : Array(rankCount).fill(cap),
    });
    const actions: Action[] = [{ type: 'wait', rank: waitRank }];
    let state = initialState(config);

    const initialWait = applyAction(state, actions[0]!);
    if (!initialWait.ok) {
      throw new Error('wait-bearing arbitrary selected an invalid initial wait');
    }
    state = initialWait.state;

    for (const choice of choices) {
      const legalMoves = classifyWaitBearingActions(state);
      if (legalMoves.length === 0) {
        break;
      }

      const action = legalMoves[choice % legalMoves.length]!;
      const result = applyAction(state, action);
      if (!result.ok) {
        throw new Error('wait-bearing arbitrary selected a rejected action');
      }

      actions.push(action);
      state = result.state;
    }

    return { config, actions };
  });

function isLegalMove(move: MoveClassification): move is LegalMoveClassification {
  return move.status === 'legal';
}

function classifyWaitBearingActions(state: ReturnType<typeof initialState>): readonly Action[] {
  const placementActions = classifyMoves(state)
    .filter(isLegalMove)
    .map((move): Action => ({
      type: 'place',
      operationId: move.operation.id,
    }));

  const waitActions = state.rankFrontiers.map((_, rank): Action => ({ type: 'wait', rank }));

  return Object.freeze([...placementActions, ...waitActions]);
}

function completeActionsForConfig(
  config: LevelConfig,
  choices: readonly number[],
): readonly Action[] {
  let state = initialState(config);
  const actions: Action[] = [];
  const maxActions = state.operations.length;
  let step = 0;

  while (step < maxActions) {
    const legalPlacements = classifyMoves(state).filter(isLegalMove);
    if (legalPlacements.length === 0) {
      break;
    }

    const choice = choices[step] ?? 0;
    const legalPlacement = legalPlacements[choice % legalPlacements.length]!;
    const action: Action = {
      type: 'place',
      operationId: legalPlacement.operation.id,
    };
    const result = applyAction(state, action);
    if (!result.ok) {
      throw new Error('deterministic completion builder selected a rejected action');
    }
    actions.push(action);
    state = result.state;
    step += 1;
  }

  if (actions.length !== state.operations.length) {
    throw new Error('deterministic completion builder failed to place every operation');
  }

  return Object.freeze(actions);
}

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
      { numRuns: PROPERTY_RUNS, verbose: 1 },
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
      { numRuns: PROPERTY_RUNS, verbose: 1 },
    );
  });

  it('bounded wait-bearing replays preserve intentional idle accounting and score invariants', () => {
    fc.assert(
      fc.property(waitBearingReplayArbitrary, ({ config, actions }) => {
        const result = replay(config, actions);
        expect(result.ok).toBe(true);
        if (!result.ok) {
          return;
        }

        const scored = score(result.state);
        const expectedIntentionalIdle = actions.reduce((total, action) => {
          return action.type === 'wait' ? total + 1 : total;
        }, 0);

        expect(actions.some((action) => action.type === 'wait')).toBe(true);
        expect(actions.length).toBeLessThanOrEqual(MAX_WAIT_ACTIONS);
        expect(scored.intentionalIdle).toBe(expectedIntentionalIdle);
        expect(
          result.state.gaps
            .filter((gap) => gap.kind === 'intentional')
            .reduce((total, gap) => {
              return total + (gap.end - gap.start);
            }, 0),
        ).toBe(expectedIntentionalIdle);
        expect(result.state.actions).toEqual(actions);
        expect(scored.bubbleRatio).toBeGreaterThanOrEqual(0);
        expect(scored.bubbleRatio).toBeLessThanOrEqual(1);
        expect(scored.totalWork).toBeLessThanOrEqual(scored.capacity);
      }),
      { numRuns: PROPERTY_RUNS, verbose: 1 },
    );
  });

  it('deterministically constructed complete schedules contain every operation exactly once', () => {
    fc.assert(
      fc.property(completeConfigArbitrary, ({ config, actions }) => {
        const result = replay(config, actions);
        expect(result.ok).toBe(true);
        if (!result.ok) {
          return;
        }

        const scored = score(result.state);
        expect(scored.complete).toBe(true);
        expect(actions).toHaveLength(result.state.operations.length);
        expect(result.state.placements).toHaveLength(result.state.operations.length);
        expect(
          new Set(result.state.placements.map((placement) => placement.operationId)).size,
        ).toBe(result.state.operations.length);
        expect(result.state.placements.map((placement) => placement.operationId).sort()).toEqual(
          result.state.operations.map((operation) => operation.id).sort(),
        );
      }),
      { numRuns: PROPERTY_RUNS, verbose: 1 },
    );
  });

  it('automation only applies legal unique place actions, replays to the returned state, and does not mutate input', () => {
    fc.assert(
      fc.property(legalReplayArbitrary, ({ config, actions }) => {
        const replayResult = replay(config, actions);
        expect(replayResult.ok).toBe(true);
        if (!replayResult.ok) {
          return;
        }
        const { state } = replayResult;

        const snapshot = JSON.parse(JSON.stringify(state));
        const initialRemaining = state.operations.length - state.placements.length;

        const result = runUntilInteresting(state);

        expect(result.applied.every((action) => action.type === 'place')).toBe(true);

        const appliedIds = result.applied.map((a) => (a as PlaceOperationAction).operationId);
        expect(new Set(appliedIds).size).toBe(appliedIds.length);

        let cursor = state;
        for (const action of result.applied) {
          expect(action.type).toBe('place');
          expect(Object.isFrozen(action)).toBe(true);
          if (action.type !== 'place') {
            continue;
          }

          const classification = classifyOperation(cursor, action.operationId);
          expect(classification.status).toBe('legal');
          cursor = expectApplied(applyAction(cursor, action));
        }

        const replayed = replay(config, [...actions, ...result.applied]);
        expect(replayed.ok).toBe(true);
        if (replayed.ok) {
          expect(replayed.state).toEqual(result.state);
        }
        expect(cursor).toEqual(result.state);

        expect(result.applied.length).toBeLessThanOrEqual(initialRemaining);

        expect(JSON.parse(JSON.stringify(state))).toEqual(snapshot);
      }),
      { numRuns: PROPERTY_RUNS, verbose: 1 },
    );
  });
});
