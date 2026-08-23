import { describe, expect, it } from 'vitest';
import {
  decodeAttempt,
  encodeAttempt,
  type DecodeAttemptFailure,
  type UrlAttemptPayload,
} from '../src/persistence/codec';
import {
  deserializeProgress,
  loadProgress,
  progressContaining,
  saveProgress,
  selectBest,
  serializeProgress,
  type StoredAttempt,
} from '../src/persistence/storage';
import { replay } from '../src/engine/replay';
import { attemptRankingTuple } from '../src/engine/score';
import type { Action } from '../src/engine/types';
import { deriveOperations } from '../src/engine/operations';
import { getLevel, type LevelId } from '../src/levels/levels';
import { LEGAL_ACTIONS, MASTERED_ACTIONS } from '../src/levels/fixtures';

const STORAGE_KEY = 'sensei.progress.v1';

function storedMasteredAttempt(levelId: LevelId = 'dependency-chain'): StoredAttempt {
  return attemptFromActions(levelId, MASTERED_ACTIONS[levelId]);
}

function storedLegalAttempt(levelId: LevelId = 'dependency-chain'): StoredAttempt {
  return attemptFromActions(levelId, LEGAL_ACTIONS[levelId]);
}

function attemptFromActions(levelId: LevelId, actions: readonly Action[]): StoredAttempt {
  const level = getLevel(levelId);
  const result = replay(level, actions);
  if (!result.ok) {
    throw new Error(`fixture replay failed at ${result.index}`);
  }
  const tuple = attemptRankingTuple(result.state);
  const outcome =
    result.state.placements.length === result.state.operations.length ? 'legal' : 'legal';
  return Object.freeze({
    levelId,
    levelVersion: level.version,
    actions: Object.freeze(actions.map(cloneAction)),
    outcome:
      result.state.placements.length === result.state.operations.length &&
      tuple.intentionalIdle === 0
        ? 'mastered'
        : outcome,
    tuple,
  });
}

function cloneAction(action: Action): Action {
  switch (action.type) {
    case 'place':
      return { type: 'place', operationId: action.operationId };
    case 'wait':
      return { type: 'wait', rank: action.rank };
  }
}

function encodeUnknown(payload: unknown): string {
  return encodeURIComponent(JSON.stringify(payload));
}

function memoryStorage(
  initial: string | null = null,
): Storage & { readonly writes: readonly string[] } {
  const values = new Map<string, string>();
  const writes: string[] = [];
  if (initial !== null) {
    values.set(STORAGE_KEY, initial);
  }
  return {
    get length() {
      return values.size;
    },
    get writes() {
      return writes;
    },
    clear() {
      values.clear();
    },
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    key(index: number) {
      return [...values.keys()][index] ?? null;
    },
    removeItem(key: string) {
      values.delete(key);
    },
    setItem(key: string, value: string) {
      writes.push(`${key}=${value}`);
      values.set(key, value);
    },
  };
}

function throwingStorage(kind: 'get' | 'set'): Storage {
  const delegate = memoryStorage();
  return {
    get length() {
      return delegate.length;
    },
    clear: delegate.clear.bind(delegate),
    key: delegate.key.bind(delegate),
    removeItem: delegate.removeItem.bind(delegate),
    getItem(key: string) {
      if (kind === 'get') {
        throw new DOMException('denied', 'SecurityError');
      }
      return delegate.getItem(key);
    },
    setItem(key: string, value: string) {
      if (kind === 'set') {
        throw new DOMException('full', 'QuotaExceededError');
      }
      delegate.setItem(key, value);
    },
  };
}

function expectDecodeReason(result: DecodeAttemptFailure, reason: DecodeAttemptFailure['reason']) {
  expect(result.reason).toBe(reason);
}

describe('URL attempt codec', () => {
  it('encodes exactly the numeric schema replay payload and decodes to nested attempt truth', () => {
    const actions = MASTERED_ACTIONS['dependency-chain'];
    const payload: UrlAttemptPayload = {
      schemaVersion: 1,
      levelId: 'dependency-chain',
      levelVersion: 1,
      actions,
    };

    const encoded = encodeAttempt(payload);

    expect(decodeURIComponent(encoded)).toBe(JSON.stringify(payload));
    const decoded = decodeAttempt(encoded, getLevel);
    expect(decoded).toMatchObject({ ok: true, attempt: { levelId: 'dependency-chain', actions } });
    if (decoded.ok) {
      expect(decoded.attempt.outcome).toBe('mastered');
      expect(decoded.attempt.tuple).toEqual({
        makespan: 6,
        peakActivationMemory: 1,
        intentionalIdle: 0,
        actionCount: 4,
      });
    }
  });

  it('round-trips attempts for the new current-engine curriculum levels', () => {
    for (const levelId of [
      'gpipe-afab',
      'warm-up-then-alternate',
      'tie-at-the-frontier',
      'memory-capped-one-f-one-b',
    ] as const) {
      const level = getLevel(levelId);
      const payload: UrlAttemptPayload = {
        schemaVersion: 1,
        levelId,
        levelVersion: level.version,
        actions: MASTERED_ACTIONS[levelId],
      };

      const decoded = decodeAttempt(encodeAttempt(payload), getLevel);

      expect(decoded.ok).toBe(true);
      if (decoded.ok) {
        expect(decoded.attempt.levelId).toBe(levelId);
        expect(decoded.attempt.outcome).toBe('mastered');
        expect(decoded.attempt.actions).toEqual(MASTERED_ACTIONS[levelId]);
      }
    }
  });

  it('encodes and decodes the stamped building-block attempt as expanded actions only', () => {
    const level = getLevel('stamp-the-pattern');
    const payload: UrlAttemptPayload = {
      schemaVersion: 1,
      levelId: 'stamp-the-pattern',
      levelVersion: level.version,
      actions: MASTERED_ACTIONS['stamp-the-pattern'],
    };

    const encoded = encodeAttempt(payload);
    const storedPayload = JSON.parse(decodeURIComponent(encoded)) as Record<string, unknown>;

    expect(Object.keys(storedPayload).sort()).toEqual(
      ['actions', 'levelId', 'levelVersion', 'schemaVersion'].sort(),
    );
    expect(storedPayload).not.toHaveProperty('buildingBlock');
    expect(storedPayload).not.toHaveProperty('trajectory');
    expect(storedPayload.actions).toEqual(MASTERED_ACTIONS['stamp-the-pattern']);

    const decoded = decodeAttempt(encoded, getLevel);

    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      expect(decoded.attempt.levelId).toBe('stamp-the-pattern');
      expect(decoded.attempt.outcome).toBe('mastered');
      expect(decoded.attempt.actions).toEqual(MASTERED_ACTIONS['stamp-the-pattern']);
      for (const action of decoded.attempt.actions) {
        expect(action).not.toHaveProperty('buildingBlock');
        expect(action).not.toHaveProperty('trajectory');
      }
    }
  });

  it('encodes and decodes virtual-stage attempts as expanded actions only', () => {
    const level = getLevel('virtual-stages');
    const payload: UrlAttemptPayload = {
      schemaVersion: 1,
      levelId: 'virtual-stages',
      levelVersion: level.version,
      actions: MASTERED_ACTIONS['virtual-stages'],
    };

    const encoded = encodeAttempt(payload);
    const storedPayload = JSON.parse(decodeURIComponent(encoded)) as Record<string, unknown>;

    expect(Object.keys(storedPayload).sort()).toEqual(
      ['actions', 'levelId', 'levelVersion', 'schemaVersion'].sort(),
    );
    expect(storedPayload).not.toHaveProperty('topology');
    expect(storedPayload.actions).toEqual(MASTERED_ACTIONS['virtual-stages']);

    const decoded = decodeAttempt(encoded, getLevel);

    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      expect(decoded.attempt.levelId).toBe('virtual-stages');
      expect(decoded.attempt.outcome).toBe('mastered');
      expect(decoded.attempt.actions).toEqual(MASTERED_ACTIONS['virtual-stages']);
    }
  });

  it('encodes and decodes interleaved 1F1B attempts as expanded actions only', () => {
    const level = getLevel('interleaved-one-f-one-b');
    const payload: UrlAttemptPayload = {
      schemaVersion: 1,
      levelId: 'interleaved-one-f-one-b',
      levelVersion: level.version,
      actions: MASTERED_ACTIONS['interleaved-one-f-one-b'],
    };

    const encoded = encodeAttempt(payload);
    const storedPayload = JSON.parse(decodeURIComponent(encoded)) as Record<string, unknown>;

    expect(Object.keys(storedPayload).sort()).toEqual(
      ['actions', 'levelId', 'levelVersion', 'schemaVersion'].sort(),
    );
    expect(storedPayload).not.toHaveProperty('topology');
    expect(storedPayload).not.toHaveProperty('policy');
    expect(storedPayload.actions).toEqual(MASTERED_ACTIONS['interleaved-one-f-one-b']);

    const decoded = decodeAttempt(encoded, getLevel);

    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      expect(decoded.attempt.levelId).toBe('interleaved-one-f-one-b');
      expect(decoded.attempt.outcome).toBe('mastered');
      expect(decoded.attempt.actions).toEqual(MASTERED_ACTIONS['interleaved-one-f-one-b']);
    }
  });

  it('encodes and decodes nonuniform-duration attempts as expanded actions only', () => {
    const level = getLevel('heavy-backward-tail');
    const payload: UrlAttemptPayload = {
      schemaVersion: 1,
      levelId: 'heavy-backward-tail',
      levelVersion: level.version,
      actions: MASTERED_ACTIONS['heavy-backward-tail'],
    };

    const encoded = encodeAttempt(payload);
    const storedPayload = JSON.parse(decodeURIComponent(encoded)) as Record<string, unknown>;

    expect(Object.keys(storedPayload).sort()).toEqual(
      ['actions', 'levelId', 'levelVersion', 'schemaVersion'].sort(),
    );
    expect(storedPayload).not.toHaveProperty('durationOverrides');
    expect(storedPayload).not.toHaveProperty('durations');
    expect(storedPayload).not.toHaveProperty('topology');
    expect(storedPayload.actions).toEqual(MASTERED_ACTIONS['heavy-backward-tail']);

    const decoded = decodeAttempt(encoded, getLevel);

    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      expect(decoded.attempt.levelId).toBe('heavy-backward-tail');
      expect(decoded.attempt.outcome).toBe('mastered');
      expect(decoded.attempt.actions).toEqual(MASTERED_ACTIONS['heavy-backward-tail']);
    }
  });

  it('encodes and decodes split-backward attempts as canonical actions only', () => {
    const level = getLevel('split-backward');
    const payload: UrlAttemptPayload = {
      schemaVersion: 1,
      levelId: 'split-backward',
      levelVersion: level.version,
      actions: MASTERED_ACTIONS['split-backward'],
    };

    const encoded = encodeAttempt(payload);
    const storedPayload = JSON.parse(decodeURIComponent(encoded)) as Record<string, unknown>;

    expect(Object.keys(storedPayload).sort()).toEqual(
      ['actions', 'levelId', 'levelVersion', 'schemaVersion'].sort(),
    );
    expect(storedPayload).not.toHaveProperty('operationModel');
    expect(storedPayload).not.toHaveProperty('durationOverrides');
    expect(storedPayload).not.toHaveProperty('durations');
    expect(storedPayload.actions).toEqual(MASTERED_ACTIONS['split-backward']);

    const decoded = decodeAttempt(encoded, getLevel);

    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      expect(decoded.attempt.levelId).toBe('split-backward');
      expect(decoded.attempt.outcome).toBe('mastered');
      expect(decoded.attempt.actions).toEqual(MASTERED_ACTIONS['split-backward']);
    }
  });

  it('encodes and decodes zero-bubble attempts as canonical actions only', () => {
    const level = getLevel('zero-bubble-h1');
    const payload: UrlAttemptPayload = {
      schemaVersion: 1,
      levelId: 'zero-bubble-h1',
      levelVersion: level.version,
      actions: MASTERED_ACTIONS['zero-bubble-h1'],
    };

    const encoded = encodeAttempt(payload);
    const storedPayload = JSON.parse(decodeURIComponent(encoded)) as Record<string, unknown>;

    expect(Object.keys(storedPayload).sort()).toEqual(
      ['actions', 'levelId', 'levelVersion', 'schemaVersion'].sort(),
    );
    expect(storedPayload).not.toHaveProperty('operationModel');
    expect(storedPayload).not.toHaveProperty('scoreModel');
    expect(storedPayload).not.toHaveProperty('referencePolicy');
    expect(storedPayload.actions).toEqual(MASTERED_ACTIONS['zero-bubble-h1']);

    const decoded = decodeAttempt(encoded, getLevel);

    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      expect(decoded.attempt.levelId).toBe('zero-bubble-h1');
      expect(decoded.attempt.outcome).toBe('mastered');
      expect(decoded.attempt.actions).toEqual(MASTERED_ACTIONS['zero-bubble-h1']);
    }
  });

  it('encodes and decodes grouped attempts as canonical actions only', () => {
    const level = getLevel('group-the-pipe');
    const payload: UrlAttemptPayload = {
      schemaVersion: 1,
      levelId: 'group-the-pipe',
      levelVersion: level.version,
      actions: MASTERED_ACTIONS['group-the-pipe'],
    };

    const encoded = encodeAttempt(payload);
    const storedPayload = JSON.parse(decodeURIComponent(encoded)) as Record<string, unknown>;

    expect(Object.keys(storedPayload).sort()).toEqual(
      ['actions', 'levelId', 'levelVersion', 'schemaVersion'].sort(),
    );
    expect(storedPayload).not.toHaveProperty('microbatchGrouping');
    expect(storedPayload).not.toHaveProperty('groupSize');
    expect(storedPayload).not.toHaveProperty('referencePolicy');
    expect(storedPayload.actions).toEqual(MASTERED_ACTIONS['group-the-pipe']);

    const decoded = decodeAttempt(encoded, getLevel);

    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      expect(decoded.attempt.levelId).toBe('group-the-pipe');
      expect(decoded.attempt.outcome).toBe('mastered');
      expect(decoded.attempt.actions).toEqual(MASTERED_ACTIONS['group-the-pipe']);
    }
  });

  it('rejects outcome and tuple smuggling by exact URL keys', () => {
    const level = getLevel('dependency-chain');
    const decoded = decodeAttempt(
      encodeUnknown({
        schemaVersion: 1,
        levelId: 'dependency-chain',
        levelVersion: level.version,
        actions: MASTERED_ACTIONS['dependency-chain'],
        outcome: 'mastered',
        tuple: { makespan: 0 },
      }),
      getLevel,
    );

    expect(decoded.ok).toBe(false);
    if (!decoded.ok) expectDecodeReason(decoded, 'unexpected-key');
  });

  it('treats attacker-shaped failure JSON as an ordinary invalid payload', () => {
    const decoded = decodeAttempt(encodeUnknown({ ok: false, reason: 'boom' }), getLevel);

    expect(decoded).toEqual({ ok: false, reason: 'unexpected-key' });
  });

  it('returns historical-level-version with raw canonical payload and does not replay current config', () => {
    const payload: UrlAttemptPayload = {
      schemaVersion: 1,
      levelId: 'dependency-chain',
      levelVersion: 0,
      actions: MASTERED_ACTIONS['dependency-chain'],
    };

    const decoded = decodeAttempt(encodeAttempt(payload), getLevel);

    expect(decoded).toEqual({ ok: false, reason: 'historical-level-version', payload });
  });

  it('distinguishes malformed percent encoding from malformed JSON', () => {
    expect(decodeAttempt('%ZZ', getLevel)).toEqual({ ok: false, reason: 'malformed-uri' });
    expect(decodeAttempt(encodeURIComponent('{'), getLevel)).toEqual({
      ok: false,
      reason: 'malformed-json',
    });
  });

  it('rejects extra keys recursively and invalid numeric fields', () => {
    const level = getLevel('dependency-chain');
    const cases: readonly unknown[] = [
      {
        schemaVersion: 1,
        levelId: 'dependency-chain',
        levelVersion: level.version,
        actions: [],
        extra: true,
      },
      {
        schemaVersion: 1,
        levelId: 'dependency-chain',
        levelVersion: level.version,
        actions: [{ type: 'place', operationId: 'F:0:0', extra: true }],
      },
      { schemaVersion: 1, levelId: 'dependency-chain', levelVersion: -1, actions: [] },
      { schemaVersion: 1, levelId: 'dependency-chain', levelVersion: 1.5, actions: [] },
      {
        schemaVersion: 1,
        levelId: 'dependency-chain',
        levelVersion: level.version,
        actions: [{ type: 'wait', rank: -1 }],
      },
      {
        schemaVersion: 1,
        levelId: 'dependency-chain',
        levelVersion: level.version,
        actions: [{ type: 'wait', rank: 2 }],
      },
    ];

    for (const candidate of cases) {
      const decoded = decodeAttempt(encodeUnknown(candidate), getLevel);
      expect(decoded.ok).toBe(false);
    }
  });

  it('rejects unknown levels and URL action count above inventory plus 1000 wait ticks', () => {
    const unknown = decodeAttempt(
      encodeUnknown({ schemaVersion: 1, levelId: 'not-a-level', levelVersion: 1, actions: [] }),
      getLevel,
    );
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expectDecodeReason(unknown, 'unknown-level-id');

    const level = getLevel('dependency-chain');
    const tooManyActions: Action[] = Array.from(
      { length: deriveOperations(level).length + 1001 },
      () => ({
        type: 'wait',
        rank: 0,
      }),
    );
    const overCap = decodeAttempt(
      encodeUnknown({
        schemaVersion: 1,
        levelId: 'dependency-chain',
        levelVersion: level.version,
        actions: tooManyActions,
      }),
      getLevel,
    );
    expect(overCap.ok).toBe(false);
    if (!overCap.ok) expectDecodeReason(overCap, 'too-many-actions');
  });

  it('reports first replay failure index and typed engine BlockReason', () => {
    const decoded = decodeAttempt(
      encodeUnknown({
        schemaVersion: 1,
        levelId: 'dependency-chain',
        levelVersion: 1,
        actions: [{ type: 'place', operationId: 'F:1:0' }],
      }),
      getLevel,
    );

    expect(decoded).toEqual({
      ok: false,
      reason: 'replay-blocked',
      index: 0,
      blockReason: { kind: 'dependency-not-finished', operationId: 'F:0:0' },
    });
  });

  it('deep-freezes replay-blocked nested reason details', () => {
    const decoded = decodeAttempt(
      encodeUnknown({
        schemaVersion: 1,
        levelId: 'dependency-chain',
        levelVersion: 1,
        actions: [{ type: 'place', operationId: 'F:1:0' }],
      }),
      getLevel,
    );

    expect(decoded.ok).toBe(false);
    if (!decoded.ok && decoded.reason === 'replay-blocked') {
      expect(Object.isFrozen(decoded.blockReason)).toBe(true);
      expect(() => {
        Object.assign(decoded.blockReason, { operationId: 'B:0:0' });
      }).toThrow(TypeError);
    }
  });
});

describe('stored progress validation and recovery', () => {
  it('accepts old progress payloads that only mention the original four levels', () => {
    const oldProgress = {
      schemaVersion: 1,
      unlockedLevelIds: ['dependency-chain', 'fill-the-pipe', 'backward-is-heavier', 'memory-wall'],
      bestLegalAttempts: {},
      bestMasteredAttempts: {},
      historicalAttempts: [],
    };

    const decoded = deserializeProgress(JSON.stringify(oldProgress), getLevel);

    expect(decoded).toEqual({
      ok: true,
      progress: {
        unlockedLevelIds: [
          'dependency-chain',
          'fill-the-pipe',
          'backward-is-heavier',
          'memory-wall',
        ],
        bestLegalAttempts: {},
        bestMasteredAttempts: {},
        historicalAttempts: [],
      },
    });
  });

  it('unlocks appended curriculum from a completed legacy terminal level', () => {
    const oldProgress = {
      schemaVersion: 1,
      unlockedLevelIds: ['dependency-chain', 'fill-the-pipe', 'backward-is-heavier', 'memory-wall'],
      bestLegalAttempts: {},
      bestMasteredAttempts: {
        'memory-wall': {
          schemaVersion: 1,
          levelId: 'memory-wall',
          levelVersion: getLevel('memory-wall').version,
          actions: MASTERED_ACTIONS['memory-wall'],
        },
      },
      historicalAttempts: [],
    };

    const decoded = deserializeProgress(JSON.stringify(oldProgress), getLevel);

    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      expect(decoded.progress.unlockedLevelIds).toEqual([
        'dependency-chain',
        'fill-the-pipe',
        'backward-is-heavier',
        'memory-wall',
        'gpipe-afab',
      ]);
      expect(decoded.progress.bestMasteredAttempts['memory-wall']?.outcome).toBe('mastered');
    }
  });

  it('replays canonical stored actions to recompute outcome and tuple', () => {
    const stored = {
      schemaVersion: 1,
      unlockedLevelIds: ['dependency-chain'],
      bestLegalAttempts: {
        'dependency-chain': {
          schemaVersion: 1,
          levelId: 'dependency-chain',
          levelVersion: 1,
          actions: LEGAL_ACTIONS['dependency-chain'],
        },
      },
      bestMasteredAttempts: {},
      historicalAttempts: [],
    };

    const progress = deserializeProgress(JSON.stringify(stored), getLevel);

    expect(progress.ok).toBe(true);
    if (progress.ok) {
      expect(progress.progress.bestLegalAttempts['dependency-chain']?.outcome).toBe('legal');
      expect(progress.progress.bestLegalAttempts['dependency-chain']?.tuple.intentionalIdle).toBe(
        1,
      );
      expect(progress.progress.bestMasteredAttempts['dependency-chain']).toBeUndefined();
    }
  });

  it('rejects smuggled stored outcome and tuple fields', () => {
    const tampered = {
      schemaVersion: 1,
      unlockedLevelIds: ['dependency-chain'],
      bestLegalAttempts: {
        'dependency-chain': {
          levelId: 'dependency-chain',
          levelVersion: 1,
          actions: LEGAL_ACTIONS['dependency-chain'],
          outcome: 'mastered',
          tuple: { makespan: 0, peakActivationMemory: 0, intentionalIdle: 0, actionCount: 0 },
        },
      },
      bestMasteredAttempts: {},
      historicalAttempts: [],
    };

    expect(deserializeProgress(JSON.stringify(tampered), getLevel)).toEqual({
      ok: false,
      reason: 'invalid-stored-attempt',
    });
  });

  it('quarantines malformed stored bytes with an explicit recovery indicator', () => {
    const storage = memoryStorage('{');

    const result = loadProgress(storage, '', getLevel);

    expect(result.status).toBe('ok');
    expect(result.recovery).toEqual({ kind: 'quarantined-storage', reason: 'malformed-json' });
    expect(result.progress.unlockedLevelIds).toEqual(['dependency-chain']);
  });

  it('quarantines attacker-shaped failure JSON in stored best slots without throwing', () => {
    const storage = memoryStorage(
      JSON.stringify({
        schemaVersion: 1,
        unlockedLevelIds: ['dependency-chain'],
        bestLegalAttempts: { 'dependency-chain': { ok: false, reason: 'boom' } },
        bestMasteredAttempts: {},
        historicalAttempts: [],
      }),
    );

    expect(() => loadProgress(storage, '', getLevel)).not.toThrow();
    const result = loadProgress(storage, '', getLevel);

    expect(result.status).toBe('ok');
    expect(result.recovery).toEqual({
      kind: 'quarantined-storage',
      reason: 'invalid-stored-attempt',
    });
    expect(result.progress.unlockedLevelIds).toEqual(['dependency-chain']);
  });

  it('quarantines spoofed historical and replay-blocked stored sentinels without throwing', () => {
    const spoofedPayloads = [
      {
        schemaVersion: 1,
        unlockedLevelIds: ['dependency-chain'],
        bestLegalAttempts: {
          'dependency-chain': { ok: false, reason: 'historical-level-version' },
        },
        bestMasteredAttempts: {},
        historicalAttempts: [],
      },
      {
        schemaVersion: 1,
        unlockedLevelIds: ['dependency-chain'],
        bestLegalAttempts: {
          'dependency-chain': { ok: false, reason: 'replay-blocked' },
        },
        bestMasteredAttempts: {},
        historicalAttempts: [],
      },
    ] as const;

    for (const payload of spoofedPayloads) {
      expect(deserializeProgress(JSON.stringify(payload), getLevel)).toEqual({
        ok: false,
        reason: 'invalid-stored-attempt',
      });

      const storage = memoryStorage(JSON.stringify(payload));
      expect(() => loadProgress(storage, '', getLevel)).not.toThrow();
      expect(loadProgress(storage, '', getLevel)).toMatchObject({
        status: 'ok',
        recovery: { kind: 'quarantined-storage', reason: 'invalid-stored-attempt' },
      });
    }
  });

  it('rejects stored extra keys, duplicate slot entries, invalid actions, and stored action caps', () => {
    const level = getLevel('dependency-chain');
    const validAttempt = {
      levelId: 'dependency-chain',
      levelVersion: level.version,
      actions: MASTERED_ACTIONS['dependency-chain'],
    };
    const payloads: readonly unknown[] = [
      {
        schemaVersion: 1,
        unlockedLevelIds: ['dependency-chain'],
        bestLegalAttempts: {},
        bestMasteredAttempts: {},
        historicalAttempts: [],
        extra: true,
      },
      {
        schemaVersion: 1,
        unlockedLevelIds: ['dependency-chain'],
        bestLegalAttempts: { 'dependency-chain': { ...validAttempt, extra: true } },
        bestMasteredAttempts: {},
        historicalAttempts: [],
      },
      {
        schemaVersion: 1,
        unlockedLevelIds: ['dependency-chain'],
        bestLegalAttempts: {
          'dependency-chain': validAttempt,
          'dependency-chain#copy': validAttempt,
        },
        bestMasteredAttempts: {},
        historicalAttempts: [],
      },
      {
        schemaVersion: 1,
        unlockedLevelIds: ['dependency-chain'],
        bestLegalAttempts: {
          'dependency-chain': {
            levelId: 'dependency-chain',
            levelVersion: level.version,
            actions: [{ type: 'wait', rank: 99 }],
          },
        },
        bestMasteredAttempts: {},
        historicalAttempts: [],
      },
      {
        schemaVersion: 1,
        unlockedLevelIds: ['dependency-chain'],
        bestLegalAttempts: {
          'dependency-chain': {
            levelId: 'dependency-chain',
            levelVersion: level.version,
            actions: Array.from({ length: deriveOperations(level).length + 1001 }, () => ({
              type: 'wait',
              rank: 0,
            })),
          },
        },
        bestMasteredAttempts: {},
        historicalAttempts: [],
      },
    ];

    for (const payload of payloads) {
      expect(deserializeProgress(JSON.stringify(payload), getLevel).ok).toBe(false);
    }
  });

  it('retains historical attempts for export but excludes them from best-attempt slots', () => {
    const historical = {
      schemaVersion: 1,
      levelId: 'dependency-chain',
      levelVersion: 0,
      actions: MASTERED_ACTIONS['dependency-chain'],
    };
    const payload = {
      schemaVersion: 1,
      unlockedLevelIds: ['dependency-chain'],
      bestLegalAttempts: { 'dependency-chain': historical },
      bestMasteredAttempts: {},
      historicalAttempts: [historical],
    };

    const result = deserializeProgress(JSON.stringify(payload), getLevel);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.progress.bestLegalAttempts['dependency-chain']).toBeUndefined();
      expect(result.progress.historicalAttempts).toEqual([historical]);
    }
  });

  it('rejects current-version canonical payloads in historicalAttempts instead of dropping them', () => {
    const payload = {
      schemaVersion: 1,
      unlockedLevelIds: ['dependency-chain'],
      bestLegalAttempts: {},
      bestMasteredAttempts: {},
      historicalAttempts: [
        {
          schemaVersion: 1,
          levelId: 'dependency-chain',
          levelVersion: 1,
          actions: MASTERED_ACTIONS['dependency-chain'],
        },
      ],
    };

    expect(deserializeProgress(JSON.stringify(payload), getLevel)).toEqual({
      ok: false,
      reason: 'invalid-stored-attempt',
    });
  });

  it('loads valid URL for the session without overwriting local best progress', () => {
    const local = progressContaining(storedMasteredAttempt('dependency-chain'));
    const storage = memoryStorage(serializeProgress(local));
    const url = `#attempt=${encodeAttempt({
      schemaVersion: 1,
      levelId: 'dependency-chain',
      levelVersion: 1,
      actions: LEGAL_ACTIONS['dependency-chain'],
    })}`;

    const result = loadProgress(storage, url, getLevel);

    expect(result.status).toBe('ok');
    expect(result.urlAttempt?.outcome).toBe('legal');
    expect(result.progress.bestMasteredAttempts['dependency-chain']).toBeDefined();
    expect(storage.writes).toEqual([]);
  });

  it('does not let a bad URL overwrite good local progress', () => {
    const local = progressContaining(storedMasteredAttempt('dependency-chain'));
    const storage = memoryStorage(serializeProgress(local));

    const result = loadProgress(storage, '#attempt=%ZZ', getLevel);

    expect(result.status).toBe('ok');
    expect(result.urlAttempt).toBeNull();
    expect(result.urlRecovery).toEqual({
      kind: 'ignored-url',
      failure: { ok: false, reason: 'malformed-uri' },
    });
    expect(result.progress.bestMasteredAttempts['dependency-chain']).toBeDefined();
    expect(storage.getItem(STORAGE_KEY)).toBe(serializeProgress(local));
  });

  it('preserves historical URL recovery payload detail without changing local progress', () => {
    const local = progressContaining(storedMasteredAttempt('dependency-chain'));
    const storage = memoryStorage(serializeProgress(local));
    const historical = {
      schemaVersion: 1,
      levelId: 'dependency-chain',
      levelVersion: 0,
      actions: MASTERED_ACTIONS['dependency-chain'],
    } satisfies UrlAttemptPayload;
    const hash = `#attempt=${encodeAttempt(historical)}`;

    const result = loadProgress(storage, hash, getLevel);

    expect(result.status).toBe('ok');
    expect(result.urlAttempt).toBeNull();
    expect(result.urlRecovery).toEqual({
      kind: 'ignored-url',
      failure: { ok: false, reason: 'historical-level-version', payload: historical },
    });
    expect(result.progress.bestMasteredAttempts['dependency-chain']).toBeDefined();
    expect(storage.getItem(STORAGE_KEY)).toBe(serializeProgress(local));
  });

  it('preserves replay-blocked URL recovery index and typed reason without changing local progress', () => {
    const local = progressContaining(storedMasteredAttempt('dependency-chain'));
    const storage = memoryStorage(serializeProgress(local));
    const hash = `#attempt=${encodeAttempt({
      schemaVersion: 1,
      levelId: 'dependency-chain',
      levelVersion: 1,
      actions: [{ type: 'place', operationId: 'F:1:0' }],
    })}`;

    const result = loadProgress(storage, hash, getLevel);

    expect(result.status).toBe('ok');
    expect(result.urlAttempt).toBeNull();
    expect(result.urlRecovery).toEqual({
      kind: 'ignored-url',
      failure: {
        ok: false,
        reason: 'replay-blocked',
        index: 0,
        blockReason: { kind: 'dependency-not-finished', operationId: 'F:0:0' },
      },
    });
    expect(result.progress.bestMasteredAttempts['dependency-chain']).toBeDefined();
    expect(storage.getItem(STORAGE_KEY)).toBe(serializeProgress(local));
  });

  it('returns session-only with progress on storage read and write exceptions', () => {
    const readResult = loadProgress(throwingStorage('get'), '', getLevel);
    expect(readResult.status).toBe('session-only');
    expect(readResult.progress.unlockedLevelIds).toEqual(['dependency-chain']);

    const progress = progressContaining(storedMasteredAttempt());
    const saveResult = saveProgress(throwingStorage('set'), progress);
    expect(saveResult.status).toBe('session-only');
    expect(saveResult.progress).toEqual(progress);
    expect(saveResult.progress).not.toBe(progress);
  });

  it('normalizes saveProgress results to canonical frozen copies', () => {
    const mutableProgress = {
      unlockedLevelIds: ['dependency-chain'],
      bestLegalAttempts: { 'dependency-chain': storedMasteredAttempt('dependency-chain') },
      bestMasteredAttempts: { 'dependency-chain': storedMasteredAttempt('dependency-chain') },
      historicalAttempts: [] as UrlAttemptPayload[],
    };
    const storage = memoryStorage();

    const result = saveProgress(storage, mutableProgress);

    expect(result.status).toBe('ok');
    expect(result.progress).not.toBe(mutableProgress);
    expect(result.progress.bestLegalAttempts).not.toBe(mutableProgress.bestLegalAttempts);
    expect(Object.isFrozen(result.progress)).toBe(true);
    expect(Object.isFrozen(result.progress.bestLegalAttempts)).toBe(true);
    expect(Object.isFrozen(result.progress.bestLegalAttempts['dependency-chain'])).toBe(true);

    mutableProgress.unlockedLevelIds.push('memory-wall');
    delete mutableProgress.bestLegalAttempts['dependency-chain'];

    expect(result.progress.unlockedLevelIds).toEqual(['dependency-chain', 'fill-the-pipe']);
    expect(result.progress.bestLegalAttempts['dependency-chain']).toBeDefined();
    expect(storage.getItem(STORAGE_KEY)).toBe(serializeProgress(result.progress));
  });

  it('returns session-only with frozen safe progress for invalid progress input without writing storage', () => {
    const storage = memoryStorage();
    const invalidProgress = {
      unlockedLevelIds: ['not-a-level'],
      bestLegalAttempts: {},
      bestMasteredAttempts: {},
      historicalAttempts: [] as UrlAttemptPayload[],
    } as unknown as Parameters<typeof saveProgress>[1];

    expect(() => saveProgress(storage, invalidProgress)).not.toThrow();
    const result = saveProgress(storage, invalidProgress);

    expect(result.status).toBe('session-only');
    expect(result.progress.unlockedLevelIds).toEqual(['dependency-chain']);
    expect(result.progress.bestLegalAttempts).toEqual({});
    expect(Object.isFrozen(result.progress)).toBe(true);
    expect(Object.isFrozen(result.progress.bestLegalAttempts)).toBe(true);
    expect(storage.writes).toEqual([]);
  });
});

describe('progress shape, immutability, and ranking', () => {
  it('progressContaining unlocks dependency-chain and applies legal/mastered slot semantics', () => {
    const mastered = progressContaining(storedMasteredAttempt());
    expect(mastered.unlockedLevelIds).toEqual(['dependency-chain', 'fill-the-pipe']);
    expect(mastered.bestLegalAttempts['dependency-chain']?.outcome).toBe('mastered');
    expect(mastered.bestMasteredAttempts['dependency-chain']?.outcome).toBe('mastered');

    const legal = progressContaining(storedLegalAttempt());
    expect(legal.unlockedLevelIds).toEqual(['dependency-chain', 'fill-the-pipe']);
    expect(legal.bestLegalAttempts['dependency-chain']?.outcome).toBe('legal');
    expect(legal.bestMasteredAttempts['dependency-chain']).toBeUndefined();
  });

  it('public progress structures and attempts are deeply frozen and not Map-mutable', () => {
    const progress = progressContaining(storedMasteredAttempt());

    expect(progress.bestLegalAttempts).not.toBeInstanceOf(Map);
    expect(Object.isFrozen(progress)).toBe(true);
    expect(Object.isFrozen(progress.bestLegalAttempts)).toBe(true);
    expect(Object.isFrozen(progress.bestLegalAttempts['dependency-chain']?.actions)).toBe(true);
    expect(() => {
      Object.assign(progress.bestLegalAttempts, {
        'memory-wall': storedMasteredAttempt('memory-wall'),
      });
    }).toThrow(TypeError);
  });

  it('selectBest requires a single current level cohort and preserves input immutability', () => {
    const dependency = storedMasteredAttempt('dependency-chain');
    const memory = storedMasteredAttempt('memory-wall');
    const input = Object.freeze([dependency, memory]);

    expect(() => selectBest(input)).toThrow(/mixed level cohorts/i);
    expect(input).toEqual([dependency, memory]);
  });

  it('uses makespan, memory, idle, then action count for best', () => {
    const base = storedMasteredAttempt();
    const slow: StoredAttempt = {
      ...base,
      tuple: { makespan: 20, peakActivationMemory: 1, intentionalIdle: 0, actionCount: 4 },
    };
    const fast: StoredAttempt = {
      ...base,
      tuple: { makespan: 19, peakActivationMemory: 3, intentionalIdle: 0, actionCount: 4 },
    };
    const lowerMemory: StoredAttempt = {
      ...base,
      tuple: { makespan: 19, peakActivationMemory: 1, intentionalIdle: 1, actionCount: 4 },
    };
    const lowerIdle: StoredAttempt = {
      ...base,
      tuple: { makespan: 19, peakActivationMemory: 1, intentionalIdle: 0, actionCount: 5 },
    };
    const fewerActions: StoredAttempt = {
      ...base,
      tuple: { makespan: 19, peakActivationMemory: 1, intentionalIdle: 0, actionCount: 4 },
    };

    expect(selectBest([slow, fast])).toBe(fast);
    expect(selectBest([fast, lowerMemory])).toBe(lowerMemory);
    expect(selectBest([lowerMemory, lowerIdle])).toBe(lowerIdle);
    expect(selectBest([lowerIdle, fewerActions])).toBe(fewerActions);
  });

  it('supports explicit expected level/version filtering for current-version cohorts', () => {
    const current = storedMasteredAttempt();
    const historical: StoredAttempt = {
      ...current,
      levelVersion: 0,
      tuple: { makespan: 0, peakActivationMemory: 0, intentionalIdle: 0, actionCount: 0 },
    };

    expect(
      selectBest([historical, current], { levelId: 'dependency-chain', levelVersion: 1 }),
    ).toBe(current);
  });
});
