import type {
  LevelConfig,
  OperationKind,
  PipelineDirection,
  PipelineTopologyPlacement,
  ReferencePolicyId,
} from './types';

const TOPOLOGY_PLACEMENTS = new Set<PipelineTopologyPlacement>(['one-to-one', 'wrap', 'v-shape']);
const BACKWARD_MODELS = new Set(['fused', 'split']);
const PIPELINE_DIRECTIONS = new Set<PipelineDirection>(['asc', 'desc']);
const REFERENCE_POLICY_IDS = new Set<ReferencePolicyId>([
  'gpipe-afab',
  'one-f-one-b',
  'interleaved-one-f-one-b',
  'group-major',
  'zero-bubble-h1',
  'zero-bubble-h2',
  'zero-bubble-deep',
  'dualpipe-balanced',
  'dualpipe-one-direction',
]);

function isTopologyPlacement(value: string): value is PipelineTopologyPlacement {
  return TOPOLOGY_PLACEMENTS.has(value as PipelineTopologyPlacement);
}

function isOperationKind(value: string): value is OperationKind {
  return value === 'F' || value === 'B' || value === 'W';
}

function isPipelineDirection(value: string): value is PipelineDirection {
  return PIPELINE_DIRECTIONS.has(value as PipelineDirection);
}

function isFinitePositiveInteger(value: number): boolean {
  return Number.isInteger(value) && Number.isFinite(value) && value > 0;
}

function isFinitePositive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function parseDirectionalDependencyEndpoint(
  id: string,
): { kind: OperationKind; stage: number; microbatch: number; direction: PipelineDirection } | null {
  const match = /^(F|B|W):(0|[1-9]\d*):(0|[1-9]\d*):(asc|desc)$/.exec(id);
  if (!match) {
    return null;
  }
  return {
    kind: match[1] as OperationKind,
    stage: Number.parseInt(match[2]!, 10),
    microbatch: Number.parseInt(match[3]!, 10),
    direction: match[4] as PipelineDirection,
  };
}

function isValidDependencyEndpoint(
  endpoint: ReturnType<typeof parseDirectionalDependencyEndpoint>,
  config: LevelConfig,
  operationModel: { readonly backward: 'fused' | 'split' },
): boolean {
  if (endpoint === null) {
    return false;
  }
  if (endpoint.kind === 'W' && operationModel.backward !== 'split') {
    return false;
  }
  return endpoint.stage < config.stageCount && endpoint.microbatch < config.microbatchCount;
}

export function validateLevelConfig(config: LevelConfig): void {
  if (!isFinitePositiveInteger(config.rankCount)) {
    throw new Error('rankCount must be a positive finite integer');
  }
  if (!isFinitePositiveInteger(config.stageCount)) {
    throw new Error('stageCount must be a positive finite integer');
  }
  if (!isFinitePositiveInteger(config.microbatchCount)) {
    throw new Error('microbatchCount must be a positive finite integer');
  }
  if (config.microbatchGrouping) {
    if (!isFinitePositiveInteger(config.microbatchGrouping.groupSize)) {
      throw new Error('microbatchGrouping groupSize must be a positive finite integer');
    }
    if (config.microbatchGrouping.groupSize > config.microbatchCount) {
      throw new Error('microbatchGrouping groupSize must not exceed microbatchCount');
    }
    const groupCount = Math.ceil(config.microbatchCount / config.microbatchGrouping.groupSize);
    if (config.microbatchGrouping.groupLabels !== undefined) {
      if (!Array.isArray(config.microbatchGrouping.groupLabels)) {
        throw new Error('microbatchGrouping groupLabels must be an array');
      }
      if (config.microbatchGrouping.groupLabels.length !== groupCount) {
        throw new Error('microbatchGrouping groupLabels length must match group count');
      }
    }
    for (const label of config.microbatchGrouping.groupLabels ?? []) {
      if (typeof label !== 'string' || label.trim().length === 0) {
        throw new Error('microbatchGrouping groupLabels must be non-empty');
      }
    }
  }
  if (
    config.scoreModel?.internalBubble !== undefined &&
    typeof config.scoreModel.internalBubble !== 'boolean'
  ) {
    throw new Error('scoreModel internalBubble must be boolean');
  }
  if (
    config.residencyModel !== undefined &&
    !isFinitePositiveInteger(config.residencyModel.weightUnit)
  ) {
    throw new Error('residencyModel weightUnit must be a positive finite integer');
  }
  if (config.dualPipeModel !== undefined) {
    if (config.dualPipeModel.enabled !== true) {
      throw new Error('dualPipeModel enabled must be true');
    }
    if (
      !Array.isArray(config.dualPipeModel.directions) ||
      config.dualPipeModel.directions.length === 0
    ) {
      throw new Error('dualPipeModel directions must be a non-empty array');
    }
    const seenDirections = new Set<PipelineDirection>();
    for (const direction of config.dualPipeModel.directions) {
      if (!isPipelineDirection(direction)) {
        throw new Error('dualPipeModel directions must be asc or desc');
      }
      if (seenDirections.has(direction)) {
        throw new Error(`duplicate dualPipeModel direction ${direction}`);
      }
      seenDirections.add(direction);
    }
    if (!seenDirections.has('asc') || !seenDirections.has('desc')) {
      throw new Error('dualPipeModel must include asc and desc directions');
    }
    if (!isFinitePositiveInteger(config.dualPipeModel.resourceModel.directionalSlots)) {
      throw new Error('dualPipeModel directionalSlots must be a positive finite integer');
    }
    if (!isFinitePositiveInteger(config.dualPipeModel.resourceModel.sharedCapacity)) {
      throw new Error('dualPipeModel sharedCapacity must be a positive finite integer');
    }
  }
  if (!isFinitePositive(config.durations.F)) {
    throw new Error('F duration must be a positive finite number');
  }
  if (!isFinitePositive(config.durations.B)) {
    throw new Error('B duration must be a positive finite number');
  }
  if (!isFinitePositiveInteger(config.durations.F)) {
    throw new Error('F duration must be a positive finite integer');
  }
  if (!isFinitePositiveInteger(config.durations.B)) {
    throw new Error('B duration must be a positive finite integer');
  }
  const operationModel = config.operationModel ?? { backward: 'fused' as const };
  if (!BACKWARD_MODELS.has(operationModel.backward)) {
    throw new Error('operationModel backward must be fused or split');
  }
  if (config.durations.W !== undefined && !isFinitePositive(config.durations.W)) {
    throw new Error('W duration must be a positive finite number');
  }
  if (config.durations.W !== undefined && !isFinitePositiveInteger(config.durations.W)) {
    throw new Error('W duration must be a positive finite integer');
  }
  if (operationModel.backward === 'split' && config.durations.W === undefined) {
    throw new Error('split operationModel requires W duration');
  }
  if (
    operationModel.backward === 'fused' &&
    (config.durations.F !== 1 || config.durations.B !== 2)
  ) {
    throw new Error('V1 base durations must be F=1 and B=2');
  }
  if (
    operationModel.backward === 'split' &&
    (config.durations.F !== 1 || config.durations.B !== 1 || config.durations.W !== 1)
  ) {
    throw new Error('split base durations must be F=1, B=1, and W=1');
  }
  if (operationModel.backward === 'fused' && config.durations.W !== undefined) {
    throw new Error('fused operationModel must not define W duration');
  }

  if (config.durationOverrides) {
    const seen = new Set<string>();
    for (const override of config.durationOverrides) {
      if (!isOperationKind(override.kind)) {
        throw new Error('duration override kind must be F, B, or W');
      }
      if (override.kind === 'W' && operationModel.backward !== 'split') {
        throw new Error('W duration overrides require split operationModel');
      }
      if (
        !Number.isInteger(override.stage) ||
        !Number.isFinite(override.stage) ||
        override.stage < 0 ||
        override.stage >= config.stageCount
      ) {
        throw new Error(
          `duration override stage ${override.stage} out of bounds for stageCount ${config.stageCount}`,
        );
      }
      if (!isFinitePositiveInteger(override.duration)) {
        throw new Error(
          `duration override for ${override.kind} stage ${override.stage} must be a positive finite integer`,
        );
      }
      const key = `${override.kind}:${override.stage}`;
      if (seen.has(key)) {
        throw new Error(`duplicate duration override for ${override.kind} stage ${override.stage}`);
      }
      seen.add(key);
    }
  }

  const seenReferencePolicies = new Set<ReferencePolicyId>();
  for (const policyId of config.referencePolicy?.candidatePolicyIds ?? []) {
    if (!REFERENCE_POLICY_IDS.has(policyId)) {
      throw new Error('reference policy id is not supported');
    }
    if (seenReferencePolicies.has(policyId)) {
      throw new Error(`duplicate reference policy id ${policyId}`);
    }
    seenReferencePolicies.add(policyId);
  }
  if (config.referencePolicy?.comparisonPolicyId !== undefined) {
    if (!REFERENCE_POLICY_IDS.has(config.referencePolicy.comparisonPolicyId)) {
      throw new Error('comparison reference policy id is not supported');
    }
    if (!seenReferencePolicies.has(config.referencePolicy.comparisonPolicyId)) {
      throw new Error('comparison reference policy id must be a candidate policy');
    }
  }

  if (config.dualPipeModel?.crossDirectionDependencies) {
    const seenEdges = new Set<string>();
    for (const edge of config.dualPipeModel.crossDirectionDependencies) {
      const from = parseDirectionalDependencyEndpoint(edge.from);
      const to = parseDirectionalDependencyEndpoint(edge.to);
      if (from === null || to === null) {
        throw new Error('dualPipeModel cross-direction dependencies require directional IDs');
      }
      if (
        !isValidDependencyEndpoint(from, config, operationModel) ||
        !isValidDependencyEndpoint(to, config, operationModel)
      ) {
        throw new Error('dualPipeModel cross-direction dependency endpoint not in inventory');
      }
      const key = `${edge.from}->${edge.to}`;
      if (seenEdges.has(key)) {
        throw new Error(`duplicate dualPipeModel dependency ${key}`);
      }
      seenEdges.add(key);
    }
  }

  const topology = config.topology ?? { placement: 'one-to-one' as const, virtualStagesPerRank: 1 };

  if (!isTopologyPlacement(topology.placement)) {
    throw new Error('topology placement must be one-to-one, wrap, or v-shape');
  }
  if (!isFinitePositiveInteger(topology.virtualStagesPerRank)) {
    throw new Error('virtualStagesPerRank must be a positive finite integer');
  }
  if (topology.placement === 'one-to-one') {
    if (topology.virtualStagesPerRank !== 1) {
      throw new Error('one-to-one topology requires virtualStagesPerRank to equal 1');
    }
    if (config.stageCount !== config.rankCount) {
      throw new Error('one-to-one topology requires stageCount to equal rankCount');
    }
  } else {
    if (topology.virtualStagesPerRank <= 1) {
      throw new Error('virtual topology requires virtualStagesPerRank greater than 1');
    }
    if (config.stageCount !== config.rankCount * topology.virtualStagesPerRank) {
      throw new Error(
        'virtual topology requires stageCount to equal rankCount times virtualStagesPerRank',
      );
    }
  }
  if (config.memoryCaps !== null) {
    if (config.memoryCaps.length !== config.rankCount) {
      throw new Error('memoryCaps length must equal rankCount');
    }
    for (const cap of config.memoryCaps) {
      if (!isFinitePositiveInteger(cap)) {
        throw new Error('memoryCaps values must be positive finite integers');
      }
    }
  }

  for (const target of config.masteryTargets) {
    if ('metric' in target && target.metric === 'internalBubbleRatio') {
      if (config.scoreModel?.internalBubble !== true) {
        throw new Error('internalBubbleRatio targets require internal bubble scoring');
      }
    }
    if ('metric' in target && target.metric === 'allGatherCount') {
      if (config.residencyModel === undefined) {
        throw new Error('allGatherCount targets require residencyModel');
      }
    }
  }
}
