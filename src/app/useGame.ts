import { useState } from 'react';
import {
  explainBlockedMove,
  revealReadySet,
  runUntilInteresting,
  suggestMove,
  type ExplanationResult,
  type StopReason,
  type Suggestion,
} from '../coaching/coaching';
import {
  applyAction,
  classifyMoves,
  replay,
  type MoveClassification,
  type ScheduleState,
} from '../engine/replay';
import { attemptRankingTuple, score } from '../engine/score';
import { parseOperationId } from '../engine/operations';
import type { Action, Operation, OperationId } from '../engine/types';
import { LEVEL_IDS, getLevel, type LevelId } from '../levels/levels';
import {
  loadProgress,
  saveProgress,
  selectBest,
  encodeAttempt,
  type Progress,
  type StoredAttempt,
  type UrlAttemptPayload,
} from '../persistence/storage';

interface OverlayState {
  readonly message: string;
}

export interface LevelOptionState {
  readonly levelId: LevelId;
  readonly title: string;
  readonly unlocked: boolean;
  readonly reason: string | null;
}

interface GameState {
  readonly levelId: LevelId;
  readonly actions: readonly Action[];
  readonly cursor: number;
  readonly batchEnds: readonly number[];
  readonly selectedOperationId: OperationId | null;
  readonly overlay: OverlayState;
  readonly progress: Progress;
  readonly persistenceNotice: string | null;
  readonly lastRecordedAttemptKey: string | null;
}

export interface GameViewModel {
  readonly levelId: LevelId;
  readonly level: ReturnType<typeof getLevel>;
  readonly actions: readonly Action[];
  readonly cursor: number;
  readonly selectedOperationId: OperationId | null;
  readonly overlay: OverlayState;
  readonly schedule: ScheduleState;
  readonly score: ReturnType<typeof score>;
  readonly attemptTuple: ReturnType<typeof attemptRankingTuple>;
  readonly moveClassifications: readonly MoveClassification[];
  readonly selectedExplanation: ExplanationResult | null;
  readonly suggestion: Suggestion | null;
  readonly readySet: ReturnType<typeof revealReadySet>;
  readonly persistenceNotice: string | null;
  readonly levelOptions: readonly LevelOptionState[];
  readonly canReadySet: boolean;
  readonly readySetReason: string;
  readonly hintReason: string;
  readonly automationReason: string;
  readonly activateOperation: (operationId: OperationId) => void;
  readonly selectOperation: (operationId: OperationId) => void;
  readonly clearSelection: () => void;
  readonly placeSelectedOperation: () => void;
  readonly shareAttempt: () => void;
  readonly waitOneTick: (rank: number) => void;
  readonly undo: () => void;
  readonly redo: () => void;
  readonly reset: () => void;
  readonly changeLevel: (levelId: LevelId) => void;
  readonly showReadySet: () => void;
  readonly showHint: () => void;
  readonly automate: () => void;
}

const DEFAULT_LEVEL_ID: LevelId = 'dependency-chain';
const READY_MESSAGE = 'Ready to place operations.';

function cloneAction(action: Action): Action {
  switch (action.type) {
    case 'place':
      return Object.freeze({ type: 'place', operationId: action.operationId });
    case 'wait':
      return Object.freeze({ type: 'wait', rank: action.rank });
  }
}

function freezeActions(actions: readonly Action[]): readonly Action[] {
  return Object.freeze(actions.map(cloneAction));
}

function hasSavedProgress(progress: Progress): boolean {
  return (
    progress.unlockedLevelIds.length > 1 ||
    LEVEL_IDS.some(
      (levelId) =>
        progress.bestLegalAttempts[levelId] !== undefined ||
        progress.bestMasteredAttempts[levelId] !== undefined,
    ) ||
    progress.historicalAttempts.length > 0
  );
}

function nextLevelId(levelId: LevelId): LevelId | null {
  const index = LEVEL_IDS.indexOf(levelId);
  return index >= 0 && index + 1 < LEVEL_IDS.length ? LEVEL_IDS[index + 1]! : null;
}

function unlockedForUi(progress: Progress, currentLevelId: LevelId): ReadonlySet<LevelId> {
  return new Set<LevelId>([...progress.unlockedLevelIds, currentLevelId]);
}

function levelUnlockReason(levelId: LevelId): string | null {
  if (levelId === 'dependency-chain') {
    return null;
  }
  const index = LEVEL_IDS.indexOf(levelId);
  const prerequisite = LEVEL_IDS[index - 1];
  return prerequisite
    ? `Complete ${getLevel(prerequisite).title} to unlock ${getLevel(levelId).title}.`
    : null;
}

function levelOptions(progress: Progress, currentLevelId: LevelId): readonly LevelOptionState[] {
  const unlocked = unlockedForUi(progress, currentLevelId);
  return Object.freeze(
    LEVEL_IDS.map((levelId) =>
      Object.freeze({
        levelId,
        title: getLevel(levelId).title,
        unlocked: unlocked.has(levelId),
        reason: unlocked.has(levelId) ? null : levelUnlockReason(levelId),
      }),
    ),
  );
}

function coachingReason(
  capability: 'readySet' | 'suggest' | 'auto',
  levelId: LevelId,
  enabled: boolean,
): string {
  const levelTitle = getLevel(levelId).title;
  const name =
    capability === 'readySet'
      ? 'Ready set'
      : capability === 'suggest'
        ? 'Local hint'
        : 'Automation';
  return enabled
    ? `${name} is available on ${levelTitle}.`
    : `${name} is unavailable on ${levelTitle}.`;
}

function urlRecoveryNotice(reason: string): string {
  return `Shared attempt could not be read: ${reason}.`;
}

function initialGameState(
  initialLevelId: LevelId,
  storage: Storage | null,
  initialPersistenceNotice: string | null,
): GameState {
  const hash = typeof window === 'undefined' ? '' : window.location.hash;
  const loaded = loadProgress(storage, hash, getLevel);
  const loadedLevelId = loaded.urlAttempt?.levelId ?? initialLevelId;
  const loadedActions = freezeActions(loaded.urlAttempt?.actions ?? []);
  const loadedBatchEnds = Object.freeze(loadedActions.map((_, index) => index + 1));
  let persistenceNotice: string | null = null;

  if (loaded.status === 'session-only') {
    persistenceNotice = 'Could not access saved progress. Progress is staying in this tab only.';
  } else if (hasSavedProgress(loaded.progress)) {
    persistenceNotice = 'Progress restored.';
  }

  if (loaded.recovery) {
    persistenceNotice = 'Saved progress could not be read. Starting from the last safe state.';
  }

  if (loaded.urlRecovery) {
    persistenceNotice = urlRecoveryNotice(loaded.urlRecovery.failure.reason);
  }

  if (initialPersistenceNotice !== null && persistenceNotice === null) {
    persistenceNotice = initialPersistenceNotice;
  }

  return {
    levelId: loadedLevelId,
    actions: loadedActions,
    cursor: loadedActions.length,
    batchEnds: loadedBatchEnds,
    selectedOperationId: null,
    overlay: {
      message:
        loaded.urlAttempt === null
          ? READY_MESSAGE
          : `Loaded ${getLevel(loadedLevelId).title} from a shared attempt.`,
    },
    progress: loaded.progress,
    persistenceNotice,
    lastRecordedAttemptKey: null,
  };
}

function activeActions(actions: readonly Action[], cursor: number): readonly Action[] {
  return actions.slice(0, cursor);
}

function deriveSchedule(
  levelId: LevelId,
  actions: readonly Action[],
  cursor: number,
): ScheduleState {
  const level = getLevel(levelId);
  const replayed = replay(level, activeActions(actions, cursor));
  if (!replayed.ok) {
    throw new Error(
      `Active attempt is inconsistent at action ${replayed.index}: ${replayed.reason.kind}`,
    );
  }
  return replayed.state;
}

export function formatOperationName(value: OperationId | Operation): string {
  const parsed = typeof value === 'string' ? parseOperationId(value) : value;
  return `${parsed.kind} stage ${parsed.stage} microbatch ${parsed.microbatch}`;
}

export function formatOperationCode(value: OperationId | Operation): string {
  const parsed = typeof value === 'string' ? parseOperationId(value) : value;
  return `${parsed.kind}${parsed.stage}:S${parsed.stage}:B${parsed.microbatch}`;
}

function coherentSelection(
  selectedOperationId: OperationId | null,
  operations: readonly Operation[],
): OperationId | null {
  if (selectedOperationId === null) {
    return null;
  }
  return operations.some((operation) => operation.id === selectedOperationId)
    ? selectedOperationId
    : null;
}

function formatBlockedSummary(operationId: OperationId, count: number): string {
  const reasonLabel = count === 1 ? 'blocker' : 'blockers';
  return `${formatOperationName(operationId)} is blocked by ${count} ${reasonLabel}.`;
}

function activeAttemptUrl(levelId: LevelId, actions: readonly Action[]): string {
  const encoded = encodeAttempt(buildUrlAttempt(levelId, actions));
  if (typeof window === 'undefined') {
    return `#attempt=${encoded}`;
  }
  const url = new URL(window.location.href);
  url.hash = `attempt=${encoded}`;
  return url.toString();
}

export function formatStopReason(stop: StopReason): string {
  switch (stop.kind) {
    case 'choice':
      return `Automation stopped at a learner choice between ${stop.operationIds
        .map(formatOperationCode)
        .join(', ')}.`;
    case 'dependency-gap':
      return `Automation stopped at a dependency gap before ${formatOperationCode(stop.operationId)} can start at ${stop.start} while rank frontier ${stop.rankFrontier} is still behind.`;
    case 'memory-boundary':
      return `Automation stopped at a memory boundary before ${stop.operationIds
        .map(formatOperationCode)
        .join(', ')}.`;
    case 'would-complete':
      return stop.operationId
        ? `Automation stopped because ${formatOperationCode(stop.operationId)} would complete the attempt.`
        : 'Automation stopped because the attempt is already complete.';
    case 'memory-deadlock':
      return 'Automation detected a memory deadlock. Undo or reset to recover.';
    case 'deadlock':
      return 'Automation detected a deadlock. Undo or reset to recover.';
  }
}

function freezeProgress(progress: Progress): Progress {
  return Object.freeze({
    unlockedLevelIds: Object.freeze([...progress.unlockedLevelIds]),
    bestLegalAttempts: Object.freeze({ ...progress.bestLegalAttempts }),
    bestMasteredAttempts: Object.freeze({ ...progress.bestMasteredAttempts }),
    historicalAttempts: Object.freeze([...progress.historicalAttempts]),
  });
}

function truncateBatchEnds(batchEnds: readonly number[], cursor: number): readonly number[] {
  return Object.freeze(batchEnds.filter((end) => end <= cursor));
}

function previousBoundary(batchEnds: readonly number[], cursor: number): number {
  let previous = 0;
  for (const end of batchEnds) {
    if (end >= cursor) {
      break;
    }
    previous = end;
  }
  return previous;
}

function buildAttempt(levelId: LevelId, actions: readonly Action[]): StoredAttempt | null {
  const level = getLevel(levelId);
  const replayed = replay(level, actions);
  if (!replayed.ok) {
    throw new Error(`Completed attempt became invalid at action ${replayed.index}.`);
  }

  const scoreResult = score(replayed.state);
  if (!scoreResult.complete) {
    return null;
  }

  return Object.freeze({
    levelId,
    levelVersion: level.version,
    actions: freezeActions(actions),
    outcome: scoreResult.mastered ? 'mastered' : 'legal',
    tuple: attemptRankingTuple(replayed.state),
  });
}

function buildUrlAttempt(levelId: LevelId, actions: readonly Action[]): UrlAttemptPayload {
  const level = getLevel(levelId);
  return Object.freeze({
    schemaVersion: 1,
    levelId,
    levelVersion: level.version,
    actions: freezeActions(actions),
  });
}

function mergeProgress(progress: Progress, attempt: StoredAttempt): Progress {
  const nextUnlocked = new Set<LevelId>(progress.unlockedLevelIds);
  nextUnlocked.add(attempt.levelId);
  const unlockedNextLevelId = nextLevelId(attempt.levelId);
  if (unlockedNextLevelId) {
    nextUnlocked.add(unlockedNextLevelId);
  }

  const bestLegalAttempts: Partial<Record<LevelId, StoredAttempt>> = {
    ...progress.bestLegalAttempts,
  };
  const legalCandidates = [progress.bestLegalAttempts[attempt.levelId], attempt].filter(
    (candidate): candidate is StoredAttempt => candidate !== undefined,
  );
  const bestLegalAttempt = selectBest(legalCandidates, {
    levelId: attempt.levelId,
    levelVersion: attempt.levelVersion,
  });
  if (bestLegalAttempt) {
    bestLegalAttempts[attempt.levelId] = bestLegalAttempt;
  }

  const bestMasteredAttempts: Partial<Record<LevelId, StoredAttempt>> = {
    ...progress.bestMasteredAttempts,
  };
  if (attempt.outcome === 'mastered') {
    const masteredCandidates = [progress.bestMasteredAttempts[attempt.levelId], attempt].filter(
      (candidate): candidate is StoredAttempt => candidate !== undefined,
    );
    const bestMasteredAttempt = selectBest(masteredCandidates, {
      levelId: attempt.levelId,
      levelVersion: attempt.levelVersion,
    });
    if (bestMasteredAttempt) {
      bestMasteredAttempts[attempt.levelId] = bestMasteredAttempt;
    }
  }

  return freezeProgress({
    unlockedLevelIds: Object.freeze(LEVEL_IDS.filter((levelId) => nextUnlocked.has(levelId))),
    bestLegalAttempts: Object.freeze(bestLegalAttempts),
    bestMasteredAttempts: Object.freeze(bestMasteredAttempts),
    historicalAttempts: progress.historicalAttempts,
  });
}

function appendBatch(
  current: GameState,
  appendedActions: readonly Action[],
  selectedOperationId: OperationId | null,
  message: string,
): GameState {
  if (appendedActions.length === 0) {
    return {
      ...current,
      selectedOperationId,
      overlay: { message },
    };
  }

  const prefix = activeActions(current.actions, current.cursor);
  const nextActions = freezeActions([...prefix, ...appendedActions]);
  const nextBatchEnds = Object.freeze([
    ...truncateBatchEnds(current.batchEnds, current.cursor),
    nextActions.length,
  ]);

  return {
    ...current,
    actions: nextActions,
    cursor: nextActions.length,
    batchEnds: nextBatchEnds,
    selectedOperationId,
    overlay: { message },
  };
}

function persistIfComplete(current: GameState, storage: Storage | null): GameState {
  const completedAttempt = buildAttempt(
    current.levelId,
    activeActions(current.actions, current.cursor),
  );
  if (completedAttempt === null) {
    return current;
  }

  const fingerprint = `${completedAttempt.levelId}:${completedAttempt.levelVersion}:${JSON.stringify(
    completedAttempt.actions,
  )}`;
  if (current.lastRecordedAttemptKey === fingerprint) {
    return current;
  }

  const nextProgress = mergeProgress(current.progress, completedAttempt);
  if (storage === null) {
    return {
      ...current,
      progress: nextProgress,
      lastRecordedAttemptKey: fingerprint,
    };
  }

  const saved = saveProgress(storage, nextProgress);
  const shouldClearPersistenceNotice =
    current.persistenceNotice ===
      'Could not save progress. Progress is staying in this tab only.' ||
    current.persistenceNotice === 'Progress restored.';
  return {
    ...current,
    progress: saved.progress,
    persistenceNotice:
      saved.status === 'session-only'
        ? 'Could not save progress. Progress is staying in this tab only.'
        : shouldClearPersistenceNotice
          ? null
          : current.persistenceNotice,
    lastRecordedAttemptKey: fingerprint,
  };
}

function hasCompletedLevel(progress: Progress, levelId: LevelId): boolean {
  return (
    progress.bestLegalAttempts[levelId] !== undefined ||
    progress.bestMasteredAttempts[levelId] !== undefined
  );
}

function canUseReadySet(progress: Progress, levelId: LevelId): boolean {
  const level = getLevel(levelId);
  if (!level.coaching.readySet) {
    return false;
  }
  return levelId === 'fill-the-pipe' ? hasCompletedLevel(progress, levelId) : true;
}

function readySetAvailabilityReason(progress: Progress, levelId: LevelId): string {
  const level = getLevel(levelId);
  if (!level.coaching.readySet) {
    return coachingReason('readySet', levelId, false);
  }
  if (levelId === 'fill-the-pipe' && !hasCompletedLevel(progress, levelId)) {
    return 'Ready set unlocks after completing Fill the Pipe once.';
  }
  return coachingReason('readySet', levelId, true);
}

export function useGame(
  initialLevelId: LevelId = DEFAULT_LEVEL_ID,
  storage: Storage | null = null,
  initialPersistenceNotice: string | null = null,
): GameViewModel {
  const [game, setGame] = useState<GameState>(() =>
    initialGameState(initialLevelId, storage, initialPersistenceNotice),
  );

  const level = getLevel(game.levelId);
  const schedule = deriveSchedule(game.levelId, game.actions, game.cursor);
  const moveClassifications = classifyMoves(schedule);
  const scoreResult = score(schedule);
  const attemptTuple = attemptRankingTuple(schedule);
  const selectedOperationId = coherentSelection(game.selectedOperationId, schedule.operations);
  const selectedExplanation =
    selectedOperationId === null ? null : explainBlockedMove(schedule, selectedOperationId);
  const suggestion = level.coaching.suggest ? suggestMove(schedule) : null;
  const canReadySet = canUseReadySet(game.progress, game.levelId);
  const readySet = canReadySet ? revealReadySet(schedule) : [];
  const optionStates = levelOptions(game.progress, game.levelId);
  const readySetReason = readySetAvailabilityReason(game.progress, game.levelId);
  const hintReason = coachingReason('suggest', game.levelId, level.coaching.suggest);
  const automationReason = coachingReason('auto', game.levelId, level.coaching.auto);

  function updateWithCurrentSchedule(
    updater: (current: GameState, currentSchedule: ScheduleState) => GameState,
  ): void {
    setGame((current) =>
      persistIfComplete(
        updater(current, deriveSchedule(current.levelId, current.actions, current.cursor)),
        storage,
      ),
    );
  }

  function activateOperation(operationId: OperationId): void {
    updateWithCurrentSchedule((current, currentSchedule) => {
      const classification = moveClassificationsFor(currentSchedule).find(
        (entry) => entry.operation.id === operationId,
      );
      if (!classification) {
        throw new Error(`Operation ${operationId} not found in current inventory`);
      }

      if (classification.status === 'completed') {
        return {
          ...current,
          selectedOperationId: operationId,
          overlay: {
            message: `${formatOperationName(operationId)} is already placed and now selected.`,
          },
        };
      }

      if (classification.status === 'blocked') {
        return {
          ...current,
          selectedOperationId: operationId,
          overlay: {
            message: formatBlockedSummary(operationId, classification.reasons.length),
          },
        };
      }

      const action: Action = { type: 'place', operationId };
      const applied = applyAction(currentSchedule, action);
      if (!applied.ok) {
        throw new Error(
          `Engine inconsistency while placing ${operationId}: ${applied.reason.kind}`,
        );
      }

      return appendBatch(
        current,
        [action],
        operationId,
        `Placed ${formatOperationName(operationId)} on rank ${classification.operation.rank}.`,
      );
    });
  }

  function selectOperation(operationId: OperationId): void {
    updateWithCurrentSchedule((current) => ({
      ...current,
      selectedOperationId: operationId,
      overlay: { message: `Inspecting ${formatOperationName(operationId)}.` },
    }));
  }

  function clearSelection(): void {
    updateWithCurrentSchedule((current) => ({
      ...current,
      selectedOperationId: null,
      overlay: { message: 'Cleared the selected operation.' },
    }));
  }

  function placeSelectedOperation(): void {
    updateWithCurrentSchedule((current, currentSchedule) => {
      const operationId = current.selectedOperationId;
      if (operationId === null) {
        return {
          ...current,
          overlay: { message: 'Select a ready operation before placing it.' },
        };
      }

      const classification = moveClassificationsFor(currentSchedule).find(
        (entry) => entry.operation.id === operationId,
      );
      if (!classification) {
        throw new Error(`Operation ${operationId} not found in current inventory`);
      }
      if (classification.status === 'completed') {
        return {
          ...current,
          overlay: { message: `${formatOperationName(operationId)} is already placed.` },
        };
      }
      if (classification.status === 'blocked') {
        return {
          ...current,
          overlay: { message: formatBlockedSummary(operationId, classification.reasons.length) },
        };
      }

      const action: Action = { type: 'place', operationId };
      const applied = applyAction(currentSchedule, action);
      if (!applied.ok) {
        throw new Error(
          `Engine inconsistency while placing ${operationId}: ${applied.reason.kind}`,
        );
      }
      return appendBatch(
        current,
        [action],
        operationId,
        `Placed ${formatOperationName(operationId)} on rank ${classification.operation.rank}.`,
      );
    });
  }

  function shareAttempt(): void {
    setGame((current) => {
      const url = activeAttemptUrl(current.levelId, activeActions(current.actions, current.cursor));
      if (typeof window !== 'undefined') {
        window.location.hash = new URL(url).hash;
      }
      return {
        ...current,
        overlay: { message: 'Share link updated in the address bar.' },
      };
    });
  }

  function waitOneTick(rank: number): void {
    updateWithCurrentSchedule((current, currentSchedule) => {
      const action: Action = { type: 'wait', rank };
      const applied = applyAction(currentSchedule, action);
      if (!applied.ok) {
        return {
          ...current,
          overlay: { message: `Could not wait on rank ${rank}: ${applied.reason.kind}.` },
        };
      }

      return appendBatch(
        current,
        [action],
        current.selectedOperationId,
        `Inserted one intentional idle tick on rank ${rank}.`,
      );
    });
  }

  function undo(): void {
    setGame((current) => {
      if (current.cursor === 0) {
        return current;
      }
      const nextCursor = previousBoundary(current.batchEnds, current.cursor);
      const undoneCount = current.cursor - nextCursor;
      return persistIfComplete(
        {
          ...current,
          cursor: nextCursor,
          overlay: {
            message:
              undoneCount === 1
                ? 'Undid 1 action.'
                : `Undid 1 batch containing ${undoneCount} actions.`,
          },
        },
        storage,
      );
    });
  }

  function redo(): void {
    setGame((current) => {
      const nextCursor = current.batchEnds.find((end) => end > current.cursor);
      if (nextCursor === undefined) {
        return current;
      }
      const redoneCount = nextCursor - current.cursor;
      return persistIfComplete(
        {
          ...current,
          cursor: nextCursor,
          overlay: {
            message:
              redoneCount === 1
                ? 'Redid 1 action.'
                : `Redid 1 batch containing ${redoneCount} actions.`,
          },
        },
        storage,
      );
    });
  }

  function reset(): void {
    setGame((current) =>
      persistIfComplete(
        {
          ...current,
          actions: Object.freeze([]),
          cursor: 0,
          batchEnds: Object.freeze([]),
          selectedOperationId: null,
          overlay: { message: 'Reset the current attempt.' },
          lastRecordedAttemptKey: null,
        },
        storage,
      ),
    );
  }

  function changeLevel(levelId: LevelId): void {
    setGame((current) => {
      const selectable = levelOptions(current.progress, current.levelId).find(
        (entry) => entry.levelId === levelId,
      );
      if (selectable && !selectable.unlocked) {
        return persistIfComplete(
          {
            ...current,
            overlay: { message: selectable.reason ?? `${selectable.title} is locked.` },
          },
          storage,
        );
      }

      return persistIfComplete(
        {
          ...current,
          levelId,
          actions: Object.freeze([]),
          cursor: 0,
          batchEnds: Object.freeze([]),
          selectedOperationId: null,
          overlay: { message: `Loaded ${getLevel(levelId).title}.` },
          lastRecordedAttemptKey: null,
        },
        storage,
      );
    });
  }

  function showReadySet(): void {
    updateWithCurrentSchedule((current, currentSchedule) => {
      if (!canUseReadySet(current.progress, current.levelId)) {
        return {
          ...current,
          overlay: { message: readySetAvailabilityReason(current.progress, current.levelId) },
        };
      }

      const nextReadySet = revealReadySet(currentSchedule);
      return {
        ...current,
        overlay: {
          message:
            nextReadySet.length === 0
              ? 'Ready set: no operations are legal yet.'
              : `Ready set: ${nextReadySet.map((entry) => entry.operationId).join(', ')}.`,
        },
      };
    });
  }

  function showHint(): void {
    updateWithCurrentSchedule((current, currentSchedule) => {
      if (!getLevel(current.levelId).coaching.suggest) {
        return {
          ...current,
          overlay: { message: coachingReason('suggest', current.levelId, false) },
        };
      }

      const nextSuggestion = suggestMove(currentSchedule);
      if (!nextSuggestion) {
        return {
          ...current,
          overlay: { message: 'No local hint is available from the current state.' },
        };
      }

      return {
        ...current,
        selectedOperationId: nextSuggestion.operationId,
        overlay: {
          message: `Local hint: place ${formatOperationName(nextSuggestion.operationId)}. ${nextSuggestion.reason.message}`,
        },
      };
    });
  }

  function automate(): void {
    updateWithCurrentSchedule((current, currentSchedule) => {
      if (!getLevel(current.levelId).coaching.auto) {
        return {
          ...current,
          overlay: { message: coachingReason('auto', current.levelId, false) },
        };
      }

      const result = runUntilInteresting(currentSchedule);

      let nextSelection: OperationId | null = current.selectedOperationId;
      switch (result.stop.kind) {
        case 'choice':
        case 'memory-boundary':
          nextSelection = result.stop.operationIds[0] ?? nextSelection;
          break;
        case 'dependency-gap':
        case 'would-complete':
          nextSelection = result.stop.operationId ?? nextSelection;
          break;
        case 'memory-deadlock':
        case 'deadlock':
          break;
      }

      return appendBatch(current, result.applied, nextSelection, formatStopReason(result.stop));
    });
  }

  return {
    levelId: game.levelId,
    level,
    actions: game.actions,
    cursor: game.cursor,
    selectedOperationId,
    overlay: game.overlay,
    schedule,
    score: scoreResult,
    attemptTuple,
    moveClassifications,
    selectedExplanation,
    suggestion,
    readySet,
    persistenceNotice: game.persistenceNotice,
    levelOptions: optionStates,
    canReadySet,
    readySetReason,
    hintReason,
    automationReason,
    activateOperation,
    selectOperation,
    clearSelection,
    placeSelectedOperation,
    shareAttempt,
    waitOneTick,
    undo,
    redo,
    reset,
    changeLevel,
    showReadySet,
    showHint,
    automate,
  };
}

function moveClassificationsFor(state: ScheduleState): readonly MoveClassification[] {
  return classifyMoves(state);
}
