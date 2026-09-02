import type { LevelConfig } from '../engine/types';
import type { SelectedBlockStatus } from '../app/useGame';
import { PatternCheck, type PatternCheckModel } from './PatternCheck';

interface GameControlsProps {
  readonly level: LevelConfig;
  readonly selectedBlockStatus: SelectedBlockStatus;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly canReadySet: boolean;
  readonly readySetReason: string;
  readonly hintReason: string;
  readonly automationReason: string;
  readonly canSolve: boolean;
  readonly patternCheck: PatternCheckModel | null;
  readonly onWait: (rank: number) => void;
  readonly onPlaceSelected: () => void;
  readonly onClearSelection: () => void;
  readonly onShare: () => void;
  readonly onUndo: () => void;
  readonly onRedo: () => void;
  readonly onReadySet: () => void;
  readonly onHint: () => void;
  readonly onAutomate: () => void;
  readonly onSolve: () => void;
  readonly onStampPattern: () => void;
  readonly onReset: () => void;
}

export function GameControls({
  level,
  selectedBlockStatus,
  canUndo,
  canRedo,
  canReadySet,
  readySetReason,
  hintReason,
  automationReason,
  canSolve,
  patternCheck,
  onWait,
  onPlaceSelected,
  onClearSelection,
  onShare,
  onUndo,
  onRedo,
  onReadySet,
  onHint,
  onAutomate,
  onSolve,
  onStampPattern,
  onReset,
}: GameControlsProps) {
  return (
    <section className="schedule-command-rail" aria-label="Schedule command rail">
      <div className="schedule-command-rail__primary">
        <h2 id="game-controls-heading">Schedule</h2>
        <button
          type="button"
          className="command-button"
          aria-label="Undo last action"
          onClick={onUndo}
          disabled={!canUndo}
        >
          Undo
        </button>
        <button
          type="button"
          className="command-button"
          aria-label="Redo next action"
          onClick={onRedo}
          disabled={!canRedo}
        >
          Redo
        </button>
        <button
          type="button"
          className="command-button command-button--primary"
          aria-label="Place selected operation"
          onClick={onPlaceSelected}
          disabled={!selectedBlockStatus.canPlace}
        >
          Place
        </button>
        <div
          className="selected-block-status"
          role="group"
          aria-label="Selected block status"
          data-state={selectedBlockStatus.state}
        >
          <span className="selected-block-status__label">{selectedBlockStatus.label}</span>
          {selectedBlockStatus.code ? (
            <span className="selected-block-status__code">{selectedBlockStatus.code}</span>
          ) : null}
          <span className="selected-block-status__meta">{selectedBlockStatus.detail}</span>
        </div>
        <button
          type="button"
          className="command-button"
          aria-label="Clear selected operation"
          onClick={onClearSelection}
        >
          Clear
        </button>
      </div>

      <div className="schedule-command-rail__secondary">
        <div className="control-cluster" aria-label="Rank wait controls">
          <span className="control-cluster__label">Wait</span>
          {Array.from({ length: level.rankCount }, (_, rank) => (
            <button
              key={rank}
              type="button"
              className="command-button command-button--rank"
              aria-label={'Wait one tick on rank ' + rank}
              onClick={() => onWait(rank)}
            >
              R{rank}
            </button>
          ))}
        </div>

        <div className="control-cluster" aria-label="Learning controls">
          <span className="control-cluster__label">Assist</span>
          <button
            type="button"
            className="command-button"
            aria-label="Show ready operations"
            onClick={onReadySet}
            disabled={!canReadySet}
            aria-describedby="ready-set-reason"
          >
            Ready
          </button>
          <button
            type="button"
            className="command-button"
            aria-label="Show local hint"
            onClick={onHint}
            disabled={!level.coaching.suggest}
            aria-describedby="hint-reason"
          >
            Hint
          </button>
          <button
            type="button"
            className="command-button"
            aria-label="Run until interesting boundary"
            onClick={onAutomate}
            disabled={!level.coaching.auto}
            aria-describedby="automation-reason"
          >
            Auto
          </button>
          <button
            type="button"
            className="command-button command-button--solve"
            aria-label="Solve from current state"
            aria-describedby="solve-reason"
            onClick={onSolve}
            disabled={!canSolve}
          >
            Solve
          </button>
        </div>

        {patternCheck ? <PatternCheck check={patternCheck} onStamp={onStampPattern} /> : null}

        <div className="control-cluster" aria-label="Attempt controls">
          <span className="control-cluster__label">Attempt</span>
          <button
            type="button"
            className="command-button"
            aria-label="Share attempt link"
            onClick={onShare}
          >
            Share
          </button>
          <button
            type="button"
            className="command-button command-button--danger"
            aria-label="Reset current attempt"
            onClick={onReset}
          >
            Reset
          </button>
        </div>

        <div className="control-notes sr-only">
          <p id="ready-set-reason">{readySetReason}</p>
          <p id="hint-reason">{hintReason}</p>
          <p id="automation-reason">{automationReason}</p>
          <p id="solve-reason">
            Complete from here, preferring mastery, then makespan, peak memory, gather count, idle,
            and action count.
          </p>
        </div>
      </div>
    </section>
  );
}
