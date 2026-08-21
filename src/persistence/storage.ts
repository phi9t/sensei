import { compareAttempts } from '../engine/score';
import { LEVEL_IDS, type LevelId } from '../levels/levels';
import {
  decodeAttempt,
  encodeAttempt,
  PERSISTENCE_SCHEMA,
  STORAGE_KEY,
  type DecodeAttemptFailure,
  type GetLevel,
  type StoredAttempt,
  type UrlAttemptPayload,
} from './codec';

export { STORAGE_KEY, encodeAttempt, decodeAttempt } from './codec';
export type { AttemptRankingTuple, GetLevel, StoredAttempt, UrlAttemptPayload } from './codec';

type AttemptMap = Readonly<Partial<Record<LevelId, StoredAttempt>>>;

export interface Progress {
  readonly unlockedLevelIds: readonly LevelId[];
  readonly bestLegalAttempts: AttemptMap;
  readonly bestMasteredAttempts: AttemptMap;
  readonly historicalAttempts: readonly UrlAttemptPayload[];
}

interface StoredProgressPayload {
  readonly schemaVersion: typeof PERSISTENCE_SCHEMA;
  readonly unlockedLevelIds: readonly LevelId[];
  readonly bestLegalAttempts: Partial<Record<LevelId, UrlAttemptPayload>>;
  readonly bestMasteredAttempts: Partial<Record<LevelId, UrlAttemptPayload>>;
  readonly historicalAttempts: readonly UrlAttemptPayload[];
}

export type DeserializeProgressResult =
  | { readonly ok: true; readonly progress: Progress }
  | { readonly ok: false; readonly reason: DeserializeProgressReason };

type DeserializeProgressReason =
  | 'malformed-json'
  | 'unexpected-key'
  | 'invalid-schema-version'
  | 'invalid-unlocked-level-id'
  | 'duplicate-unlocked-level-id'
  | 'invalid-slot-key'
  | 'slot-level-mismatch'
  | 'historical-attempt-in-slot'
  | 'legal-attempt-in-mastered-slot'
  | 'invalid-stored-attempt';

export type LoadProgressResult =
  | {
      readonly status: 'ok';
      readonly progress: Progress;
      readonly urlAttempt: StoredAttempt | null;
      readonly recovery?: {
        readonly kind: 'quarantined-storage';
        readonly reason: DeserializeProgressReason;
      };
      readonly urlRecovery?: UrlRecovery;
    }
  | {
      readonly status: 'session-only';
      readonly progress: Progress;
      readonly urlAttempt: StoredAttempt | null;
      readonly reason: string;
      readonly recovery?: {
        readonly kind: 'quarantined-storage';
        readonly reason: DeserializeProgressReason;
      };
      readonly urlRecovery?: UrlRecovery;
    };

export type SaveProgressResult =
  | { readonly status: 'ok'; readonly progress: Progress }
  | { readonly status: 'session-only'; readonly progress: Progress; readonly reason: string };

interface SelectBestExpected {
  readonly levelId: LevelId;
  readonly levelVersion: number;
}

export interface UrlRecovery {
  readonly kind: 'ignored-url';
  readonly failure: DecodeAttemptFailure;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isLevelId(value: unknown): value is LevelId {
  return typeof value === 'string' && LEVEL_IDS.includes(value as LevelId);
}

function hasExactKeys(value: Record<string, unknown>, expectedKeys: readonly string[]): boolean {
  const actualKeys = Object.keys(value).sort();
  const sortedExpected = [...expectedKeys].sort();
  return (
    actualKeys.length === sortedExpected.length &&
    actualKeys.every((key, index) => key === sortedExpected[index])
  );
}

function cloneAttempt(attempt: StoredAttempt): StoredAttempt {
  return Object.freeze({
    levelId: attempt.levelId,
    levelVersion: attempt.levelVersion,
    actions: Object.freeze(
      attempt.actions.map((action) =>
        action.type === 'place'
          ? Object.freeze({ type: 'place', operationId: action.operationId })
          : Object.freeze({ type: 'wait', rank: action.rank }),
      ),
    ),
    outcome: attempt.outcome,
    tuple: Object.freeze({
      makespan: attempt.tuple.makespan,
      peakActivationMemory: attempt.tuple.peakActivationMemory,
      intentionalIdle: attempt.tuple.intentionalIdle,
      actionCount: attempt.tuple.actionCount,
    }),
  });
}

function clonePayload(payload: UrlAttemptPayload): UrlAttemptPayload {
  return Object.freeze({
    schemaVersion: PERSISTENCE_SCHEMA,
    levelId: payload.levelId,
    levelVersion: payload.levelVersion,
    actions: Object.freeze(
      payload.actions.map((action) =>
        action.type === 'place'
          ? Object.freeze({ type: 'place', operationId: action.operationId })
          : Object.freeze({ type: 'wait', rank: action.rank }),
      ),
    ),
  });
}

function cloneUrlDecodeFailure(failure: DecodeAttemptFailure): DecodeAttemptFailure {
  switch (failure.reason) {
    case 'historical-level-version':
      return Object.freeze({
        ok: false,
        reason: 'historical-level-version',
        payload: clonePayload(failure.payload),
      });
    case 'replay-blocked':
      return Object.freeze({
        ok: false,
        reason: 'replay-blocked',
        index: failure.index,
        blockReason:
          failure.blockReason.kind === 'memory-cap'
            ? Object.freeze({
                kind: 'memory-cap',
                rank: failure.blockReason.rank,
                resident: failure.blockReason.resident,
                requested: failure.blockReason.requested,
                cap: failure.blockReason.cap,
              })
            : failure.blockReason.kind === 'invalid-rank'
              ? Object.freeze({
                  kind: 'invalid-rank',
                  rank: failure.blockReason.rank,
                })
              : Object.freeze({
                  kind: failure.blockReason.kind,
                  operationId: failure.blockReason.operationId,
                }),
      });
    default:
      return Object.freeze({
        ok: false,
        reason: failure.reason,
      });
  }
}

function safeEmptyProgress(): Progress {
  return createEmptyProgress();
}

function normalizeProgress(progress: Progress): Progress {
  const unlockedLevelIds = validateUnlockedLevelIds(progress.unlockedLevelIds);
  if (typeof unlockedLevelIds === 'string') {
    throw new Error(`invalid progress unlocked levels: ${unlockedLevelIds}`);
  }

  const bestLegalAttempts: Partial<Record<LevelId, StoredAttempt>> = {};
  for (const levelId of LEVEL_IDS) {
    const attempt = progress.bestLegalAttempts[levelId];
    if (attempt) {
      bestLegalAttempts[levelId] = cloneAttempt(attempt);
    }
  }

  const bestMasteredAttempts: Partial<Record<LevelId, StoredAttempt>> = {};
  for (const levelId of LEVEL_IDS) {
    const attempt = progress.bestMasteredAttempts[levelId];
    if (attempt) {
      bestMasteredAttempts[levelId] = cloneAttempt(attempt);
    }
  }

  const historicalAttempts = Object.freeze(progress.historicalAttempts.map(clonePayload));

  return Object.freeze({
    unlockedLevelIds,
    bestLegalAttempts: freezeAttemptMap(bestLegalAttempts),
    bestMasteredAttempts: freezeAttemptMap(bestMasteredAttempts),
    historicalAttempts,
  });
}

function freezeAttemptMap(attempts: Partial<Record<LevelId, StoredAttempt>>): AttemptMap {
  const cloned: Partial<Record<LevelId, StoredAttempt>> = {};
  for (const levelId of LEVEL_IDS) {
    const attempt = attempts[levelId];
    if (attempt) {
      cloned[levelId] = cloneAttempt(attempt);
    }
  }
  return Object.freeze(cloned);
}

function createEmptyProgress(): Progress {
  return Object.freeze({
    unlockedLevelIds: Object.freeze(['dependency-chain'] as const),
    bestLegalAttempts: Object.freeze({}),
    bestMasteredAttempts: Object.freeze({}),
    historicalAttempts: Object.freeze([]),
  });
}

export function progressContaining(attempt: StoredAttempt): Progress {
  const unlockedLevelIds =
    attempt.levelId === 'dependency-chain'
      ? Object.freeze(['dependency-chain'] as const)
      : Object.freeze(['dependency-chain', attempt.levelId] as const);

  const bestLegalAttempts: Partial<Record<LevelId, StoredAttempt>> = {
    [attempt.levelId]: cloneAttempt(attempt),
  };
  const bestMasteredAttempts: Partial<Record<LevelId, StoredAttempt>> =
    attempt.outcome === 'mastered' ? { [attempt.levelId]: cloneAttempt(attempt) } : {};

  return Object.freeze({
    unlockedLevelIds,
    bestLegalAttempts: freezeAttemptMap(bestLegalAttempts),
    bestMasteredAttempts: freezeAttemptMap(bestMasteredAttempts),
    historicalAttempts: Object.freeze([]),
  });
}

function canonicalPayloadFromAttempt(attempt: StoredAttempt): UrlAttemptPayload {
  return Object.freeze({
    schemaVersion: PERSISTENCE_SCHEMA,
    levelId: attempt.levelId,
    levelVersion: attempt.levelVersion,
    actions: cloneAttempt(attempt).actions,
  });
}

function serializeAttemptMap(attempts: AttemptMap): Partial<Record<LevelId, UrlAttemptPayload>> {
  const serialized: Partial<Record<LevelId, UrlAttemptPayload>> = {};
  for (const levelId of LEVEL_IDS) {
    const attempt = attempts[levelId];
    if (attempt) {
      serialized[levelId] = canonicalPayloadFromAttempt(attempt);
    }
  }
  return serialized;
}

export function serializeProgress(progress: Progress): string {
  const payload: StoredProgressPayload = Object.freeze({
    schemaVersion: PERSISTENCE_SCHEMA,
    unlockedLevelIds: Object.freeze([...progress.unlockedLevelIds]),
    bestLegalAttempts: Object.freeze(serializeAttemptMap(progress.bestLegalAttempts)),
    bestMasteredAttempts: Object.freeze(serializeAttemptMap(progress.bestMasteredAttempts)),
    historicalAttempts: Object.freeze(progress.historicalAttempts.map(clonePayload)),
  });
  return JSON.stringify(payload);
}

function validateUnlockedLevelIds(
  rawUnlockedLevelIds: unknown,
): readonly LevelId[] | DeserializeProgressReason {
  if (!Array.isArray(rawUnlockedLevelIds)) {
    return 'invalid-unlocked-level-id';
  }

  const seen = new Set<LevelId>();
  const unlockedLevelIds: LevelId[] = [];
  for (const entry of rawUnlockedLevelIds) {
    if (!isLevelId(entry)) {
      return 'invalid-unlocked-level-id';
    }
    if (seen.has(entry)) {
      return 'duplicate-unlocked-level-id';
    }
    seen.add(entry);
    unlockedLevelIds.push(entry);
  }

  if (!seen.has('dependency-chain')) {
    unlockedLevelIds.unshift('dependency-chain');
  }

  return Object.freeze(unlockedLevelIds);
}

function decodeStoredPayload(
  payload: unknown,
  getLevel: GetLevel,
): StoredAttempt | DeserializeProgressReason | UrlAttemptPayload {
  let decoded: DecodeAttemptFailure | ReturnType<typeof decodeAttempt>;
  try {
    decoded = decodeAttempt(encodeURIComponent(JSON.stringify(payload)), getLevel);
  } catch {
    return 'invalid-stored-attempt';
  }
  if (decoded.ok) {
    return decoded.attempt;
  }

  switch (decoded.reason) {
    case 'historical-level-version':
      if (
        decoded.payload.levelId === undefined ||
        decoded.payload.levelVersion === undefined ||
        decoded.payload.actions === undefined
      ) {
        return 'invalid-stored-attempt';
      }
      return clonePayload(decoded.payload);
    case 'replay-blocked':
    case 'malformed-uri':
    case 'malformed-json':
    case 'unexpected-key':
    case 'invalid-schema-version':
    case 'invalid-level-id':
    case 'unknown-level-id':
    case 'invalid-level-version':
    case 'invalid-actions':
    case 'invalid-action':
    case 'invalid-action-type':
    case 'invalid-wait-rank':
    case 'invalid-operation-id':
    case 'unknown-operation-id':
    case 'too-many-actions':
      return 'invalid-stored-attempt';
    default:
      return 'invalid-stored-attempt';
  }
}

function validateAttemptMap(
  rawValue: unknown,
  slot: 'bestLegalAttempts' | 'bestMasteredAttempts',
  getLevel: GetLevel,
  historicalAttempts: UrlAttemptPayload[],
): Partial<Record<LevelId, StoredAttempt>> | DeserializeProgressReason {
  if (!isObjectRecord(rawValue)) {
    return 'invalid-stored-attempt';
  }

  const result: Partial<Record<LevelId, StoredAttempt>> = {};
  for (const [rawKey, rawPayload] of Object.entries(rawValue)) {
    if (!isLevelId(rawKey)) {
      return 'invalid-slot-key';
    }
    const decoded = decodeStoredPayload(rawPayload as UrlAttemptPayload, getLevel);
    if (typeof decoded === 'string') {
      return decoded;
    }
    if ('schemaVersion' in decoded) {
      historicalAttempts.push(decoded);
      continue;
    }
    if (decoded.levelId !== rawKey) {
      return 'slot-level-mismatch';
    }
    if (slot === 'bestMasteredAttempts' && decoded.outcome !== 'mastered') {
      return 'legal-attempt-in-mastered-slot';
    }
    result[rawKey] = cloneAttempt(decoded);
  }
  return result;
}

function validateHistoricalAttempts(
  rawHistoricalAttempts: unknown,
  getLevel: GetLevel,
): readonly UrlAttemptPayload[] | DeserializeProgressReason {
  if (!Array.isArray(rawHistoricalAttempts)) {
    return 'invalid-stored-attempt';
  }

  const historicalAttempts: UrlAttemptPayload[] = [];
  for (const rawPayload of rawHistoricalAttempts) {
    const decoded = decodeStoredPayload(rawPayload as UrlAttemptPayload, getLevel);
    if (typeof decoded === 'string') {
      return decoded;
    }
    if ('schemaVersion' in decoded) {
      historicalAttempts.push(decoded);
      continue;
    }
    return 'invalid-stored-attempt';
  }

  return Object.freeze(historicalAttempts.map(clonePayload));
}

export function deserializeProgress(raw: string, getLevel: GetLevel): DeserializeProgressResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return Object.freeze({ ok: false, reason: 'malformed-json' });
  }

  if (!isObjectRecord(parsed)) {
    return Object.freeze({ ok: false, reason: 'malformed-json' });
  }

  if (
    !hasExactKeys(parsed, [
      'schemaVersion',
      'unlockedLevelIds',
      'bestLegalAttempts',
      'bestMasteredAttempts',
      'historicalAttempts',
    ])
  ) {
    return Object.freeze({ ok: false, reason: 'unexpected-key' });
  }

  if (parsed.schemaVersion !== PERSISTENCE_SCHEMA) {
    return Object.freeze({ ok: false, reason: 'invalid-schema-version' });
  }

  const unlockedLevelIds = validateUnlockedLevelIds(parsed.unlockedLevelIds);
  if (typeof unlockedLevelIds === 'string') {
    return Object.freeze({ ok: false, reason: unlockedLevelIds });
  }

  const slotHistoricalAttempts: UrlAttemptPayload[] = [];
  const bestLegalAttempts = validateAttemptMap(
    parsed.bestLegalAttempts,
    'bestLegalAttempts',
    getLevel,
    slotHistoricalAttempts,
  );
  if (typeof bestLegalAttempts === 'string') {
    return Object.freeze({ ok: false, reason: bestLegalAttempts });
  }

  const bestMasteredAttempts = validateAttemptMap(
    parsed.bestMasteredAttempts,
    'bestMasteredAttempts',
    getLevel,
    slotHistoricalAttempts,
  );
  if (typeof bestMasteredAttempts === 'string') {
    return Object.freeze({ ok: false, reason: bestMasteredAttempts });
  }

  const historicalAttempts = validateHistoricalAttempts(parsed.historicalAttempts, getLevel);
  if (typeof historicalAttempts === 'string') {
    return Object.freeze({ ok: false, reason: historicalAttempts });
  }

  const historicalByEncoding = new Map<string, UrlAttemptPayload>();
  for (const payload of [...slotHistoricalAttempts, ...historicalAttempts]) {
    historicalByEncoding.set(encodeAttempt(payload), clonePayload(payload));
  }

  const progress: Progress = Object.freeze({
    unlockedLevelIds,
    bestLegalAttempts: freezeAttemptMap(bestLegalAttempts),
    bestMasteredAttempts: freezeAttemptMap(bestMasteredAttempts),
    historicalAttempts: Object.freeze([...historicalByEncoding.values()]),
  });

  return Object.freeze({ ok: true, progress });
}

export function selectBest(
  attempts: readonly StoredAttempt[],
  expected?: SelectBestExpected,
): StoredAttempt | undefined {
  const filtered = expected
    ? attempts.filter(
        (attempt) =>
          attempt.levelId === expected.levelId && attempt.levelVersion === expected.levelVersion,
      )
    : attempts;

  if (filtered.length === 0) {
    return undefined;
  }

  const cohortLevelId = filtered[0]?.levelId;
  const cohortLevelVersion = filtered[0]?.levelVersion;
  if (
    filtered.some(
      (attempt) => attempt.levelId !== cohortLevelId || attempt.levelVersion !== cohortLevelVersion,
    )
  ) {
    throw new Error('mixed level cohorts are not comparable');
  }

  let best = filtered[0];
  if (best === undefined) {
    return undefined;
  }
  for (const attempt of filtered.slice(1)) {
    if (compareAttempts(attempt.tuple, best.tuple) < 0) {
      best = attempt;
    }
  }

  return best;
}

export function saveProgress(storage: Storage, progress: Progress): SaveProgressResult {
  let normalizedProgress: Progress;
  try {
    normalizedProgress = normalizeProgress(progress);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return Object.freeze({
      status: 'session-only',
      progress: safeEmptyProgress(),
      reason,
    });
  }
  try {
    storage.setItem(STORAGE_KEY, serializeProgress(normalizedProgress));
    return Object.freeze({ status: 'ok', progress: normalizedProgress });
  } catch (error) {
    const reason = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    return Object.freeze({ status: 'session-only', progress: normalizedProgress, reason });
  }
}

function readUrlAttempt(
  hash: string,
  getLevel: GetLevel,
): {
  readonly urlAttempt: StoredAttempt | null;
  readonly urlRecovery?: UrlRecovery;
} {
  if (hash.length === 0) {
    return { urlAttempt: null };
  }

  const fragment = hash.startsWith('#') ? hash.slice(1) : hash;
  const params = new URLSearchParams(fragment);
  const encodedAttempt = params.get('attempt');
  if (encodedAttempt === null) {
    return { urlAttempt: null };
  }

  const decoded = decodeAttempt(encodedAttempt, getLevel);
  if (!decoded.ok) {
    return {
      urlAttempt: null,
      urlRecovery: Object.freeze({
        kind: 'ignored-url',
        failure: cloneUrlDecodeFailure(decoded),
      }),
    };
  }

  return { urlAttempt: decoded.attempt };
}

export function loadProgress(
  storage: Storage | null,
  hash: string,
  getLevel: GetLevel,
): LoadProgressResult {
  let progress = createEmptyProgress();
  let recovery:
    | { readonly kind: 'quarantined-storage'; readonly reason: DeserializeProgressReason }
    | undefined;

  if (storage !== null) {
    try {
      const stored = storage.getItem(STORAGE_KEY);
      if (stored !== null) {
        const deserialized = deserializeProgress(stored, getLevel);
        if (deserialized.ok) {
          progress = deserialized.progress;
        } else {
          recovery = Object.freeze({
            kind: 'quarantined-storage',
            reason: deserialized.reason,
          });
        }
      }
    } catch (error) {
      const reason = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      const urlResult = readUrlAttempt(hash, getLevel);
      const result: {
        status: 'session-only';
        progress: Progress;
        urlAttempt: StoredAttempt | null;
        reason: string;
        recovery?: {
          readonly kind: 'quarantined-storage';
          readonly reason: DeserializeProgressReason;
        };
        urlRecovery?: UrlRecovery;
      } = {
        status: 'session-only',
        progress,
        urlAttempt: urlResult.urlAttempt,
        reason,
      };
      if (recovery) {
        result.recovery = recovery;
      }
      if (urlResult.urlRecovery) {
        result.urlRecovery = urlResult.urlRecovery;
      }
      return Object.freeze(result);
    }
  }

  const urlResult = readUrlAttempt(hash, getLevel);
  if (storage === null) {
    const result: {
      status: 'session-only';
      progress: Progress;
      urlAttempt: StoredAttempt | null;
      reason: string;
      recovery?: {
        readonly kind: 'quarantined-storage';
        readonly reason: DeserializeProgressReason;
      };
      urlRecovery?: UrlRecovery;
    } = {
      status: 'session-only',
      progress,
      urlAttempt: urlResult.urlAttempt,
      reason: 'Storage unavailable',
    };
    if (recovery) {
      result.recovery = recovery;
    }
    if (urlResult.urlRecovery) {
      result.urlRecovery = urlResult.urlRecovery;
    }
    return Object.freeze(result);
  }

  const result: {
    status: 'ok';
    progress: Progress;
    urlAttempt: StoredAttempt | null;
    recovery?: { readonly kind: 'quarantined-storage'; readonly reason: DeserializeProgressReason };
    urlRecovery?: UrlRecovery;
  } = {
    status: 'ok',
    progress,
    urlAttempt: urlResult.urlAttempt,
  };
  if (recovery) {
    result.recovery = recovery;
  }
  if (urlResult.urlRecovery) {
    result.urlRecovery = urlResult.urlRecovery;
  }
  return Object.freeze(result);
}
