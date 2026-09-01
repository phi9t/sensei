import { analyzeBuildingBlockPlan, expandBuildingBlockPlan } from './buildingBlocks';
import { deriveOperations, predecessorsOf } from './operations';
import {
  applyAction,
  classifyMoves,
  initialState,
  replay,
  type BlockReason,
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
import type {
  Action,
  BuildingBlockAnalysis,
  BuildingBlockPlan,
  LevelConfig,
  Operation,
  OperationId,
} from './types';

export interface SynthesisSchedule {
  readonly actions: readonly Action[];
  readonly state: ScheduleState;
  readonly score: ScoreResult;
  readonly ranking: AttemptRankingTuple;
}

export type SynthesisFailureReason =
  | { readonly kind: 'unsupported-dual-pipe' }
  | { readonly kind: 'unsupported-residency' }
  | {
      readonly kind: 'source-replay-failed';
      readonly index: number;
      readonly action: Action;
      readonly blockReason: BlockReason;
    }
  | { readonly kind: 'deadlock' }
  | {
      readonly kind: 'too-many-representative-operations';
      readonly representativeOperationCount: number;
      readonly maxRepresentativeOperations: number;
    }
  | { readonly kind: 'search-exhausted'; readonly maxAssignments: number };

export type SqueezedScheduleResult =
  | {
      readonly ok: true;
      readonly original: SynthesisSchedule;
      readonly squeezed: SynthesisSchedule;
      readonly rankOrders: readonly (readonly OperationId[])[];
      readonly removedIntentionalIdle: number;
    }
  | {
      readonly ok: false;
      readonly reason: SynthesisFailureReason;
    };

export interface BuildingBlockSearchOptions {
  readonly minPeriod?: number;
  readonly maxPeriod?: number;
  readonly maxOffset?: number;
  readonly maxRepresentativeOperations?: number;
  readonly maxAssignments?: number;
  readonly maxCandidates?: number;
}

export interface BuildingBlockSearchStats {
  readonly representativeOperationCount: number;
  readonly periodsSearched: number;
  readonly assignmentsVisited: number;
  readonly candidatePlans: number;
  readonly validPlans: number;
  readonly expandedCandidates: number;
  readonly squeezedCandidates: number;
  readonly prunedByResidue: number;
  readonly prunedByDependency: number;
  readonly prunedByValidation: number;
}

export interface BuildingBlockCandidate {
  readonly plan: BuildingBlockPlan;
  readonly analysis: BuildingBlockAnalysis;
  readonly expanded: SynthesisSchedule;
  readonly squeezed: SynthesisSchedule;
  readonly ranking: AttemptRankingTuple;
}

export type BuildingBlockCandidateSearchResult =
  | {
      readonly ok: true;
      readonly candidates: readonly BuildingBlockCandidate[];
      readonly stats: BuildingBlockSearchStats;
    }
  | {
      readonly ok: false;
      readonly reason: SynthesisFailureReason;
      readonly stats: BuildingBlockSearchStats;
      readonly candidates?: readonly BuildingBlockCandidate[];
    };

type MutableBuildingBlockSearchStats = {
  representativeOperationCount: number;
  periodsSearched: number;
  assignmentsVisited: number;
  candidatePlans: number;
  validPlans: number;
  expandedCandidates: number;
  squeezedCandidates: number;
  prunedByResidue: number;
  prunedByDependency: number;
  prunedByValidation: number;
};

type OffsetAssignment = ReadonlyMap<OperationId, number>;

type MutableSearchContext = {
  readonly config: LevelConfig;
  readonly representativeOperations: readonly Operation[];
  readonly operationById: ReadonlyMap<OperationId, Operation>;
  readonly options: Required<BuildingBlockSearchOptions>;
  readonly stats: MutableBuildingBlockSearchStats;
  readonly candidates: BuildingBlockCandidate[];
  exhausted: boolean;
};

type OffsetFeasibility =
  { readonly ok: true } | { readonly ok: false; readonly reason: 'residue' | 'dependency' };

const DEFAULT_MAX_REPRESENTATIVE_OPERATIONS = 8;
const DEFAULT_MAX_ASSIGNMENTS = 50_000;
const DEFAULT_MAX_CANDIDATES = 8;

function freezeAction(action: Action): Action {
  return Object.freeze({ ...action });
}

function freezeActions(actions: readonly Action[]): readonly Action[] {
  return Object.freeze(actions.map(freezeAction));
}

function freezeSchedule(state: ScheduleState): SynthesisSchedule {
  return Object.freeze({
    actions: freezeActions(state.actions),
    state,
    score: score(state),
    ranking: attemptRankingTuple(state),
  });
}

function freezeRankOrders(
  rankOrders: readonly (readonly OperationId[])[],
): readonly (readonly OperationId[])[] {
  return Object.freeze(rankOrders.map((rankOrder) => Object.freeze([...rankOrder])));
}

function freezeSearchStats(stats: MutableBuildingBlockSearchStats): BuildingBlockSearchStats {
  return Object.freeze({ ...stats });
}

function freezeBuildingBlockPlan(plan: BuildingBlockPlan): BuildingBlockPlan {
  return Object.freeze({
    period: plan.period,
    trajectory: Object.freeze(
      plan.trajectory.map((entry) =>
        Object.freeze({
          operationId: entry.operationId,
          offset: entry.offset,
        }),
      ),
    ),
  });
}

function freezeCandidate(candidate: BuildingBlockCandidate): BuildingBlockCandidate {
  return Object.freeze({
    plan: freezeBuildingBlockPlan(candidate.plan),
    analysis: candidate.analysis,
    expanded: candidate.expanded,
    squeezed: candidate.squeezed,
    ranking: candidate.ranking,
  });
}

function freezeCandidates(
  candidates: readonly BuildingBlockCandidate[],
): readonly BuildingBlockCandidate[] {
  return Object.freeze(candidates.map(freezeCandidate));
}

function freezeBlockReason(reason: BlockReason): BlockReason {
  if ('evictedStages' in reason) {
    return Object.freeze({
      ...reason,
      evictedStages: Object.freeze([...reason.evictedStages]),
    });
  }
  return Object.freeze({ ...reason });
}

function unsupportedReason(config: LevelConfig): SynthesisFailureReason | null {
  if (config.dualPipeModel) {
    return Object.freeze({ kind: 'unsupported-dual-pipe' as const });
  }
  if (config.residencyModel) {
    return Object.freeze({ kind: 'unsupported-residency' as const });
  }
  return null;
}

function sourceReplayFailure(
  result: Extract<ReturnType<typeof replay>, { ok: false }>,
): SynthesisFailureReason {
  return Object.freeze({
    kind: 'source-replay-failed' as const,
    index: result.index,
    action: freezeAction(result.action),
    blockReason: freezeBlockReason(result.reason),
  });
}

function scheduleForActions(config: LevelConfig, actions: readonly Action[]): SynthesisSchedule {
  const result = replay(config, actions);
  if (!result.ok) {
    throw new Error(
      `expected replayable actions, failed at ${result.index}: ${result.reason.kind}`,
    );
  }
  return freezeSchedule(result.state);
}

function rankOrdersFromState(state: ScheduleState): readonly (readonly OperationId[])[] {
  const rankOrders: OperationId[][] = Array.from({ length: state.config.rankCount }, () => []);

  const sortedPlacements = [...state.placements].sort(
    (left, right) =>
      left.rank - right.rank ||
      left.start - right.start ||
      left.end - right.end ||
      left.operationId.localeCompare(right.operationId),
  );

  for (const placement of sortedPlacements) {
    rankOrders[placement.rank]!.push(placement.operationId);
  }

  return freezeRankOrders(rankOrders);
}

function isLegalMove(
  move: MoveClassification,
): move is Extract<MoveClassification, { status: 'legal' }> {
  return move.status === 'legal';
}

function headChoice(
  state: ScheduleState,
  rankOrders: readonly (readonly OperationId[])[],
  cursors: readonly number[],
): Extract<MoveClassification, { status: 'legal' }> | null {
  const legalById = new Map(
    classifyMoves(state)
      .filter(isLegalMove)
      .map((move) => [move.operation.id, move]),
  );
  let best: Extract<MoveClassification, { status: 'legal' }> | null = null;

  for (let rank = 0; rank < rankOrders.length; rank += 1) {
    const operationId = rankOrders[rank]?.[cursors[rank] ?? 0];
    if (!operationId) {
      continue;
    }

    const move = legalById.get(operationId);
    if (!move) {
      continue;
    }

    if (
      !best ||
      move.earliestStart < best.earliestStart ||
      (move.earliestStart === best.earliestStart && move.operation.rank < best.operation.rank) ||
      (move.earliestStart === best.earliestStart &&
        move.operation.rank === best.operation.rank &&
        move.operation.id.localeCompare(best.operation.id) < 0)
    ) {
      best = move;
    }
  }

  return best;
}

export function squeezeActionsByRankOrder(
  config: LevelConfig,
  actions: readonly Action[],
): SqueezedScheduleResult {
  const unsupported = unsupportedReason(config);
  if (unsupported) {
    return Object.freeze({ ok: false as const, reason: unsupported });
  }

  const source = replay(config, actions);
  if (!source.ok) {
    return Object.freeze({ ok: false as const, reason: sourceReplayFailure(source) });
  }

  const rankOrders = rankOrdersFromState(source.state);
  const targetPlacements = rankOrders.reduce((total, rankOrder) => total + rankOrder.length, 0);
  const cursors = new Array<number>(config.rankCount).fill(0);
  let state = initialState(config);

  while (state.placements.length < targetPlacements) {
    const choice = headChoice(state, rankOrders, cursors);
    if (!choice) {
      return Object.freeze({ ok: false as const, reason: Object.freeze({ kind: 'deadlock' }) });
    }

    const applied = applyAction(state, { type: 'place', operationId: choice.operation.id });
    if (!applied.ok) {
      throw new Error(`classified legal move was rejected: ${applied.reason.kind}`);
    }

    cursors[choice.operation.rank] = (cursors[choice.operation.rank] ?? 0) + 1;
    state = applied.state;
  }

  const original = freezeSchedule(source.state);
  const squeezed = freezeSchedule(state);
  return Object.freeze({
    ok: true as const,
    original,
    squeezed,
    rankOrders,
    removedIntentionalIdle: Math.max(
      0,
      original.score.intentionalIdle - squeezed.score.intentionalIdle,
    ),
  });
}

function positiveIntegerOption(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value) || !Number.isInteger(value) || value <= 0) {
    return fallback;
  }
  return value;
}

function nonNegativeIntegerOption(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
    return fallback;
  }
  return value;
}

function operationKindOrder(operation: Operation): number {
  if (operation.kind === 'F') return 0;
  if (operation.kind === 'B') return 1;
  return 2;
}

function compareRepresentativeOperations(left: Operation, right: Operation): number {
  const leftStage = left.kind === 'B' ? -left.stage : left.stage;
  const rightStage = right.kind === 'B' ? -right.stage : right.stage;
  const deltas = [
    operationKindOrder(left) - operationKindOrder(right),
    leftStage - rightStage,
    left.rank - right.rank,
    left.microbatch - right.microbatch,
  ];

  for (const delta of deltas) {
    if (delta !== 0) {
      return delta;
    }
  }

  return left.id.localeCompare(right.id);
}

function representativeOperations(config: LevelConfig): readonly Operation[] {
  return Object.freeze(
    deriveOperations(config)
      .filter((operation) => operation.microbatch === 0)
      .sort(compareRepresentativeOperations),
  );
}

function maxRankWork(config: LevelConfig, operations: readonly Operation[]): number {
  const workByRank = new Array<number>(config.rankCount).fill(0);
  for (const operation of operations) {
    workByRank[operation.rank]! += operation.duration;
  }
  return workByRank.reduce((max, work) => Math.max(max, work), 1);
}

function normalizeSearchOptions(
  config: LevelConfig,
  operations: readonly Operation[],
  options: BuildingBlockSearchOptions,
): Required<BuildingBlockSearchOptions> {
  const minimumPeriod = positiveIntegerOption(options.minPeriod, maxRankWork(config, operations));
  const maximumPeriod = positiveIntegerOption(options.maxPeriod, minimumPeriod + 4);
  const maxPeriod = Math.max(minimumPeriod, maximumPeriod);

  return Object.freeze({
    minPeriod: minimumPeriod,
    maxPeriod,
    maxOffset: nonNegativeIntegerOption(
      options.maxOffset,
      maxPeriod + maxRankWork(config, operations),
    ),
    maxRepresentativeOperations: positiveIntegerOption(
      options.maxRepresentativeOperations,
      DEFAULT_MAX_REPRESENTATIVE_OPERATIONS,
    ),
    maxAssignments: positiveIntegerOption(options.maxAssignments, DEFAULT_MAX_ASSIGNMENTS),
    maxCandidates: positiveIntegerOption(options.maxCandidates, DEFAULT_MAX_CANDIDATES),
  });
}

function emptySearchStats(representativeOperationCount: number): MutableBuildingBlockSearchStats {
  return {
    representativeOperationCount,
    periodsSearched: 0,
    assignmentsVisited: 0,
    candidatePlans: 0,
    validPlans: 0,
    expandedCandidates: 0,
    squeezedCandidates: 0,
    prunedByResidue: 0,
    prunedByDependency: 0,
    prunedByValidation: 0,
  };
}

function assignmentPlan(
  period: number,
  operations: readonly Operation[],
  assignments: OffsetAssignment,
): BuildingBlockPlan {
  return freezeBuildingBlockPlan({
    period,
    trajectory: operations.map((operation) => ({
      operationId: operation.id,
      offset: assignments.get(operation.id) ?? 0,
    })),
  });
}

function planSortKey(plan: BuildingBlockPlan): string {
  return plan.trajectory.map((entry) => `${entry.operationId}@${entry.offset}`).join('|');
}

function stableBubbleTotal(analysis: BuildingBlockAnalysis): number {
  return analysis.rankAnalyses.reduce((total, rank) => total + rank.stableBubble, 0);
}

function compareCandidates(left: BuildingBlockCandidate, right: BuildingBlockCandidate): number {
  const rankingDelta = compareAttempts(left.ranking, right.ranking);
  if (rankingDelta !== 0) {
    return rankingDelta;
  }

  const deltas = [
    left.plan.period - right.plan.period,
    stableBubbleTotal(left.analysis) - stableBubbleTotal(right.analysis),
  ];
  for (const delta of deltas) {
    if (delta !== 0) {
      return delta;
    }
  }

  return planSortKey(left.plan).localeCompare(planSortKey(right.plan));
}

function appendCandidate(
  candidates: BuildingBlockCandidate[],
  candidate: BuildingBlockCandidate,
  maxCandidates: number,
): void {
  candidates.push(freezeCandidate(candidate));
  candidates.sort(compareCandidates);
  candidates.splice(maxCandidates);
}

function occupancyKeys(operation: Operation, offset: number, period: number): readonly string[] {
  const keys: string[] = [];
  const seen = new Set<string>();

  for (let tick = 0; tick < operation.duration; tick += 1) {
    const residue = (offset + tick) % period;
    const key = `${operation.rank}:${residue}`;
    if (seen.has(key)) {
      return Object.freeze([...keys, key]);
    }
    seen.add(key);
    keys.push(key);
  }

  return Object.freeze(keys);
}

function hasResidueConflict(
  operation: Operation,
  offset: number,
  period: number,
  occupancy: ReadonlyMap<string, OperationId>,
): boolean {
  const keys = occupancyKeys(operation, offset, period);
  return new Set(keys).size !== keys.length || keys.some((key) => occupancy.has(key));
}

function hasDependencyConflict(
  config: LevelConfig,
  operation: Operation,
  offset: number,
  assignments: OffsetAssignment,
  operationById: ReadonlyMap<OperationId, Operation>,
): boolean {
  for (const predecessorId of predecessorsOf(operation.id, config)) {
    const predecessor = operationById.get(predecessorId);
    const predecessorOffset = assignments.get(predecessorId);
    if (
      predecessor &&
      predecessorOffset !== undefined &&
      predecessorOffset + predecessor.duration > offset
    ) {
      return true;
    }
  }

  const operationEnd = offset + operation.duration;
  for (const [assignedId, assignedOffset] of assignments) {
    if (!predecessorsOf(assignedId, config).includes(operation.id)) {
      continue;
    }
    if (operationEnd > assignedOffset) {
      return true;
    }
  }

  return false;
}

function offsetFeasibility(
  context: MutableSearchContext,
  operation: Operation,
  offset: number,
  period: number,
  assignments: OffsetAssignment,
  occupancy: ReadonlyMap<string, OperationId>,
): OffsetFeasibility {
  if (hasResidueConflict(operation, offset, period, occupancy)) {
    context.stats.prunedByResidue += 1;
    return Object.freeze({ ok: false as const, reason: 'residue' as const });
  }

  if (
    hasDependencyConflict(context.config, operation, offset, assignments, context.operationById)
  ) {
    context.stats.prunedByDependency += 1;
    return Object.freeze({ ok: false as const, reason: 'dependency' as const });
  }

  return Object.freeze({ ok: true as const });
}

function addOccupancy(
  occupancy: ReadonlyMap<string, OperationId>,
  operation: Operation,
  offset: number,
  period: number,
): ReadonlyMap<string, OperationId> {
  const next = new Map(occupancy);
  for (const key of occupancyKeys(operation, offset, period)) {
    next.set(key, operation.id);
  }
  return next;
}

function evaluatePlan(
  context: MutableSearchContext,
  period: number,
  assignments: OffsetAssignment,
): void {
  context.stats.candidatePlans += 1;
  const plan = assignmentPlan(period, context.representativeOperations, assignments);
  const analysis = analyzeBuildingBlockPlan(context.config, plan);
  if (!analysis.validation.ok) {
    context.stats.prunedByValidation += 1;
    return;
  }

  context.stats.validPlans += 1;
  const expanded = expandBuildingBlockPlan(context.config, plan);
  if (!expanded.ok) {
    context.stats.prunedByValidation += 1;
    return;
  }

  const expandedSchedule = scheduleForActions(context.config, expanded.actions);
  context.stats.expandedCandidates += 1;
  const squeezed = squeezeActionsByRankOrder(context.config, expanded.actions);
  if (!squeezed.ok) {
    context.stats.prunedByValidation += 1;
    return;
  }

  context.stats.squeezedCandidates += 1;
  appendCandidate(
    context.candidates,
    {
      plan,
      analysis,
      expanded: expandedSchedule,
      squeezed: squeezed.squeezed,
      ranking: squeezed.squeezed.ranking,
    },
    context.options.maxCandidates,
  );
}

function searchOffsets(
  context: MutableSearchContext,
  period: number,
  index: number,
  assignments: OffsetAssignment,
  occupancy: ReadonlyMap<string, OperationId>,
): void {
  if (context.exhausted) {
    return;
  }

  if (index >= context.representativeOperations.length) {
    evaluatePlan(context, period, assignments);
    return;
  }

  const operation = context.representativeOperations[index]!;
  for (let offset = 0; offset <= context.options.maxOffset; offset += 1) {
    if (context.stats.assignmentsVisited >= context.options.maxAssignments) {
      context.exhausted = true;
      return;
    }
    context.stats.assignmentsVisited += 1;

    const feasible = offsetFeasibility(context, operation, offset, period, assignments, occupancy);
    if (!feasible.ok) {
      continue;
    }

    const nextAssignments = new Map(assignments);
    nextAssignments.set(operation.id, offset);
    searchOffsets(
      context,
      period,
      index + 1,
      nextAssignments,
      addOccupancy(occupancy, operation, offset, period),
    );
  }
}

function searchFailureResult(
  reason: SynthesisFailureReason,
  stats: MutableBuildingBlockSearchStats,
  candidates: readonly BuildingBlockCandidate[] = [],
): BuildingBlockCandidateSearchResult {
  const frozenCandidates = freezeCandidates(candidates);
  return Object.freeze({
    ok: false as const,
    reason,
    stats: freezeSearchStats(stats),
    ...(frozenCandidates.length > 0 ? { candidates: frozenCandidates } : {}),
  });
}

export function findBuildingBlockCandidates(
  config: LevelConfig,
  options: BuildingBlockSearchOptions = {},
): BuildingBlockCandidateSearchResult {
  const unsupported = unsupportedReason(config);
  const operations = unsupported
    ? Object.freeze([] as readonly Operation[])
    : representativeOperations(config);
  const stats = emptySearchStats(operations.length);
  if (unsupported) {
    return searchFailureResult(unsupported, stats);
  }

  const normalizedOptions = normalizeSearchOptions(config, operations, options);
  if (operations.length > normalizedOptions.maxRepresentativeOperations) {
    return searchFailureResult(
      Object.freeze({
        kind: 'too-many-representative-operations' as const,
        representativeOperationCount: operations.length,
        maxRepresentativeOperations: normalizedOptions.maxRepresentativeOperations,
      }),
      stats,
    );
  }

  const context: MutableSearchContext = {
    config,
    representativeOperations: operations,
    operationById: new Map(operations.map((operation) => [operation.id, operation])),
    options: normalizedOptions,
    stats,
    candidates: [],
    exhausted: false,
  };

  for (
    let period = normalizedOptions.minPeriod;
    period <= normalizedOptions.maxPeriod;
    period += 1
  ) {
    if (context.exhausted) {
      break;
    }
    stats.periodsSearched += 1;
    searchOffsets(context, period, 0, new Map(), new Map());
  }

  if (context.exhausted) {
    return searchFailureResult(
      Object.freeze({
        kind: 'search-exhausted' as const,
        maxAssignments: normalizedOptions.maxAssignments,
      }),
      stats,
      context.candidates,
    );
  }

  return Object.freeze({
    ok: true as const,
    candidates: freezeCandidates(context.candidates),
    stats: freezeSearchStats(stats),
  });
}
