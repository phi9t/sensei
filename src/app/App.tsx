import { OperationTray } from '../components/OperationTray';
import { ScheduleBoard } from '../components/ScheduleBoard';
import { MoveInspector } from '../components/MoveInspector';
import { MetricsPanel } from '../components/MetricsPanel';
import { GameControls } from '../components/GameControls';
import { useGame } from './useGame';
import type { LevelId } from '../levels/levels';

interface AppProps {
  readonly initialLevelId?: LevelId;
  readonly storage?: Storage | null;
}

function resolveBrowserStorage(): {
  readonly storage: Storage | null;
  readonly notice: string | null;
} {
  try {
    return {
      storage: window.localStorage,
      notice: null,
    };
  } catch {
    return {
      storage: null,
      notice: 'Could not access saved progress. Progress is staying in this tab only.',
    };
  }
}

export function App({ initialLevelId = 'dependency-chain', storage }: AppProps) {
  const defaultStorage = storage === undefined ? resolveBrowserStorage() : null;
  const resolvedStorage = defaultStorage?.storage ?? storage ?? null;
  const initialPersistenceNotice = defaultStorage?.notice ?? null;
  const game = useGame(initialLevelId, resolvedStorage, initialPersistenceNotice);

  return (
    <main className="app-shell">
      <section className="panel hero-panel" aria-labelledby="sensei-heading">
        <div className="hero-panel__topline">
          <div>
            <h1 id="sensei-heading">Sensei Pipeline Scheduling</h1>
            <p>Correct first. Efficient next.</p>
          </div>
          <label>
            <select
              aria-label="Choose level"
              value={game.levelId}
              onChange={(event) => game.changeLevel(event.target.value as LevelId)}
            >
              {game.levelOptions.map((option) => (
                <option key={option.levelId} value={option.levelId} disabled={!option.unlocked}>
                  {option.title}
                </option>
              ))}
            </select>
          </label>
        </div>
        <section aria-labelledby="goal-and-introduction-heading">
          <h2 id="goal-and-introduction-heading">Goal and introduction</h2>
          <p>{game.level.title}</p>
          <div className="hero-panel__status">
            <p>{game.score.complete ? 'Legal completion' : 'Incomplete'}</p>
            <p>{game.score.mastered ? 'Mastered' : 'Mastery pending'}</p>
          </div>
          {game.persistenceNotice ? <p>{game.persistenceNotice}</p> : null}
          <ul aria-label="Level access status">
            {game.levelOptions
              .filter((option) => !option.unlocked && option.reason !== null)
              .map((option) => (
                <li key={option.levelId}>{option.reason}</li>
              ))}
          </ul>
        </section>
      </section>

      <div className="content-grid">
        <OperationTray
          classifications={game.moveClassifications}
          selectedOperationId={game.selectedOperationId}
          onActivate={game.activateOperation}
        />

        <ScheduleBoard schedule={game.schedule} selectedOperationId={game.selectedOperationId} />

        <MoveInspector
          operationId={game.selectedOperationId}
          explanation={game.selectedExplanation}
        />

        <MetricsPanel
          level={game.level}
          score={game.score}
          currentMemory={game.schedule.currentMemory}
          attemptTuple={game.attemptTuple}
        />

        <GameControls
          level={game.level}
          canUndo={game.cursor > 0}
          canRedo={game.cursor < game.actions.length}
          canReadySet={game.canReadySet}
          readySetReason={game.readySetReason}
          hintReason={game.hintReason}
          automationReason={game.automationReason}
          onWait={game.waitOneTick}
          onUndo={game.undo}
          onRedo={game.redo}
          onReadySet={game.showReadySet}
          onHint={game.showHint}
          onAutomate={game.automate}
          onReset={game.reset}
        />
      </div>

      <div
        className="live-region"
        role="status"
        aria-label="Interaction feedback"
        aria-live="polite"
      >
        {game.overlay.message}
      </div>
    </main>
  );
}
