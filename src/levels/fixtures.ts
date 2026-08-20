import type { Action, OperationId } from '../engine/types';
import type { LevelId } from './levels';

function place(operationId: OperationId): Action {
  return Object.freeze({ type: 'place', operationId });
}

function wait(rank: number): Action {
  return Object.freeze({ type: 'wait', rank });
}

function placeIds(...operationIds: readonly OperationId[]): readonly Action[] {
  return Object.freeze(operationIds.map((operationId) => place(operationId)));
}

function withLeadingWait(actions: readonly Action[]): readonly Action[] {
  return Object.freeze([wait(0), ...actions]);
}

const masteredActions = {
  'dependency-chain': placeIds('F:0:0', 'F:1:0', 'B:1:0', 'B:0:0'),
  'fill-the-pipe': placeIds(
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
  'backward-is-heavier': placeIds(
    'F:0:0',
    'F:0:1',
    'F:0:2',
    'F:1:0',
    'F:1:1',
    'F:1:2',
    'F:2:0',
    'F:2:1',
    'F:2:2',
    'B:2:0',
    'B:1:0',
    'B:0:0',
    'B:2:1',
    'B:1:1',
    'B:0:1',
    'B:2:2',
    'B:1:2',
    'B:0:2',
  ),
  'memory-wall': placeIds(
    'F:0:0',
    'F:0:1',
    'F:0:2',
    'F:1:0',
    'F:1:1',
    'F:2:0',
    'B:2:0',
    'B:1:0',
    'B:0:0',
    'F:0:3',
    'F:1:2',
    'F:2:1',
    'B:2:1',
    'B:1:1',
    'B:0:1',
    'F:1:3',
    'F:2:2',
    'B:2:2',
    'B:1:2',
    'B:0:2',
    'F:2:3',
    'B:2:3',
    'B:1:3',
    'B:0:3',
  ),
} satisfies Record<LevelId, readonly Action[]>;

export const MASTERED_ACTIONS = Object.freeze(masteredActions);

const legalActions = {
  'dependency-chain': withLeadingWait(MASTERED_ACTIONS['dependency-chain']),
  'fill-the-pipe': withLeadingWait(MASTERED_ACTIONS['fill-the-pipe']),
  'backward-is-heavier': withLeadingWait(MASTERED_ACTIONS['backward-is-heavier']),
  'memory-wall': withLeadingWait(MASTERED_ACTIONS['memory-wall']),
} satisfies Record<LevelId, readonly Action[]>;

export const LEGAL_ACTIONS = Object.freeze(legalActions);
