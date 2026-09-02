import {
  applyAction,
  classifyMoves,
  replay,
  type BlockReason,
  type MoveClassification,
  type ScheduleState,
} from './replay';
import type { Action, LevelConfig, Operation, OperationId, ReferencePolicyId } from './types';
import { microbatchGroupIndex } from './microbatchGroups';
import { operationIdFor } from './operations';
import { topologyForLevel } from './topology';

export interface ReferencePolicy {
  readonly id: ReferencePolicyId;
  readonly label: string;
}

export const REFERENCE_POLICIES: Readonly<Record<ReferencePolicyId, ReferencePolicy>> =
  Object.freeze({
    'gpipe-afab': Object.freeze({ id: 'gpipe-afab', label: 'GPipe AFAB' }),
    'one-f-one-b': Object.freeze({ id: 'one-f-one-b', label: '1F1B' }),
    'interleaved-one-f-one-b': Object.freeze({
      id: 'interleaved-one-f-one-b',
      label: 'Interleaved 1F1B',
    }),
    'group-major': Object.freeze({ id: 'group-major', label: 'Group Major' }),
    'zero-bubble-h1': Object.freeze({ id: 'zero-bubble-h1', label: 'ZB-H1' }),
    'zero-bubble-h2': Object.freeze({ id: 'zero-bubble-h2', label: 'ZB-H2' }),
    'zero-bubble-deep': Object.freeze({
      id: 'zero-bubble-deep',
      label: 'Zero Bubble Deep',
    }),
    'dualpipe-balanced': Object.freeze({ id: 'dualpipe-balanced', label: 'DualPipe balanced' }),
    'dualpipe-one-direction': Object.freeze({
      id: 'dualpipe-one-direction',
      label: 'One-direction baseline',
    }),
  });

type LegalMove = Extract<MoveClassification, { status: 'legal' }>;

export type PolicyProjectionResult =
  | {
      readonly ok: true;
      readonly policyId: ReferencePolicyId;
      readonly actions: readonly Action[];
      readonly state: ScheduleState;
    }
  | {
      readonly ok: false;
      readonly policyId: ReferencePolicyId;
      readonly reason: PolicyProjectionFailure;
    };

export type PolicyProjectionFailure =
  | { readonly kind: 'deadlock' }
  | {
      readonly kind: 'blocked';
      readonly operationId: OperationId;
      readonly blockReason: BlockReason;
    }
  | {
      readonly kind: 'engine-rejected';
      readonly operationId: OperationId;
      readonly blockReason: BlockReason;
    };

export type RecognitionResult =
  | {
      readonly kind: 'matched';
      readonly policyId: ReferencePolicyId;
      readonly label: string;
      readonly exact: boolean;
      readonly candidatePolicyIds: readonly ReferencePolicyId[];
    }
  | {
      readonly kind: 'unmatched';
      readonly candidatePolicyIds: readonly ReferencePolicyId[];
    }
  | {
      readonly kind: 'incomplete';
      readonly candidatePolicyIds: readonly ReferencePolicyId[];
    };

function isLegalMove(move: MoveClassification): move is LegalMove {
  return move.status === 'legal';
}

function compareByEarliestStartThenId(left: LegalMove, right: LegalMove): number {
  if (left.earliestStart !== right.earliestStart) {
    return left.earliestStart - right.earliestStart;
  }
  return left.operation.id.localeCompare(right.operation.id);
}

function operationSortKey(operation: Operation): readonly number[] {
  const backwardStage = operation.stage;
  const backwardMicrobatch = operation.microbatch;

  return operation.kind === 'F'
    ? [0, operation.stage, operation.microbatch]
    : [1, backwardMicrobatch, -backwardStage];
}

function compareByPolicyOrder(left: Operation, right: Operation): number {
  const leftKey = operationSortKey(left);
  const rightKey = operationSortKey(right);
  for (let index = 0; index < leftKey.length; index += 1) {
    const delta = leftKey[index]! - rightKey[index]!;
    if (delta !== 0) {
      return delta;
    }
  }
  return left.id.localeCompare(right.id);
}

function selectAfabMove(state: ScheduleState, legalMoves: readonly LegalMove[]): LegalMove | null {
  const unplaced = state.operations
    .filter((operation) => !state.placementById[operation.id])
    .sort(compareByPolicyOrder);

  const legalById = new Map(legalMoves.map((move) => [move.operation.id, move]));
  for (const operation of unplaced) {
    const legal = legalById.get(operation.id);
    if (legal) {
      return legal;
    }

    const classification = classifyMoves(state).find((move) => move.operation.id === operation.id);
    if (
      classification?.status === 'blocked' &&
      classification.reasons.some((reason) => reason.kind === 'memory-cap')
    ) {
      return null;
    }
  }

  return null;
}

function placedForwardCount(state: ScheduleState, stage: number): number {
  return state.placements.filter((placement) => {
    const operation = state.operations.find((candidate) => candidate.id === placement.operationId);
    return operation?.kind === 'F' && operation.stage === stage;
  }).length;
}

function selectWarmupMove(
  state: ScheduleState,
  legalMoves: readonly LegalMove[],
): LegalMove | null {
  for (let stage = 0; stage < state.config.stageCount; stage += 1) {
    const warmupQuota = state.config.stageCount - stage;
    if (placedForwardCount(state, stage) >= warmupQuota) {
      continue;
    }

    const candidates = legalMoves
      .filter((move) => move.operation.kind === 'F' && move.operation.stage === stage)
      .sort((left, right) => left.operation.microbatch - right.operation.microbatch);
    if (candidates[0]) {
      return candidates[0];
    }
  }

  return null;
}

function selectOneFOneBMove(
  state: ScheduleState,
  legalMoves: readonly LegalMove[],
): LegalMove | null {
  const warmupMove = selectWarmupMove(state, legalMoves);
  if (warmupMove) {
    return warmupMove;
  }

  const sorted = [...legalMoves].sort((left, right) => {
    if (left.operation.kind !== right.operation.kind) {
      return left.operation.kind === 'B' ? -1 : 1;
    }
    if (left.operation.kind === 'B' && left.operation.stage !== right.operation.stage) {
      return right.operation.stage - left.operation.stage;
    }
    if (left.operation.kind === 'F') {
      const leftDiagonal = left.operation.stage + left.operation.microbatch;
      const rightDiagonal = right.operation.stage + right.operation.microbatch;
      if (leftDiagonal !== rightDiagonal) {
        return leftDiagonal - rightDiagonal;
      }
    }
    if (left.operation.stage !== right.operation.stage) {
      return left.operation.stage - right.operation.stage;
    }
    if (left.operation.microbatch !== right.operation.microbatch) {
      return left.operation.microbatch - right.operation.microbatch;
    }
    return left.operation.id.localeCompare(right.operation.id);
  });

  return sorted[0] ?? null;
}

function selectFirstStageWarmupMove(
  state: ScheduleState,
  legalMoves: readonly LegalMove[],
): LegalMove | null {
  const topology = topologyForLevel(state.config);
  const warmupQuota = Math.min(
    state.config.microbatchCount,
    Math.max(1, topology.virtualStagesPerRank),
  );

  if (placedForwardCount(state, 0) >= warmupQuota) {
    return null;
  }

  const candidates = legalMoves
    .filter((move) => move.operation.kind === 'F' && move.operation.stage === 0)
    .sort((left, right) => left.operation.microbatch - right.operation.microbatch);

  return candidates[0] ?? null;
}

function compareForwardInterleaved(left: LegalMove, right: LegalMove): number {
  if (left.operation.microbatch !== right.operation.microbatch) {
    return left.operation.microbatch - right.operation.microbatch;
  }
  if (left.operation.stage !== right.operation.stage) {
    return right.operation.stage - left.operation.stage;
  }
  if (left.earliestStart !== right.earliestStart) {
    return left.earliestStart - right.earliestStart;
  }
  return left.operation.id.localeCompare(right.operation.id);
}

function compareBackwardInterleaved(left: LegalMove, right: LegalMove): number {
  if (left.operation.microbatch !== right.operation.microbatch) {
    return left.operation.microbatch - right.operation.microbatch;
  }
  if (left.operation.stage !== right.operation.stage) {
    return right.operation.stage - left.operation.stage;
  }
  if (left.earliestStart !== right.earliestStart) {
    return left.earliestStart - right.earliestStart;
  }
  return left.operation.id.localeCompare(right.operation.id);
}

function selectInterleavedOneFOneBMove(
  state: ScheduleState,
  legalMoves: readonly LegalMove[],
): LegalMove | null {
  const warmupMove = selectFirstStageWarmupMove(state, legalMoves);
  if (warmupMove) {
    return warmupMove;
  }

  const finalStage = state.config.stageCount - 1;
  const finalStageBackward = legalMoves
    .filter((move) => move.operation.kind === 'B' && move.operation.stage === finalStage)
    .sort(compareBackwardInterleaved);
  if (finalStageBackward[0]) {
    return finalStageBackward[0];
  }

  const forward = legalMoves
    .filter((move) => move.operation.kind === 'F')
    .sort(compareForwardInterleaved);
  if (forward[0]) {
    return forward[0];
  }

  const backward = legalMoves
    .filter((move) => move.operation.kind === 'B')
    .sort(compareBackwardInterleaved);

  return backward[0] ?? null;
}

function groupMajorKindOrder(kind: Operation['kind']): number {
  return kind === 'F' ? 0 : kind === 'B' ? 1 : 2;
}

function compareGroupMajorMove(config: LevelConfig, left: LegalMove, right: LegalMove): number {
  const leftGroup = microbatchGroupIndex(config, left.operation.microbatch);
  const rightGroup = microbatchGroupIndex(config, right.operation.microbatch);
  if (leftGroup !== rightGroup) {
    return leftGroup - rightGroup;
  }
  if (left.operation.kind !== right.operation.kind) {
    return groupMajorKindOrder(left.operation.kind) - groupMajorKindOrder(right.operation.kind);
  }
  if (left.operation.kind === 'B' && left.operation.stage !== right.operation.stage) {
    return right.operation.stage - left.operation.stage;
  }
  if (left.operation.stage !== right.operation.stage) {
    return left.operation.stage - right.operation.stage;
  }
  if (left.operation.microbatch !== right.operation.microbatch) {
    return left.operation.microbatch - right.operation.microbatch;
  }
  if (left.earliestStart !== right.earliestStart) {
    return left.earliestStart - right.earliestStart;
  }
  return left.operation.id.localeCompare(right.operation.id);
}

function selectGroupMajorMove(
  state: ScheduleState,
  legalMoves: readonly LegalMove[],
): LegalMove | null {
  return (
    [...legalMoves].sort((left, right) => compareGroupMajorMove(state.config, left, right))[0] ??
    null
  );
}

function directionOrder(operation: Operation): number {
  return operation.direction === 'desc' ? 1 : 0;
}

function compareDualPipeBalanced(left: LegalMove, right: LegalMove): number {
  if (left.earliestStart !== right.earliestStart) {
    return left.earliestStart - right.earliestStart;
  }
  if (left.operation.kind !== right.operation.kind) {
    return groupMajorKindOrder(left.operation.kind) - groupMajorKindOrder(right.operation.kind);
  }
  if (left.operation.microbatch !== right.operation.microbatch) {
    return left.operation.microbatch - right.operation.microbatch;
  }
  if (left.operation.stage !== right.operation.stage) {
    return left.operation.stage - right.operation.stage;
  }
  if (directionOrder(left.operation) !== directionOrder(right.operation)) {
    return directionOrder(left.operation) - directionOrder(right.operation);
  }
  return left.operation.id.localeCompare(right.operation.id);
}

function selectDualPipeBalancedMove(legalMoves: readonly LegalMove[]): LegalMove | null {
  return [...legalMoves].sort(compareDualPipeBalanced)[0] ?? null;
}

function zeroBubbleStageKey(operation: Operation): number {
  return operation.kind === 'F' ? operation.stage : -operation.stage;
}

function compareZeroBubbleKind(left: Operation, right: Operation): number {
  const order: Record<Operation['kind'], number> = { B: 0, F: 1, W: 2 };
  return order[left.kind] - order[right.kind];
}

function compareZeroBubbleMove(left: LegalMove, right: LegalMove): number {
  if (left.operation.kind !== right.operation.kind) {
    return compareZeroBubbleKind(left.operation, right.operation);
  }
  if (left.operation.microbatch !== right.operation.microbatch) {
    return left.operation.microbatch - right.operation.microbatch;
  }
  const leftStage = zeroBubbleStageKey(left.operation);
  const rightStage = zeroBubbleStageKey(right.operation);
  if (leftStage !== rightStage) {
    return leftStage - rightStage;
  }
  if (left.earliestStart !== right.earliestStart) {
    return left.earliestStart - right.earliestStart;
  }
  return left.operation.id.localeCompare(right.operation.id);
}

function selectZeroBubbleWarmupMove(
  state: ScheduleState,
  legalMoves: readonly LegalMove[],
  warmupLimit: number,
): LegalMove | null {
  const placed = state.placements.filter((placement) => {
    const operation = state.operations.find((candidate) => candidate.id === placement.operationId);
    return operation?.kind === 'F' && operation.stage === 0;
  }).length;

  if (placed >= Math.min(warmupLimit, state.config.microbatchCount)) {
    return null;
  }

  return (
    legalMoves
      .filter((move) => move.operation.kind === 'F' && move.operation.stage === 0)
      .sort((left, right) => left.operation.microbatch - right.operation.microbatch)[0] ?? null
  );
}

function selectZeroBubbleMove(
  state: ScheduleState,
  legalMoves: readonly LegalMove[],
  warmupLimit: number,
): LegalMove | null {
  const warmup = selectZeroBubbleWarmupMove(state, legalMoves, warmupLimit);
  if (warmup) {
    return warmup;
  }

  const earliestStart = Math.min(...legalMoves.map((move) => move.earliestStart));
  return (
    legalMoves
      .filter((move) => move.earliestStart === earliestStart)
      .sort(compareZeroBubbleMove)[0] ?? null
  );
}

function blockedPolicyOperation(
  state: ScheduleState,
  policyId: ReferencePolicyId,
): PolicyProjectionFailure | null {
  if (policyId !== 'gpipe-afab') {
    return null;
  }

  const unplaced = state.operations
    .filter((operation) => !state.placementById[operation.id])
    .sort(compareByPolicyOrder);
  const next = unplaced[0];
  if (!next) {
    return null;
  }

  const classification = classifyMoves(state).find((move) => move.operation.id === next.id);
  if (classification?.status !== 'blocked') {
    return null;
  }

  const memoryCap = classification.reasons.find((reason) => reason.kind === 'memory-cap');
  if (!memoryCap) {
    return null;
  }

  return Object.freeze({
    kind: 'blocked' as const,
    operationId: next.id,
    blockReason: Object.freeze({ ...memoryCap }),
  });
}

function selectMove(
  state: ScheduleState,
  policyId: ReferencePolicyId,
  legalMoves: readonly LegalMove[],
): LegalMove | null {
  switch (policyId) {
    case 'gpipe-afab':
      return selectAfabMove(state, legalMoves);
    case 'one-f-one-b':
      return selectOneFOneBMove(state, legalMoves);
    case 'interleaved-one-f-one-b':
      return selectInterleavedOneFOneBMove(state, legalMoves);
    case 'group-major':
      return selectGroupMajorMove(state, legalMoves);
    case 'zero-bubble-h1':
      return selectZeroBubbleMove(state, legalMoves, state.config.stageCount - 1);
    case 'zero-bubble-h2':
      return selectZeroBubbleMove(state, legalMoves, state.config.stageCount);
    case 'zero-bubble-deep':
      return selectZeroBubbleMove(state, legalMoves, state.config.stageCount + 1);
    case 'dualpipe-balanced':
    case 'dualpipe-one-direction':
      return selectDualPipeBalancedMove(legalMoves);
  }
}

function configForPolicy(config: LevelConfig, policyId: ReferencePolicyId): LevelConfig {
  if (policyId !== 'dualpipe-one-direction' || !config.dualPipeModel) {
    return config;
  }

  const edgeKeys = new Set<string>();
  const crossDirectionDependencies = [...(config.dualPipeModel.crossDirectionDependencies ?? [])];

  for (const edge of crossDirectionDependencies) {
    edgeKeys.add(`${edge.from}->${edge.to}`);
  }

  for (let ascMicrobatch = 0; ascMicrobatch < config.microbatchCount; ascMicrobatch += 1) {
    const from = operationIdFor(config, 'B', 0, ascMicrobatch, 'asc');
    for (let descMicrobatch = 0; descMicrobatch < config.microbatchCount; descMicrobatch += 1) {
      const to = operationIdFor(config, 'F', config.stageCount - 1, descMicrobatch, 'desc');
      const key = `${from}->${to}`;
      if (!edgeKeys.has(key)) {
        crossDirectionDependencies.push(Object.freeze({ from, to }));
        edgeKeys.add(key);
      }
    }
  }

  return Object.freeze({
    ...config,
    dualPipeModel: Object.freeze({
      ...config.dualPipeModel,
      directions: Object.freeze([...config.dualPipeModel.directions]),
      resourceModel: Object.freeze({ ...config.dualPipeModel.resourceModel }),
      crossDirectionDependencies: Object.freeze(crossDirectionDependencies),
    }),
  });
}

export function projectReferencePolicy(
  config: LevelConfig,
  policyId: ReferencePolicyId,
): PolicyProjectionResult {
  const projectedConfig = configForPolicy(config, policyId);
  const currentState = replay(projectedConfig, []);
  if (!currentState.ok) {
    throw new Error('initial replay unexpectedly failed');
  }

  return projectReferencePolicyFromState(currentState.state, policyId);
}

export function projectReferencePolicyFromState(
  initialState: ScheduleState,
  policyId: ReferencePolicyId,
): PolicyProjectionResult {
  let currentState = { ok: true as const, state: initialState };
  const actions: Action[] = [];
  const maxSteps = currentState.state.operations.length;

  for (let step = 0; step < maxSteps; step += 1) {
    if (currentState.state.placements.length === currentState.state.operations.length) {
      return Object.freeze({
        ok: true as const,
        policyId,
        actions: Object.freeze(actions),
        state: currentState.state,
      });
    }

    const legalMoves = classifyMoves(currentState.state)
      .filter(isLegalMove)
      .sort(compareByEarliestStartThenId);
    if (legalMoves.length === 0) {
      return Object.freeze({
        ok: false as const,
        policyId,
        reason: Object.freeze({ kind: 'deadlock' as const }),
      });
    }

    const selected = selectMove(currentState.state, policyId, legalMoves);
    if (selected === null) {
      return Object.freeze({
        ok: false as const,
        policyId,
        reason:
          blockedPolicyOperation(currentState.state, policyId) ??
          Object.freeze({ kind: 'deadlock' as const }),
      });
    }

    const action: Action = Object.freeze({ type: 'place', operationId: selected.operation.id });
    const applied = applyAction(currentState.state, action);
    if (!applied.ok) {
      return Object.freeze({
        ok: false as const,
        policyId,
        reason: Object.freeze({
          kind: 'engine-rejected' as const,
          operationId: selected.operation.id,
          blockReason: Object.freeze({ ...applied.reason }),
        }),
      });
    }

    actions.push(action);
    currentState = { ok: true, state: applied.state };
  }

  return currentState.state.placements.length === currentState.state.operations.length
    ? Object.freeze({
        ok: true as const,
        policyId,
        actions: Object.freeze(actions),
        state: currentState.state,
      })
    : Object.freeze({
        ok: false as const,
        policyId,
        reason: Object.freeze({ kind: 'deadlock' as const }),
      });
}

function operationsByRank(state: ScheduleState): ReadonlyMap<number, readonly OperationId[]> {
  const result = new Map<number, OperationId[]>();
  for (const placement of state.placements) {
    const operations = result.get(placement.rank) ?? [];
    operations.push(placement.operationId);
    result.set(placement.rank, operations);
  }

  return new Map(
    [...result.entries()].map(([rank, operations]) => [rank, Object.freeze([...operations])]),
  );
}

function sameOrderByRank(left: ScheduleState, right: ScheduleState): boolean {
  const leftByRank = operationsByRank(left);
  const rightByRank = operationsByRank(right);

  for (let rank = 0; rank < left.config.rankCount; rank += 1) {
    const leftOps = leftByRank.get(rank) ?? [];
    const rightOps = rightByRank.get(rank) ?? [];
    if (leftOps.length !== rightOps.length) {
      return false;
    }
    for (let index = 0; index < leftOps.length; index += 1) {
      if (leftOps[index] !== rightOps[index]) {
        return false;
      }
    }
  }

  return true;
}

function sameExactPlacement(left: ScheduleState, right: ScheduleState): boolean {
  if (left.placements.length !== right.placements.length) {
    return false;
  }

  for (let index = 0; index < left.placements.length; index += 1) {
    const leftPlacement = left.placements[index]!;
    const rightPlacement = right.placements[index]!;
    if (
      leftPlacement.operationId !== rightPlacement.operationId ||
      leftPlacement.rank !== rightPlacement.rank ||
      leftPlacement.start !== rightPlacement.start ||
      leftPlacement.end !== rightPlacement.end
    ) {
      return false;
    }
  }

  return true;
}

function candidatePoliciesFor(config: LevelConfig): readonly ReferencePolicyId[] {
  if (config.referencePolicy) {
    return Object.freeze([...config.referencePolicy.candidatePolicyIds]);
  }

  switch (config.algorithm.family) {
    case 'gpipe':
      return Object.freeze(['gpipe-afab', 'one-f-one-b'] as const);
    case 'one-f-one-b':
      return Object.freeze(['one-f-one-b', 'gpipe-afab'] as const);
    case 'interleaved-one-f-one-b':
      return Object.freeze(['interleaved-one-f-one-b', 'one-f-one-b', 'gpipe-afab'] as const);
    case 'grouped':
      return Object.freeze(['group-major', 'one-f-one-b'] as const);
    case 'dualpipe':
      return Object.freeze(['dualpipe-balanced', 'dualpipe-one-direction'] as const);
    case 'foundations':
    case 'building-block':
    case 'zero-bubble':
    case 'fsdp-residency':
      return Object.freeze([]);
  }
}

export function recognizeSchedule(state: ScheduleState): RecognitionResult {
  const candidatePolicyIds = candidatePoliciesFor(state.config);
  if (state.placements.length !== state.operations.length) {
    return Object.freeze({
      kind: 'incomplete' as const,
      candidatePolicyIds,
    });
  }

  for (const policyId of candidatePolicyIds) {
    const projected = projectReferencePolicy(state.config, policyId);
    if (!projected.ok) {
      continue;
    }
    if (sameOrderByRank(state, projected.state)) {
      return Object.freeze({
        kind: 'matched' as const,
        policyId,
        label: REFERENCE_POLICIES[policyId].label,
        exact: sameExactPlacement(state, projected.state),
        candidatePolicyIds,
      });
    }
  }

  return Object.freeze({
    kind: 'unmatched' as const,
    candidatePolicyIds,
  });
}
