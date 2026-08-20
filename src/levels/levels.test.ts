import { describe, expect, it } from 'vitest';
import { LEGAL_ACTIONS, MASTERED_ACTIONS } from './fixtures';
import { getLevel, LEVEL_IDS, type LevelId } from './levels';
import { initialState, replay } from '../engine/replay';
import { score } from '../engine/score';
import type { Action, LevelConfig, OperationId } from '../engine/types';

const EXPECTED_LEVEL_IDS = [
  'dependency-chain',
  'fill-the-pipe',
  'backward-is-heavier',
  'memory-wall',
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
  },
} satisfies Record<LevelId, LevelConfig>;

const EXPECTED_MASTERED_IDS = {
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
} satisfies Record<LevelId, readonly OperationId[]>;

const EXPECTED_GOLDEN_ROWS = {
  'dependency-chain': {
    makespan: 6,
    bubbleRatio: 0.5,
    peakActivationMemoryByRank: [1, 1],
    peakActivationMemory: 1,
  },
  'fill-the-pipe': {
    makespan: 12,
    bubbleRatio: 0.25,
    peakActivationMemoryByRank: [3, 3],
    peakActivationMemory: 3,
  },
  'backward-is-heavier': {
    makespan: 15,
    bubbleRatio: 0.4,
    peakActivationMemoryByRank: [3, 3, 3],
    peakActivationMemory: 3,
  },
  'memory-wall': {
    makespan: 18,
    bubbleRatio: 1 / 3,
    peakActivationMemoryByRank: [3, 2, 1],
    peakActivationMemory: 3,
  },
} satisfies Record<
  LevelId,
  {
    makespan: number;
    bubbleRatio: number;
    peakActivationMemoryByRank: readonly number[];
    peakActivationMemory: number;
  }
>;

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
});

describe('golden fixtures', () => {
  it('exports exact mastered and legal action logs', () => {
    expect(Object.keys(MASTERED_ACTIONS)).toEqual(EXPECTED_LEVEL_IDS);
    expect(Object.keys(LEGAL_ACTIONS)).toEqual(EXPECTED_LEVEL_IDS);

    for (const id of EXPECTED_LEVEL_IDS) {
      const expectedMastered = EXPECTED_MASTERED_IDS[id].map((operationId): Action => ({
        type: 'place',
        operationId,
      }));

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
      expect(result.intentionalIdle).toBe(0);
      expect(result.peakActivationMemoryByRank).toEqual(expectedRow.peakActivationMemoryByRank);
      expect(result.peakActivationMemory).toBe(expectedRow.peakActivationMemory);
    }
  });

  it('ensures each mastered fixture covers the exact operation inventory once', () => {
    for (const id of EXPECTED_LEVEL_IDS) {
      const config = getLevel(id);
      const actions = MASTERED_ACTIONS[id]!;
      const expectedCount = config.rankCount * config.microbatchCount * 2;
      const inventory = initialState(config).operations.map((operation) => operation.id);
      const placedIds = actions.map((action) => {
        expect(action.type).toBe('place');
        if (action.type !== 'place') {
          throw new Error('mastered fixtures must be place-only');
        }
        return action.operationId;
      });

      expect(actions).toHaveLength(expectedCount);
      expect([...placedIds].sort()).toEqual([...inventory].sort());
      expect(new Set(placedIds).size).toBe(inventory.length);
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
      const makespanTarget = config.masteryTargets.find((target) => target.metric === 'makespan');
      const idleTarget = config.masteryTargets.find(
        (target) => target.metric === 'intentionalIdle',
      );

      expect(result.complete).toBe(true);
      expect(result.mastered).toBe(false);
      expect(result.makespan).toBe(goldenRow.makespan + 1);
      expect(result.intentionalIdle).toBe(1);
      expect(makespanTarget).toBeDefined();
      expect(idleTarget).toBeDefined();
      expect(result.makespan).toBeGreaterThan(makespanTarget!.value);
      expect(result.intentionalIdle).toBeGreaterThan(idleTarget!.value);
    }
  });
});
