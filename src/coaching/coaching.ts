import {
  classifyOperation,
  classifyMoves,
  type BlockReason,
  type MoveClassification,
  type ResourceDelay,
  type ScheduleState,
} from '../engine/replay';
import { applyAction } from '../engine/replay';
import type { Action, OperationId } from '../engine/types';
import { parseOperationId } from '../engine/operations';

export type StopReason =
  | { kind: 'choice'; operationIds: readonly OperationId[]; earliestStart: number }
  | { kind: 'dependency-gap'; operationId: OperationId; start: number; rankFrontier: number }
  | { kind: 'memory-boundary'; operationIds: readonly OperationId[] }
  | { kind: 'would-complete'; operationId?: OperationId }
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
  allGatherCount?: number;
}

export interface Suggestion {
  operationId: OperationId;
  earliestStart: number;
  projectedMemory: number;
  allGatherCount?: number;
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
      dependencyIds: readonly OperationId[];
      residencyEffect?: Extract<MoveClassification, { status: 'completed' }>['residencyEffect'];
    }
  | {
      status: 'legal';
      operationId: OperationId;
      dependencyIds: readonly OperationId[];
      earliestStart: number;
      projectedMemory: number;
      resourceDelay?: ResourceDelay;
      residencyEffect?: Extract<MoveClassification, { status: 'legal' }>['residencyEffect'];
    }
  | {
      status: 'blocked';
      operationId: OperationId;
      dependencyIds: readonly OperationId[];
      explanations: readonly ExplanationEntry[];
    };

export interface ExplanationEntry {
  kind: string;
  reason: BlockReason;
  message: string;
}

function compareLegalMoves(
  a: Extract<MoveClassification, { status: 'legal' }>,
  b: Extract<MoveClassification, { status: 'legal' }>,
): number {
  if (a.earliestStart !== b.earliestStart) {
    return a.earliestStart - b.earliestStart;
  }
  return a.operation.id.localeCompare(b.operation.id);
}

function assertNever(value: never): never {
  throw new Error(`Unhandled block reason: ${JSON.stringify(value)}`);
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
  const sorted = [...legal].sort(compareLegalMoves);
  return Object.freeze(
    sorted.map((m) =>
      Object.freeze({
        operationId: m.operation.id,
        earliestStart: m.earliestStart,
        projectedMemory: m.projectedMemory,
        ...(m.residencyEffect?.action === 'gather'
          ? { allGatherCount: state.allGatherCount + 1 }
          : state.config.residencyModel
            ? { allGatherCount: state.allGatherCount }
            : {}),
      }),
    ),
  );
}

export function suggestMove(state: ScheduleState): Suggestion | null {
  const legal = getLegal(state);
  if (legal.length === 0) return null;

  const sorted = [...legal].sort(compareLegalMoves);

  const first = sorted[0]!;
  const parsed = parseOperationId(first.operation.id);
  const rankFrontier = state.rankFrontiers[first.operation.rank] ?? 0;

  return Object.freeze({
    operationId: first.operation.id,
    earliestStart: first.earliestStart,
    projectedMemory: first.projectedMemory,
    ...(first.residencyEffect?.action === 'gather'
      ? { allGatherCount: state.allGatherCount + 1 }
      : state.config.residencyModel
        ? { allGatherCount: state.allGatherCount }
        : {}),
    reason: Object.freeze({
      kind: 'rank-frontier' as const,
      rank: first.operation.rank,
      rankFrontier,
      message: `This move can start immediately for logical stage ${parsed.stage} on rank ${first.operation.rank} frontier ${rankFrontier}.`,
    }),
  });
}

function formatBlockMessage(reason: BlockReason): string {
  switch (reason.kind) {
    case 'dependency-not-finished': {
      return `Needs ${reason.operationId} to finish first.`;
    }
    case 'memory-cap': {
      return `Rank ${reason.rank} is at memory cap ${reason.resident}/${reason.cap} and cannot place another forward activation.`;
    }
    case 'residency-memory-cap': {
      return `Rank ${reason.rank} would use ${reason.activationMemory} activation + ${reason.residentWeightMemory} weight units after evicting cached stages.`;
    }
    case 'already-placed': {
      return `${reason.operationId} is already placed.`;
    }
    case 'invalid-rank': {
      return `Rank ${reason.rank} is invalid.`;
    }
    case 'unknown-operation-id': {
      return `${reason.operationId} is not part of this level.`;
    }
  }
  return assertNever(reason);
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
      dependencyIds: classification.dependencyIds,
      ...(classification.residencyEffect
        ? { residencyEffect: classification.residencyEffect }
        : {}),
    });
  }

  if (classification.status === 'legal') {
    return Object.freeze({
      status: 'legal' as const,
      operationId,
      dependencyIds: classification.dependencyIds,
      earliestStart: classification.earliestStart,
      projectedMemory: classification.projectedMemory,
      ...(classification.resourceDelay ? { resourceDelay: classification.resourceDelay } : {}),
      ...(classification.residencyEffect
        ? { residencyEffect: classification.residencyEffect }
        : {}),
    });
  }

  const explanations = Object.freeze(
    classification.reasons.map((reason) =>
      Object.freeze({
        kind: reason.kind,
        reason: Object.freeze({ ...reason }),
        message: formatBlockMessage(reason),
      }),
    ),
  );

  return Object.freeze({
    status: 'blocked' as const,
    operationId,
    dependencyIds: classification.dependencyIds,
    explanations,
  });
}

export function runUntilInteresting(state: ScheduleState): CoachingResult {
  let currentState = state;
  const applied: Action[] = [];
  const initialRemaining = state.operations.length - state.placements.length;

  if (initialRemaining === 0) {
    return Object.freeze({
      state: currentState,
      applied: Object.freeze([...applied]),
      stop: Object.freeze({ kind: 'would-complete' }),
    });
  }

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
        stop: Object.freeze({ kind: 'would-complete' }),
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

    if (unplaced === 1) {
      return Object.freeze({
        state: currentState,
        applied: Object.freeze([...applied]),
        stop: Object.freeze({
          kind: 'would-complete',
          operationId: legal[0]!.operation.id,
        }),
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

    const sortedLegal = [...legal].sort(compareLegalMoves);

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

    // Otherwise, apply the first sorted legal move and loop
    const first = sortedLegal[0]!;
    const action: Action = Object.freeze({ type: 'place', operationId: first.operation.id });
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
      const hasMemCap = classification.reasons.some(
        (r) => r.kind === 'memory-cap' || r.kind === 'residency-memory-cap',
      );
      if (hasMemCap) {
        result.push({ operationId: classification.operation.id });
      }
    }
  }
  return Object.freeze(result);
}
