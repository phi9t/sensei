import { OperationTray } from '../components/OperationTray';
import { ScheduleBoard } from '../components/ScheduleBoard';
import { MoveInspector } from '../components/MoveInspector';
import { MetricsPanel } from '../components/MetricsPanel';
import { GameControls } from '../components/GameControls';
import { LevelGuide } from '../components/LevelGuide';
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
  const placedBlockCount = game.schedule.placements.length;
  const totalBlockCount = game.schedule.operations.length;
  const preview =
    game.selectedExplanation?.status === 'legal'
      ? {
          operationId: game.selectedExplanation.operationId,
          earliestStart: game.selectedExplanation.earliestStart,
        }
      : null;

  return (
    <main className="app-shell">
      <a className="skip-link" href="#play-surface">
        Skip to play surface
      </a>

      <div className="cockpit-grid" id="play-surface">
        <header className="top-rail" role="banner" aria-label="Sensei cockpit">
          <div className="top-rail__brand">
            <h1 id="sensei-heading">Sensei</h1>
            <p>Pipeline scheduling</p>
          </div>

          <div className="level-picker">
            <label>
              <span>Level</span>
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

            <p className="top-rail__count">
              {placedBlockCount}/{totalBlockCount} blocks
            </p>

            <ul className="sr-only" aria-label="Level access status">
              {game.levelOptions
                .filter((option) => !option.unlocked && option.reason !== null)
                .map((option) => (
                  <li key={option.levelId}>{option.reason}</li>
                ))}
            </ul>

            {offlineNotice ? (
              <p
                className="header-notice"
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
                className="header-notice"
                role="status"
                aria-live="polite"
                aria-atomic="true"
                aria-label="Saved progress notice"
              >
                {game.persistenceNotice}
              </p>
            ) : null}
          </div>
        </header>

        <LevelGuide level={game.level} score={game.score} />

        <OperationTray
          classifications={game.moveClassifications}
          selectedOperationId={game.selectedOperationId}
          onActivate={game.activateOperation}
          onInspect={game.selectOperation}
        />

        <div
          className="live-region command-feedback"
          role="status"
          aria-label="Interaction feedback"
          aria-live="polite"
        >
          <span className="live-region__pulse" aria-hidden="true" />
          {game.overlay.message}
        </div>

        <section className="schedule-command-rail" aria-label="Schedule command rail">
          <GameControls
            level={game.level}
            canUndo={game.cursor > 0}
            canRedo={game.cursor < game.actions.length}
            canReadySet={game.canReadySet}
            readySetReason={game.readySetReason}
            hintReason={game.hintReason}
            automationReason={game.automationReason}
            onWait={game.waitOneTick}
            onPlaceSelected={game.placeSelectedOperation}
            onClearSelection={game.clearSelection}
            onShare={game.shareAttempt}
            onUndo={game.undo}
            onRedo={game.redo}
            onReadySet={game.showReadySet}
            onHint={game.showHint}
            onAutomate={game.automate}
            onReset={game.reset}
          />
        </section>

        <ScheduleBoard
          schedule={game.schedule}
          selectedOperationId={game.selectedOperationId}
          preview={preview}
        />

        <aside className="score-rail" aria-label="Score rail">
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
        </aside>
      </div>
    </main>
  );
}
