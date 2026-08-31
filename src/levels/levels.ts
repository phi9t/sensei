import type { AlgorithmLevelMetadata, LevelConfig, MasteryTarget } from '../engine/types';

export const LEVEL_IDS = [
  'dependency-chain',
  'fill-the-pipe',
  'backward-is-heavier',
  'memory-wall',
  'gpipe-afab',
  'warm-up-then-alternate',
  'tie-at-the-frontier',
  'memory-capped-one-f-one-b',
  'stamp-the-pattern',
  'virtual-stages',
  'interleaved-one-f-one-b',
  'ragged-rounds',
  'heavy-backward-tail',
  'split-backward',
  'zero-bubble-h1',
  'zero-bubble-h2',
  'zero-bubble-deep',
  'group-the-pipe',
  'bf-pp-pressure',
  'gather-once-reuse',
  'group-too-wide',
  'regather-storm',
  'two-directions',
  'dualpipe-balance',
  'dualpipe-conflict',
] as const;

export type LevelId = (typeof LEVEL_IDS)[number];

function freezeTargets(targets: readonly MasteryTarget[]): readonly MasteryTarget[] {
  return Object.freeze(targets.map((target) => Object.freeze({ ...target })));
}

function freezeAlgorithm(metadata: AlgorithmLevelMetadata): AlgorithmLevelMetadata {
  return Object.freeze({
    ...metadata,
    introducedModel: Object.freeze([...metadata.introducedModel]),
  });
}

function freezeBuildingBlock(
  buildingBlock: NonNullable<LevelConfig['buildingBlock']>,
): NonNullable<LevelConfig['buildingBlock']> {
  return Object.freeze({
    ...buildingBlock,
    plan: Object.freeze({
      ...buildingBlock.plan,
      trajectory: Object.freeze(
        buildingBlock.plan.trajectory.map((operation) => Object.freeze({ ...operation })),
      ),
    }),
  });
}

function freezeTopology(
  topology: NonNullable<LevelConfig['topology']>,
): NonNullable<LevelConfig['topology']> {
  return Object.freeze({ ...topology });
}

function freezeDurationOverrides(
  overrides: NonNullable<LevelConfig['durationOverrides']>,
): NonNullable<LevelConfig['durationOverrides']> {
  return Object.freeze(overrides.map((override) => Object.freeze({ ...override })));
}

function freezeOperationModel(
  operationModel: NonNullable<LevelConfig['operationModel']>,
): NonNullable<LevelConfig['operationModel']> {
  return Object.freeze({ ...operationModel });
}

function freezeMicrobatchGrouping(
  microbatchGrouping: NonNullable<LevelConfig['microbatchGrouping']>,
): NonNullable<LevelConfig['microbatchGrouping']> {
  return Object.freeze({
    groupSize: microbatchGrouping.groupSize,
    ...(microbatchGrouping.groupLabels
      ? { groupLabels: Object.freeze([...microbatchGrouping.groupLabels]) }
      : {}),
  });
}

function freezeScoreModel(
  scoreModel: NonNullable<LevelConfig['scoreModel']>,
): NonNullable<LevelConfig['scoreModel']> {
  return Object.freeze({ ...scoreModel });
}

function freezeReferencePolicy(
  referencePolicy: NonNullable<LevelConfig['referencePolicy']>,
): NonNullable<LevelConfig['referencePolicy']> {
  return Object.freeze({
    candidatePolicyIds: Object.freeze([...referencePolicy.candidatePolicyIds]),
    ...(referencePolicy.comparisonPolicyId
      ? { comparisonPolicyId: referencePolicy.comparisonPolicyId }
      : {}),
  });
}

function freezeResidencyModel(
  residencyModel: NonNullable<LevelConfig['residencyModel']>,
): NonNullable<LevelConfig['residencyModel']> {
  return Object.freeze({ ...residencyModel });
}

function freezeDualPipeModel(
  dualPipeModel: NonNullable<LevelConfig['dualPipeModel']>,
): NonNullable<LevelConfig['dualPipeModel']> {
  return Object.freeze({
    enabled: dualPipeModel.enabled,
    directions: Object.freeze([...dualPipeModel.directions]),
    resourceModel: Object.freeze({ ...dualPipeModel.resourceModel }),
    ...(dualPipeModel.crossDirectionDependencies
      ? {
          crossDirectionDependencies: Object.freeze(
            dualPipeModel.crossDirectionDependencies.map((edge) => Object.freeze({ ...edge })),
          ),
        }
      : {}),
  });
}

function freezeLevel(config: LevelConfig): LevelConfig {
  const {
    buildingBlock,
    topology,
    durationOverrides,
    operationModel,
    microbatchGrouping,
    scoreModel,
    referencePolicy,
    residencyModel,
    dualPipeModel,
    ...baseConfig
  } = config;
  const frozen = {
    ...baseConfig,
    durations: Object.freeze({ ...config.durations }),
    memoryCaps: config.memoryCaps === null ? null : Object.freeze([...config.memoryCaps]),
    masteryTargets: freezeTargets(config.masteryTargets),
    coaching: Object.freeze({ ...config.coaching }),
    algorithm: freezeAlgorithm(config.algorithm),
    ...(buildingBlock ? { buildingBlock: freezeBuildingBlock(buildingBlock) } : {}),
    ...(topology ? { topology: freezeTopology(topology) } : {}),
    ...(durationOverrides ? { durationOverrides: freezeDurationOverrides(durationOverrides) } : {}),
    ...(operationModel ? { operationModel: freezeOperationModel(operationModel) } : {}),
    ...(microbatchGrouping
      ? { microbatchGrouping: freezeMicrobatchGrouping(microbatchGrouping) }
      : {}),
    ...(scoreModel ? { scoreModel: freezeScoreModel(scoreModel) } : {}),
    ...(referencePolicy ? { referencePolicy: freezeReferencePolicy(referencePolicy) } : {}),
    ...(residencyModel ? { residencyModel: freezeResidencyModel(residencyModel) } : {}),
    ...(dualPipeModel ? { dualPipeModel: freezeDualPipeModel(dualPipeModel) } : {}),
  } satisfies LevelConfig;

  return Object.freeze(frozen);
}

const LEVELS_BY_ID: Readonly<Record<LevelId, LevelConfig>> = Object.freeze({
  'dependency-chain': freezeLevel({
    id: 'dependency-chain',
    version: 1,
    title: 'Dependency Chain',
    rankCount: 2,
    stageCount: 2,
    microbatchCount: 1,
    durations: { F: 1, B: 2 },
    memoryCaps: null,
    masteryTargets: [
      { metric: 'makespan', op: '<=', value: 6 },
      { metric: 'intentionalIdle', op: '<=', value: 0 },
    ],
    coaching: { readySet: false, suggest: false, auto: false },
    algorithm: {
      family: 'foundations',
      setTitle: 'Foundations',
      concept: 'Read the dependency chain before placing backward work.',
      objective: 'Finish the only microbatch without inserting idle.',
      patternLabel: null,
      introducedModel: ['forward dependency', 'backward dependency'],
    },
  }),
  'fill-the-pipe': freezeLevel({
    id: 'fill-the-pipe',
    version: 1,
    title: 'Fill the Pipe',
    rankCount: 2,
    stageCount: 2,
    microbatchCount: 3,
    durations: { F: 1, B: 2 },
    memoryCaps: null,
    masteryTargets: [
      { metric: 'makespan', op: '<=', value: 12 },
      { metric: 'intentionalIdle', op: '<=', value: 0 },
    ],
    coaching: { readySet: true, suggest: false, auto: false },
    algorithm: {
      family: 'foundations',
      setTitle: 'Foundations',
      concept: 'Place forward blocks to fill the pipeline before draining it.',
      objective: 'Overlap microbatches while keeping every move legal.',
      patternLabel: 'Fill/Drain',
      introducedModel: ['pipeline fill', 'pipeline drain', 'bubble'],
    },
  }),
  'backward-is-heavier': freezeLevel({
    id: 'backward-is-heavier',
    version: 1,
    title: 'Backward Is Heavier',
    rankCount: 3,
    stageCount: 3,
    microbatchCount: 3,
    durations: { F: 1, B: 2 },
    memoryCaps: null,
    masteryTargets: [
      { metric: 'makespan', op: '<=', value: 15 },
      { metric: 'intentionalIdle', op: '<=', value: 0 },
    ],
    coaching: { readySet: true, suggest: true, auto: false },
    algorithm: {
      family: 'foundations',
      setTitle: 'Foundations',
      concept: 'Backward work is heavier, so the tail dominates sloppy schedules.',
      objective: 'Keep the heavier backward tail short.',
      patternLabel: 'F=1 B=2',
      introducedModel: ['duration asymmetry', 'critical tail'],
    },
  }),
  'memory-wall': freezeLevel({
    id: 'memory-wall',
    version: 1,
    title: 'Memory Wall',
    rankCount: 3,
    stageCount: 3,
    microbatchCount: 4,
    durations: { F: 1, B: 2 },
    memoryCaps: [3, 2, 1],
    masteryTargets: [
      { metric: 'makespan', op: '<=', value: 18 },
      { metric: 'intentionalIdle', op: '<=', value: 0 },
      { metric: 'peakActivationMemory', op: '<=', value: 3 },
    ],
    coaching: { readySet: true, suggest: true, auto: true },
    algorithm: {
      family: 'foundations',
      setTitle: 'Foundations',
      concept: 'Activation memory can block otherwise legal forward work.',
      objective: 'Respect per-rank memory caps without adding idle.',
      patternLabel: 'Memory cap',
      introducedModel: ['activation lifetime', 'memory admission'],
    },
  }),
  'gpipe-afab': freezeLevel({
    id: 'gpipe-afab',
    version: 2,
    title: 'GPipe AFAB',
    rankCount: 3,
    stageCount: 3,
    microbatchCount: 4,
    durations: { F: 1, B: 2 },
    memoryCaps: null,
    masteryTargets: [
      { kind: 'schedule-pattern', pattern: 'afab' },
      { metric: 'makespan', op: '<=', value: 18 },
      { metric: 'intentionalIdle', op: '<=', value: 0 },
      { metric: 'peakActivationMemory', op: '<=', value: 4 },
    ],
    coaching: { readySet: true, suggest: true, auto: true },
    algorithm: {
      family: 'gpipe',
      setTitle: 'GPipe',
      concept: 'Run all forward work first, then drain all backward work.',
      objective: 'Build the AFAB shape and notice the activation memory it holds.',
      patternLabel: 'AFAB',
      introducedModel: ['all-forward/all-backward policy', 'activation accumulation'],
    },
  }),
  'warm-up-then-alternate': freezeLevel({
    id: 'warm-up-then-alternate',
    version: 1,
    title: 'Warm Up Then Alternate',
    rankCount: 3,
    stageCount: 3,
    microbatchCount: 4,
    durations: { F: 1, B: 2 },
    memoryCaps: null,
    masteryTargets: [
      { metric: 'makespan', op: '<=', value: 18 },
      { metric: 'intentionalIdle', op: '<=', value: 0 },
      { metric: 'peakActivationMemory', op: '<=', value: 3 },
    ],
    coaching: { readySet: true, suggest: true, auto: true },
    algorithm: {
      family: 'one-f-one-b',
      setTitle: '1F1B',
      concept: 'Warm up the pipe, then alternate backward and forward work.',
      objective: 'Match GPipe makespan while holding fewer activations.',
      patternLabel: '1F1B',
      introducedModel: ['warmup', 'steady alternation', 'memory reduction'],
    },
  }),
  'tie-at-the-frontier': freezeLevel({
    id: 'tie-at-the-frontier',
    version: 1,
    title: 'Tie at the Frontier',
    rankCount: 2,
    stageCount: 2,
    microbatchCount: 4,
    durations: { F: 1, B: 2 },
    memoryCaps: null,
    masteryTargets: [
      { metric: 'makespan', op: '<=', value: 15 },
      { metric: 'intentionalIdle', op: '<=', value: 0 },
      { metric: 'peakActivationMemory', op: '<=', value: 2 },
    ],
    coaching: { readySet: true, suggest: true, auto: true },
    algorithm: {
      family: 'one-f-one-b',
      setTitle: '1F1B',
      concept: 'When forward and backward are both ready, backward can protect memory.',
      objective: 'Choose the backward move at frontier ties.',
      patternLabel: '1F1B',
      introducedModel: ['ready-set tie', 'backward priority'],
    },
  }),
  'memory-capped-one-f-one-b': freezeLevel({
    id: 'memory-capped-one-f-one-b',
    version: 1,
    title: 'Memory-Capped 1F1B',
    rankCount: 3,
    stageCount: 3,
    microbatchCount: 5,
    durations: { F: 1, B: 2 },
    memoryCaps: [3, 2, 1],
    masteryTargets: [
      { metric: 'makespan', op: '<=', value: 21 },
      { metric: 'intentionalIdle', op: '<=', value: 0 },
      { metric: 'peakActivationMemory', op: '<=', value: 3 },
    ],
    coaching: { readySet: true, suggest: true, auto: true },
    algorithm: {
      family: 'one-f-one-b',
      setTitle: '1F1B',
      concept: 'Memory caps turn backward priority into an admission policy.',
      objective: 'Keep the 1F1B rhythm under a tight last-rank cap.',
      patternLabel: '1F1B + cap',
      introducedModel: ['memory-constrained 1F1B', 'admission pressure'],
    },
  }),
  'stamp-the-pattern': freezeLevel({
    id: 'stamp-the-pattern',
    version: 1,
    title: 'Stamp The Pattern',
    rankCount: 2,
    stageCount: 2,
    microbatchCount: 3,
    durations: { F: 1, B: 2 },
    memoryCaps: null,
    masteryTargets: [
      { metric: 'makespan', op: '<=', value: 12 },
      { metric: 'intentionalIdle', op: '<=', value: 2 },
      { metric: 'peakActivationMemory', op: '<=', value: 2 },
    ],
    coaching: { readySet: true, suggest: true, auto: true },
    algorithm: {
      family: 'building-block',
      setTitle: 'Building Blocks',
      concept: 'Repeat one trajectory across microbatches.',
      objective: 'Validate the pattern, stamp it, and inspect the completed schedule.',
      patternLabel: 'Periodic',
      introducedModel: ['periodic trajectory', 'pattern stamping'],
    },
    buildingBlock: {
      label: 'Two-rank periodic trajectory',
      plan: {
        period: 3,
        trajectory: [
          { operationId: 'F:0:0', offset: 0 },
          { operationId: 'F:1:0', offset: 1 },
          { operationId: 'B:1:0', offset: 2 },
          { operationId: 'B:0:0', offset: 4 },
        ],
      },
    },
  }),
  'virtual-stages': freezeLevel({
    id: 'virtual-stages',
    version: 1,
    title: 'Virtual Stages',
    rankCount: 2,
    stageCount: 4,
    microbatchCount: 2,
    topology: { placement: 'v-shape', virtualStagesPerRank: 2 },
    durations: { F: 1, B: 2 },
    memoryCaps: null,
    masteryTargets: [
      { metric: 'makespan', op: '<=', value: 16 },
      { metric: 'intentionalIdle', op: '<=', value: 0 },
      { metric: 'peakActivationMemory', op: '<=', value: 4 },
    ],
    coaching: { readySet: true, suggest: true, auto: true },
    algorithm: {
      family: 'interleaved-one-f-one-b',
      setTitle: 'Virtual Stages',
      concept: 'One physical rank can own multiple logical stages.',
      objective: 'Follow logical dependencies while placing work on the owning rank lane.',
      patternLabel: 'V-shape',
      introducedModel: ['logical stage', 'physical rank ownership', 'virtual pipeline stage'],
    },
  }),
  'interleaved-one-f-one-b': freezeLevel({
    id: 'interleaved-one-f-one-b',
    version: 1,
    title: 'Interleaved 1F1B',
    rankCount: 2,
    stageCount: 4,
    microbatchCount: 3,
    topology: { placement: 'v-shape', virtualStagesPerRank: 2 },
    durations: { F: 1, B: 2 },
    memoryCaps: null,
    masteryTargets: [
      { metric: 'makespan', op: '<=', value: 26 },
      { metric: 'intentionalIdle', op: '<=', value: 0 },
      { metric: 'peakActivationMemory', op: '<=', value: 6 },
    ],
    coaching: { readySet: true, suggest: true, auto: true },
    algorithm: {
      family: 'interleaved-one-f-one-b',
      setTitle: 'Interleaved 1F1B',
      concept: 'Alternate virtual-stage chunks after a short first-stage warmup.',
      objective: 'Match the interleaved reference order on physical rank lanes.',
      patternLabel: 'Interleaved 1F1B',
      introducedModel: [
        'virtual-stage warmup',
        'interleaved steady state',
        'rank-local operation order',
      ],
    },
  }),
  'ragged-rounds': freezeLevel({
    id: 'ragged-rounds',
    version: 1,
    title: 'Ragged Rounds',
    rankCount: 2,
    stageCount: 4,
    microbatchCount: 5,
    topology: { placement: 'v-shape', virtualStagesPerRank: 2 },
    durations: { F: 1, B: 2 },
    memoryCaps: null,
    masteryTargets: [
      { metric: 'makespan', op: '<=', value: 46 },
      { metric: 'intentionalIdle', op: '<=', value: 0 },
      { metric: 'peakActivationMemory', op: '<=', value: 10 },
    ],
    coaching: { readySet: true, suggest: true, auto: true },
    algorithm: {
      family: 'interleaved-one-f-one-b',
      setTitle: 'Interleaved 1F1B',
      concept: 'Ragged microbatch rounds leave an uneven tail.',
      objective: 'Hit the interleaved policy par, then inspect where the tail still bubbles.',
      patternLabel: 'Policy par',
      introducedModel: ['ragged round', 'policy par', 'tail effect'],
    },
  }),
  'heavy-backward-tail': freezeLevel({
    id: 'heavy-backward-tail',
    version: 1,
    title: 'Heavy Backward Tail',
    rankCount: 2,
    stageCount: 4,
    microbatchCount: 3,
    topology: { placement: 'v-shape', virtualStagesPerRank: 2 },
    durations: { F: 1, B: 2 },
    durationOverrides: [{ kind: 'B', stage: 0, duration: 4 }],
    memoryCaps: null,
    masteryTargets: [
      { metric: 'makespan', op: '<=', value: 28 },
      { metric: 'intentionalIdle', op: '<=', value: 0 },
      { metric: 'peakActivationMemory', op: '<=', value: 6 },
    ],
    coaching: { readySet: true, suggest: true, auto: true },
    algorithm: {
      family: 'interleaved-one-f-one-b',
      setTitle: 'Nonuniform Cost',
      concept:
        'A heavy first-stage backward creates a critical tail even when operation counts look balanced.',
      objective: 'Keep the interleaved rhythm while draining the expensive B:S0 tail early enough.',
      patternLabel: 'Cost-aware',
      introducedModel: ['stage-specific duration', 'critical tail by cost'],
    },
  }),
  'split-backward': freezeLevel({
    id: 'split-backward',
    version: 1,
    title: 'Split Backward',
    rankCount: 2,
    stageCount: 2,
    microbatchCount: 2,
    durations: { F: 1, B: 1, W: 1 },
    operationModel: { backward: 'split' },
    memoryCaps: null,
    masteryTargets: [
      { metric: 'makespan', op: '<=', value: 7 },
      { metric: 'intentionalIdle', op: '<=', value: 0 },
      { metric: 'peakActivationMemory', op: '<=', value: 2 },
    ],
    coaching: { readySet: true, suggest: true, auto: true },
    algorithm: {
      family: 'zero-bubble',
      setTitle: 'Zero Bubble',
      concept: 'Split backward exposes input-gradient and weight-gradient work as separate blocks.',
      objective: 'Place W after B and watch activation memory release at weight-gradient time.',
      patternLabel: 'Split B/W',
      introducedModel: ['input-gradient work', 'weight-gradient work', 'release on W'],
    },
  }),
  'zero-bubble-h1': freezeLevel({
    id: 'zero-bubble-h1',
    version: 1,
    title: 'ZB-H1 Window',
    rankCount: 2,
    stageCount: 2,
    microbatchCount: 3,
    durations: { F: 1, B: 1, W: 1 },
    operationModel: { backward: 'split' },
    scoreModel: { internalBubble: true },
    referencePolicy: {
      candidatePolicyIds: ['zero-bubble-h1', 'zero-bubble-h2', 'zero-bubble-deep'],
    },
    memoryCaps: null,
    masteryTargets: [
      { metric: 'makespan', op: '<=', value: 10 },
      { metric: 'intentionalIdle', op: '<=', value: 0 },
      { metric: 'internalBubbleRatio', op: '<=', value: 0 },
      { metric: 'peakActivationMemory', op: '<=', value: 3 },
    ],
    coaching: { readySet: true, suggest: true, auto: true },
    algorithm: {
      family: 'zero-bubble',
      setTitle: 'Zero Bubble',
      concept: 'Keep W blocks available so local idle can be filled after input gradients clear.',
      objective: 'Use a short warmup, then drain B and W without leaving internal gaps.',
      patternLabel: 'ZB-H1',
      introducedModel: ['zero-bubble warmup', 'internal bubble', 'W fill'],
    },
  }),
  'zero-bubble-h2': freezeLevel({
    id: 'zero-bubble-h2',
    version: 1,
    title: 'ZB-H2 Window',
    rankCount: 3,
    stageCount: 3,
    microbatchCount: 4,
    durations: { F: 1, B: 1, W: 1 },
    operationModel: { backward: 'split' },
    scoreModel: { internalBubble: true },
    referencePolicy: {
      candidatePolicyIds: ['zero-bubble-h2', 'zero-bubble-h1', 'zero-bubble-deep'],
    },
    memoryCaps: null,
    masteryTargets: [
      { metric: 'makespan', op: '<=', value: 14 },
      { metric: 'intentionalIdle', op: '<=', value: 0 },
      { metric: 'internalBubbleRatio', op: '<=', value: 0.03 },
      { metric: 'peakActivationMemory', op: '<=', value: 4 },
    ],
    coaching: { readySet: true, suggest: true, auto: true },
    algorithm: {
      family: 'zero-bubble',
      setTitle: 'Zero Bubble',
      concept: 'A wider warmup changes which W blocks are useful bubble fillers.',
      objective: 'Compare the H2 reference order against H1 while keeping internal bubble low.',
      patternLabel: 'ZB-H2',
      introducedModel: ['warmup window', 'variant comparison', 'bubble filling'],
    },
  }),
  'zero-bubble-deep': freezeLevel({
    id: 'zero-bubble-deep',
    version: 1,
    title: 'Deep Zero Bubble',
    rankCount: 4,
    stageCount: 4,
    microbatchCount: 5,
    durations: { F: 1, B: 1, W: 1 },
    operationModel: { backward: 'split' },
    scoreModel: { internalBubble: true },
    referencePolicy: {
      candidatePolicyIds: ['zero-bubble-deep', 'zero-bubble-h2', 'zero-bubble-h1'],
    },
    memoryCaps: null,
    masteryTargets: [
      { metric: 'makespan', op: '<=', value: 18 },
      { metric: 'intentionalIdle', op: '<=', value: 0 },
      { metric: 'internalBubbleRatio', op: '<=', value: 0.04 },
      { metric: 'peakActivationMemory', op: '<=', value: 5 },
    ],
    coaching: { readySet: true, suggest: true, auto: true },
    algorithm: {
      family: 'zero-bubble',
      setTitle: 'Zero Bubble',
      concept: 'Deeper pipelines expose more tail work, so W placement decides where gaps remain.',
      objective: 'Hold the low-bubble reference shape while draining a longer split-backward tail.',
      patternLabel: 'Zero Bubble Deep',
      introducedModel: ['deep warmup', 'tail drain', 'variant trade-off'],
    },
  }),
  'group-the-pipe': freezeLevel({
    id: 'group-the-pipe',
    version: 1,
    title: 'Group The Pipe',
    rankCount: 3,
    stageCount: 3,
    microbatchCount: 4,
    durations: { F: 1, B: 2 },
    microbatchGrouping: {
      groupSize: 2,
      groupLabels: ['G0', 'G1'],
    },
    referencePolicy: {
      candidatePolicyIds: ['group-major', 'one-f-one-b'],
      comparisonPolicyId: 'one-f-one-b',
    },
    memoryCaps: null,
    masteryTargets: [
      { metric: 'makespan', op: '<=', value: 24 },
      { metric: 'intentionalIdle', op: '<=', value: 0 },
      { metric: 'peakActivationMemory', op: '<=', value: 2 },
    ],
    coaching: { readySet: true, suggest: true, auto: true },
    algorithm: {
      family: 'grouped',
      setTitle: 'Grouped',
      concept: 'Group-major scheduling drains a small batch group before admitting the next one.',
      objective: 'Finish G0 before G1 while watching bubble and activation memory.',
      patternLabel: 'Group major',
      introducedModel: ['microbatch group', 'group-major order', 'group boundary'],
    },
  }),
  'bf-pp-pressure': freezeLevel({
    id: 'bf-pp-pressure',
    version: 1,
    title: 'BF-PP Pressure',
    rankCount: 3,
    stageCount: 3,
    microbatchCount: 6,
    durations: { F: 1, B: 2 },
    microbatchGrouping: {
      groupSize: 2,
      groupLabels: ['G0', 'G1', 'G2'],
    },
    referencePolicy: {
      candidatePolicyIds: ['group-major', 'one-f-one-b'],
      comparisonPolicyId: 'one-f-one-b',
    },
    memoryCaps: [2, 2, 2],
    masteryTargets: [
      { metric: 'makespan', op: '<=', value: 36 },
      { metric: 'intentionalIdle', op: '<=', value: 0 },
      { metric: 'peakActivationMemory', op: '<=', value: 2 },
    ],
    coaching: { readySet: true, suggest: true, auto: true },
    algorithm: {
      family: 'grouped',
      setTitle: 'Grouped',
      concept: 'Small groups keep activation pressure bounded while preserving a repeatable order.',
      objective: 'Use group-major placement to stay under the memory cap without FSDP claims.',
      patternLabel: 'BF-PP',
      introducedModel: ['bounded group', 'activation pressure', 'policy-relative comparison'],
    },
  }),
  'gather-once-reuse': freezeLevel({
    id: 'gather-once-reuse',
    version: 1,
    title: 'Gather Once, Reuse',
    rankCount: 2,
    stageCount: 2,
    microbatchCount: 2,
    durations: { F: 1, B: 2 },
    memoryCaps: [3, 3],
    residencyModel: { weightUnit: 1 },
    masteryTargets: [
      { metric: 'makespan', op: '<=', value: 9 },
      { metric: 'intentionalIdle', op: '<=', value: 0 },
      { metric: 'peakActivationMemory', op: '<=', value: 2 },
      { metric: 'allGatherCount', op: '<=', value: 2 },
    ],
    coaching: { readySet: true, suggest: true, auto: true },
    algorithm: {
      family: 'fsdp-residency',
      setTitle: 'FSDP Residency',
      concept:
        'A forward block gathers its stage weights once, then later forwards can reuse them.',
      objective: 'Place same-stage forwards close enough to reuse resident weights.',
      patternLabel: 'Reuse',
      introducedModel: ['weight residency', 'all-gather count', 'reuse'],
    },
  }),
  'group-too-wide': freezeLevel({
    id: 'group-too-wide',
    version: 1,
    title: 'Group Too Wide',
    rankCount: 2,
    stageCount: 4,
    microbatchCount: 2,
    topology: { placement: 'v-shape', virtualStagesPerRank: 2 },
    durations: { F: 1, B: 2 },
    microbatchGrouping: {
      groupSize: 2,
      groupLabels: ['G0'],
    },
    memoryCaps: [3, 3],
    residencyModel: { weightUnit: 1 },
    masteryTargets: [
      { metric: 'makespan', op: '<=', value: 24 },
      { metric: 'intentionalIdle', op: '<=', value: 0 },
      { metric: 'peakActivationMemory', op: '<=', value: 2 },
      { metric: 'allGatherCount', op: '<=', value: 6 },
    ],
    coaching: { readySet: true, suggest: true, auto: true },
    algorithm: {
      family: 'fsdp-residency',
      setTitle: 'FSDP Residency',
      concept: 'A wide forward group can run out of room once activations and weights share a cap.',
      objective: 'Drain one microbatch before admitting the next wide group.',
      patternLabel: 'Cap-aware',
      introducedModel: ['combined memory cap', 'durationless eviction', 'group width'],
    },
  }),
  'regather-storm': freezeLevel({
    id: 'regather-storm',
    version: 1,
    title: 'Regather Storm',
    rankCount: 2,
    stageCount: 4,
    microbatchCount: 4,
    topology: { placement: 'v-shape', virtualStagesPerRank: 2 },
    durations: { F: 1, B: 2 },
    microbatchGrouping: {
      groupSize: 2,
      groupLabels: ['G0', 'G1'],
    },
    memoryCaps: [5, 5],
    residencyModel: { weightUnit: 1 },
    masteryTargets: [
      { metric: 'makespan', op: '<=', value: 36 },
      { metric: 'intentionalIdle', op: '<=', value: 0 },
      { metric: 'peakActivationMemory', op: '<=', value: 4 },
      { metric: 'allGatherCount', op: '<=', value: 6 },
    ],
    coaching: { readySet: true, suggest: true, auto: true },
    algorithm: {
      family: 'fsdp-residency',
      setTitle: 'FSDP Residency',
      concept: 'Switching between resident virtual stages too often creates extra gathers.',
      objective: 'Group work enough to reduce regathers while keeping the schedule compact.',
      patternLabel: 'Gather-aware',
      introducedModel: ['regather', 'residency pressure', 'communication trade-off'],
    },
  }),
  'two-directions': freezeLevel({
    id: 'two-directions',
    version: 1,
    title: 'Two Directions',
    rankCount: 2,
    stageCount: 2,
    microbatchCount: 1,
    durations: { F: 1, B: 2 },
    memoryCaps: null,
    dualPipeModel: {
      enabled: true,
      directions: ['asc', 'desc'],
      resourceModel: { directionalSlots: 1, sharedCapacity: 2 },
    },
    referencePolicy: {
      candidatePolicyIds: ['dualpipe-balanced', 'dualpipe-one-direction'],
      comparisonPolicyId: 'dualpipe-one-direction',
    },
    masteryTargets: [
      { metric: 'makespan', op: '<=', value: 6 },
      { metric: 'intentionalIdle', op: '<=', value: 0 },
      { metric: 'peakActivationMemory', op: '<=', value: 2 },
    ],
    coaching: { readySet: true, suggest: true, auto: true },
    algorithm: {
      family: 'dualpipe',
      setTitle: 'DualPipe',
      concept: 'Two directions carry independent microbatches through the same rank lanes.',
      objective: 'Place Up and Down blocks while keeping the code shape F0:S0:D0.',
      patternLabel: 'Bidirectional',
      introducedModel: ['direction cue', 'opposite stage flow', 'direction-bearing ID'],
    },
  }),
  'dualpipe-balance': freezeLevel({
    id: 'dualpipe-balance',
    version: 1,
    title: 'DualPipe Balance',
    rankCount: 2,
    stageCount: 2,
    microbatchCount: 2,
    durations: { F: 1, B: 2 },
    memoryCaps: null,
    dualPipeModel: {
      enabled: true,
      directions: ['asc', 'desc'],
      resourceModel: { directionalSlots: 1, sharedCapacity: 2 },
    },
    referencePolicy: {
      candidatePolicyIds: ['dualpipe-balanced', 'dualpipe-one-direction'],
      comparisonPolicyId: 'dualpipe-one-direction',
    },
    masteryTargets: [
      { metric: 'makespan', op: '<=', value: 9 },
      { metric: 'intentionalIdle', op: '<=', value: 0 },
      { metric: 'peakActivationMemory', op: '<=', value: 4 },
    ],
    coaching: { readySet: true, suggest: true, auto: true },
    algorithm: {
      family: 'dualpipe',
      setTitle: 'DualPipe',
      concept: 'Opposite-direction work can share a rank lane when the resource model allows it.',
      objective: 'Overlap Up and Down blocks to beat the one-direction baseline.',
      patternLabel: 'Balanced',
      introducedModel: ['bidirectional overlap', 'shared rank capacity', 'baseline comparison'],
    },
  }),
  'dualpipe-conflict': freezeLevel({
    id: 'dualpipe-conflict',
    version: 1,
    title: 'DualPipe Conflict',
    rankCount: 2,
    stageCount: 2,
    microbatchCount: 2,
    durations: { F: 1, B: 2 },
    memoryCaps: null,
    dualPipeModel: {
      enabled: true,
      directions: ['asc', 'desc'],
      resourceModel: { directionalSlots: 1, sharedCapacity: 1 },
    },
    referencePolicy: {
      candidatePolicyIds: ['dualpipe-balanced', 'dualpipe-one-direction'],
      comparisonPolicyId: 'dualpipe-one-direction',
    },
    masteryTargets: [
      { metric: 'makespan', op: '<=', value: 12 },
      { metric: 'intentionalIdle', op: '<=', value: 0 },
      { metric: 'peakActivationMemory', op: '<=', value: 4 },
    ],
    coaching: { readySet: true, suggest: true, auto: true },
    algorithm: {
      family: 'dualpipe',
      setTitle: 'DualPipe',
      concept: 'A shared capacity of one turns apparent pairs back into serialized work.',
      objective: 'Read the resource conflict and still complete the bidirectional schedule.',
      patternLabel: 'Capacity 1',
      introducedModel: ['resource conflict', 'shared capacity', 'forced serialization'],
    },
  }),
});

export function getLevel(id: LevelId): LevelConfig {
  const level = LEVELS_BY_ID[id];
  if (!level) {
    throw new Error(`Unknown level: ${String(id)}`);
  }
  return level;
}
