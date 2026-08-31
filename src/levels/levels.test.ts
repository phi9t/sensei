import { describe, expect, it } from 'vitest';
import { LEGAL_ACTIONS, MASTERED_ACTIONS } from './fixtures';
import { getLevel, LEVEL_IDS, type LevelId } from './levels';
import { initialState, replay } from '../engine/replay';
import { score } from '../engine/score';
import type {
  Action,
  LevelConfig,
  MasteryTarget,
  MetricMasteryTarget,
  OperationId,
} from '../engine/types';

const EXPECTED_LEVEL_IDS = [
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

const EXPECTED_LEVEL_GROUPS = [
  'Foundations',
  'GPipe',
  '1F1B',
  'Building Blocks',
  'Virtual Stages',
  'Interleaved 1F1B',
  'Nonuniform Cost',
  'Zero Bubble',
  'Grouped',
  'FSDP Residency',
  'DualPipe',
] as const;

const EXPECTED_CONFIGS = {
  'dependency-chain': {
    id: 'dependency-chain',
    version: 1,
    title: 'Dependency Chain',
    rankCount: 2,
    stageCount: 2,
    microbatchCount: 1,
    durations: { F: 1, B: 2 },
    memoryCaps: null,
    coaching: { readySet: false, suggest: false, auto: false },
    masteryTargets: [
      { metric: 'makespan', op: '<=', value: 6 },
      { metric: 'intentionalIdle', op: '<=', value: 0 },
    ],
    algorithm: {
      family: 'foundations',
      setTitle: 'Foundations',
      concept: 'Read the dependency chain before placing backward work.',
      objective: 'Finish the only microbatch without inserting idle.',
      patternLabel: null,
      introducedModel: ['forward dependency', 'backward dependency'],
    },
  },
  'fill-the-pipe': {
    id: 'fill-the-pipe',
    version: 1,
    title: 'Fill the Pipe',
    rankCount: 2,
    stageCount: 2,
    microbatchCount: 3,
    durations: { F: 1, B: 2 },
    memoryCaps: null,
    coaching: { readySet: true, suggest: false, auto: false },
    masteryTargets: [
      { metric: 'makespan', op: '<=', value: 12 },
      { metric: 'intentionalIdle', op: '<=', value: 0 },
    ],
    algorithm: {
      family: 'foundations',
      setTitle: 'Foundations',
      concept: 'Place forward blocks to fill the pipeline before draining it.',
      objective: 'Overlap microbatches while keeping every move legal.',
      patternLabel: 'Fill/Drain',
      introducedModel: ['pipeline fill', 'pipeline drain', 'bubble'],
    },
  },
  'backward-is-heavier': {
    id: 'backward-is-heavier',
    version: 1,
    title: 'Backward Is Heavier',
    rankCount: 3,
    stageCount: 3,
    microbatchCount: 3,
    durations: { F: 1, B: 2 },
    memoryCaps: null,
    coaching: { readySet: true, suggest: true, auto: false },
    masteryTargets: [
      { metric: 'makespan', op: '<=', value: 15 },
      { metric: 'intentionalIdle', op: '<=', value: 0 },
    ],
    algorithm: {
      family: 'foundations',
      setTitle: 'Foundations',
      concept: 'Backward work is heavier, so the tail dominates sloppy schedules.',
      objective: 'Keep the heavier backward tail short.',
      patternLabel: 'F=1 B=2',
      introducedModel: ['duration asymmetry', 'critical tail'],
    },
  },
  'memory-wall': {
    id: 'memory-wall',
    version: 1,
    title: 'Memory Wall',
    rankCount: 3,
    stageCount: 3,
    microbatchCount: 4,
    durations: { F: 1, B: 2 },
    memoryCaps: [3, 2, 1],
    coaching: { readySet: true, suggest: true, auto: true },
    masteryTargets: [
      { metric: 'makespan', op: '<=', value: 18 },
      { metric: 'intentionalIdle', op: '<=', value: 0 },
      { metric: 'peakActivationMemory', op: '<=', value: 3 },
    ],
    algorithm: {
      family: 'foundations',
      setTitle: 'Foundations',
      concept: 'Activation memory can block otherwise legal forward work.',
      objective: 'Respect per-rank memory caps without adding idle.',
      patternLabel: 'Memory cap',
      introducedModel: ['activation lifetime', 'memory admission'],
    },
  },
  'gpipe-afab': {
    id: 'gpipe-afab',
    version: 2,
    title: 'GPipe AFAB',
    rankCount: 3,
    stageCount: 3,
    microbatchCount: 4,
    durations: { F: 1, B: 2 },
    memoryCaps: null,
    coaching: { readySet: true, suggest: true, auto: true },
    masteryTargets: [
      { kind: 'schedule-pattern', pattern: 'afab' },
      { metric: 'makespan', op: '<=', value: 18 },
      { metric: 'intentionalIdle', op: '<=', value: 0 },
      { metric: 'peakActivationMemory', op: '<=', value: 4 },
    ],
    algorithm: {
      family: 'gpipe',
      setTitle: 'GPipe',
      concept: 'Run all forward work first, then drain all backward work.',
      objective: 'Build the AFAB shape and notice the activation memory it holds.',
      patternLabel: 'AFAB',
      introducedModel: ['all-forward/all-backward policy', 'activation accumulation'],
    },
  },
  'warm-up-then-alternate': {
    id: 'warm-up-then-alternate',
    version: 1,
    title: 'Warm Up Then Alternate',
    rankCount: 3,
    stageCount: 3,
    microbatchCount: 4,
    durations: { F: 1, B: 2 },
    memoryCaps: null,
    coaching: { readySet: true, suggest: true, auto: true },
    masteryTargets: [
      { metric: 'makespan', op: '<=', value: 18 },
      { metric: 'intentionalIdle', op: '<=', value: 0 },
      { metric: 'peakActivationMemory', op: '<=', value: 3 },
    ],
    algorithm: {
      family: 'one-f-one-b',
      setTitle: '1F1B',
      concept: 'Warm up the pipe, then alternate backward and forward work.',
      objective: 'Match GPipe makespan while holding fewer activations.',
      patternLabel: '1F1B',
      introducedModel: ['warmup', 'steady alternation', 'memory reduction'],
    },
  },
  'tie-at-the-frontier': {
    id: 'tie-at-the-frontier',
    version: 1,
    title: 'Tie at the Frontier',
    rankCount: 2,
    stageCount: 2,
    microbatchCount: 4,
    durations: { F: 1, B: 2 },
    memoryCaps: null,
    coaching: { readySet: true, suggest: true, auto: true },
    masteryTargets: [
      { metric: 'makespan', op: '<=', value: 15 },
      { metric: 'intentionalIdle', op: '<=', value: 0 },
      { metric: 'peakActivationMemory', op: '<=', value: 2 },
    ],
    algorithm: {
      family: 'one-f-one-b',
      setTitle: '1F1B',
      concept: 'When forward and backward are both ready, backward can protect memory.',
      objective: 'Choose the backward move at frontier ties.',
      patternLabel: '1F1B',
      introducedModel: ['ready-set tie', 'backward priority'],
    },
  },
  'memory-capped-one-f-one-b': {
    id: 'memory-capped-one-f-one-b',
    version: 1,
    title: 'Memory-Capped 1F1B',
    rankCount: 3,
    stageCount: 3,
    microbatchCount: 5,
    durations: { F: 1, B: 2 },
    memoryCaps: [3, 2, 1],
    coaching: { readySet: true, suggest: true, auto: true },
    masteryTargets: [
      { metric: 'makespan', op: '<=', value: 21 },
      { metric: 'intentionalIdle', op: '<=', value: 0 },
      { metric: 'peakActivationMemory', op: '<=', value: 3 },
    ],
    algorithm: {
      family: 'one-f-one-b',
      setTitle: '1F1B',
      concept: 'Memory caps turn backward priority into an admission policy.',
      objective: 'Keep the 1F1B rhythm under a tight last-rank cap.',
      patternLabel: '1F1B + cap',
      introducedModel: ['memory-constrained 1F1B', 'admission pressure'],
    },
  },
  'stamp-the-pattern': {
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
  },
  'virtual-stages': {
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
  },
  'interleaved-one-f-one-b': {
    id: 'interleaved-one-f-one-b',
    version: 1,
    title: 'Interleaved 1F1B',
    rankCount: 2,
    stageCount: 4,
    microbatchCount: 3,
    topology: { placement: 'v-shape', virtualStagesPerRank: 2 },
    durations: { F: 1, B: 2 },
    memoryCaps: null,
    coaching: { readySet: true, suggest: true, auto: true },
    masteryTargets: [
      { metric: 'makespan', op: '<=', value: 26 },
      { metric: 'intentionalIdle', op: '<=', value: 0 },
      { metric: 'peakActivationMemory', op: '<=', value: 6 },
    ],
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
  },
  'ragged-rounds': {
    id: 'ragged-rounds',
    version: 1,
    title: 'Ragged Rounds',
    rankCount: 2,
    stageCount: 4,
    microbatchCount: 5,
    topology: { placement: 'v-shape', virtualStagesPerRank: 2 },
    durations: { F: 1, B: 2 },
    memoryCaps: null,
    coaching: { readySet: true, suggest: true, auto: true },
    masteryTargets: [
      { metric: 'makespan', op: '<=', value: 46 },
      { metric: 'intentionalIdle', op: '<=', value: 0 },
      { metric: 'peakActivationMemory', op: '<=', value: 10 },
    ],
    algorithm: {
      family: 'interleaved-one-f-one-b',
      setTitle: 'Interleaved 1F1B',
      concept: 'Ragged microbatch rounds leave an uneven tail.',
      objective: 'Hit the interleaved policy par, then inspect where the tail still bubbles.',
      patternLabel: 'Policy par',
      introducedModel: ['ragged round', 'policy par', 'tail effect'],
    },
  },
  'heavy-backward-tail': {
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
    coaching: { readySet: true, suggest: true, auto: true },
    masteryTargets: [
      { metric: 'makespan', op: '<=', value: 28 },
      { metric: 'intentionalIdle', op: '<=', value: 0 },
      { metric: 'peakActivationMemory', op: '<=', value: 6 },
    ],
    algorithm: {
      family: 'interleaved-one-f-one-b',
      setTitle: 'Nonuniform Cost',
      concept:
        'A heavy first-stage backward creates a critical tail even when operation counts look balanced.',
      objective: 'Keep the interleaved rhythm while draining the expensive B:S0 tail early enough.',
      patternLabel: 'Cost-aware',
      introducedModel: ['stage-specific duration', 'critical tail by cost'],
    },
  },
  'split-backward': {
    id: 'split-backward',
    version: 1,
    title: 'Split Backward',
    rankCount: 2,
    stageCount: 2,
    microbatchCount: 2,
    durations: { F: 1, B: 1, W: 1 },
    operationModel: { backward: 'split' },
    memoryCaps: null,
    coaching: { readySet: true, suggest: true, auto: true },
    masteryTargets: [
      { metric: 'makespan', op: '<=', value: 7 },
      { metric: 'intentionalIdle', op: '<=', value: 0 },
      { metric: 'peakActivationMemory', op: '<=', value: 2 },
    ],
    algorithm: {
      family: 'zero-bubble',
      setTitle: 'Zero Bubble',
      concept: 'Split backward exposes input-gradient and weight-gradient work as separate blocks.',
      objective: 'Place W after B and watch activation memory release at weight-gradient time.',
      patternLabel: 'Split B/W',
      introducedModel: ['input-gradient work', 'weight-gradient work', 'release on W'],
    },
  },
  'zero-bubble-h1': {
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
    coaching: { readySet: true, suggest: true, auto: true },
    masteryTargets: [
      { metric: 'makespan', op: '<=', value: 10 },
      { metric: 'intentionalIdle', op: '<=', value: 0 },
      { metric: 'internalBubbleRatio', op: '<=', value: 0 },
      { metric: 'peakActivationMemory', op: '<=', value: 3 },
    ],
    algorithm: {
      family: 'zero-bubble',
      setTitle: 'Zero Bubble',
      concept: 'Keep W blocks available so local idle can be filled after input gradients clear.',
      objective: 'Use a short warmup, then drain B and W without leaving internal gaps.',
      patternLabel: 'ZB-H1',
      introducedModel: ['zero-bubble warmup', 'internal bubble', 'W fill'],
    },
  },
  'zero-bubble-h2': {
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
    coaching: { readySet: true, suggest: true, auto: true },
    masteryTargets: [
      { metric: 'makespan', op: '<=', value: 14 },
      { metric: 'intentionalIdle', op: '<=', value: 0 },
      { metric: 'internalBubbleRatio', op: '<=', value: 0.03 },
      { metric: 'peakActivationMemory', op: '<=', value: 4 },
    ],
    algorithm: {
      family: 'zero-bubble',
      setTitle: 'Zero Bubble',
      concept: 'A wider warmup changes which W blocks are useful bubble fillers.',
      objective: 'Compare the H2 reference order against H1 while keeping internal bubble low.',
      patternLabel: 'ZB-H2',
      introducedModel: ['warmup window', 'variant comparison', 'bubble filling'],
    },
  },
  'zero-bubble-deep': {
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
    coaching: { readySet: true, suggest: true, auto: true },
    masteryTargets: [
      { metric: 'makespan', op: '<=', value: 18 },
      { metric: 'intentionalIdle', op: '<=', value: 0 },
      { metric: 'internalBubbleRatio', op: '<=', value: 0.04 },
      { metric: 'peakActivationMemory', op: '<=', value: 5 },
    ],
    algorithm: {
      family: 'zero-bubble',
      setTitle: 'Zero Bubble',
      concept: 'Deeper pipelines expose more tail work, so W placement decides where gaps remain.',
      objective: 'Hold the low-bubble reference shape while draining a longer split-backward tail.',
      patternLabel: 'Zero Bubble Deep',
      introducedModel: ['deep warmup', 'tail drain', 'variant trade-off'],
    },
  },
  'group-the-pipe': {
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
    coaching: { readySet: true, suggest: true, auto: true },
    masteryTargets: [
      { metric: 'makespan', op: '<=', value: 24 },
      { metric: 'intentionalIdle', op: '<=', value: 0 },
      { metric: 'peakActivationMemory', op: '<=', value: 2 },
    ],
    algorithm: {
      family: 'grouped',
      setTitle: 'Grouped',
      concept: 'Group-major scheduling drains a small batch group before admitting the next one.',
      objective: 'Finish G0 before G1 while watching bubble and activation memory.',
      patternLabel: 'Group major',
      introducedModel: ['microbatch group', 'group-major order', 'group boundary'],
    },
  },
  'bf-pp-pressure': {
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
    coaching: { readySet: true, suggest: true, auto: true },
    masteryTargets: [
      { metric: 'makespan', op: '<=', value: 36 },
      { metric: 'intentionalIdle', op: '<=', value: 0 },
      { metric: 'peakActivationMemory', op: '<=', value: 2 },
    ],
    algorithm: {
      family: 'grouped',
      setTitle: 'Grouped',
      concept: 'Small groups keep activation pressure bounded while preserving a repeatable order.',
      objective: 'Use group-major placement to stay under the memory cap without FSDP claims.',
      patternLabel: 'BF-PP',
      introducedModel: ['bounded group', 'activation pressure', 'policy-relative comparison'],
    },
  },
  'gather-once-reuse': {
    id: 'gather-once-reuse',
    version: 1,
    title: 'Gather Once, Reuse',
    rankCount: 2,
    stageCount: 2,
    microbatchCount: 2,
    durations: { F: 1, B: 2 },
    memoryCaps: [3, 3],
    residencyModel: { weightUnit: 1 },
    coaching: { readySet: true, suggest: true, auto: true },
    masteryTargets: [
      { metric: 'makespan', op: '<=', value: 9 },
      { metric: 'intentionalIdle', op: '<=', value: 0 },
      { metric: 'peakActivationMemory', op: '<=', value: 2 },
      { metric: 'allGatherCount', op: '<=', value: 2 },
    ],
    algorithm: {
      family: 'fsdp-residency',
      setTitle: 'FSDP Residency',
      concept:
        'A forward block gathers its stage weights once, then later forwards can reuse them.',
      objective: 'Place same-stage forwards close enough to reuse resident weights.',
      patternLabel: 'Reuse',
      introducedModel: ['weight residency', 'all-gather count', 'reuse'],
    },
  },
  'group-too-wide': {
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
    coaching: { readySet: true, suggest: true, auto: true },
    masteryTargets: [
      { metric: 'makespan', op: '<=', value: 24 },
      { metric: 'intentionalIdle', op: '<=', value: 0 },
      { metric: 'peakActivationMemory', op: '<=', value: 2 },
      { metric: 'allGatherCount', op: '<=', value: 6 },
    ],
    algorithm: {
      family: 'fsdp-residency',
      setTitle: 'FSDP Residency',
      concept: 'A wide forward group can run out of room once activations and weights share a cap.',
      objective: 'Drain one microbatch before admitting the next wide group.',
      patternLabel: 'Cap-aware',
      introducedModel: ['combined memory cap', 'durationless eviction', 'group width'],
    },
  },
  'regather-storm': {
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
    coaching: { readySet: true, suggest: true, auto: true },
    masteryTargets: [
      { metric: 'makespan', op: '<=', value: 36 },
      { metric: 'intentionalIdle', op: '<=', value: 0 },
      { metric: 'peakActivationMemory', op: '<=', value: 4 },
      { metric: 'allGatherCount', op: '<=', value: 6 },
    ],
    algorithm: {
      family: 'fsdp-residency',
      setTitle: 'FSDP Residency',
      concept: 'Switching between resident virtual stages too often creates extra gathers.',
      objective: 'Group work enough to reduce regathers while keeping the schedule compact.',
      patternLabel: 'Gather-aware',
      introducedModel: ['regather', 'residency pressure', 'communication trade-off'],
    },
  },
  'two-directions': {
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
    coaching: { readySet: true, suggest: true, auto: true },
    masteryTargets: [
      { metric: 'makespan', op: '<=', value: 6 },
      { metric: 'intentionalIdle', op: '<=', value: 0 },
      { metric: 'peakActivationMemory', op: '<=', value: 2 },
    ],
    algorithm: {
      family: 'dualpipe',
      setTitle: 'DualPipe',
      concept: 'Two directions carry independent microbatches through the same rank lanes.',
      objective: 'Place Up and Down blocks while keeping the code shape F0:S0:D0.',
      patternLabel: 'Bidirectional',
      introducedModel: ['direction cue', 'opposite stage flow', 'direction-bearing ID'],
    },
  },
  'dualpipe-balance': {
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
    coaching: { readySet: true, suggest: true, auto: true },
    masteryTargets: [
      { metric: 'makespan', op: '<=', value: 9 },
      { metric: 'intentionalIdle', op: '<=', value: 0 },
      { metric: 'peakActivationMemory', op: '<=', value: 4 },
    ],
    algorithm: {
      family: 'dualpipe',
      setTitle: 'DualPipe',
      concept: 'Opposite-direction work can share a rank lane when the resource model allows it.',
      objective: 'Overlap Up and Down blocks to beat the one-direction baseline.',
      patternLabel: 'Balanced',
      introducedModel: ['bidirectional overlap', 'shared rank capacity', 'baseline comparison'],
    },
  },
  'dualpipe-conflict': {
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
    coaching: { readySet: true, suggest: true, auto: true },
    masteryTargets: [
      { metric: 'makespan', op: '<=', value: 12 },
      { metric: 'intentionalIdle', op: '<=', value: 0 },
      { metric: 'peakActivationMemory', op: '<=', value: 4 },
    ],
    algorithm: {
      family: 'dualpipe',
      setTitle: 'DualPipe',
      concept: 'A shared capacity of one turns apparent pairs back into serialized work.',
      objective: 'Read the resource conflict and still complete the bidirectional schedule.',
      patternLabel: 'Capacity 1',
      introducedModel: ['resource conflict', 'shared capacity', 'forced serialization'],
    },
  },
} satisfies Record<LevelId, LevelConfig>;

const EXPECTED_MASTERED_ACTIONS = {
  'dependency-chain': ['F:0:0', 'F:1:0', 'B:1:0', 'B:0:0'],
  'fill-the-pipe': [
    'F:0:0',
    'F:0:1',
    'F:0:2',
    'F:1:0',
    'F:1:1',
    'F:1:2',
    'B:1:0',
    'B:0:0',
    'B:1:1',
    'B:0:1',
    'B:1:2',
    'B:0:2',
  ],
  'backward-is-heavier': [
    'F:0:0',
    'F:0:1',
    'F:0:2',
    'F:1:0',
    'F:1:1',
    'F:1:2',
    'F:2:0',
    'F:2:1',
    'F:2:2',
    'B:2:0',
    'B:1:0',
    'B:0:0',
    'B:2:1',
    'B:1:1',
    'B:0:1',
    'B:2:2',
    'B:1:2',
    'B:0:2',
  ],
  'memory-wall': [
    'F:0:0',
    'F:0:1',
    'F:0:2',
    'F:1:0',
    'F:1:1',
    'F:2:0',
    'B:2:0',
    'B:1:0',
    'B:0:0',
    'F:0:3',
    'F:1:2',
    'F:2:1',
    'B:2:1',
    'B:1:1',
    'B:0:1',
    'F:1:3',
    'F:2:2',
    'B:2:2',
    'B:1:2',
    'B:0:2',
    'F:2:3',
    'B:2:3',
    'B:1:3',
    'B:0:3',
  ],
  'gpipe-afab': [
    'F:0:0',
    'F:0:1',
    'F:0:2',
    'F:0:3',
    'F:1:0',
    'F:1:1',
    'F:1:2',
    'F:1:3',
    'F:2:0',
    'F:2:1',
    'F:2:2',
    'F:2:3',
    'B:2:0',
    'B:1:0',
    'B:0:0',
    'B:2:1',
    'B:1:1',
    'B:0:1',
    'B:2:2',
    'B:1:2',
    'B:0:2',
    'B:2:3',
    'B:1:3',
    'B:0:3',
  ],
  'warm-up-then-alternate': [
    'F:0:0',
    'F:0:1',
    'F:0:2',
    'F:1:0',
    'F:1:1',
    'F:2:0',
    'B:2:0',
    'B:1:0',
    'B:0:0',
    'F:0:3',
    'F:1:2',
    'F:2:1',
    'B:2:1',
    'B:1:1',
    'B:0:1',
    'F:1:3',
    'F:2:2',
    'B:2:2',
    'B:1:2',
    'B:0:2',
    'F:2:3',
    'B:2:3',
    'B:1:3',
    'B:0:3',
  ],
  'tie-at-the-frontier': [
    'F:0:0',
    'F:0:1',
    'F:1:0',
    'B:1:0',
    'B:0:0',
    'F:0:2',
    'F:1:1',
    'B:1:1',
    'B:0:1',
    'F:0:3',
    'F:1:2',
    'B:1:2',
    'B:0:2',
    'F:1:3',
    'B:1:3',
    'B:0:3',
  ],
  'memory-capped-one-f-one-b': [
    'F:0:0',
    'F:0:1',
    'F:0:2',
    'F:1:0',
    'F:1:1',
    'F:2:0',
    'B:2:0',
    'B:1:0',
    'B:0:0',
    'F:0:3',
    'F:1:2',
    'F:2:1',
    'B:2:1',
    'B:1:1',
    'B:0:1',
    'F:0:4',
    'F:1:3',
    'F:2:2',
    'B:2:2',
    'B:1:2',
    'B:0:2',
    'F:1:4',
    'F:2:3',
    'B:2:3',
    'B:1:3',
    'B:0:3',
    'F:2:4',
    'B:2:4',
    'B:1:4',
    'B:0:4',
  ],
  'stamp-the-pattern': [
    'F:0:0',
    'F:1:0',
    'B:1:0',
    { type: 'wait', rank: 0 },
    { type: 'wait', rank: 0 },
    'F:0:1',
    'B:0:0',
    'F:1:1',
    'B:1:1',
    'F:0:2',
    'B:0:1',
    'F:1:2',
    'B:1:2',
    'B:0:2',
  ],
  'virtual-stages': [
    'F:0:0',
    'F:0:1',
    'F:1:0',
    'F:2:0',
    'F:3:0',
    'B:3:0',
    'F:1:1',
    'F:2:1',
    'F:3:1',
    'B:3:1',
    'B:2:0',
    'B:1:0',
    'B:0:0',
    'B:2:1',
    'B:1:1',
    'B:0:1',
  ],
  'interleaved-one-f-one-b': [
    'F:0:0',
    'F:0:1',
    'F:1:0',
    'F:2:0',
    'F:3:0',
    'B:3:0',
    'F:1:1',
    'F:2:1',
    'F:3:1',
    'B:3:1',
    'F:0:2',
    'F:1:2',
    'F:2:2',
    'F:3:2',
    'B:3:2',
    'B:2:0',
    'B:1:0',
    'B:0:0',
    'B:2:1',
    'B:1:1',
    'B:0:1',
    'B:2:2',
    'B:1:2',
    'B:0:2',
  ],
  'ragged-rounds': [
    'F:0:0',
    'F:0:1',
    'F:1:0',
    'F:2:0',
    'F:3:0',
    'B:3:0',
    'F:1:1',
    'F:2:1',
    'F:3:1',
    'B:3:1',
    'F:0:2',
    'F:1:2',
    'F:2:2',
    'F:3:2',
    'B:3:2',
    'F:0:3',
    'F:1:3',
    'F:2:3',
    'F:3:3',
    'B:3:3',
    'F:0:4',
    'F:1:4',
    'F:2:4',
    'F:3:4',
    'B:3:4',
    'B:2:0',
    'B:1:0',
    'B:0:0',
    'B:2:1',
    'B:1:1',
    'B:0:1',
    'B:2:2',
    'B:1:2',
    'B:0:2',
    'B:2:3',
    'B:1:3',
    'B:0:3',
    'B:2:4',
    'B:1:4',
    'B:0:4',
  ],
  'heavy-backward-tail': [
    'F:0:0',
    'F:0:1',
    'F:1:0',
    'F:2:0',
    'F:3:0',
    'B:3:0',
    'F:1:1',
    'F:2:1',
    'F:3:1',
    'B:3:1',
    'F:0:2',
    'F:1:2',
    'F:2:2',
    'F:3:2',
    'B:3:2',
    'B:2:0',
    'B:1:0',
    'B:0:0',
    'B:2:1',
    'B:1:1',
    'B:0:1',
    'B:2:2',
    'B:1:2',
    'B:0:2',
  ],
  'split-backward': [
    'F:0:0',
    'F:0:1',
    'F:1:0',
    'B:1:0',
    'B:0:0',
    'F:1:1',
    'W:0:0',
    'B:1:1',
    'B:0:1',
    'W:1:0',
    'W:0:1',
    'W:1:1',
  ],
  'zero-bubble-h1': [
    'F:0:0',
    'F:1:0',
    'F:0:1',
    'B:1:0',
    'F:0:2',
    'B:0:0',
    'F:1:1',
    'B:1:1',
    'W:0:0',
    'B:0:1',
    'F:1:2',
    'B:1:2',
    'W:0:1',
    'B:0:2',
    'W:1:0',
    'W:1:1',
    'W:0:2',
    'W:1:2',
  ],
  'zero-bubble-h2': [
    'F:0:0',
    'F:0:1',
    'F:0:2',
    'F:1:0',
    'F:2:0',
    'F:1:1',
    'B:2:0',
    'F:1:2',
    'F:0:3',
    'B:1:0',
    'F:2:1',
    'B:0:0',
    'B:2:1',
    'F:1:3',
    'B:1:1',
    'F:2:2',
    'W:0:0',
    'B:0:1',
    'B:2:2',
    'W:1:0',
    'B:1:2',
    'F:2:3',
    'W:0:1',
    'B:0:2',
    'B:2:3',
    'W:1:1',
    'B:1:3',
    'W:2:0',
    'W:0:2',
    'B:0:3',
    'W:2:1',
    'W:1:2',
    'W:2:2',
    'W:1:3',
    'W:0:3',
    'W:2:3',
  ],
  'zero-bubble-deep': [
    'F:0:0',
    'F:0:1',
    'F:0:2',
    'F:0:3',
    'F:0:4',
    'F:1:0',
    'F:2:0',
    'F:1:1',
    'F:3:0',
    'F:2:1',
    'F:1:2',
    'B:3:0',
    'F:2:2',
    'F:1:3',
    'B:2:0',
    'F:3:1',
    'F:1:4',
    'B:1:0',
    'B:3:1',
    'F:2:3',
    'B:0:0',
    'B:2:1',
    'F:3:2',
    'W:1:0',
    'B:1:1',
    'B:3:2',
    'F:2:4',
    'W:0:0',
    'B:0:1',
    'B:2:2',
    'F:3:3',
    'W:1:1',
    'B:1:2',
    'B:3:3',
    'W:2:0',
    'W:0:1',
    'B:0:2',
    'B:2:3',
    'F:3:4',
    'W:1:2',
    'B:1:3',
    'B:3:4',
    'W:2:1',
    'W:0:2',
    'B:0:3',
    'B:2:4',
    'W:3:0',
    'W:1:3',
    'B:1:4',
    'W:3:1',
    'W:2:2',
    'W:0:3',
    'B:0:4',
    'W:3:2',
    'W:2:3',
    'W:1:4',
    'W:3:3',
    'W:2:4',
    'W:0:4',
    'W:3:4',
  ],
  'group-the-pipe': [
    'F:0:0',
    'F:0:1',
    'F:1:0',
    'F:1:1',
    'F:2:0',
    'F:2:1',
    'B:2:0',
    'B:2:1',
    'B:1:0',
    'B:1:1',
    'B:0:0',
    'B:0:1',
    'F:0:2',
    'F:0:3',
    'F:1:2',
    'F:1:3',
    'F:2:2',
    'F:2:3',
    'B:2:2',
    'B:2:3',
    'B:1:2',
    'B:1:3',
    'B:0:2',
    'B:0:3',
  ],
  'bf-pp-pressure': [
    'F:0:0',
    'F:0:1',
    'F:1:0',
    'F:1:1',
    'F:2:0',
    'F:2:1',
    'B:2:0',
    'B:2:1',
    'B:1:0',
    'B:1:1',
    'B:0:0',
    'B:0:1',
    'F:0:2',
    'F:0:3',
    'F:1:2',
    'F:1:3',
    'F:2:2',
    'F:2:3',
    'B:2:2',
    'B:2:3',
    'B:1:2',
    'B:1:3',
    'B:0:2',
    'B:0:3',
    'F:0:4',
    'F:0:5',
    'F:1:4',
    'F:1:5',
    'F:2:4',
    'F:2:5',
    'B:2:4',
    'B:2:5',
    'B:1:4',
    'B:1:5',
    'B:0:4',
    'B:0:5',
  ],
  'gather-once-reuse': ['F:0:0', 'F:0:1', 'F:1:0', 'B:1:0', 'B:0:0', 'F:1:1', 'B:1:1', 'B:0:1'],
  'group-too-wide': [
    'F:0:0',
    'F:1:0',
    'F:2:0',
    'F:3:0',
    'B:3:0',
    'B:2:0',
    'B:1:0',
    'B:0:0',
    'F:0:1',
    'F:1:1',
    'F:2:1',
    'F:3:1',
    'B:3:1',
    'B:2:1',
    'B:1:1',
    'B:0:1',
  ],
  'regather-storm': [
    'F:0:0',
    'F:0:1',
    'F:1:0',
    'F:1:1',
    'F:2:0',
    'F:2:1',
    'F:3:0',
    'F:3:1',
    'B:3:0',
    'B:3:1',
    'B:2:0',
    'B:2:1',
    'B:1:0',
    'B:1:1',
    'B:0:0',
    'B:0:1',
    'F:0:2',
    'F:0:3',
    'F:1:2',
    'F:1:3',
    'F:2:2',
    'F:2:3',
    'F:3:2',
    'F:3:3',
    'B:3:2',
    'B:3:3',
    'B:2:2',
    'B:2:3',
    'B:1:2',
    'B:1:3',
    'B:0:2',
    'B:0:3',
  ],
  'two-directions': [
    'F:0:0:asc',
    'F:1:0:desc',
    'F:0:0:desc',
    'F:1:0:asc',
    'B:0:0:desc',
    'B:1:0:asc',
    'B:0:0:asc',
    'B:1:0:desc',
  ],
  'dualpipe-balance': [
    'F:0:0:asc',
    'F:1:0:desc',
    'F:0:0:desc',
    'F:1:0:asc',
    'F:0:1:asc',
    'F:1:1:desc',
    'F:0:1:desc',
    'F:1:1:asc',
    'B:0:0:desc',
    'B:1:0:asc',
    'B:0:0:asc',
    'B:1:0:desc',
    'B:0:1:desc',
    'B:1:1:asc',
    'B:0:1:asc',
    'B:1:1:desc',
  ],
  'dualpipe-conflict': [
    'F:0:0:asc',
    'F:1:0:desc',
    'F:0:0:desc',
    'F:1:0:asc',
    'F:0:1:asc',
    'F:1:1:desc',
    'F:0:1:desc',
    'F:1:1:asc',
    'B:0:0:desc',
    'B:1:0:asc',
    'B:0:0:asc',
    'B:1:0:desc',
    'B:0:1:desc',
    'B:1:1:asc',
    'B:0:1:asc',
    'B:1:1:desc',
  ],
} satisfies Record<LevelId, readonly (OperationId | Action)[]>;

interface ExpectedGoldenRow {
  readonly makespan: number;
  readonly intentionalIdle: number;
  readonly bubbleRatio: number;
  readonly internalBubbleRatio?: number;
  readonly peakActivationMemoryByRank: readonly number[];
  readonly peakActivationMemory: number;
  readonly allGatherCount?: number;
}

const EXPECTED_GOLDEN_ROWS: Record<LevelId, ExpectedGoldenRow> = {
  'dependency-chain': {
    makespan: 6,
    intentionalIdle: 0,
    bubbleRatio: 0.5,
    peakActivationMemoryByRank: [1, 1],
    peakActivationMemory: 1,
  },
  'fill-the-pipe': {
    makespan: 12,
    intentionalIdle: 0,
    bubbleRatio: 0.25,
    peakActivationMemoryByRank: [3, 3],
    peakActivationMemory: 3,
  },
  'backward-is-heavier': {
    makespan: 15,
    intentionalIdle: 0,
    bubbleRatio: 0.4,
    peakActivationMemoryByRank: [3, 3, 3],
    peakActivationMemory: 3,
  },
  'memory-wall': {
    makespan: 18,
    intentionalIdle: 0,
    bubbleRatio: 1 / 3,
    peakActivationMemoryByRank: [3, 2, 1],
    peakActivationMemory: 3,
  },
  'gpipe-afab': {
    makespan: 18,
    intentionalIdle: 0,
    bubbleRatio: 1 / 3,
    peakActivationMemoryByRank: [4, 4, 4],
    peakActivationMemory: 4,
  },
  'warm-up-then-alternate': {
    makespan: 18,
    intentionalIdle: 0,
    bubbleRatio: 1 / 3,
    peakActivationMemoryByRank: [3, 2, 1],
    peakActivationMemory: 3,
  },
  'tie-at-the-frontier': {
    makespan: 15,
    intentionalIdle: 0,
    bubbleRatio: 0.2,
    peakActivationMemoryByRank: [2, 1],
    peakActivationMemory: 2,
  },
  'memory-capped-one-f-one-b': {
    makespan: 21,
    intentionalIdle: 0,
    bubbleRatio: 2 / 7,
    peakActivationMemoryByRank: [3, 2, 1],
    peakActivationMemory: 3,
  },
  'stamp-the-pattern': {
    makespan: 12,
    intentionalIdle: 2,
    bubbleRatio: 0.25,
    peakActivationMemoryByRank: [2, 1],
    peakActivationMemory: 2,
  },
  'virtual-stages': {
    makespan: 16,
    intentionalIdle: 0,
    bubbleRatio: 0.25,
    peakActivationMemoryByRank: [3, 4],
    peakActivationMemory: 4,
  },
  'interleaved-one-f-one-b': {
    makespan: 26,
    intentionalIdle: 0,
    bubbleRatio: 4 / 13,
    peakActivationMemoryByRank: [4, 6],
    peakActivationMemory: 6,
  },
  'ragged-rounds': {
    makespan: 46,
    intentionalIdle: 0,
    bubbleRatio: 8 / 23,
    peakActivationMemoryByRank: [6, 10],
    peakActivationMemory: 10,
  },
  'heavy-backward-tail': {
    makespan: 28,
    intentionalIdle: 0,
    bubbleRatio: 0.25,
    peakActivationMemoryByRank: [4, 6],
    peakActivationMemory: 6,
  },
  'split-backward': {
    makespan: 7,
    intentionalIdle: 0,
    bubbleRatio: 1 / 7,
    peakActivationMemoryByRank: [2, 2],
    peakActivationMemory: 2,
  },
  'zero-bubble-h1': {
    makespan: 10,
    intentionalIdle: 0,
    bubbleRatio: 0.1,
    internalBubbleRatio: 0,
    peakActivationMemoryByRank: [3, 3],
    peakActivationMemory: 3,
  },
  'zero-bubble-h2': {
    makespan: 14,
    intentionalIdle: 0,
    bubbleRatio: 1 / 7,
    internalBubbleRatio: 1 / 37,
    peakActivationMemoryByRank: [4, 4, 4],
    peakActivationMemory: 4,
  },
  'zero-bubble-deep': {
    makespan: 18,
    intentionalIdle: 0,
    bubbleRatio: 1 / 6,
    internalBubbleRatio: 1 / 31,
    peakActivationMemoryByRank: [5, 5, 5, 5],
    peakActivationMemory: 5,
  },
  'group-the-pipe': {
    makespan: 24,
    intentionalIdle: 0,
    bubbleRatio: 0.5,
    peakActivationMemoryByRank: [2, 2, 2],
    peakActivationMemory: 2,
  },
  'bf-pp-pressure': {
    makespan: 36,
    intentionalIdle: 0,
    bubbleRatio: 0.5,
    peakActivationMemoryByRank: [2, 2, 2],
    peakActivationMemory: 2,
  },
  'gather-once-reuse': {
    makespan: 9,
    intentionalIdle: 0,
    bubbleRatio: 1 / 3,
    peakActivationMemoryByRank: [2, 1],
    peakActivationMemory: 2,
    allGatherCount: 2,
  },
  'group-too-wide': {
    makespan: 24,
    intentionalIdle: 0,
    bubbleRatio: 0.5,
    peakActivationMemoryByRank: [2, 2],
    peakActivationMemory: 2,
    allGatherCount: 6,
  },
  'regather-storm': {
    makespan: 36,
    intentionalIdle: 0,
    bubbleRatio: 1 / 3,
    peakActivationMemoryByRank: [4, 4],
    peakActivationMemory: 4,
    allGatherCount: 6,
  },
  'two-directions': {
    makespan: 6,
    intentionalIdle: 0,
    bubbleRatio: 0.5,
    peakActivationMemoryByRank: [2, 2],
    peakActivationMemory: 2,
  },
  'dualpipe-balance': {
    makespan: 9,
    intentionalIdle: 0,
    bubbleRatio: 1 / 3,
    peakActivationMemoryByRank: [4, 4],
    peakActivationMemory: 4,
  },
  'dualpipe-conflict': {
    makespan: 12,
    intentionalIdle: 0,
    bubbleRatio: 0,
    peakActivationMemoryByRank: [4, 4],
    peakActivationMemory: 4,
  },
};

function isMetricTarget(target: MasteryTarget): target is MetricMasteryTarget {
  return 'metric' in target;
}

describe('levels public API', () => {
  it('exports LEVEL_IDS in the approved order and getLevel lookups', () => {
    expect(LEVEL_IDS).toEqual(EXPECTED_LEVEL_IDS);

    for (const id of EXPECTED_LEVEL_IDS) {
      expect(getLevel(id)).toEqual(EXPECTED_CONFIGS[id]);
    }
  });

  it('throws a clear error for runtime misuse with an unknown id', () => {
    expect(() => getLevel('unknown-level' as LevelId)).toThrow(/unknown level/i);
  });

  it('exports metadata for every current curriculum level', () => {
    for (const id of LEVEL_IDS) {
      const level = getLevel(id);

      expect(level.algorithm).toEqual(
        expect.objectContaining({
          family: expect.any(String),
          setTitle: expect.any(String),
          concept: expect.any(String),
          objective: expect.any(String),
          introducedModel: expect.any(Array),
        }),
      );
      expect(level.algorithm.setTitle.trim().length).toBeGreaterThan(0);
      expect(level.algorithm.concept.trim().length).toBeGreaterThan(0);
      expect(level.algorithm.objective.trim().length).toBeGreaterThan(0);
      expect(Object.isFrozen(level.algorithm)).toBe(true);
      expect(Object.isFrozen(level.algorithm.introducedModel)).toBe(true);
    }
  });

  it('exports curriculum set groups in first-seen order', () => {
    const groups = LEVEL_IDS.reduce<string[]>((seen, id) => {
      const setTitle = getLevel(id).algorithm.setTitle;
      return seen.includes(setTitle) ? seen : [...seen, setTitle];
    }, []);

    expect(groups).toEqual(EXPECTED_LEVEL_GROUPS);
  });

  it('returns frozen canonical configs and nested structures', () => {
    const level = getLevel('memory-wall');

    expect(Object.isFrozen(level)).toBe(true);
    expect(Object.isFrozen(level.durations)).toBe(true);
    expect(Object.isFrozen(level.coaching)).toBe(true);
    expect(Object.isFrozen(level.masteryTargets)).toBe(true);
    expect(Object.isFrozen(level.masteryTargets[0]!)).toBe(true);
    expect(Object.isFrozen(level.memoryCaps)).toBe(true);

    expect(() => {
      (level as { rankCount: number }).rankCount = 99;
    }).toThrow();
    expect(() => {
      (level.durations as { F: number }).F = 99;
    }).toThrow();
    expect(() => {
      (level.coaching as { auto: boolean }).auto = false;
    }).toThrow();
    expect(() => {
      (
        level.masteryTargets as unknown as readonly [{ value: number }, ...{ value: number }[]]
      )[0]!.value = 99;
    }).toThrow();
    expect(() => {
      (level.memoryCaps as number[])[0] = 99;
    }).toThrow();

    expect(getLevel('memory-wall')).toEqual(EXPECTED_CONFIGS['memory-wall']);
  });

  it('freezes building-block metadata with the level config', () => {
    const level = getLevel('stamp-the-pattern');

    expect(Object.isFrozen(level.buildingBlock)).toBe(true);
    expect(Object.isFrozen(level.buildingBlock?.plan)).toBe(true);
    expect(Object.isFrozen(level.buildingBlock?.plan.trajectory)).toBe(true);
    expect(Object.isFrozen(level.buildingBlock?.plan.trajectory[0])).toBe(true);
    expect(getLevel('memory-capped-one-f-one-b').buildingBlock).toBeUndefined();
  });

  it('freezes topology metadata with the level config', () => {
    const level = getLevel('virtual-stages');

    expect(Object.isFrozen(level.topology)).toBe(true);
    expect(level.topology).toEqual({ placement: 'v-shape', virtualStagesPerRank: 2 });
  });

  it('freezes duration override metadata with the level config', () => {
    const level = getLevel('heavy-backward-tail');

    expect(Object.isFrozen(level.durationOverrides)).toBe(true);
    expect(Object.isFrozen(level.durationOverrides?.[0])).toBe(true);
    expect(level.durationOverrides).toEqual([{ kind: 'B', stage: 0, duration: 4 }]);
    expect(getLevel('ragged-rounds').durationOverrides).toBeUndefined();
  });

  it('freezes operation model metadata with the level config', () => {
    const level = getLevel('split-backward');

    expect(Object.isFrozen(level.operationModel)).toBe(true);
    expect(level.operationModel).toEqual({ backward: 'split' });
    expect(getLevel('heavy-backward-tail').operationModel).toBeUndefined();
  });

  it('freezes zero-bubble score and reference policy metadata with the level config', () => {
    const level = getLevel('zero-bubble-h2');

    expect(Object.isFrozen(level.scoreModel)).toBe(true);
    expect(Object.isFrozen(level.referencePolicy)).toBe(true);
    expect(Object.isFrozen(level.referencePolicy?.candidatePolicyIds)).toBe(true);
    expect(level.scoreModel).toEqual({ internalBubble: true });
    expect(level.referencePolicy).toEqual({
      candidatePolicyIds: ['zero-bubble-h2', 'zero-bubble-h1', 'zero-bubble-deep'],
    });
  });

  it('freezes grouped microbatch metadata with the level config', () => {
    const level = getLevel('group-the-pipe');

    expect(Object.isFrozen(level.microbatchGrouping)).toBe(true);
    expect(Object.isFrozen(level.microbatchGrouping?.groupLabels)).toBe(true);
    expect(level.microbatchGrouping).toEqual({ groupSize: 2, groupLabels: ['G0', 'G1'] });
    expect(level.referencePolicy).toEqual({
      candidatePolicyIds: ['group-major', 'one-f-one-b'],
      comparisonPolicyId: 'one-f-one-b',
    });
  });

  it('freezes DualPipe metadata with the level config', () => {
    const level = getLevel('dualpipe-balance');

    expect(Object.isFrozen(level.dualPipeModel)).toBe(true);
    expect(Object.isFrozen(level.dualPipeModel?.directions)).toBe(true);
    expect(Object.isFrozen(level.dualPipeModel?.resourceModel)).toBe(true);
    expect(Object.isFrozen(level.referencePolicy)).toBe(true);
    expect(Object.isFrozen(level.referencePolicy?.candidatePolicyIds)).toBe(true);
    expect(level.dualPipeModel).toEqual({
      enabled: true,
      directions: ['asc', 'desc'],
      resourceModel: { directionalSlots: 1, sharedCapacity: 2 },
    });
    expect(level.referencePolicy).toEqual({
      candidatePolicyIds: ['dualpipe-balanced', 'dualpipe-one-direction'],
      comparisonPolicyId: 'dualpipe-one-direction',
    });
  });
});

describe('golden fixtures', () => {
  it('exports exact mastered and legal action logs', () => {
    expect(Object.keys(MASTERED_ACTIONS)).toEqual(EXPECTED_LEVEL_IDS);
    expect(Object.keys(LEGAL_ACTIONS)).toEqual(EXPECTED_LEVEL_IDS);

    for (const id of EXPECTED_LEVEL_IDS) {
      const expectedMastered = EXPECTED_MASTERED_ACTIONS[id].map((action): Action =>
        typeof action === 'string' ? { type: 'place', operationId: action } : action,
      );

      expect(MASTERED_ACTIONS[id]).toEqual(expectedMastered);
      expect(LEGAL_ACTIONS[id]).toEqual([{ type: 'wait', rank: 0 }, ...expectedMastered]);
    }
  });

  it('freezes fixture records, arrays, and contained actions', () => {
    expect(Object.isFrozen(MASTERED_ACTIONS)).toBe(true);
    expect(Object.isFrozen(LEGAL_ACTIONS)).toBe(true);

    for (const id of EXPECTED_LEVEL_IDS) {
      expect(Object.isFrozen(MASTERED_ACTIONS[id])).toBe(true);
      expect(Object.isFrozen(MASTERED_ACTIONS[id]![0]!)).toBe(true);
      expect(Object.isFrozen(LEGAL_ACTIONS[id])).toBe(true);
      expect(Object.isFrozen(LEGAL_ACTIONS[id]![0]!)).toBe(true);
    }

    expect(() => {
      (MASTERED_ACTIONS['dependency-chain'] as Action[]).push({
        type: 'place',
        operationId: 'F:0:0',
      });
    }).toThrow();
    expect(() => {
      (LEGAL_ACTIONS['dependency-chain'] as Action[])[0] = { type: 'wait', rank: 1 };
    }).toThrow();
  });
});

describe('golden replay outcomes', () => {
  it('replays every mastered fixture to the exact golden row and mastery result', () => {
    for (const id of EXPECTED_LEVEL_IDS) {
      const replayResult = replay(getLevel(id), MASTERED_ACTIONS[id]!);
      expect(replayResult.ok).toBe(true);
      if (!replayResult.ok) {
        continue;
      }

      const result = score(replayResult.state);
      const expectedRow = EXPECTED_GOLDEN_ROWS[id];

      expect(result.complete).toBe(true);
      expect(result.mastered).toBe(true);
      expect(result.makespan).toBe(expectedRow.makespan);
      expect(result.bubbleRatio).toBeCloseTo(expectedRow.bubbleRatio, 10);
      if (expectedRow.internalBubbleRatio === undefined) {
        expect(result.internalBubbleRatio).toBeUndefined();
      } else {
        expect(result.internalBubbleRatio).toBeCloseTo(expectedRow.internalBubbleRatio, 10);
      }
      expect(result.intentionalIdle).toBe(expectedRow.intentionalIdle);
      expect(result.peakActivationMemoryByRank).toEqual(expectedRow.peakActivationMemoryByRank);
      expect(result.peakActivationMemory).toBe(expectedRow.peakActivationMemory);
      expect(result.allGatherCount).toBe(expectedRow.allGatherCount);
    }
  });

  it('does not master GPipe AFAB with a 1F1B-shaped schedule', () => {
    const replayResult = replay(getLevel('gpipe-afab'), MASTERED_ACTIONS['warm-up-then-alternate']);

    expect(replayResult.ok).toBe(true);
    if (!replayResult.ok) {
      return;
    }

    const result = score(replayResult.state);

    expect(result.complete).toBe(true);
    expect(result.makespan).toBe(18);
    expect(result.intentionalIdle).toBe(0);
    expect(result.peakActivationMemory).toBe(3);
    expect(result.mastered).toBe(false);
  });

  it('ensures each mastered fixture covers the exact operation inventory once', () => {
    for (const id of EXPECTED_LEVEL_IDS) {
      const config = getLevel(id);
      const actions = MASTERED_ACTIONS[id]!;
      const inventory = initialState(config).operations.map((operation) => operation.id);
      const expectedCount = inventory.length;
      const placedIds = actions
        .filter((action): action is Extract<Action, { type: 'place' }> => action.type === 'place')
        .map((action) => action.operationId);

      expect(placedIds).toHaveLength(expectedCount);
      expect([...placedIds].sort()).toEqual([...inventory].sort());
      expect(new Set(placedIds).size).toBe(inventory.length);

      if (id !== 'stamp-the-pattern') {
        expect(actions).toHaveLength(expectedCount);
      }
    }
  });

  it('replays every legal fixture as complete and legal but not mastered', () => {
    for (const id of EXPECTED_LEVEL_IDS) {
      const config = getLevel(id);
      const replayResult = replay(config, LEGAL_ACTIONS[id]!);
      expect(replayResult.ok).toBe(true);
      if (!replayResult.ok) {
        continue;
      }

      const result = score(replayResult.state);
      const goldenRow = EXPECTED_GOLDEN_ROWS[id];
      const metricTargets = config.masteryTargets.filter(isMetricTarget);
      const makespanTarget = metricTargets.find((target) => target.metric === 'makespan');
      const idleTarget = metricTargets.find((target) => target.metric === 'intentionalIdle');

      expect(result.complete).toBe(true);
      expect(result.mastered).toBe(false);
      expect(result.makespan).toBe(goldenRow.makespan + 1);
      expect(result.intentionalIdle).toBe(goldenRow.intentionalIdle + 1);
      expect(makespanTarget).toBeDefined();
      expect(idleTarget).toBeDefined();
      expect(result.makespan).toBeGreaterThan(makespanTarget!.value);
      expect(result.intentionalIdle).toBeGreaterThan(idleTarget!.value);
    }
  });
});
