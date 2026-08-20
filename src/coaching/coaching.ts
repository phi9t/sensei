import {
  classifyOperation,
  classifyMoves,
  type MoveClassification,
  type ScheduleState,
} from '../engine/replay';
import { applyAction } from '../engine/replay';
import type { Action, OperationId } from '../engine/types';
import { parseOperationId } from '../engine/operations';

export type StopReason =
  | { kind: 'choice'; operationIds: readonly OperationId[]; earliestStart: number }
  | { kind: 'dependency-gap'; operationId: OperationId; start: number; rankFrontier: number }
  | { kind: 'memory-boundary'; operationIds: readonly OperationId[] }
  | { kind: 'would-complete'; operationId: OperationId }
  | { kind: 'memory-deadlock' }
  | { kind: 'deadlock' };

export interface CoachingResult {
  state: ScheduleState;
  applied: readonly Action[];
  stop: StopReason;
}

export interface ReadyEntry {
  operationId: OperationId;
  earliestStart: number;
  projectedMemory: number;
}

export interface Suggestion {
  operationId: OperationId;
  earliestStart: number;
  projectedMemory: number;
  reason: {
    kind: 'rank-frontier';
    rank: number;
    rankFrontier: number;
    message: string;
  };
}

export type ExplanationResult =
  | {
      status: 'completed';
      operationId: OperationId;
      placement: ScheduleState['placementById'][OperationId];
    }
  | { status: 'legal'; operationId: OperationId; earliestStart: number; projectedMemory: number }
  | {
      status: 'blocked';
      operationId: OperationId;
      explanations: readonly ExplanationEntry[];
    };

export interface ExplanationEntry {
  kind: string;
  reason: { kind: string; [key: string]: unknown };
  message: string;
}

function getLegal(
  state: ScheduleState,
): readonly Extract<MoveClassification, { status: 'legal' }>[] {
  return Object.freeze(
    classifyMoves(state).filter(
      (m): m is Extract<MoveClassification, { status: 'legal' }> => m.status === 'legal',
    ),
  );
}

export function revealReadySet(state: ScheduleState): readonly ReadyEntry[] {
  const legal = getLegal(state);
  const sorted = [...legal].sort((a, b) => {
    if (a.earliestStart !== b.earliestStart) return a.earliestStart - b.earliestStart;
    return a.operation.id.localeCompare(b.operation.id);
  });
  return Object.freeze(
    sorted.map((m) =>
      Object.freeze({
        operationId: m.operation.id,
        earliestStart: m.earliestStart,
        projectedMemory: m.projectedMemory,
      }),
    ),
  );
}

export function suggestMove(state: ScheduleState): Suggestion | null {
  const legal = getLegal(state);
  if (legal.length === 0) return null;

  const sorted = [...legal].sort((a, b) => {
    if (a.earliestStart !== b.earliestStart) return a.earliestStart - b.earliestStart;
    return a.operation.id.localeCompare(b.operation.id);
  });

  const first = sorted[0]!;
  const parsed = parseOperationId(first.operation.id);
  const rankFrontier = state.rankFrontiers[first.operation.rank] ?? 0;

  return Object.freeze({
    operationId: first.operation.id,
    earliestStart: first.earliestStart,
    projectedMemory: first.projectedMemory,
    reason: Object.freeze({
      kind: 'rank-frontier' as const,
      rank: first.operation.rank,
      rankFrontier,
      message: `This move can start immediately at rank ${parsed.stage} frontier ${rankFrontier}.`,
    }),
  });
}

function formatBlockMessage(reason: { kind: string; [key: string]: unknown }): string {
  switch (reason.kind) {
    case 'dependency-not-finished': {
      const opId = reason.operationId as string;
      return `Needs ${opId} to finish first.`;
    }
    case 'memory-cap': {
      const rank = reason.rank as number;
      const resident = reason.resident as number;
      const cap = reason.cap as number;
      return `Rank ${rank} is at memory cap ${resident}/${cap} and cannot place another forward activation.`;
    }
    case 'already-placed': {
      const opId = reason.operationId as string;
      return `${opId} is already placed.`;
    }
    case 'invalid-rank': {
      const rank = reason.rank as number;
      return `Rank ${rank} is invalid.`;
    }
    default:
      return `Blocked: ${reason.kind}`;
  }
}

export function explainBlockedMove(
  state: ScheduleState,
  operationId: OperationId,
): ExplanationResult {
  const classification = classifyOperation(state, operationId);

  if (classification.status === 'completed') {
    return Object.freeze({
      status: 'completed' as const,
      operationId,
      placement: classification.placement,
    });
  }

  if (classification.status === 'legal') {
    return Object.freeze({
      status: 'legal' as const,
      operationId,
      earliestStart: classification.earliestStart,
      projectedMemory: classification.projectedMemory,
    });
  }

  const explanations = Object.freeze(
    classification.reasons.map((reason) =>
      Object.freeze({
        kind: reason.kind,
        reason: Object.freeze({ ...reason }),
        message: formatBlockMessage(reason as unknown as { kind: string; [key: string]: unknown }),
      }),
    ),
  );

  return Object.freeze({
    status: 'blocked' as const,
    operationId,
    explanations,
  });
}

export function runUntilInteresting(state: ScheduleState): CoachingResult {
  let currentState = state;
  const applied: Action[] = [];
  const initialRemaining = state.operations.length - state.placements.length;

  for (let guard = 0; guard < initialRemaining; guard++) {
    const legal = getLegal(currentState);
    const blockedMap = getBlockedWithMemoryCap(currentState);

    const totalOps = currentState.operations.length;
    const placedCount = currentState.placements.length;
    const unplaced = totalOps - placedCount;

    if (unplaced === 0) {
      return Object.freeze({
        state: currentState,
        applied: Object.freeze([...applied]),
        stop: Object.freeze({ kind: 'would-complete', operationId: '' as OperationId }),
      });
    }

    // No legal moves at all
    if (legal.length === 0) {
      // Check if there are any memory-cap blockers
      if (blockedMap.length > 0) {
        return Object.freeze({
          state: currentState,
          applied: Object.freeze([...applied]),
          stop: Object.freeze({ kind: 'memory-deadlock' }),
        });
      }
      return Object.freeze({
        state: currentState,
        applied: Object.freeze([...applied]),
        stop: Object.freeze({ kind: 'deadlock' }),
      });
    }

    // Check if all operations are legal (would-complete on last unplaced)
    if (legal.length === unplaced) {
      const sorted = [...legal].sort((a, b) => {
        if (a.earliestStart !== b.earliestStart) return a.earliestStart - b.earliestStart;
        return a.operation.id.localeCompare(b.operation.id);
      });
      const last = sorted[sorted.length - 1]!;
      return Object.freeze({
        state: currentState,
        applied: Object.freeze([...applied]),
        stop: Object.freeze({ kind: 'would-complete', operationId: last.operation.id }),
      });
    }

    // Check for memory-cap blockers among blocked operations
    if (blockedMap.length > 0) {
      const sorted = [...blockedMap].sort((a, b) => a.operationId.localeCompare(b.operationId));
      return Object.freeze({
        state: currentState,
        applied: Object.freeze([...applied]),
        stop: Object.freeze({
          kind: 'memory-boundary',
          operationIds: Object.freeze([sorted[0]!.operationId]),
        }),
      });
    }

    const sortedLegal = [...legal].sort((a, b) => {
      if (a.earliestStart !== b.earliestStart) return a.earliestStart - b.earliestStart;
      return a.operation.id.localeCompare(b.operation.id);
    });

    const minStart = sortedLegal[0]!.earliestStart;
    const atMinStart = sortedLegal.filter((m) => m.earliestStart === minStart);

    // Choice: multiple legal ops share minimum earliestStart
    if (atMinStart.length > 1) {
      return Object.freeze({
        state: currentState,
        applied: Object.freeze([...applied]),
        stop: Object.freeze({
          kind: 'choice',
          operationIds: Object.freeze(atMinStart.map((m) => m.operation.id)),
          earliestStart: minStart,
        }),
      });
    }

    // Single min-start operation
    const singleMin = atMinStart[0]!;
    const singleMinFrontier = currentState.rankFrontiers[singleMin.operation.rank] ?? 0;

    // Dependency gap: unique min start is strictly after its rank frontier
    if (singleMin.earliestStart > singleMinFrontier) {
      return Object.freeze({
        state: currentState,
        applied: Object.freeze([...applied]),
        stop: Object.freeze({
          kind: 'dependency-gap',
          operationId: singleMin.operation.id,
          start: singleMin.earliestStart,
          rankFrontier: singleMinFrontier,
        }),
      });
    }

    // Would-complete: unique min is the last unplaced operation
    if (legal.length === unplaced) {
      return Object.freeze({
        state: currentState,
        applied: Object.freeze([...applied]),
        stop: Object.freeze({
          kind: 'would-complete',
          operationId: singleMin.operation.id,
        }),
      });
    }

    // Otherwise, apply the first sorted legal move and loop
    const first = sortedLegal[0]!;
    const action: Action = { type: 'place', operationId: first.operation.id };
    const result = applyAction(currentState, action);
    if (!result.ok) {
      return Object.freeze({
        state: currentState,
        applied: Object.freeze([...applied]),
        stop: Object.freeze({ kind: 'deadlock' }),
      });
    }
    applied.push(action);
    currentState = result.state;
  }

  // Shouldn't reach here normally
  return Object.freeze({
    state: currentState,
    applied: Object.freeze([...applied]),
    stop: Object.freeze({ kind: 'deadlock' }),
  });
}

interface BlockedWithMemoryCap {
  operationId: OperationId;
}

function getBlockedWithMemoryCap(state: ScheduleState): readonly BlockedWithMemoryCap[] {
  const result: BlockedWithMemoryCap[] = [];
  for (const classification of classifyMoves(state)) {
    if (classification.status === 'blocked') {
      const hasMemCap = classification.reasons.some((r) => r.kind === 'memory-cap');
      if (hasMemCap) {
        result.push({ operationId: classification.operation.id });
      }
    }
  }
  return Object.freeze(result);
}
