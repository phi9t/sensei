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
} satisfies Record<LevelId, readonly (OperationId | Action)[]>;

const EXPECTED_GOLDEN_ROWS = {
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
} satisfies Record<
  LevelId,
  {
    makespan: number;
    intentionalIdle: number;
    bubbleRatio: number;
    peakActivationMemoryByRank: readonly number[];
    peakActivationMemory: number;
  }
>;

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
      expect(result.intentionalIdle).toBe(expectedRow.intentionalIdle);
      expect(result.peakActivationMemoryByRank).toEqual(expectedRow.peakActivationMemoryByRank);
      expect(result.peakActivationMemory).toBe(expectedRow.peakActivationMemory);
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
