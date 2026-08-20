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
import { getLevel, type LevelId } from '../levels/levels';

interface OverlayState {
  readonly message: string;
}

interface GameState {
  readonly levelId: LevelId;
  readonly actions: readonly Action[];
  readonly cursor: number;
  readonly selectedOperationId: OperationId | null;
  readonly overlay: OverlayState;
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
  readonly activateOperation: (operationId: OperationId) => void;
  readonly selectOperation: (operationId: OperationId) => void;
  readonly waitOneTick: (rank: number) => void;
  readonly undo: () => void;
  readonly redo: () => void;
  readonly reset: () => void;
  readonly changeLevel: (levelId: LevelId) => void;
  readonly showHint: () => void;
  readonly automate: () => void;
}

const DEFAULT_LEVEL_ID: LevelId = 'dependency-chain';

function initialGameState(levelId: LevelId): GameState {
  return {
    levelId,
    actions: [],
    cursor: 0,
    selectedOperationId: null,
    overlay: { message: 'Ready to place operations.' },
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
  if (typeof value === 'string') {
    return value;
  }
  return value.id;
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

function stopReasonMessage(stop: StopReason): string {
  switch (stop.kind) {
    case 'choice':
      return `Automation stopped at a learner choice between ${stop.operationIds
        .map(formatOperationCode)
        .join(', ')}.`;
    case 'dependency-gap':
      return `Automation stopped before a dependency-forced gap for ${formatOperationCode(stop.operationId)}.`;
    case 'memory-boundary':
      return `Automation stopped at memory boundary: ${stop.operationIds
        .map(formatOperationCode)
        .join(', ')}.`;
    case 'would-complete':
      return stop.operationId
        ? `Automation stopped before the final placement ${formatOperationCode(stop.operationId)}.`
        : 'Automation stopped because the attempt is already complete.';
    case 'memory-deadlock':
      return 'Automation detected a memory deadlock. Undo or reset to recover.';
    case 'deadlock':
      return 'Automation detected a deadlock. Undo or reset to recover.';
  }
}

export function useGame(initialLevelId: LevelId = DEFAULT_LEVEL_ID): GameViewModel {
  const [game, setGame] = useState<GameState>(() => initialGameState(initialLevelId));

  const level = getLevel(game.levelId);
  const schedule = deriveSchedule(game.levelId, game.actions, game.cursor);
  const moveClassifications = classifyMoves(schedule);
  const scoreResult = score(schedule);
  const attemptTuple = attemptRankingTuple(schedule);
  const selectedOperationId = coherentSelection(game.selectedOperationId, schedule.operations);
  const selectedExplanation =
    selectedOperationId === null ? null : explainBlockedMove(schedule, selectedOperationId);
  const suggestion = level.coaching.suggest ? suggestMove(schedule) : null;
  const readySet = level.coaching.readySet ? revealReadySet(schedule) : [];

  function updateWithCurrentSchedule(
    updater: (current: GameState, currentSchedule: ScheduleState) => GameState,
  ): void {
    setGame((current) =>
      updater(current, deriveSchedule(current.levelId, current.actions, current.cursor)),
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

      const prefix = activeActions(current.actions, current.cursor);
      const action: Action = { type: 'place', operationId };
      const applied = applyAction(currentSchedule, action);
      if (!applied.ok) {
        throw new Error(
          `Engine inconsistency while placing ${operationId}: ${applied.reason.kind}`,
        );
      }

      const nextActions = [...prefix, action];
      return {
        ...current,
        actions: nextActions,
        cursor: nextActions.length,
        selectedOperationId: operationId,
        overlay: {
          message: `Placed ${formatOperationName(operationId)} on rank ${classification.operation.rank}.`,
        },
      };
    });
  }

  function selectOperation(operationId: OperationId): void {
    updateWithCurrentSchedule((current) => ({
      ...current,
      selectedOperationId: operationId,
      overlay: { message: `Inspecting ${formatOperationName(operationId)}.` },
    }));
  }

  function waitOneTick(rank: number): void {
    updateWithCurrentSchedule((current, currentSchedule) => {
      const prefix = activeActions(current.actions, current.cursor);
      const action: Action = { type: 'wait', rank };
      const applied = applyAction(currentSchedule, action);
      if (!applied.ok) {
        return {
          ...current,
          overlay: { message: `Could not wait on rank ${rank}: ${applied.reason.kind}.` },
        };
      }

      const nextActions = [...prefix, action];
      return {
        ...current,
        actions: nextActions,
        cursor: nextActions.length,
        overlay: { message: `Inserted one intentional idle tick on rank ${rank}.` },
      };
    });
  }

  function undo(): void {
    setGame((current) => {
      if (current.cursor === 0) {
        return current;
      }
      return {
        ...current,
        cursor: current.cursor - 1,
        overlay: { message: 'Undid the last action.' },
      };
    });
  }

  function redo(): void {
    setGame((current) => {
      if (current.cursor >= current.actions.length) {
        return current;
      }
      return {
        ...current,
        cursor: current.cursor + 1,
        overlay: { message: 'Redid the next action.' },
      };
    });
  }

  function reset(): void {
    setGame((current) => ({
      ...current,
      actions: [],
      cursor: 0,
      selectedOperationId: null,
      overlay: { message: 'Reset the current attempt.' },
    }));
  }

  function changeLevel(levelId: LevelId): void {
    setGame({
      levelId,
      actions: [],
      cursor: 0,
      selectedOperationId: null,
      overlay: { message: `Loaded ${getLevel(levelId).title}.` },
    });
  }

  function showHint(): void {
    updateWithCurrentSchedule((current, currentSchedule) => {
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
      const result = runUntilInteresting(currentSchedule);
      const prefix = activeActions(current.actions, current.cursor);
      const nextActions = [...prefix, ...result.applied];

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

      if (result.applied.length === 0) {
        return {
          ...current,
          selectedOperationId: nextSelection,
          overlay: { message: stopReasonMessage(result.stop) },
        };
      }

      return {
        ...current,
        actions: nextActions,
        cursor: nextActions.length,
        selectedOperationId: nextSelection,
        overlay: { message: stopReasonMessage(result.stop) },
      };
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
    activateOperation,
    selectOperation,
    waitOneTick,
    undo,
    redo,
    reset,
    changeLevel,
    showHint,
    automate,
  };
}

function moveClassificationsFor(state: ScheduleState): readonly MoveClassification[] {
  return classifyMoves(state);
}
