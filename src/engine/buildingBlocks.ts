import { deriveOperations, parseOperationId, predecessorsOf } from './operations';
import { classifyOperation, replay } from './replay';
import type {
  Action,
  BuildingBlockPlan,
  BuildingBlockValidation,
  BuildingBlockViolation,
  LevelConfig,
  Operation,
  OperationId,
} from './types';

export type {
  BuildingBlockLevelMetadata,
  BuildingBlockOperation,
  BuildingBlockPlan,
  BuildingBlockValidation,
  BuildingBlockViolation,
} from './types';

type ExpandedOperation = {
  readonly operationId: OperationId;
  readonly rank: number;
  readonly start: number;
};

function isValidPeriod(period: number): boolean {
  return Number.isFinite(period) && Number.isInteger(period) && period > 0;
}

function isValidOffset(offset: number): boolean {
  return Number.isFinite(offset) && Number.isInteger(offset) && offset >= 0;
}

function residueOf(offset: number, period: number): number {
  return ((offset % period) + period) % period;
}

function representativeId(operation: Operation): OperationId {
  return `${operation.kind}:${operation.stage}:0`;
}

function stampedOperationId(operationId: OperationId, microbatch: number): OperationId {
  const parsed = parseOperationId(operationId);
  return `${parsed.kind}:${parsed.stage}:${microbatch}`;
}

function operationById(operations: readonly Operation[]): ReadonlyMap<OperationId, Operation> {
  return new Map(operations.map((operation) => [operation.id, operation]));
}

function freezeViolation(violation: BuildingBlockViolation): BuildingBlockViolation {
  if ('operationIds' in violation) {
    return Object.freeze({
      ...violation,
      operationIds: Object.freeze([...violation.operationIds]),
    });
  }

  return Object.freeze({ ...violation });
}

function freezeValidation(
  period: number,
  violations: readonly BuildingBlockViolation[],
  projectedPeakMemory: readonly number[],
): BuildingBlockValidation {
  return Object.freeze({
    ok: violations.length === 0,
    period,
    violations: Object.freeze(violations.map(freezeViolation)),
    projectedPeakMemory: Object.freeze([...projectedPeakMemory]),
  });
}

function representativeInventory(config: LevelConfig): readonly Operation[] {
  return deriveOperations(config).filter((operation) => operation.microbatch === 0);
}

function knownRepresentativeEntries(
  operationsById: ReadonlyMap<OperationId, Operation>,
  plan: BuildingBlockPlan,
): readonly BuildingBlockPlan['trajectory'][number][] {
  return plan.trajectory.filter((entry) => operationsById.has(entry.operationId));
}

function representativeOffsets(
  entries: readonly BuildingBlockPlan['trajectory'][number][],
): ReadonlyMap<OperationId, number> {
  return new Map(entries.map((entry) => [entry.operationId, entry.offset]));
}

function validateTrajectoryMembership(
  representativeOperations: readonly Operation[],
  plan: BuildingBlockPlan,
): readonly BuildingBlockViolation[] {
  const violations: BuildingBlockViolation[] = [];
  const counts = new Map<OperationId, number>();
  const representativeIds = new Set(representativeOperations.map((operation) => operation.id));

  for (const entry of plan.trajectory) {
    if (!representativeIds.has(entry.operationId)) {
      violations.push({ kind: 'unknown-operation', operationId: entry.operationId });
      continue;
    }

    counts.set(entry.operationId, (counts.get(entry.operationId) ?? 0) + 1);
  }

  for (const entry of plan.trajectory) {
    if ((counts.get(entry.operationId) ?? 0) > 1) {
      violations.push({ kind: 'duplicate-operation', operationId: entry.operationId });
      counts.set(entry.operationId, 0);
    }
  }

  for (const operation of representativeOperations) {
    if (!counts.has(operation.id)) {
      violations.push({ kind: 'missing-operation', operationId: operation.id });
    }
  }

  return Object.freeze(violations);
}

function validateOffsets(plan: BuildingBlockPlan): readonly BuildingBlockViolation[] {
  return Object.freeze(
    plan.trajectory
      .filter((entry) => !isValidOffset(entry.offset))
      .map((entry) => ({
        kind: 'invalid-offset' as const,
        operationId: entry.operationId,
        offset: entry.offset,
      })),
  );
}

function validateRankResidues(
  representativeById: ReadonlyMap<OperationId, Operation>,
  plan: BuildingBlockPlan,
): readonly BuildingBlockViolation[] {
  const occupied = new Map<
    string,
    { rank: number; residue: number; operationIds: OperationId[] }
  >();

  for (const entry of plan.trajectory) {
    const operation = representativeById.get(entry.operationId);
    if (!operation) {
      continue;
    }

    for (let tick = 0; tick < operation.duration; tick += 1) {
      const residue = residueOf(entry.offset + tick, plan.period);
      const key = `${operation.rank}:${residue}`;
      const bucket = occupied.get(key) ?? { rank: operation.rank, residue, operationIds: [] };
      bucket.operationIds.push(entry.operationId);
      occupied.set(key, bucket);
    }
  }

  return Object.freeze(
    [...occupied.values()]
      .filter((bucket) => bucket.operationIds.length > 1)
      .map((bucket) => ({
        kind: 'duplicate-rank-residue' as const,
        rank: bucket.rank,
        residue: bucket.residue,
        operationIds: Object.freeze([...bucket.operationIds]),
      })),
  );
}

function plannedStartFor(
  offsetsByRepresentativeId: ReadonlyMap<OperationId, number>,
  operationId: OperationId,
  period: number,
): number | null {
  const parsed = parseOperationId(operationId);
  const representative: OperationId = `${parsed.kind}:${parsed.stage}:0`;
  const offset = offsetsByRepresentativeId.get(representative);
  return offset === undefined ? null : offset + parsed.microbatch * period;
}

function validateDependencies(
  config: LevelConfig,
  operations: readonly Operation[],
  offsetsByRepresentativeId: ReadonlyMap<OperationId, number>,
  plan: BuildingBlockPlan,
): readonly BuildingBlockViolation[] {
  const operationMap = operationById(operations);
  const violations: BuildingBlockViolation[] = [];
  const reported = new Set<string>();

  for (const operation of operations) {
    const start = plannedStartFor(offsetsByRepresentativeId, operation.id, plan.period);
    if (start === null) {
      continue;
    }

    for (const dependencyId of predecessorsOf(operation.id, config)) {
      const dependency = operationMap.get(dependencyId);
      const dependencyStart = plannedStartFor(offsetsByRepresentativeId, dependencyId, plan.period);
      if (!dependency || dependencyStart === null) {
        continue;
      }

      if (dependencyStart + dependency.duration > start) {
        const representativeOperationId = representativeId(operation);
        const representativeDependencyId = representativeId(dependency);
        const key = `${representativeOperationId}:${representativeDependencyId}`;
        if (!reported.has(key)) {
          violations.push({
            kind: 'unsatisfied-dependency',
            operationId: representativeOperationId,
            dependencyId: representativeDependencyId,
          });
          reported.add(key);
        }
      }
    }
  }

  return Object.freeze(violations);
}

function expandedOperations(
  config: LevelConfig,
  representativeById: ReadonlyMap<OperationId, Operation>,
  plan: BuildingBlockPlan,
): readonly ExpandedOperation[] {
  const result: ExpandedOperation[] = [];

  for (let microbatch = 0; microbatch < config.microbatchCount; microbatch += 1) {
    for (const entry of plan.trajectory) {
      const operation = representativeById.get(entry.operationId);
      if (!operation) {
        continue;
      }

      result.push({
        operationId: stampedOperationId(entry.operationId, microbatch),
        rank: operation.rank,
        start: entry.offset + microbatch * plan.period,
      });
    }
  }

  return Object.freeze(
    result.sort((left, right) => {
      if (left.start !== right.start) {
        return left.start - right.start;
      }
      if (left.rank !== right.rank) {
        return left.rank - right.rank;
      }
      return left.operationId.localeCompare(right.operationId);
    }),
  );
}

function projectedPeakMemory(
  config: LevelConfig,
  operations: readonly Operation[],
  offsetsByRepresentativeId: ReadonlyMap<OperationId, number>,
  plan: BuildingBlockPlan,
): readonly number[] {
  const peaks = new Array<number>(config.rankCount).fill(0);
  const resident = new Array<number>(config.rankCount).fill(0);
  const events: Array<{ time: number; rank: number; delta: number }> = [];

  for (const operation of operations) {
    const start = plannedStartFor(offsetsByRepresentativeId, operation.id, plan.period);
    if (start === null) {
      continue;
    }

    const delta = operation.kind === 'F' ? 1 : -1;
    events.push({ time: start + operation.duration, rank: operation.rank, delta });
  }

  events.sort(
    (left, right) => left.time - right.time || left.rank - right.rank || right.delta - left.delta,
  );

  for (const event of events) {
    resident[event.rank]! += event.delta;
    peaks[event.rank] = Math.max(peaks[event.rank]!, resident[event.rank]!);
  }

  return Object.freeze(peaks);
}

function validateMemoryCaps(
  config: LevelConfig,
  peaks: readonly number[],
): readonly BuildingBlockViolation[] {
  if (config.memoryCaps === null) {
    return Object.freeze([]);
  }

  const violations: BuildingBlockViolation[] = [];
  for (let rank = 0; rank < config.memoryCaps.length; rank += 1) {
    const cap = config.memoryCaps[rank]!;
    const peak = peaks[rank] ?? 0;
    if (peak > cap) {
      violations.push({ kind: 'memory-cap', rank, peak, cap });
    }
  }

  return Object.freeze(violations);
}

export function validateBuildingBlockPlan(
  config: LevelConfig,
  plan: BuildingBlockPlan,
): BuildingBlockValidation {
  const allOperations = deriveOperations(config);
  const representativeOperations = representativeInventory(config);
  const representativeById = operationById(representativeOperations);
  const violations: BuildingBlockViolation[] = [];

  if (!isValidPeriod(plan.period)) {
    violations.push({ kind: 'invalid-period', period: plan.period });
    return freezeValidation(plan.period, violations, new Array<number>(config.rankCount).fill(0));
  }

  violations.push(...validateTrajectoryMembership(representativeOperations, plan));
  violations.push(...validateOffsets(plan));
  if (violations.some((violation) => violation.kind === 'invalid-offset')) {
    return freezeValidation(plan.period, violations, new Array<number>(config.rankCount).fill(0));
  }

  const knownEntries = knownRepresentativeEntries(representativeById, plan);
  const offsetsByRepresentativeId = representativeOffsets(knownEntries);
  violations.push(...validateRankResidues(representativeById, plan));
  violations.push(...validateDependencies(config, allOperations, offsetsByRepresentativeId, plan));

  const peaks = projectedPeakMemory(config, allOperations, offsetsByRepresentativeId, plan);
  violations.push(...validateMemoryCaps(config, peaks));

  return freezeValidation(plan.period, violations, peaks);
}

function replayFailureValidation(
  config: LevelConfig,
  plan: BuildingBlockPlan,
  validation: BuildingBlockValidation,
  actions: readonly Action[],
): BuildingBlockValidation {
  const result = replay(config, actions);
  if (result.ok) {
    const missing = result.state.operations.find(
      (operation) => !result.state.placementById[operation.id],
    );
    if (!missing) {
      return validation;
    }
    return freezeValidation(
      plan.period,
      [{ kind: 'missing-operation', operationId: missing.id }],
      validation.projectedPeakMemory,
    );
  }

  const action = result.action;
  switch (result.reason.kind) {
    case 'unknown-operation-id':
      return freezeValidation(
        plan.period,
        [{ kind: 'unknown-operation', operationId: result.reason.operationId }],
        validation.projectedPeakMemory,
      );
    case 'already-placed':
      return freezeValidation(
        plan.period,
        [{ kind: 'duplicate-operation', operationId: result.reason.operationId }],
        validation.projectedPeakMemory,
      );
    case 'dependency-not-finished':
      return freezeValidation(
        plan.period,
        [
          {
            kind: 'unsatisfied-dependency',
            operationId: action.type === 'place' ? action.operationId : result.reason.operationId,
            dependencyId: result.reason.operationId,
          },
        ],
        validation.projectedPeakMemory,
      );
    case 'memory-cap':
      return freezeValidation(
        plan.period,
        [
          {
            kind: 'memory-cap',
            rank: result.reason.rank,
            peak: result.reason.resident + result.reason.requested,
            cap: result.reason.cap,
          },
        ],
        validation.projectedPeakMemory,
      );
    case 'invalid-rank':
      return freezeValidation(plan.period, [], validation.projectedPeakMemory);
  }
}

export function expandBuildingBlockPlan(
  config: LevelConfig,
  plan: BuildingBlockPlan,
):
  | { readonly ok: true; readonly actions: readonly Action[] }
  | { readonly ok: false; readonly validation: BuildingBlockValidation } {
  const validation = validateBuildingBlockPlan(config, plan);
  if (!validation.ok) {
    return Object.freeze({ ok: false as const, validation });
  }

  const representativeById = operationById(representativeInventory(config));
  const stamped = expandedOperations(config, representativeById, plan);
  const actions: Action[] = [];
  let replayed = replay(config, actions);
  if (!replayed.ok) {
    return Object.freeze({
      ok: false as const,
      validation: replayFailureValidation(config, plan, validation, actions),
    });
  }

  for (const operation of stamped) {
    let classification = classifyOperation(replayed.state, operation.operationId);
    while (classification.status === 'legal' && classification.earliestStart < operation.start) {
      actions.push(Object.freeze({ type: 'wait' as const, rank: operation.rank }));
      replayed = replay(config, actions);
      if (!replayed.ok) {
        return Object.freeze({
          ok: false as const,
          validation: replayFailureValidation(config, plan, validation, actions),
        });
      }
      classification = classifyOperation(replayed.state, operation.operationId);
    }

    if (classification.status !== 'legal') {
      return Object.freeze({
        ok: false as const,
        validation: replayFailureValidation(config, plan, validation, actions),
      });
    }

    actions.push(Object.freeze({ type: 'place' as const, operationId: operation.operationId }));
    replayed = replay(config, actions);
    if (!replayed.ok) {
      return Object.freeze({
        ok: false as const,
        validation: replayFailureValidation(config, plan, validation, actions),
      });
    }
  }

  const frozenActions = Object.freeze(actions);
  if (!replayed.ok || replayed.state.placements.length !== replayed.state.operations.length) {
    return Object.freeze({
      ok: false as const,
      validation: replayFailureValidation(config, plan, validation, frozenActions),
    });
  }

  return Object.freeze({ ok: true as const, actions: frozenActions });
}
