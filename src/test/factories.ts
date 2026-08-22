import fc from 'fast-check';
import type { Action, LevelConfig, OperationId, PlaceOperationAction } from '../engine/types';
import { applyAction, classifyMoves, initialState } from '../engine/replay';
import type {
  ApplyResult,
  MoveClassification,
  ReplayResult,
  ScheduleState,
} from '../engine/replay';

export function makeConfig(overrides: Partial<LevelConfig> = {}): LevelConfig {
  return {
    id: 'test',
    version: 1,
    title: 'Test',
    rankCount: 2,
    stageCount: 2,
    microbatchCount: 1,
    durations: { F: 1, B: 2 },
    memoryCaps: null,
    masteryTargets: [],
    coaching: { readySet: true, suggest: false, auto: false },
    algorithm: {
      family: 'foundations',
      setTitle: 'Test',
      concept: 'Test concept.',
      objective: 'Test objective.',
      patternLabel: null,
      introducedModel: [],
    },
    ...overrides,
  };
}

export function placeIds(...operationIds: OperationId[]): PlaceOperationAction[] {
  return operationIds.map((operationId) => ({ type: 'place', operationId }));
}

export function expectState(result: ReplayResult): ScheduleState {
  if (!result.ok) {
    throw new Error(`replay failed at action ${result.index}: ${result.reason.kind}`);
  }
  return result.state;
}

export function expectApplied(result: ApplyResult): ScheduleState {
  if (!result.ok) {
    throw new Error(result.reason.kind);
  }
  return result.state;
}

function isLegalMove(
  move: MoveClassification,
): move is Extract<MoveClassification, { status: 'legal' }> {
  return move.status === 'legal';
}

export const legalReplayArbitrary = fc
  .record({
    rankCount: fc.integer({ min: 1, max: 4 }),
    microbatchCount: fc.integer({ min: 1, max: 4 }),
    cap: fc.option(fc.integer({ min: 1, max: 4 }), { nil: null }),
    choices: fc.array(fc.nat(), { maxLength: 64 }),
  })
  .map(({ rankCount, microbatchCount, cap, choices }) => {
    const config = makeConfig({
      rankCount,
      stageCount: rankCount,
      microbatchCount,
      memoryCaps: cap === null ? null : Array(rankCount).fill(cap),
    });
    const actions: Action[] = [];
    let state = initialState(config);

    for (const choice of choices) {
      const legal = classifyMoves(state).filter(isLegalMove);
      if (legal.length === 0) {
        break;
      }

      const selected = legal[choice % legal.length]!;
      const action: Action = { type: 'place', operationId: selected.operation.id };
      const result = applyAction(state, action);
      if (!result.ok) {
        throw new Error('classified legal move was rejected');
      }

      actions.push(action);
      state = result.state;
    }

    return { config, actions };
  });
