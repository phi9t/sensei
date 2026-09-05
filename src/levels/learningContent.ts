import type { AlgorithmFamily, LevelConfig } from '../engine/types';

interface AlgorithmStep {
  readonly title: string;
  readonly explanation: string;
}

interface LearningContent {
  readonly question: string;
  readonly idea: string;
  readonly tradeoff: string;
  readonly steps: readonly AlgorithmStep[];
  readonly reading: string;
  readonly practice: string;
}

const buildingBlock: LearningContent = {
  question: 'Can one small pattern explain a whole pipeline?',
  idea: 'A building block describes one microbatch. Repeating it at fixed offsets creates a schedule; stage placement decides which operations share a device.',
  tradeoff:
    'Tighter repetition can create resource conflicts. Longer activation lifetimes increase the amount of stored state.',
  steps: [
    {
      title: 'Trace one microbatch',
      explanation: 'Follow its forward and backward dependencies through the stages.',
    },
    {
      title: 'Repeat with an offset',
      explanation: 'Place copies on the same rank timeline and check for collisions.',
    },
    {
      title: 'Check the full schedule',
      explanation: 'Warmup, drain and memory caps still matter beyond the repeating region.',
    },
  ],
  reading:
    'Read §2–3 of Controllable Memory. Compare activation lifetimes and how V-shaped placement pairs stages on devices.',
  practice:
    'Inspect two stages sharing a rank. Which dependency is satisfied, but still has to wait for that rank?',
};

const grouped: LearningContent = {
  question: 'When is doing similar work together worthwhile?',
  idea: 'Breadth-first scheduling favors work at earlier stages across microbatches. With sharded parameters, several microbatches can use the same gathered weights.',
  tradeoff:
    'Parameter reuse can reduce repeated gathers, but more unfinished forwards can keep activations resident.',
  steps: [
    {
      title: 'Choose a group',
      explanation: 'Process compatible microbatches at a stage while its weights are available.',
    },
    {
      title: 'Advance the group',
      explanation: 'Respect each microbatch’s dependencies when moving to the next stage.',
    },
    {
      title: 'Check the tradeoff',
      explanation: 'Compare activation peaks and, in residency lessons, gather counts.',
    },
  ],
  reading:
    'Read §4 and the gradient-accumulation diagrams in Appendix C. Track when parameters are gathered and reused.',
  practice:
    'Try a different order within the available group. Does parameter reuse improve at the cost of more stored activations?',
};

const CONTENT: Readonly<Record<AlgorithmFamily, LearningContent>> = {
  foundations: {
    question: 'What has to finish before the next block can run?',
    idea: 'A stage is a piece of the model; a rank is the worker that runs it. A microbatch moves forward through the stages, then gradients travel backward.',
    tradeoff:
      'Different microbatches can keep different ranks busy. A free rank can still be waiting for data from another stage.',
    steps: [
      {
        title: 'Follow the data',
        explanation: 'A forward needs the preceding stage’s output for the same microbatch.',
      },
      {
        title: 'Follow the gradient',
        explanation:
          'Backward needs its forward and, except at the last stage, the next stage’s backward.',
      },
      {
        title: 'Use the available rank',
        explanation:
          'Choose a ready block. Sensei places it at the earliest legal time on its rank.',
      },
    ],
    reading:
      'Start with GPipe §2 and Figure 2. Follow one microbatch across devices before following several at once.',
    practice:
      'Select a block that cannot run yet. Follow its dependency buttons below, then place the missing work above.',
  },
  gpipe: {
    question: 'Why do more microbatches help fill the pipeline?',
    idea: 'GPipe schedules the batch’s forward work before its backward work. Microbatches overlap across stages during each sweep.',
    tradeoff:
      'Fill and drain leave idle regions. Outstanding forwards also retain activations until their backward work.',
    steps: [
      { title: 'Fill with forwards', explanation: 'Feed microbatches through the forward stages.' },
      {
        title: 'Run the backward sweep',
        explanation: 'Propagate gradients back through the pipeline.',
      },
      {
        title: 'Finish the batch',
        explanation:
          'The paper accumulates gradients before an update. This exercise ends at the scheduled backward work.',
      },
    ],
    reading:
      'Read GPipe §2, especially Figure 2 and the discussion of recomputation. Separate pipeline ordering from memory-saving recomputation.',
    practice:
      'Find the first and last idle regions. Could rearranging work remove them without violating a dependency?',
  },
  'one-f-one-b': {
    question: 'Why alternate forward and backward work?',
    idea: 'After warmup, 1F1B alternates forward and backward passes. Completing backwards sooner limits the number of outstanding forwards.',
    tradeoff: 'Activation pressure can fall even when the pipeline bubble stays the same.',
    steps: [
      {
        title: 'Warm up',
        explanation: 'Run enough forwards for backward work to become available.',
      },
      { title: 'Alternate', explanation: 'Schedule a forward and a backward in steady state.' },
      { title: 'Drain', explanation: 'Finish the remaining backwards.' },
    ],
    reading: 'Megatron-LM §2.2.1 and Figure 4 explain warmup, steady state and drain.',
    practice:
      'At a choice between F and B, predict which choice retains more activations. Place it, inspect memory, then Undo and try the other.',
  },
  'interleaved-one-f-one-b': {
    question: 'What changes when one rank owns several stages?',
    idea: 'Interleaving assigns multiple model chunks to each worker. A rank switches among its chunks while keeping their dependencies intact.',
    tradeoff:
      'Finer chunks can reduce bubbles, but introduce additional communication in real training.',
    steps: [
      {
        title: 'Map stages to ranks',
        explanation: 'Read the ownership labels above the timeline.',
      },
      { title: 'Interleave available work', explanation: 'Choose among chunks sharing a rank.' },
      {
        title: 'Inspect the tail',
        explanation: 'Check where dependencies leave the last ranks idle.',
      },
    ],
    reading: 'Megatron-LM §2.2.2 and Figure 4 contrast chunk placement and interleaved schedules.',
    practice:
      'Find two ready operations on the same rank. Try reversing their order and compare the final makespan.',
  },
  'building-block': buildingBlock,
  'zero-bubble': {
    question: 'Which part of backward must happen first?',
    idea: 'Split backward separates input gradients, B, from parameter gradients, W. Input gradients advance the backward chain; W can be postponed.',
    tradeoff:
      'Deferred W can fill gaps but still needs saved state. In this exercise the stored activation unit remains until W completes.',
    steps: [
      {
        title: 'Advance the critical dependency',
        explanation: 'Run ready B work to make the preceding stage’s backward available.',
      },
      {
        title: 'Use a gap for W',
        explanation: 'Schedule eligible W work when the rank would otherwise wait.',
      },
      {
        title: 'Check memory and the tail',
        explanation:
          'Deferral is useful only if memory fits and the unfinished W work does not create a longer tail.',
      },
    ],
    reading:
      'Read Zero Bubble §2 and Figure 3 for the split, then §4 for optimizer synchronization. A zero internal bubble alone is not an end-to-end training result.',
    practice:
      'Select B and follow the highlighted activation lifetime. Compare placing W immediately with deferring it until another gap.',
  },
  grouped,
  'fsdp-residency': {
    ...grouped,
    question: 'Can you reuse weights without running out of memory?',
    practice:
      'Select a forward and inspect its gather or reuse effect. Try staying on the same stage before switching, then compare gathers and the per-rank cap.',
  },
  dualpipe: {
    question: 'When can opposite directions actually overlap?',
    idea: 'DualPipe feeds work from both ends and overlaps compatible computation and communication phases. Direction alone does not make work compatible.',
    tradeoff:
      'This exercise isolates directional slots and shared capacity. Its blocks are abstract operations, not the paper’s kernel phases.',
    steps: [
      {
        title: 'Follow both directions',
        explanation: 'Up traverses increasing stage IDs; Down traverses decreasing stage IDs.',
      },
      {
        title: 'Check the shared resource',
        explanation: 'Each direction has a slot, but both also consume the rank’s shared capacity.',
      },
      {
        title: 'Explain a conflict',
        explanation:
          'Inspect a delayed block and distinguish dependency waiting from shared-resource waiting.',
      },
    ],
    reading:
      'Read DeepSeek-V3 §3.2.1. Figure 4 explains phase overlap; Figure 5 shows the bidirectional schedule. Keep those two scales separate.',
    practice:
      'Compare one Up block with a Down block on the same rank. Is their timing limited by dependencies or by shared capacity?',
  },
};

export function learningContentFor(level: LevelConfig): LearningContent {
  return level.topology?.placement === 'v-shape' ? buildingBlock : CONTENT[level.algorithm.family];
}
