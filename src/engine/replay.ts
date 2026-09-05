import type {
  Action,
  LevelConfig,
  Operation,
  OperationId,
  PipelineDirection,
  ResidencyEffect,
} from './types';
import {
  deriveOperations,
  operationIdFor,
  predecessorsOf,
  parseOperationId,
  releasesActivation,
} from './operations';
import { validateLevelConfig } from './config';

export interface Placement {
  operationId: OperationId;
  rank: number;
  start: number;
  end: number;
}

export interface Gap {
  rank: number;
  start: number;
  end: number;
  kind: 'dependency-forced' | 'intentional';
}

export interface MemoryTimelineSegment {
  readonly start: number;
  readonly end: number;
  readonly value: number;
}

export interface ResourceDelay {
  readonly rank: number;
  readonly start: number;
  readonly end: number;
  readonly direction?: PipelineDirection;
  readonly sharedCapacity: number;
  readonly directionalSlots: number;
}

export type BlockReason =
  | { kind: 'already-placed'; operationId: OperationId }
  | { kind: 'dependency-not-finished'; operationId: OperationId }
  | { kind: 'memory-cap'; rank: number; resident: number; requested: 1; cap: number }
  | {
      kind: 'residency-memory-cap';
      operationId: OperationId;
      rank: number;
      activationMemory: number;
      residentWeightMemory: number;
      requestedWeightMemory: number;
      evictedStages: readonly number[];
      cap: number;
    }
  | { kind: 'invalid-rank'; rank: number }
  | { kind: 'unknown-operation-id'; operationId: OperationId };

export type MoveClassification =
  | {
      status: 'legal';
      operation: Operation;
      dependencyIds: readonly OperationId[];
      earliestStart: number;
      projectedMemory: number;
      resourceDelay?: ResourceDelay;
      residencyEffect?: ResidencyEffect;
    }
  | {
      status: 'blocked';
      operation: Operation;
      dependencyIds: readonly OperationId[];
      reasons: readonly BlockReason[];
    }
  | {
      status: 'completed';
      operation: Operation;
      placement: Placement;
      dependencyIds: readonly OperationId[];
      residencyEffect?: ResidencyEffect;
    };

export interface ScheduleState {
  config: LevelConfig;
  operations: readonly Operation[];
  placements: readonly Placement[];
  placementById: Readonly<Partial<Record<OperationId, Placement>>>;
  rankFrontiers: readonly number[];
  currentMemory: readonly number[];
  peakMemory: readonly number[];
  activationMemoryTimelineByRank: readonly (readonly MemoryTimelineSegment[])[];
  weightResidencyTimelineByRank: readonly (readonly MemoryTimelineSegment[])[];
  residentWeightsByRank: readonly (readonly number[])[];
  weightEventsByPlacement: Readonly<Partial<Record<OperationId, ResidencyEffect>>>;
  allGatherCount: number;
  gaps: readonly Gap[];
  actions: readonly Action[];
}

export type ApplyResult =
  { ok: true; state: ScheduleState } | { ok: false; action: Action; reason: BlockReason };

export type ReplayResult =
  | { ok: true; state: ScheduleState }
  | { ok: false; index: number; action: Action; reason: BlockReason };

function createPlacementById(
  _config: LevelConfig,
  _operations: readonly Operation[],
  placements: readonly Placement[],
): Readonly<Partial<Record<OperationId, Placement>>> {
  const map: Partial<Record<OperationId, Placement>> = {};
  for (const placement of placements) {
    map[placement.operationId] = placement;
  }
  return Object.freeze(map);
}

function freezeMemoryTimelineSegments(
  segments: readonly MemoryTimelineSegment[],
): readonly MemoryTimelineSegment[] {
  return Object.freeze(segments.map((segment) => Object.freeze({ ...segment })));
}

function emptyMemoryTimelines(rankCount: number): readonly (readonly MemoryTimelineSegment[])[] {
  return Object.freeze(
    Array.from({ length: rankCount }, () =>
      freezeMemoryTimelineSegments([{ start: 0, end: 0, value: 0 }]),
    ),
  );
}

function maxEndTimeForPlacements(
  placements: readonly Placement[],
  rankFrontiers: readonly number[],
): number {
  const placementEnd = placements.reduce((max, placement) => Math.max(max, placement.end), 0);
  const frontierEnd = rankFrontiers.reduce((max, frontier) => Math.max(max, frontier), 0);
  return Math.max(placementEnd, frontierEnd, 2);
}

function computeActivationMemoryTimelineByRank(
  config: LevelConfig,
  operations: readonly Operation[],
  placements: readonly Placement[],
  rankFrontiers: readonly number[],
): readonly (readonly MemoryTimelineSegment[])[] {
  const horizon = maxEndTimeForPlacements(placements, rankFrontiers);
  if (horizon === 0) {
    return emptyMemoryTimelines(config.rankCount);
  }

  const operationById = new Map(operations.map((operation) => [operation.id, operation]));
  return Object.freeze(
    Array.from({ length: config.rankCount }, (_, rank) => {
      const events = placements
        .filter((placement) => placement.rank === rank)
        .map((placement) => {
          const operation = operationById.get(placement.operationId);
          if (!operation) {
            throw new Error(`Operation ${placement.operationId} not found`);
          }
          return {
            time: placement.end,
            delta: operation.kind === 'F' ? 1 : releasesActivation(config, operation.kind) ? -1 : 0,
          };
        })
        .filter((event) => event.delta !== 0)
        .sort((left, right) => left.time - right.time || right.delta - left.delta);

      const segments: MemoryTimelineSegment[] = [];
      let cursor = 0;
      let value = 0;

      for (const event of events) {
        if (event.time > cursor) {
          segments.push({ start: cursor, end: event.time, value });
          cursor = event.time;
        }
        value += event.delta;
      }

      if (cursor < horizon) {
        segments.push({ start: cursor, end: horizon, value });
      }

      if (segments.length === 0) {
        segments.push({ start: 0, end: horizon, value: 0 });
      }

      return freezeMemoryTimelineSegments(segments);
    }),
  );
}

function computeWeightResidencyTimelineByRank(
  config: LevelConfig,
  placements: readonly Placement[],
  rankFrontiers: readonly number[],
  weightEventsByPlacement: Readonly<Partial<Record<OperationId, ResidencyEffect>>>,
): readonly (readonly MemoryTimelineSegment[])[] {
  const horizon = maxEndTimeForPlacements(placements, rankFrontiers);
  if (horizon === 0) {
    return emptyMemoryTimelines(config.rankCount);
  }

  return Object.freeze(
    Array.from({ length: config.rankCount }, (_, rank) => {
      const rankedPlacements = placements
        .filter((placement) => placement.rank === rank)
        .sort((left, right) => left.start - right.start || left.end - right.end);
      const segments: MemoryTimelineSegment[] = [];
      let cursor = 0;
      let value = 0;

      for (const placement of rankedPlacements) {
        const effect = weightEventsByPlacement[placement.operationId];
        if (!effect) {
          continue;
        }
        // Residency is required before forward computation. Gather/eviction is
        // instantaneous in this model; its communication cost is not simulated.
        if (placement.start > cursor) {
          segments.push({ start: cursor, end: placement.start, value });
          cursor = placement.start;
        }
        value = effect.residentWeightMemory;
      }

      if (cursor < horizon) {
        segments.push({ start: cursor, end: horizon, value });
      }

      if (segments.length === 0) {
        segments.push({ start: 0, end: horizon, value: 0 });
      }

      return freezeMemoryTimelineSegments(segments);
    }),
  );
}

function computePeakMemory(
  config: LevelConfig,
  _operations: readonly Operation[],
  placements: readonly Placement[],
): readonly number[] {
  const rankCount = config.rankCount;
  const peaks = new Array<number>(rankCount).fill(0);
  const activations = new Array<number>(rankCount).fill(0);
  const events: Array<{ time: number; rank: number; delta: number }> = [];

  for (const placement of placements) {
    const parsed = parseOperationId(placement.operationId);
    if (parsed.kind === 'F') {
      events.push({ time: placement.end, rank: placement.rank, delta: 1 });
    } else if (releasesActivation(config, parsed.kind)) {
      events.push({ time: placement.end, rank: placement.rank, delta: -1 });
    }
  }

  // Sort by time, then rank, then delta. Same-time events order acquire (+1)
  // before release (-1) so peak reflects conservative concurrent activation.
  events.sort((a, b) => a.time - b.time || a.rank - b.rank || b.delta - a.delta);

  for (const event of events) {
    activations[event.rank]! += event.delta;
    if (activations[event.rank]! > peaks[event.rank]!) {
      peaks[event.rank] = activations[event.rank]!;
    }
  }

  return Object.freeze(peaks);
}

function computeCurrentMemory(
  config: LevelConfig,
  placements: readonly Placement[],
): readonly number[] {
  const rankCount = config.rankCount;
  const current = new Array<number>(rankCount).fill(0);
  const releasedF = new Set<OperationId>();

  for (const placement of placements) {
    const parsed = parseOperationId(placement.operationId);
    if (releasesActivation(config, parsed.kind)) {
      const matchingF = operationIdFor(
        config,
        'F',
        parsed.stage,
        parsed.microbatch,
        parsed.direction ?? 'asc',
      );
      releasedF.add(matchingF);
    }
  }

  for (const placement of placements) {
    const parsed = parseOperationId(placement.operationId);
    if (parsed.kind === 'F' && !releasedF.has(placement.operationId)) {
      current[placement.rank]! += 1;
    }
  }

  return Object.freeze(current);
}

function cloneConfig(config: LevelConfig): LevelConfig {
  const cloned: LevelConfig = {
    ...config,
    durations: Object.freeze({ ...config.durations }),
    masteryTargets: config.masteryTargets
      ? Object.freeze(config.masteryTargets.map((t) => Object.freeze({ ...t })))
      : Object.freeze([]),
    coaching: Object.freeze({ ...config.coaching }),
    algorithm: Object.freeze({
      ...config.algorithm,
      introducedModel: Object.freeze([...config.algorithm.introducedModel]),
    }),
    ...(config.operationModel
      ? { operationModel: Object.freeze({ ...config.operationModel }) }
      : {}),
    ...(config.microbatchGrouping
      ? {
          microbatchGrouping: Object.freeze({
            groupSize: config.microbatchGrouping.groupSize,
            ...(config.microbatchGrouping.groupLabels
              ? { groupLabels: Object.freeze([...config.microbatchGrouping.groupLabels]) }
              : {}),
          }),
        }
      : {}),
    ...(config.scoreModel ? { scoreModel: Object.freeze({ ...config.scoreModel }) } : {}),
    ...(config.residencyModel
      ? { residencyModel: Object.freeze({ ...config.residencyModel }) }
      : {}),
    ...(config.dualPipeModel
      ? {
          dualPipeModel: Object.freeze({
            enabled: config.dualPipeModel.enabled,
            directions: Object.freeze([...config.dualPipeModel.directions]),
            resourceModel: Object.freeze({ ...config.dualPipeModel.resourceModel }),
            ...(config.dualPipeModel.crossDirectionDependencies
              ? {
                  crossDirectionDependencies: Object.freeze(
                    config.dualPipeModel.crossDirectionDependencies.map((edge) =>
                      Object.freeze({ ...edge }),
                    ),
                  ),
                }
              : {}),
          }),
        }
      : {}),
    ...(config.referencePolicy
      ? {
          referencePolicy: Object.freeze({
            candidatePolicyIds: Object.freeze([...config.referencePolicy.candidatePolicyIds]),
            ...(config.referencePolicy.comparisonPolicyId
              ? { comparisonPolicyId: config.referencePolicy.comparisonPolicyId }
              : {}),
          }),
        }
      : {}),
    ...(config.durationOverrides
      ? {
          durationOverrides: Object.freeze(
            config.durationOverrides.map((override) => Object.freeze({ ...override })),
          ),
        }
      : {}),
    ...(config.topology ? { topology: Object.freeze({ ...config.topology }) } : {}),
  };
  if (config.memoryCaps) {
    cloned.memoryCaps = Object.freeze([...config.memoryCaps]);
  }
  return Object.freeze(cloned);
}

function validateOperationIdInInventory(id: OperationId, operations: readonly Operation[]): void {
  parseOperationId(id);
  const found = operations.find((op) => op.id === id);
  if (!found) {
    throw new Error(
      `Operation ${id} not in inventory. Valid operations have matching stage/microbatch for this config.`,
    );
  }
}

function operationIdReasonInInventory(
  id: OperationId,
  operations: readonly Operation[],
): BlockReason | null {
  try {
    parseOperationId(id);
  } catch {
    return { kind: 'unknown-operation-id', operationId: id };
  }

  const found = operations.find((op) => op.id === id);
  return found ? null : { kind: 'unknown-operation-id', operationId: id };
}

function emptyResidentWeights(rankCount: number): readonly (readonly number[])[] {
  return Object.freeze(
    Array.from({ length: rankCount }, () => Object.freeze([] as readonly number[])),
  );
}

function freezeResidentWeights(
  residentWeightsByRank: readonly (readonly number[])[],
): readonly (readonly number[])[] {
  return Object.freeze(
    residentWeightsByRank.map((stages) =>
      Object.freeze([...stages].sort((left, right) => left - right)),
    ),
  );
}

function freezeResidencyEffect(effect: ResidencyEffect): ResidencyEffect {
  return Object.freeze({
    ...effect,
    evictedStages: Object.freeze([...effect.evictedStages]),
    residentStages: Object.freeze([...effect.residentStages]),
  });
}

type ResidencyProjection =
  | { ok: true; effect: ResidencyEffect }
  | { ok: false; reason: Extract<BlockReason, { kind: 'residency-memory-cap' }> };

function projectResidencyEffect(
  state: ScheduleState,
  operation: Operation,
): ResidencyProjection | null {
  const residencyModel = state.config.residencyModel;
  if (!residencyModel || operation.kind !== 'F') {
    return null;
  }

  const rank = operation.rank;
  const cap = state.config.memoryCaps?.[rank] ?? null;
  const weightUnit = residencyModel.weightUnit;
  const activationMemory = (state.currentMemory[rank] ?? 0) + 1;
  const previousResidentStages = state.residentWeightsByRank[rank] ?? Object.freeze([]);
  const residentStages = new Set(previousResidentStages);
  const hasCurrentStage = residentStages.has(operation.stage);
  const evictedStages: number[] = [];

  residentStages.add(operation.stage);

  if (cap !== null) {
    const evictionCandidates = [...residentStages]
      .filter((stage) => stage !== operation.stage)
      .sort((left, right) => left - right);

    while (
      activationMemory + residentStages.size * weightUnit > cap &&
      evictionCandidates.length > 0
    ) {
      const evicted = evictionCandidates.shift()!;
      residentStages.delete(evicted);
      evictedStages.push(evicted);
    }

    const residentWeightMemory = residentStages.size * weightUnit;
    if (activationMemory + residentWeightMemory > cap) {
      return Object.freeze({
        ok: false as const,
        reason: Object.freeze({
          kind: 'residency-memory-cap' as const,
          operationId: operation.id,
          rank,
          activationMemory,
          residentWeightMemory,
          requestedWeightMemory: hasCurrentStage ? 0 : weightUnit,
          evictedStages: Object.freeze(evictedStages),
          cap,
        }),
      });
    }
  }

  const nextResidentStages = Object.freeze([...residentStages].sort((left, right) => left - right));
  const residentWeightMemory = nextResidentStages.length * weightUnit;
  const effect: ResidencyEffect = freezeResidencyEffect({
    operationId: operation.id,
    rank,
    stage: operation.stage,
    action: hasCurrentStage ? 'reuse' : 'gather',
    evictedStages,
    residentStages: nextResidentStages,
    activationMemory,
    residentWeightMemory,
    totalMemory: activationMemory + residentWeightMemory,
    cap,
  });

  return Object.freeze({ ok: true as const, effect });
}

function timelineStateFields(
  config: LevelConfig,
  operations: readonly Operation[],
  placements: readonly Placement[],
  rankFrontiers: readonly number[],
  weightEventsByPlacement: Readonly<Partial<Record<OperationId, ResidencyEffect>>>,
): Pick<ScheduleState, 'activationMemoryTimelineByRank' | 'weightResidencyTimelineByRank'> {
  return Object.freeze({
    activationMemoryTimelineByRank: computeActivationMemoryTimelineByRank(
      config,
      operations,
      placements,
      rankFrontiers,
    ),
    weightResidencyTimelineByRank: computeWeightResidencyTimelineByRank(
      config,
      placements,
      rankFrontiers,
      weightEventsByPlacement,
    ),
  });
}

function validateWaitRank(rank: number, rankCount: number): BlockReason | null {
  if (!Number.isFinite(rank) || !Number.isInteger(rank)) {
    return { kind: 'invalid-rank', rank };
  }
  if (rank < 0 || rank >= rankCount) {
    return { kind: 'invalid-rank', rank };
  }
  return null;
}

export function initialState(config: LevelConfig): ScheduleState {
  validateLevelConfig(config);
  const frozenConfig = cloneConfig(config);
  const operations = deriveOperations(frozenConfig);
  const rankCount = frozenConfig.rankCount;
  const rankFrontiers = Object.freeze(new Array<number>(rankCount).fill(0));
  const placements = Object.freeze([] as readonly Placement[]);
  const weightEventsByPlacement = Object.freeze({});
  const timelines = timelineStateFields(
    frozenConfig,
    operations,
    placements,
    rankFrontiers,
    weightEventsByPlacement,
  );

  const state: ScheduleState = {
    config: frozenConfig,
    operations,
    placements,
    placementById: Object.freeze({}),
    rankFrontiers,
    currentMemory: Object.freeze(new Array<number>(rankCount).fill(0)),
    peakMemory: Object.freeze(new Array<number>(rankCount).fill(0)),
    activationMemoryTimelineByRank: timelines.activationMemoryTimelineByRank,
    weightResidencyTimelineByRank: timelines.weightResidencyTimelineByRank,
    residentWeightsByRank: emptyResidentWeights(rankCount),
    weightEventsByPlacement,
    allGatherCount: 0,
    gaps: Object.freeze([]),
    actions: Object.freeze([]),
  };

  return Object.freeze(state);
}

export function classifyOperation(state: ScheduleState, id: OperationId): MoveClassification {
  validateOperationIdInInventory(id, state.operations);

  const operation = state.operations.find((op) => op.id === id)!;

  const existing = state.placementById[id];
  if (existing) {
    const residencyEffect = state.weightEventsByPlacement[id];
    return {
      status: 'completed',
      operation,
      placement: existing,
      dependencyIds: Object.freeze([...predecessorsOf(id, state.config)]),
      ...(residencyEffect ? { residencyEffect } : {}),
    };
  }

  const reasons: BlockReason[] = [];
  const predecessors = predecessorsOf(id, state.config);

  for (const predId of predecessors) {
    if (!state.placementById[predId]) {
      reasons.push({ kind: 'dependency-not-finished', operationId: predId });
    }
  }

  const dependenciesReady = reasons.length === 0;

  if (dependenciesReady && operation.kind === 'F' && state.config.memoryCaps !== null) {
    if (state.config.residencyModel) {
      const residencyProjection = projectResidencyEffect(state, operation);
      if (residencyProjection?.ok === false) {
        reasons.push(residencyProjection.reason);
      }
    } else {
      const cap = state.config.memoryCaps[operation.rank];
      if (cap !== undefined) {
        const resident = state.currentMemory[operation.rank] ?? 0;
        if (resident + 1 > cap) {
          reasons.push({
            kind: 'memory-cap',
            rank: operation.rank,
            resident,
            requested: 1,
            cap,
          });
        }
      }
    }
  }

  if (reasons.length > 0) {
    return {
      status: 'blocked',
      operation,
      dependencyIds: Object.freeze([...predecessors]),
      reasons: Object.freeze(reasons),
    };
  }

  let projectedMemory = state.currentMemory[operation.rank] ?? 0;
  if (operation.kind === 'F') {
    projectedMemory = projectedMemory + 1;
  } else if (releasesActivation(state.config, operation.kind)) {
    projectedMemory = projectedMemory - 1;
  }

  const dependencyStart = dependencyReadyTime(state, operation);
  const waitStart = latestIntentionalWaitEnd(state, operation.rank);
  const minimumStart = state.config.dualPipeModel
    ? Math.max(dependencyStart, waitStart)
    : Math.max(state.rankFrontiers[operation.rank] ?? 0, dependencyStart);
  const start = state.config.dualPipeModel
    ? earliestDualPipeResourceStart(state, operation, minimumStart)
    : minimumStart;
  const resourceDelay = resourceDelayForStart(state, operation, minimumStart, start);
  const residencyProjection = projectResidencyEffect(state, operation);
  return {
    status: 'legal',
    operation,
    dependencyIds: Object.freeze([...predecessors]),
    earliestStart: start,
    projectedMemory,
    ...(resourceDelay ? { resourceDelay } : {}),
    ...(residencyProjection?.ok === true ? { residencyEffect: residencyProjection.effect } : {}),
  };
}

function computeEarliestStart(state: ScheduleState, operation: Operation): number {
  if (state.config.dualPipeModel) {
    const dependencyStart = dependencyReadyTime(state, operation);
    const waitStart = latestIntentionalWaitEnd(state, operation.rank);
    return earliestDualPipeResourceStart(state, operation, Math.max(dependencyStart, waitStart));
  }

  let start = state.rankFrontiers[operation.rank] ?? 0;
  const predecessors = predecessorsOf(operation.id, state.config);
  for (const predId of predecessors) {
    const predPlacement = state.placementById[predId];
    if (predPlacement) {
      start = Math.max(start, predPlacement.end);
    }
  }
  return start;
}

function dependencyReadyTime(state: ScheduleState, operation: Operation): number {
  let start = 0;
  const predecessors = predecessorsOf(operation.id, state.config);
  for (const predId of predecessors) {
    const predPlacement = state.placementById[predId];
    if (predPlacement) {
      start = Math.max(start, predPlacement.end);
    }
  }
  return start;
}

function latestIntentionalWaitEnd(state: ScheduleState, rank: number): number {
  return state.gaps.reduce(
    (latest, gap) =>
      gap.rank === rank && gap.kind === 'intentional' ? Math.max(latest, gap.end) : latest,
    0,
  );
}

function resourceDelayForStart(
  state: ScheduleState,
  operation: Operation,
  minimumStart: number,
  earliestStart: number,
): ResourceDelay | undefined {
  const model = state.config.dualPipeModel;
  if (!model || earliestStart <= minimumStart) {
    return undefined;
  }
  return Object.freeze({
    rank: operation.rank,
    start: minimumStart,
    end: earliestStart,
    ...(operation.direction ? { direction: operation.direction } : {}),
    sharedCapacity: model.resourceModel.sharedCapacity,
    directionalSlots: model.resourceModel.directionalSlots,
  });
}

function intervalsOverlap(
  leftStart: number,
  leftEnd: number,
  rightStart: number,
  rightEnd: number,
) {
  return leftStart < rightEnd && leftEnd > rightStart;
}

function operationForPlacement(state: ScheduleState, placement: Placement): Operation {
  const operation = state.operations.find((candidate) => candidate.id === placement.operationId);
  if (!operation) {
    throw new Error(`Operation ${placement.operationId} not found`);
  }
  return operation;
}

function canOccupyDualPipeResources(
  state: ScheduleState,
  operation: Operation,
  start: number,
): boolean {
  const model = state.config.dualPipeModel;
  if (!model) {
    return true;
  }
  if (!operation.direction) {
    throw new Error(`DualPipe operation ${operation.id} is missing direction`);
  }

  const end = start + operation.duration;
  let sharedOccupancy = 0;
  let directionalOccupancy = 0;

  for (const placement of state.placements) {
    if (placement.rank !== operation.rank) {
      continue;
    }
    if (!intervalsOverlap(start, end, placement.start, placement.end)) {
      continue;
    }

    const placedOperation = operationForPlacement(state, placement);
    sharedOccupancy += 1;
    if (placedOperation.direction === operation.direction) {
      directionalOccupancy += 1;
    }
  }

  return (
    sharedOccupancy < model.resourceModel.sharedCapacity &&
    directionalOccupancy < model.resourceModel.directionalSlots
  );
}

function earliestDualPipeResourceStart(
  state: ScheduleState,
  operation: Operation,
  minimumStart: number,
): number {
  const horizon =
    state.placements.reduce((max, placement) => Math.max(max, placement.end), 0) +
    operation.duration +
    state.operations.length +
    state.actions.length +
    1;

  for (let start = minimumStart; start <= horizon; start += 1) {
    if (canOccupyDualPipeResources(state, operation, start)) {
      return start;
    }
  }

  return horizon;
}

export function classifyMoves(state: ScheduleState): readonly MoveClassification[] {
  return Object.freeze(state.operations.map((op) => classifyOperation(state, op.id)));
}

function freezePlacement(placement: Placement): Readonly<Placement> {
  return Object.freeze({ ...placement });
}

function freezeAction(action: Action): Readonly<Action> {
  return Object.freeze({ ...action });
}

export function applyAction(state: ScheduleState, action: Action): ApplyResult {
  if (action.type === 'wait') {
    return applyWait(state, action.rank);
  }

  const operationId = action.operationId;
  validateOperationIdInInventory(operationId, state.operations);

  const operation = state.operations.find((op) => op.id === operationId)!;

  if (state.placementById[operationId]) {
    return {
      ok: false,
      action,
      reason: { kind: 'already-placed', operationId },
    };
  }

  const predecessors = predecessorsOf(operationId, state.config);
  for (const predId of predecessors) {
    if (!state.placementById[predId]) {
      return {
        ok: false,
        action,
        reason: { kind: 'dependency-not-finished', operationId: predId },
      };
    }
  }

  let residencyEffect: ResidencyEffect | undefined;
  if (operation.kind === 'F' && state.config.memoryCaps !== null) {
    if (state.config.residencyModel) {
      const residencyProjection = projectResidencyEffect(state, operation);
      if (residencyProjection?.ok === false) {
        return {
          ok: false,
          action,
          reason: residencyProjection.reason,
        };
      }
      residencyEffect = residencyProjection?.effect;
    } else {
      const cap = state.config.memoryCaps[operation.rank];
      if (cap !== undefined) {
        const resident = state.currentMemory[operation.rank] ?? 0;
        if (resident + 1 > cap) {
          return {
            ok: false,
            action,
            reason: {
              kind: 'memory-cap',
              rank: operation.rank,
              resident,
              requested: 1,
              cap,
            },
          };
        }
      }
    }
  } else if (state.config.residencyModel) {
    const residencyProjection = projectResidencyEffect(state, operation);
    if (residencyProjection?.ok === true) {
      residencyEffect = residencyProjection.effect;
    }
  }

  const start = computeEarliestStart(state, operation);
  const end = start + operation.duration;
  const newPlacement: Placement = freezePlacement({
    operationId,
    rank: operation.rank,
    start,
    end,
  });

  const newPlacements: readonly Placement[] = Object.freeze([...state.placements, newPlacement]);

  const newFrontiers = [...state.rankFrontiers];
  newFrontiers[operation.rank] = Math.max(newFrontiers[operation.rank] ?? 0, end);

  const newGaps = [...state.gaps];
  if (!state.config.dualPipeModel && start > (state.rankFrontiers[operation.rank] ?? 0)) {
    newGaps.push(
      Object.freeze({
        rank: operation.rank,
        start: state.rankFrontiers[operation.rank] ?? 0,
        end: start,
        kind: 'dependency-forced',
      }),
    );
  }

  const newActions: readonly Action[] = Object.freeze([...state.actions, freezeAction(action)]);

  const newCurrentMemory = computeCurrentMemory(state.config, newPlacements);
  const newPeakMemory = computePeakMemory(state.config, state.operations, newPlacements);
  let newResidentWeightsByRank = state.residentWeightsByRank;
  let newWeightEventsByPlacement = state.weightEventsByPlacement;
  let newAllGatherCount = state.allGatherCount;
  if (residencyEffect) {
    const residentWeightsByRank = [...state.residentWeightsByRank];
    residentWeightsByRank[operation.rank] = residencyEffect.residentStages;
    newResidentWeightsByRank = freezeResidentWeights(residentWeightsByRank);
    newWeightEventsByPlacement = Object.freeze({
      ...state.weightEventsByPlacement,
      [operationId]: residencyEffect,
    });
    newAllGatherCount += residencyEffect.action === 'gather' ? 1 : 0;
  }

  const newPlacementById = createPlacementById(state.config, state.operations, newPlacements);
  const newTimelines = timelineStateFields(
    state.config,
    state.operations,
    newPlacements,
    newFrontiers,
    newWeightEventsByPlacement,
  );

  const newState: ScheduleState = Object.freeze({
    config: state.config,
    operations: state.operations,
    placements: newPlacements,
    placementById: newPlacementById,
    rankFrontiers: Object.freeze(newFrontiers),
    currentMemory: newCurrentMemory,
    peakMemory: newPeakMemory,
    activationMemoryTimelineByRank: newTimelines.activationMemoryTimelineByRank,
    weightResidencyTimelineByRank: newTimelines.weightResidencyTimelineByRank,
    residentWeightsByRank: newResidentWeightsByRank,
    weightEventsByPlacement: newWeightEventsByPlacement,
    allGatherCount: newAllGatherCount,
    gaps: Object.freeze(newGaps),
    actions: newActions,
  });

  return { ok: true, state: newState };
}

function applyWait(state: ScheduleState, rank: number): ApplyResult {
  const invalidReason = validateWaitRank(rank, state.config.rankCount);
  if (invalidReason) {
    return { ok: false, action: Object.freeze({ type: 'wait', rank }), reason: invalidReason };
  }

  const frontier = state.rankFrontiers[rank] ?? 0;
  const newFrontiers = [...state.rankFrontiers];
  newFrontiers[rank] = frontier + 1;

  const newGaps = [...state.gaps];
  newGaps.push(
    Object.freeze({
      rank,
      start: frontier,
      end: frontier + 1,
      kind: 'intentional',
    }),
  );

  const newActions = Object.freeze([
    ...state.actions,
    Object.freeze({ type: 'wait', rank } as Action),
  ]);
  const newTimelines = timelineStateFields(
    state.config,
    state.operations,
    state.placements,
    newFrontiers,
    state.weightEventsByPlacement,
  );

  const newState: ScheduleState = Object.freeze({
    config: state.config,
    operations: state.operations,
    placements: state.placements,
    placementById: state.placementById,
    rankFrontiers: Object.freeze(newFrontiers),
    currentMemory: state.currentMemory,
    peakMemory: state.peakMemory,
    activationMemoryTimelineByRank: newTimelines.activationMemoryTimelineByRank,
    weightResidencyTimelineByRank: newTimelines.weightResidencyTimelineByRank,
    residentWeightsByRank: state.residentWeightsByRank,
    weightEventsByPlacement: state.weightEventsByPlacement,
    allGatherCount: state.allGatherCount,
    gaps: Object.freeze(newGaps),
    actions: newActions,
  });

  return { ok: true, state: newState };
}

export function replay(config: LevelConfig, actions: readonly Action[]): ReplayResult {
  let state = initialState(config);

  for (let i = 0; i < actions.length; i++) {
    const action = actions[i]!;
    if (action.type === 'place') {
      const unknownReason = operationIdReasonInInventory(action.operationId, state.operations);
      if (unknownReason) {
        return { ok: false, index: i, action, reason: unknownReason };
      }
    }
    const result = applyAction(state, action);
    if (!result.ok) {
      return { ok: false, index: i, action, reason: result.reason };
    }
    state = result.state;
  }

  return { ok: true, state };
}
