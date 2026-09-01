import { deriveOperations, predecessorsOf, releasesActivation } from './operations';
import type {
  LevelConfig,
  Operation,
  OperationId,
  OperationKind,
  PipelineDirection,
} from './types';

export interface OptimizerModelMetadata {
  readonly format: 'sensei.optimizer-model.v1';
  readonly levelId: string;
  readonly levelVersion: number;
  readonly assumptions: readonly string[];
}

export interface OptimizerOperation {
  readonly id: OperationId;
  readonly kind: OperationKind;
  readonly stage: number;
  readonly rank: number;
  readonly microbatch: number;
  readonly duration: number;
  readonly direction?: PipelineDirection;
}

export interface OptimizerDependency {
  readonly from: OperationId;
  readonly to: OperationId;
}

export type OptimizerResource =
  | {
      readonly id: string;
      readonly kind: 'exclusive-rank';
      readonly rank: number;
      readonly capacity: 1;
    }
  | {
      readonly id: string;
      readonly kind: 'shared-rank';
      readonly rank: number;
      readonly capacity: number;
    }
  | {
      readonly id: string;
      readonly kind: 'directional-rank';
      readonly rank: number;
      readonly direction: PipelineDirection;
      readonly capacity: number;
    };

export interface OptimizerResourceRequirement {
  readonly operationId: OperationId;
  readonly resourceId: string;
  readonly demand: 1;
}

export interface OptimizerActivationMemoryConstraint {
  readonly id: string;
  readonly kind: 'activation-memory';
  readonly rank: number;
  readonly capacity: number | null;
}

export interface OptimizerActivationMemoryEvent {
  readonly operationId: OperationId;
  readonly kind: 'activation-acquire' | 'activation-release';
  readonly at: 'end';
  readonly rank: number;
  readonly stage: number;
  readonly microbatch: number;
  readonly delta: 1 | -1;
  readonly direction?: PipelineDirection;
}

export interface OptimizerActivationMemoryModel {
  readonly constraints: readonly OptimizerActivationMemoryConstraint[];
  readonly events: readonly OptimizerActivationMemoryEvent[];
}

export interface OptimizerObjectiveTerm {
  readonly priority: number;
  readonly metric:
    'makespan' | 'peakActivationMemory' | 'allGatherCount' | 'intentionalIdle' | 'actionCount';
  readonly direction: 'minimize';
}

export interface OptimizerTimeHorizon {
  readonly lowerBound: number;
  readonly upperBound: number;
}

export interface OptimizerModel {
  readonly metadata: OptimizerModelMetadata;
  readonly timeHorizon: OptimizerTimeHorizon;
  readonly operations: readonly OptimizerOperation[];
  readonly dependencies: readonly OptimizerDependency[];
  readonly resources: readonly OptimizerResource[];
  readonly resourceRequirements: readonly OptimizerResourceRequirement[];
  readonly activationMemory: OptimizerActivationMemoryModel;
  readonly objective: readonly OptimizerObjectiveTerm[];
}

export type OptimizerModelExportFailureReason = {
  readonly kind: 'unsupported-residency';
  readonly detail: string;
};

export type OptimizerModelExportResult =
  | {
      readonly ok: true;
      readonly model: OptimizerModel;
    }
  | {
      readonly ok: false;
      readonly reason: OptimizerModelExportFailureReason;
    };

function freezeOperation(operation: Operation): OptimizerOperation {
  const base = {
    id: operation.id,
    kind: operation.kind,
    stage: operation.stage,
    rank: operation.rank,
    microbatch: operation.microbatch,
    duration: operation.duration,
  };

  return Object.freeze(operation.direction ? { ...base, direction: operation.direction } : base);
}

function freezeDependency(edge: OptimizerDependency): OptimizerDependency {
  return Object.freeze({ ...edge });
}

function dependenciesFor(
  config: LevelConfig,
  operations: readonly Operation[],
): readonly OptimizerDependency[] {
  return Object.freeze(
    operations
      .flatMap((operation) =>
        predecessorsOf(operation.id, config).map((predecessorId) => ({
          from: predecessorId,
          to: operation.id,
        })),
      )
      .sort((left, right) => left.to.localeCompare(right.to) || left.from.localeCompare(right.from))
      .map(freezeDependency),
  );
}

function resourcesFor(config: LevelConfig): readonly OptimizerResource[] {
  const resources: OptimizerResource[] = [];
  const model = config.dualPipeModel;

  for (let rank = 0; rank < config.rankCount; rank += 1) {
    if (!model) {
      resources.push(
        Object.freeze({
          id: `rank:${rank}`,
          kind: 'exclusive-rank' as const,
          rank,
          capacity: 1 as const,
        }),
      );
      continue;
    }

    resources.push(
      Object.freeze({
        id: `rank:${rank}:shared`,
        kind: 'shared-rank' as const,
        rank,
        capacity: model.resourceModel.sharedCapacity,
      }),
    );
    for (const direction of model.directions) {
      resources.push(
        Object.freeze({
          id: `rank:${rank}:direction:${direction}`,
          kind: 'directional-rank' as const,
          rank,
          direction,
          capacity: model.resourceModel.directionalSlots,
        }),
      );
    }
  }

  return Object.freeze(resources);
}

function requirementsForOperation(
  config: LevelConfig,
  operation: Operation,
): readonly OptimizerResourceRequirement[] {
  if (!config.dualPipeModel) {
    return Object.freeze([
      Object.freeze({
        operationId: operation.id,
        resourceId: `rank:${operation.rank}`,
        demand: 1 as const,
      }),
    ]);
  }

  if (!operation.direction) {
    throw new Error(`DualPipe operation ${operation.id} is missing direction`);
  }

  return Object.freeze([
    Object.freeze({
      operationId: operation.id,
      resourceId: `rank:${operation.rank}:shared`,
      demand: 1 as const,
    }),
    Object.freeze({
      operationId: operation.id,
      resourceId: `rank:${operation.rank}:direction:${operation.direction}`,
      demand: 1 as const,
    }),
  ]);
}

function resourceRequirementsFor(
  config: LevelConfig,
  operations: readonly Operation[],
): readonly OptimizerResourceRequirement[] {
  return Object.freeze(
    operations.flatMap((operation) => requirementsForOperation(config, operation)),
  );
}

function memoryConstraintsFor(config: LevelConfig): readonly OptimizerActivationMemoryConstraint[] {
  return Object.freeze(
    Array.from({ length: config.rankCount }, (_, rank) =>
      Object.freeze({
        id: `activation:${rank}`,
        kind: 'activation-memory' as const,
        rank,
        capacity: config.memoryCaps?.[rank] ?? null,
      }),
    ),
  );
}

function freezeActivationMemoryEvent(
  event: OptimizerActivationMemoryEvent,
): OptimizerActivationMemoryEvent {
  return Object.freeze({ ...event });
}

function activationMemoryEventsFor(
  config: LevelConfig,
  operations: readonly Operation[],
): readonly OptimizerActivationMemoryEvent[] {
  const events: OptimizerActivationMemoryEvent[] = operations
    .flatMap((operation): OptimizerActivationMemoryEvent[] => {
      const base = {
        operationId: operation.id,
        at: 'end' as const,
        rank: operation.rank,
        stage: operation.stage,
        microbatch: operation.microbatch,
        ...(operation.direction ? { direction: operation.direction } : {}),
      };
      if (operation.kind === 'F') {
        return [
          {
            ...base,
            kind: 'activation-acquire' as const,
            delta: 1 as const,
          },
        ];
      }
      if (releasesActivation(config, operation.kind)) {
        return [
          {
            ...base,
            kind: 'activation-release' as const,
            delta: -1 as const,
          },
        ];
      }
      return [];
    })
    .sort(
      (left, right) =>
        left.operationId.localeCompare(right.operationId) || left.kind.localeCompare(right.kind),
    );

  return Object.freeze(events.map(freezeActivationMemoryEvent));
}

function totalWork(operations: readonly Operation[]): number {
  return operations.reduce((sum, operation) => sum + operation.duration, 0);
}

function resourceWorkLowerBound(
  resources: readonly OptimizerResource[],
  requirements: readonly OptimizerResourceRequirement[],
  operations: readonly Operation[],
): number {
  const durationById = new Map(operations.map((operation) => [operation.id, operation.duration]));
  let lowerBound = 0;

  for (const resource of resources) {
    const work = requirements
      .filter((requirement) => requirement.resourceId === resource.id)
      .reduce((sum, requirement) => sum + (durationById.get(requirement.operationId) ?? 0), 0);
    lowerBound = Math.max(lowerBound, Math.ceil(work / resource.capacity));
  }

  return lowerBound;
}

function criticalPathLowerBound(
  dependencies: readonly OptimizerDependency[],
  operations: readonly Operation[],
): number {
  const operationById = new Map(operations.map((operation) => [operation.id, operation]));
  const predecessorIdsByOperation = new Map<OperationId, OperationId[]>();
  for (const dependency of dependencies) {
    const predecessorIds = predecessorIdsByOperation.get(dependency.to) ?? [];
    predecessorIds.push(dependency.from);
    predecessorIdsByOperation.set(dependency.to, predecessorIds);
  }

  const memo = new Map<OperationId, number>();
  const visiting = new Set<OperationId>();

  function endLowerBound(operationId: OperationId): number {
    const cached = memo.get(operationId);
    if (cached !== undefined) {
      return cached;
    }

    const operation = operationById.get(operationId);
    if (!operation) {
      return 0;
    }

    if (visiting.has(operationId)) {
      return 0;
    }

    visiting.add(operationId);
    const predecessorBound = (predecessorIdsByOperation.get(operationId) ?? []).reduce(
      (max, predecessorId) => Math.max(max, endLowerBound(predecessorId)),
      0,
    );
    visiting.delete(operationId);

    const result = predecessorBound + operation.duration;
    memo.set(operationId, result);
    return result;
  }

  return operations.reduce((max, operation) => Math.max(max, endLowerBound(operation.id)), 0);
}

function timeHorizonFor(
  operations: readonly Operation[],
  dependencies: readonly OptimizerDependency[],
  resources: readonly OptimizerResource[],
  requirements: readonly OptimizerResourceRequirement[],
): OptimizerTimeHorizon {
  const upperBound = totalWork(operations);
  const lowerBound = Math.max(
    resourceWorkLowerBound(resources, requirements, operations),
    criticalPathLowerBound(dependencies, operations),
  );

  return Object.freeze({ lowerBound, upperBound });
}

function optimizerObjective(): readonly OptimizerObjectiveTerm[] {
  return Object.freeze([
    Object.freeze({ priority: 1, metric: 'makespan' as const, direction: 'minimize' as const }),
    Object.freeze({
      priority: 2,
      metric: 'peakActivationMemory' as const,
      direction: 'minimize' as const,
    }),
    Object.freeze({
      priority: 3,
      metric: 'allGatherCount' as const,
      direction: 'minimize' as const,
    }),
    Object.freeze({
      priority: 4,
      metric: 'intentionalIdle' as const,
      direction: 'minimize' as const,
    }),
    Object.freeze({
      priority: 5,
      metric: 'actionCount' as const,
      direction: 'minimize' as const,
    }),
  ]);
}

function assumptionsFor(config: LevelConfig): readonly string[] {
  const assumptions = [
    'Operation inventory and dependency edges are derived from Sensei engine semantics.',
    'Solvers must enforce dependency end <= successor start.',
    'Activation memory events occur at operation end, with acquire before release at equal time.',
    'Objective order follows Sensei attempt ranking: makespan, peak activation memory, all-gather count, intentional idle, action count.',
  ];

  if (config.dualPipeModel) {
    assumptions.push(
      'DualPipe operations consume one shared rank slot and one direction-specific rank slot.',
    );
  } else {
    assumptions.push('Each operation consumes one exclusive rank resource for its duration.');
  }

  return Object.freeze(assumptions);
}

export function exportOptimizerModel(config: LevelConfig): OptimizerModelExportResult {
  if (config.residencyModel) {
    return Object.freeze({
      ok: false as const,
      reason: Object.freeze({
        kind: 'unsupported-residency' as const,
        detail: 'Residency requires stateful cache and eviction variables, not only intervals.',
      }),
    });
  }

  const operations = deriveOperations(config);
  const dependencies = dependenciesFor(config, operations);
  const resources = resourcesFor(config);
  const resourceRequirements = resourceRequirementsFor(config, operations);
  const model: OptimizerModel = Object.freeze({
    metadata: Object.freeze({
      format: 'sensei.optimizer-model.v1' as const,
      levelId: config.id,
      levelVersion: config.version,
      assumptions: assumptionsFor(config),
    }),
    timeHorizon: timeHorizonFor(operations, dependencies, resources, resourceRequirements),
    operations: Object.freeze(operations.map(freezeOperation)),
    dependencies,
    resources,
    resourceRequirements,
    activationMemory: Object.freeze({
      constraints: memoryConstraintsFor(config),
      events: activationMemoryEventsFor(config, operations),
    }),
    objective: optimizerObjective(),
  });

  return Object.freeze({ ok: true as const, model });
}
