import { OperationTray } from '../components/OperationTray';
import { ScheduleBoard } from '../components/ScheduleBoard';
import { MoveInspector } from '../components/MoveInspector';
import { MetricsPanel } from '../components/MetricsPanel';
import { GameControls } from '../components/GameControls';
import { useGame } from './useGame';
import type { LevelId } from '../levels/levels';
import type { OfflineStatus } from '../offline/register';

interface AppProps {
  readonly initialLevelId?: LevelId;
  readonly storage?: Storage | null;
  readonly offlineStatus?: OfflineStatus;
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

function offlineNoticeFor(status: OfflineStatus | undefined): string | null {
  switch (status) {
    case 'unavailable':
      return 'Offline support is temporarily unavailable. The game still works online.';
    case 'unsupported':
      return 'Offline support is not available in this environment.';
    case 'ready':
    case undefined:
      return null;
  }
}

export function App({ initialLevelId = 'dependency-chain', storage, offlineStatus }: AppProps) {
  const defaultStorage = storage === undefined ? resolveBrowserStorage() : null;
  const resolvedStorage = defaultStorage?.storage ?? storage ?? null;
  const initialPersistenceNotice = defaultStorage?.notice ?? null;
  const game = useGame(initialLevelId, resolvedStorage, initialPersistenceNotice);
  const offlineNotice = offlineNoticeFor(offlineStatus);

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
          {offlineNotice ? (
            <p
              role="status"
              aria-live="polite"
              aria-atomic="true"
              aria-label="Offline support notice"
            >
              {offlineNotice}
            </p>
          ) : null}
          {game.persistenceNotice ? (
            <p
              role="status"
              aria-live="polite"
              aria-atomic="true"
              aria-label="Saved progress notice"
            >
              {game.persistenceNotice}
            </p>
          ) : null}
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
