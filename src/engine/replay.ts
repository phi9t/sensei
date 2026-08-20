import type { Action, LevelConfig, Operation, OperationId } from './types';
import { deriveOperations, predecessorsOf, parseOperationId } from './operations';
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

export type BlockReason =
  | { kind: 'already-placed'; operationId: OperationId }
  | { kind: 'dependency-not-finished'; operationId: OperationId }
  | { kind: 'memory-cap'; rank: number; resident: number; requested: 1; cap: number }
  | { kind: 'invalid-rank'; rank: number };

export type MoveClassification =
  | { status: 'legal'; operation: Operation; earliestStart: number; projectedMemory: number }
  | { status: 'blocked'; operation: Operation; reasons: readonly BlockReason[] }
  | { status: 'completed'; operation: Operation; placement: Placement };

export interface ScheduleState {
  config: LevelConfig;
  operations: readonly Operation[];
  placements: readonly Placement[];
  placementById: Readonly<Partial<Record<OperationId, Placement>>>;
  rankFrontiers: readonly number[];
  currentMemory: readonly number[];
  peakMemory: readonly number[];
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
    } else {
      events.push({ time: placement.end, rank: placement.rank, delta: -1 });
    }
  }

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
  const completedB = new Set<OperationId>();

  for (const placement of placements) {
    const parsed = parseOperationId(placement.operationId);
    if (parsed.kind === 'B') {
      completedB.add(placement.operationId);
      const matchingF: OperationId = `F:${parsed.stage}:${parsed.microbatch}`;
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

export function initialState(config: LevelConfig): ScheduleState {
  validateLevelConfig(config);
  const operations = deriveOperations(config);
  const rankCount = config.rankCount;

  const state: ScheduleState = {
    config,
    operations,
    placements: Object.freeze([]),
    placementById: Object.freeze({}),
    rankFrontiers: Object.freeze(new Array<number>(rankCount).fill(0)),
    currentMemory: Object.freeze(new Array<number>(rankCount).fill(0)),
    peakMemory: Object.freeze(new Array<number>(rankCount).fill(0)),
    gaps: Object.freeze([]),
    actions: Object.freeze([]),
  };

  return Object.freeze(state);
}

export function classifyOperation(state: ScheduleState, id: OperationId): MoveClassification {
  const operation = state.operations.find((op) => op.id === id);
  if (!operation) {
    return {
      status: 'blocked',
      operation: {
        id,
        kind: id.startsWith('F') ? 'F' : 'B',
        stage: Number.parseInt(id.split(':')[1] ?? '0', 10),
        rank: Number.parseInt(id.split(':')[1] ?? '0', 10),
        microbatch: Number.parseInt(id.split(':')[2] ?? '0', 10),
        duration: 0,
      },
      reasons: [{ kind: 'dependency-not-finished', operationId: id }],
    };
  }

  const existing = state.placementById[id];
  if (existing) {
    return { status: 'completed', operation, placement: existing };
  }

  const reasons: BlockReason[] = [];
  const predecessors = predecessorsOf(id, state.config);

  for (const predId of predecessors) {
    if (!state.placementById[predId]) {
      reasons.push({ kind: 'dependency-not-finished', operationId: predId });
    }
  }

  const start = computeEarliestStart(state, operation);

  if (operation.kind === 'F' && state.config.memoryCaps !== null) {
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

  if (reasons.length > 0) {
    return { status: 'blocked', operation, reasons: Object.freeze(reasons) };
  }

  const projectedMemory = state.currentMemory[operation.rank] ?? 0;
  if (operation.kind === 'F') {
    return {
      status: 'legal',
      operation,
      earliestStart: start,
      projectedMemory: projectedMemory + 1,
    };
  }
  return { status: 'legal', operation, earliestStart: start, projectedMemory };
}

function computeEarliestStart(state: ScheduleState, operation: Operation): number {
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

export function classifyMoves(state: ScheduleState): readonly MoveClassification[] {
  return Object.freeze(state.operations.map((op) => classifyOperation(state, op.id)));
}

function freezePlacement(placement: Placement): Readonly<Placement> {
  return Object.freeze({ ...placement });
}

export function applyAction(state: ScheduleState, action: Action): ApplyResult {
  if (action.type === 'wait') {
    return applyWait(state, action.rank);
  }

  const operationId = action.operationId;
  const operation = state.operations.find((op) => op.id === operationId);
  if (!operation) {
    return {
      ok: false,
      action,
      reason: { kind: 'dependency-not-finished', operationId },
    };
  }

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

  const start = computeEarliestStart(state, operation);

  if (operation.kind === 'F' && state.config.memoryCaps !== null) {
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

  const end = start + operation.duration;
  const newPlacement: Placement = freezePlacement({
    operationId,
    rank: operation.rank,
    start,
    end,
  });

  const newPlacements: readonly Placement[] = Object.freeze([...state.placements, newPlacement]);

  const newFrontiers = [...state.rankFrontiers];
  newFrontiers[operation.rank] = end;

  const newGaps = [...state.gaps];
  if (start > (state.rankFrontiers[operation.rank] ?? 0)) {
    newGaps.push(
      Object.freeze({
        rank: operation.rank,
        start: state.rankFrontiers[operation.rank] ?? 0,
        end: start,
        kind: 'dependency-forced',
      }),
    );
  }

  const newActions: readonly Action[] = Object.freeze([...state.actions, action]);

  const newCurrentMemory = computeCurrentMemory(state.config, newPlacements);
  const newPeakMemory = computePeakMemory(state.config, state.operations, newPlacements);

  const newPlacementById = createPlacementById(state.config, state.operations, newPlacements);

  const newState: ScheduleState = Object.freeze({
    config: state.config,
    operations: state.operations,
    placements: newPlacements,
    placementById: newPlacementById,
    rankFrontiers: Object.freeze(newFrontiers),
    currentMemory: newCurrentMemory,
    peakMemory: newPeakMemory,
    gaps: Object.freeze(newGaps),
    actions: newActions,
  });

  return { ok: true, state: newState };
}

function applyWait(state: ScheduleState, rank: number): ApplyResult {
  if (rank < 0 || rank >= state.config.rankCount) {
    return { ok: false, action: { type: 'wait', rank }, reason: { kind: 'invalid-rank', rank } };
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

  const newActions = Object.freeze([...state.actions, { type: 'wait', rank } as Action]);

  const newState: ScheduleState = Object.freeze({
    config: state.config,
    operations: state.operations,
    placements: state.placements,
    placementById: state.placementById,
    rankFrontiers: Object.freeze(newFrontiers),
    currentMemory: state.currentMemory,
    peakMemory: state.peakMemory,
    gaps: Object.freeze(newGaps),
    actions: newActions,
  });

  return { ok: true, state: newState };
}

export function replay(config: LevelConfig, actions: readonly Action[]): ReplayResult {
  let state = initialState(config);

  for (let i = 0; i < actions.length; i++) {
    const action = actions[i]!;
    const result = applyAction(state, action);
    if (!result.ok) {
      return { ok: false, index: i, action, reason: result.reason };
    }
    state = result.state;
  }

  return { ok: true, state };
}
