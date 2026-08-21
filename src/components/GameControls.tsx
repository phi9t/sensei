import type { LevelConfig } from '../engine/types';

interface GameControlsProps {
  readonly level: LevelConfig;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly canReadySet: boolean;
  readonly readySetReason: string;
  readonly hintReason: string;
  readonly automationReason: string;
  readonly onWait: (rank: number) => void;
  readonly onPlaceSelected: () => void;
  readonly onClearSelection: () => void;
  readonly onShare: () => void;
  readonly onUndo: () => void;
  readonly onRedo: () => void;
  readonly onReadySet: () => void;
  readonly onHint: () => void;
  readonly onAutomate: () => void;
  readonly onReset: () => void;
}

export function GameControls({
  level,
  canUndo,
  canRedo,
  canReadySet,
  readySetReason,
  hintReason,
  automationReason,
  onWait,
  onPlaceSelected,
  onClearSelection,
  onShare,
  onUndo,
  onRedo,
  onReadySet,
  onHint,
  onAutomate,
  onReset,
}: GameControlsProps) {
  return (
    <section className="panel controls-panel" aria-label="Game controls">
      <div className="controls-primary">
        <h2 id="game-controls-heading">Controls</h2>
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
      </div>

      <details className="more-controls">
        <summary>More controls</summary>
        <div className="more-controls__body">
          <div className="control-cluster" aria-label="Placement controls">
            <span className="control-cluster__label">Selection</span>
            <button
              type="button"
              className="command-button command-button--primary"
              aria-label="Place selected operation"
              onClick={onPlaceSelected}
            >
              Place selected
            </button>
            <button
              type="button"
              className="command-button"
              aria-label="Clear selected operation"
              onClick={onClearSelection}
            >
              Clear
            </button>
          </div>

          <div className="control-cluster" aria-label="Rank wait controls">
            <span className="control-cluster__label">Wait 1 tick</span>
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
              Auto-step
            </button>
          </div>

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
          </div>
        </div>
      </details>
    </section>
  );
}
