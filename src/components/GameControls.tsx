import type { LevelConfig } from '../engine/types';

interface GameControlsProps {
  readonly level: LevelConfig;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly onWait: (rank: number) => void;
  readonly onUndo: () => void;
  readonly onRedo: () => void;
  readonly onHint: () => void;
  readonly onAutomate: () => void;
  readonly onReset: () => void;
}

export function GameControls({
  level,
  canUndo,
  canRedo,
  onWait,
  onUndo,
  onRedo,
  onHint,
  onAutomate,
  onReset,
}: GameControlsProps) {
  return (
    <section className="panel controls-panel" aria-labelledby="game-controls-heading">
      <h2 id="game-controls-heading">Game controls</h2>
      <div className="controls-rank-waits">
        {Array.from({ length: level.rankCount }, (_, rank) => (
          <button key={rank} type="button" onClick={() => onWait(rank)}>
            Wait one tick on rank {rank}
          </button>
        ))}
      </div>
      <div className="controls-actions">
        <button type="button" onClick={onUndo} disabled={!canUndo}>
          Undo last action
        </button>
        <button type="button" onClick={onRedo} disabled={!canRedo}>
          Redo next action
        </button>
        <button type="button" onClick={onHint} disabled={!level.coaching.suggest}>
          Show local hint
        </button>
        <button type="button" onClick={onAutomate} disabled={!level.coaching.auto}>
          Run until interesting boundary
        </button>
        <button type="button" onClick={onReset}>
          Reset current attempt
        </button>
      </div>
    </section>
  );
}
