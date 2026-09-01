import {
  applyAction,
  classifyMoves,
  initialState,
  type MoveClassification,
  type ScheduleState,
} from './replay';
import {
  attemptRankingTuple,
  compareAttempts,
  score,
  type AttemptRankingTuple,
  type ScoreResult,
} from './score';
import type { Action, LevelConfig, OperationId } from './types';

export interface ExactScheduleSearchOptions {
  readonly maxOperations?: number;
  readonly maxStates?: number;
}

export interface ExactScheduleSearchStats {
  readonly operationCount: number;
  readonly statesVisited: number;
  readonly transitionsConsidered: number;
  readonly completeSchedules: number;
  readonly prunedByDominance: number;
  readonly prunedByBound: number;
  readonly maxDominanceWidth: number;
}

export type ExactScheduleSearchFailureReason =
  | { readonly kind: 'unsupported-dual-pipe' }
  | { readonly kind: 'unsupported-residency' }
  | {
      readonly kind: 'too-many-operations';
      readonly operationCount: number;
      readonly maxOperations: number;
    }
  | { readonly kind: 'search-exhausted'; readonly maxStates: number }
  | { readonly kind: 'deadlock' };

export interface ExactScheduleSearchSchedule {
  readonly actions: readonly Action[];
  readonly state: ScheduleState;
  readonly score: ScoreResult;
  readonly ranking: AttemptRankingTuple;
}

type ExactSchedule = ExactScheduleSearchSchedule;

export type ExactScheduleSearchResult =
  | ({
      readonly ok: true;
      readonly stats: ExactScheduleSearchStats;
    } & ExactSchedule)
  | {
      readonly ok: false;
      readonly reason: ExactScheduleSearchFailureReason;
      readonly stats: ExactScheduleSearchStats;
      readonly bestSoFar?: ExactSchedule;
    };

export type ExactScheduleFrontierResult =
  | {
      readonly ok: true;
      readonly frontier: readonly ExactScheduleSearchSchedule[];
      readonly stats: ExactScheduleSearchStats;
    }
  | {
      readonly ok: false;
      readonly reason: ExactScheduleSearchFailureReason;
      readonly stats: ExactScheduleSearchStats;
      readonly frontier?: readonly ExactScheduleSearchSchedule[];
    };

type MutableStats = {
  operationCount: number;
  statesVisited: number;
  transitionsConsidered: number;
  completeSchedules: number;
  prunedByDominance: number;
  prunedByBound: number;
  maxDominanceWidth: number;
};

type DominanceLabel = {
  readonly rankFrontiers: readonly number[];
  readonly operationEnds: ReadonlyMap<OperationId, number>;
  readonly currentMemory: readonly number[];
  readonly peakMemory: readonly number[];
  readonly allGatherCount: number;
};

type LegalMove = Extract<MoveClassification, { status: 'legal' }>;

const DEFAULT_MAX_OPERATIONS = 14;
const DEFAULT_MAX_STATES = 100_000;

function emptyMutableStats(operationCount: number): MutableStats {
  return {
    operationCount,
    statesVisited: 0,
    transitionsConsidered: 0,
    completeSchedules: 0,
    prunedByDominance: 0,
    prunedByBound: 0,
    maxDominanceWidth: 0,
  };
}

function freezeStats(stats: MutableStats): ExactScheduleSearchStats {
  return Object.freeze({ ...stats });
}

function freezeActions(actions: readonly Action[]): readonly Action[] {
  return Object.freeze(actions.map((action) => Object.freeze({ ...action })));
}

function freezeExactSchedule(state: ScheduleState): ExactSchedule {
  return Object.freeze({
    actions: freezeActions(state.actions),
    state,
    score: score(state),
    ranking: attemptRankingTuple(state),
  });
}

function isComplete(state: ScheduleState): boolean {
  return state.placements.length === state.operations.length;
}

function isLegalMove(move: MoveClassification): move is LegalMove {
  return move.status === 'legal';
}

function operationKindOrder(operationId: OperationId): number {
  if (operationId.startsWith('F:')) return 0;
  if (operationId.startsWith('B:')) return 1;
  return 2;
}

function compareLegalMoves(left: LegalMove, right: LegalMove): number {
  const deltas = [
    left.earliestStart - right.earliestStart,
    left.operation.rank - right.operation.rank,
    left.operation.microbatch - right.operation.microbatch,
    operationKindOrder(left.operation.id) - operationKindOrder(right.operation.id),
    left.operation.stage - right.operation.stage,
  ];

  for (const delta of deltas) {
    if (delta !== 0) {
      return delta;
    }
  }

  return left.operation.id.localeCompare(right.operation.id);
}

function placedSetKey(state: ScheduleState): string {
  return state.placements
    .map((placement) => placement.operationId)
    .sort()
    .join('|');
}

function dominanceLabel(state: ScheduleState): DominanceLabel {
  return Object.freeze({
    rankFrontiers: Object.freeze([...state.rankFrontiers]),
    operationEnds: new Map(
      state.placements.map((placement) => [placement.operationId, placement.end]),
    ),
    currentMemory: Object.freeze([...state.currentMemory]),
    peakMemory: Object.freeze([...state.peakMemory]),
    allGatherCount: state.allGatherCount,
  });
}

function allNumbersLessThanOrEqual(left: readonly number[], right: readonly number[]): boolean {
  return left.every((value, index) => value <= (right[index] ?? Number.POSITIVE_INFINITY));
}

function operationEndsNoLater(left: DominanceLabel, right: DominanceLabel): boolean {
  for (const [operationId, end] of left.operationEnds) {
    const otherEnd = right.operationEnds.get(operationId);
    if (otherEnd === undefined || end > otherEnd) {
      return false;
    }
  }

  return true;
}

function dominates(left: DominanceLabel, right: DominanceLabel): boolean {
  return (
    allNumbersLessThanOrEqual(left.rankFrontiers, right.rankFrontiers) &&
    operationEndsNoLater(left, right) &&
    allNumbersLessThanOrEqual(left.currentMemory, right.currentMemory) &&
    allNumbersLessThanOrEqual(left.peakMemory, right.peakMemory) &&
    left.allGatherCount <= right.allGatherCount
  );
}

function recordDominanceLabel(
  labelsByPlacedSet: Map<string, DominanceLabel[]>,
  state: ScheduleState,
  stats: MutableStats,
): boolean {
  const key = placedSetKey(state);
  const label = dominanceLabel(state);
  const labels = labelsByPlacedSet.get(key) ?? [];

  if (labels.some((existing) => dominates(existing, label))) {
    stats.prunedByDominance += 1;
    return false;
  }

  const survivors = labels.filter((existing) => !dominates(label, existing));
  survivors.push(label);
  labelsByPlacedSet.set(key, survivors);
  stats.maxDominanceWidth = Math.max(stats.maxDominanceWidth, survivors.length);
  return true;
}

function remainingWorkByRank(state: ScheduleState): readonly number[] {
  const remaining = new Array<number>(state.config.rankCount).fill(0);

  for (const operation of state.operations) {
    if (state.placementById[operation.id]) {
      continue;
    }
    remaining[operation.rank]! += operation.duration;
  }

  return remaining;
}

function maxNumber(values: readonly number[]): number {
  return values.reduce((max, value) => Math.max(max, value), 0);
}

function lowerBoundMakespan(state: ScheduleState): number {
  const remaining = remainingWorkByRank(state);
  return state.rankFrontiers.reduce(
    (max, frontier, rank) => Math.max(max, frontier + (remaining[rank] ?? 0)),
    0,
  );
}

function losesAgainstIncumbentLowerBound(state: ScheduleState, incumbent: ExactSchedule): boolean {
  const lowerMakespan = lowerBoundMakespan(state);
  if (lowerMakespan > incumbent.ranking.makespan) {
    return true;
  }

  return (
    lowerMakespan === incumbent.ranking.makespan &&
    maxNumber(state.peakMemory) > incumbent.ranking.peakActivationMemory
  );
}

function failureResult(
  reason: ExactScheduleSearchFailureReason,
  stats: MutableStats,
  bestSoFar: ExactSchedule | null = null,
): ExactScheduleSearchResult {
  return Object.freeze({
    ok: false as const,
    reason: Object.freeze({ ...reason }),
    stats: freezeStats(stats),
    ...(bestSoFar ? { bestSoFar } : {}),
  });
}

function freezeExactSchedules(
  schedules: readonly ExactScheduleSearchSchedule[],
): readonly ExactScheduleSearchSchedule[] {
  return Object.freeze(schedules.map((schedule) => Object.freeze({ ...schedule })));
}

function allGatherValue(tuple: AttemptRankingTuple): number {
  return tuple.allGatherCount ?? 0;
}

function dominatesRanking(left: AttemptRankingTuple, right: AttemptRankingTuple): boolean {
  const noWorse =
    left.makespan <= right.makespan &&
    left.peakActivationMemory <= right.peakActivationMemory &&
    allGatherValue(left) <= allGatherValue(right) &&
    left.intentionalIdle <= right.intentionalIdle &&
    left.actionCount <= right.actionCount;
  const strictlyBetter =
    left.makespan < right.makespan ||
    left.peakActivationMemory < right.peakActivationMemory ||
    allGatherValue(left) < allGatherValue(right) ||
    left.intentionalIdle < right.intentionalIdle ||
    left.actionCount < right.actionCount;

  return noWorse && strictlyBetter;
}

function sameRanking(left: AttemptRankingTuple, right: AttemptRankingTuple): boolean {
  return (
    left.makespan === right.makespan &&
    left.peakActivationMemory === right.peakActivationMemory &&
    allGatherValue(left) === allGatherValue(right) &&
    left.intentionalIdle === right.intentionalIdle &&
    left.actionCount === right.actionCount
  );
}

function appendFrontierSchedule(frontier: ExactSchedule[], candidate: ExactSchedule): void {
  if (
    frontier.some(
      (existing) =>
        dominatesRanking(existing.ranking, candidate.ranking) ||
        sameRanking(existing.ranking, candidate.ranking),
    )
  ) {
    return;
  }

  const survivors = frontier.filter(
    (existing) => !dominatesRanking(candidate.ranking, existing.ranking),
  );
  survivors.push(candidate);
  survivors.sort((left, right) => compareAttempts(left.ranking, right.ranking));
  frontier.splice(0, frontier.length, ...survivors);
}

function frontierFailureResult(
  reason: ExactScheduleSearchFailureReason,
  stats: MutableStats,
  frontier: readonly ExactSchedule[] = [],
): ExactScheduleFrontierResult {
  const frozenFrontier = freezeExactSchedules(frontier);
  return Object.freeze({
    ok: false as const,
    reason: Object.freeze({ ...reason }),
    stats: freezeStats(stats),
    ...(frozenFrontier.length > 0 ? { frontier: frozenFrontier } : {}),
  });
}

export function findExactSchedule(
  config: LevelConfig,
  options: ExactScheduleSearchOptions = {},
): ExactScheduleSearchResult {
  const initial = initialState(config);
  const maxOperations = options.maxOperations ?? DEFAULT_MAX_OPERATIONS;
  const maxStates = options.maxStates ?? DEFAULT_MAX_STATES;
  const stats = emptyMutableStats(initial.operations.length);

  if (initial.config.dualPipeModel) {
    return failureResult({ kind: 'unsupported-dual-pipe' }, stats);
  }
  if (initial.config.residencyModel) {
    return failureResult({ kind: 'unsupported-residency' }, stats);
  }
  if (initial.operations.length > maxOperations) {
    return failureResult(
      {
        kind: 'too-many-operations',
        operationCount: initial.operations.length,
        maxOperations,
      },
      stats,
    );
  }

  let exhausted = false;
  let best: ExactSchedule | null = null;
  const labelsByPlacedSet = new Map<string, DominanceLabel[]>();

  function visit(state: ScheduleState): void {
    if (exhausted) {
      return;
    }
    if (stats.statesVisited >= maxStates) {
      exhausted = true;
      return;
    }

    stats.statesVisited += 1;

    if (isComplete(state)) {
      stats.completeSchedules += 1;
      const candidate = freezeExactSchedule(state);
      if (!best || compareAttempts(candidate.ranking, best.ranking) < 0) {
        best = candidate;
      }
      return;
    }

    if (best && losesAgainstIncumbentLowerBound(state, best)) {
      stats.prunedByBound += 1;
      return;
    }

    if (!recordDominanceLabel(labelsByPlacedSet, state, stats)) {
      return;
    }

    const legalMoves = classifyMoves(state).filter(isLegalMove).sort(compareLegalMoves);
    for (const move of legalMoves) {
      if (exhausted) {
        return;
      }

      stats.transitionsConsidered += 1;
      const next = applyAction(state, { type: 'place', operationId: move.operation.id });
      if (!next.ok) {
        throw new Error(`classified legal move was rejected: ${next.reason.kind}`);
      }
      visit(next.state);
    }
  }

  visit(initial);

  if (exhausted) {
    return failureResult({ kind: 'search-exhausted', maxStates }, stats, best);
  }

  if (!best) {
    return failureResult({ kind: 'deadlock' }, stats);
  }

  const provenBest = best as ExactSchedule;
  return Object.freeze({
    ok: true as const,
    actions: provenBest.actions,
    state: provenBest.state,
    score: provenBest.score,
    ranking: provenBest.ranking,
    stats: freezeStats(stats),
  });
}

export function findExactScheduleFrontier(
  config: LevelConfig,
  options: ExactScheduleSearchOptions = {},
): ExactScheduleFrontierResult {
  const initial = initialState(config);
  const maxOperations = options.maxOperations ?? DEFAULT_MAX_OPERATIONS;
  const maxStates = options.maxStates ?? DEFAULT_MAX_STATES;
  const stats = emptyMutableStats(initial.operations.length);

  if (initial.config.dualPipeModel) {
    return frontierFailureResult({ kind: 'unsupported-dual-pipe' }, stats);
  }
  if (initial.config.residencyModel) {
    return frontierFailureResult({ kind: 'unsupported-residency' }, stats);
  }
  if (initial.operations.length > maxOperations) {
    return frontierFailureResult(
      {
        kind: 'too-many-operations',
        operationCount: initial.operations.length,
        maxOperations,
      },
      stats,
    );
  }

  let exhausted = false;
  const frontier: ExactSchedule[] = [];
  const labelsByPlacedSet = new Map<string, DominanceLabel[]>();

  function visit(state: ScheduleState): void {
    if (exhausted) {
      return;
    }
    if (stats.statesVisited >= maxStates) {
      exhausted = true;
      return;
    }

    stats.statesVisited += 1;

    if (isComplete(state)) {
      stats.completeSchedules += 1;
      appendFrontierSchedule(frontier, freezeExactSchedule(state));
      return;
    }

    if (!recordDominanceLabel(labelsByPlacedSet, state, stats)) {
      return;
    }

    const legalMoves = classifyMoves(state).filter(isLegalMove).sort(compareLegalMoves);
    for (const move of legalMoves) {
      if (exhausted) {
        return;
      }

      stats.transitionsConsidered += 1;
      const next = applyAction(state, { type: 'place', operationId: move.operation.id });
      if (!next.ok) {
        throw new Error(`classified legal move was rejected: ${next.reason.kind}`);
      }
      visit(next.state);
    }
  }

  visit(initial);

  if (exhausted) {
    return frontierFailureResult({ kind: 'search-exhausted', maxStates }, stats, frontier);
  }

  if (frontier.length === 0) {
    return frontierFailureResult({ kind: 'deadlock' }, stats);
  }

  return Object.freeze({
    ok: true as const,
    frontier: freezeExactSchedules(frontier),
    stats: freezeStats(stats),
  });
}
