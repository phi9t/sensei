import { deriveOperations } from '../engine/operations';
import type { BlockReason } from '../engine/replay';
import { replay } from '../engine/replay';
import { attemptRankingTuple, score, type AttemptRankingTuple } from '../engine/score';
import type { Action, LevelConfig, OperationId } from '../engine/types';
import { type LevelId } from '../levels/levels';

export const PERSISTENCE_SCHEMA = 1 as const;
export const STORAGE_KEY = 'sensei.progress.v1';

export type Outcome = 'legal' | 'mastered';
export type GetLevel = (id: LevelId) => LevelConfig;

export interface StoredAttempt {
  readonly levelId: LevelId;
  readonly levelVersion: number;
  readonly actions: readonly Action[];
  readonly outcome: Outcome;
  readonly tuple: AttemptRankingTuple;
}

export interface UrlAttemptPayload {
  readonly schemaVersion: typeof PERSISTENCE_SCHEMA;
  readonly levelId: LevelId;
  readonly levelVersion: number;
  readonly actions: readonly Action[];
}

export interface DecodeAttemptSuccess {
  readonly ok: true;
  readonly attempt: StoredAttempt;
}

type DecodeAttemptReason =
  | 'malformed-uri'
  | 'malformed-json'
  | 'unexpected-key'
  | 'invalid-schema-version'
  | 'invalid-level-id'
  | 'unknown-level-id'
  | 'invalid-level-version'
  | 'invalid-actions'
  | 'invalid-action'
  | 'invalid-action-type'
  | 'invalid-wait-rank'
  | 'invalid-operation-id'
  | 'unknown-operation-id'
  | 'too-many-actions'
  | 'historical-level-version'
  | 'replay-blocked';

type SimpleDecodeFailureReason = Exclude<
  DecodeAttemptReason,
  'historical-level-version' | 'replay-blocked'
>;

type SimpleDecodeAttemptFailure = {
  readonly ok: false;
  readonly reason: SimpleDecodeFailureReason;
};

type HistoricalDecodeAttemptFailure = {
  readonly ok: false;
  readonly reason: 'historical-level-version';
  readonly payload: UrlAttemptPayload;
};

type ReplayBlockedDecodeAttemptFailure = {
  readonly ok: false;
  readonly reason: 'replay-blocked';
  readonly index: number;
  readonly blockReason: BlockReason;
};

export type DecodeAttemptFailure =
  SimpleDecodeAttemptFailure | HistoricalDecodeAttemptFailure | ReplayBlockedDecodeAttemptFailure;

export type DecodeAttemptResult = DecodeAttemptSuccess | DecodeAttemptFailure;
export type { AttemptRankingTuple } from '../engine/score';

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isDecodeAttemptFailure(value: unknown): value is DecodeAttemptFailure {
  return isObjectRecord(value) && value.ok === false && typeof value.reason === 'string';
}

function isFiniteInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && Number.isFinite(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return isFiniteInteger(value) && value >= 0;
}

function hasExactKeys(value: Record<string, unknown>, expectedKeys: readonly string[]): boolean {
  const actualKeys = Object.keys(value).sort();
  const sortedExpected = [...expectedKeys].sort();
  return (
    actualKeys.length === sortedExpected.length &&
    actualKeys.every((key, index) => key === sortedExpected[index])
  );
}

function cloneAction(action: Action): Action {
  switch (action.type) {
    case 'place':
      return Object.freeze({ type: 'place', operationId: action.operationId });
    case 'wait':
      return Object.freeze({ type: 'wait', rank: action.rank });
  }
}

function freezeTuple(tuple: AttemptRankingTuple): AttemptRankingTuple {
  return Object.freeze({
    makespan: tuple.makespan,
    peakActivationMemory: tuple.peakActivationMemory,
    intentionalIdle: tuple.intentionalIdle,
    actionCount: tuple.actionCount,
  });
}

function freezeActions(actions: readonly Action[]): readonly Action[] {
  return Object.freeze(actions.map(cloneAction));
}

function freezeAttempt(
  levelId: LevelId,
  levelVersion: number,
  actions: readonly Action[],
  outcome: Outcome,
  tuple: AttemptRankingTuple,
): StoredAttempt {
  return Object.freeze({
    levelId,
    levelVersion,
    actions: freezeActions(actions),
    outcome,
    tuple: freezeTuple(tuple),
  });
}

function freezeBlockReason(blockReason: BlockReason): BlockReason {
  switch (blockReason.kind) {
    case 'already-placed':
    case 'dependency-not-finished':
      return Object.freeze({
        kind: blockReason.kind,
        operationId: blockReason.operationId,
      });
    case 'memory-cap':
      return Object.freeze({
        kind: 'memory-cap',
        rank: blockReason.rank,
        resident: blockReason.resident,
        requested: blockReason.requested,
        cap: blockReason.cap,
      });
    case 'invalid-rank':
      return Object.freeze({
        kind: 'invalid-rank',
        rank: blockReason.rank,
      });
  }
}

function decodeUriComponent(encoded: string): string | DecodeAttemptFailure {
  try {
    return decodeURIComponent(encoded);
  } catch {
    return Object.freeze({ ok: false, reason: 'malformed-uri' });
  }
}

function parseJson(decoded: string): unknown | DecodeAttemptFailure {
  try {
    return JSON.parse(decoded);
  } catch {
    return Object.freeze({ ok: false, reason: 'malformed-json' });
  }
}

function validateKnownLevel(
  rawLevelId: unknown,
  getLevel: GetLevel,
): LevelConfig | DecodeAttemptFailure {
  if (typeof rawLevelId !== 'string') {
    return Object.freeze({ ok: false, reason: 'invalid-level-id' });
  }

  try {
    return getLevel(rawLevelId as LevelId);
  } catch {
    return Object.freeze({ ok: false, reason: 'unknown-level-id' });
  }
}

function validateAction(
  rawAction: unknown,
  level: LevelConfig,
  validOperationIds: ReadonlySet<OperationId>,
): Action | DecodeAttemptFailure {
  if (!isObjectRecord(rawAction)) {
    return Object.freeze({ ok: false, reason: 'invalid-action' });
  }

  if (!hasExactKeys(rawAction, ['type', rawAction.type === 'place' ? 'operationId' : 'rank'])) {
    return Object.freeze({ ok: false, reason: 'unexpected-key' });
  }

  if (rawAction.type === 'place') {
    if (typeof rawAction.operationId !== 'string') {
      return Object.freeze({ ok: false, reason: 'invalid-operation-id' });
    }

    if (!validOperationIds.has(rawAction.operationId as OperationId)) {
      return Object.freeze({ ok: false, reason: 'unknown-operation-id' });
    }

    return Object.freeze({
      type: 'place',
      operationId: rawAction.operationId as OperationId,
    });
  }

  if (rawAction.type === 'wait') {
    if (!isNonNegativeInteger(rawAction.rank) || rawAction.rank >= level.rankCount) {
      return Object.freeze({ ok: false, reason: 'invalid-wait-rank' });
    }

    return Object.freeze({ type: 'wait', rank: rawAction.rank });
  }

  return Object.freeze({ ok: false, reason: 'invalid-action-type' });
}

function validatePayload(
  rawPayload: unknown,
  getLevel: GetLevel,
): UrlAttemptPayload | DecodeAttemptFailure {
  if (!isObjectRecord(rawPayload)) {
    return Object.freeze({ ok: false, reason: 'malformed-json' });
  }

  if (!hasExactKeys(rawPayload, ['schemaVersion', 'levelId', 'levelVersion', 'actions'])) {
    return Object.freeze({ ok: false, reason: 'unexpected-key' });
  }

  if (rawPayload.schemaVersion !== PERSISTENCE_SCHEMA) {
    return Object.freeze({ ok: false, reason: 'invalid-schema-version' });
  }

  const levelResult = validateKnownLevel(rawPayload.levelId, getLevel);
  if (isDecodeAttemptFailure(levelResult)) {
    return levelResult;
  }
  const level = levelResult;

  if (!isNonNegativeInteger(rawPayload.levelVersion)) {
    return Object.freeze({ ok: false, reason: 'invalid-level-version' });
  }

  if (!Array.isArray(rawPayload.actions)) {
    return Object.freeze({ ok: false, reason: 'invalid-actions' });
  }

  const validOperationIds = new Set<OperationId>(
    deriveOperations(level).map((operation) => operation.id),
  );
  const actionCap = validOperationIds.size + 1000;
  if (rawPayload.actions.length > actionCap) {
    return Object.freeze({ ok: false, reason: 'too-many-actions' });
  }

  const actions: Action[] = [];
  for (const rawAction of rawPayload.actions) {
    const actionResult = validateAction(rawAction, level, validOperationIds);
    if (isDecodeAttemptFailure(actionResult)) {
      return actionResult;
    }
    actions.push(actionResult);
  }

  const payload: UrlAttemptPayload = Object.freeze({
    schemaVersion: PERSISTENCE_SCHEMA,
    levelId: level.id as LevelId,
    levelVersion: rawPayload.levelVersion,
    actions: freezeActions(actions),
  });

  if (payload.levelVersion !== level.version) {
    return Object.freeze({ ok: false, reason: 'historical-level-version', payload });
  }

  return payload;
}

export function encodeAttempt(payload: UrlAttemptPayload): string {
  return encodeURIComponent(
    JSON.stringify({
      schemaVersion: PERSISTENCE_SCHEMA,
      levelId: payload.levelId,
      levelVersion: payload.levelVersion,
      actions: payload.actions.map(cloneAction),
    }),
  );
}

export function decodeAttempt(encoded: string, getLevel: GetLevel): DecodeAttemptResult {
  const decoded = decodeUriComponent(encoded);
  if (isDecodeAttemptFailure(decoded)) {
    return decoded;
  }

  const parsed = parseJson(decoded);
  if (isDecodeAttemptFailure(parsed)) {
    return parsed;
  }

  const payload = validatePayload(parsed, getLevel);
  if (isDecodeAttemptFailure(payload)) {
    return payload;
  }

  const level = getLevel(payload.levelId);
  const replayResult = replay(level, payload.actions);
  if (!replayResult.ok) {
    return Object.freeze({
      ok: false,
      reason: 'replay-blocked',
      index: replayResult.index,
      blockReason: freezeBlockReason(replayResult.reason),
    });
  }

  const tuple = attemptRankingTuple(replayResult.state);
  const replayScore = score(replayResult.state);
  const outcome: Outcome = replayScore.mastered ? 'mastered' : 'legal';

  return Object.freeze({
    ok: true,
    attempt: freezeAttempt(level.id as LevelId, level.version, payload.actions, outcome, tuple),
  });
}
