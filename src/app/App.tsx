import { useEffect, useRef } from 'react';
import { OperationTray } from '../components/OperationTray';
import { ScheduleBoard } from '../components/ScheduleBoard';
import { MoveInspector } from '../components/MoveInspector';
import { MetricsPanel } from '../components/MetricsPanel';
import { GameControls } from '../components/GameControls';
import { LevelGuide } from '../components/LevelGuide';
import { LearningLab } from '../components/LearningLab';
import { memoryByRank } from '../engine/score';
import { useGame, type LevelOptionState } from './useGame';
import { LEVEL_IDS, type LevelId } from '../levels/levels';
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

interface LevelOptionGroup {
  readonly setTitle: string;
  readonly options: readonly LevelOptionState[];
}

export function groupLevelOptions(
  options: readonly LevelOptionState[],
): readonly LevelOptionGroup[] {
  const groupsBySet = new Map<string, LevelOptionState[]>();

  for (const option of options) {
    const group = groupsBySet.get(option.setTitle);
    if (group) {
      group.push(option);
      continue;
    }

    groupsBySet.set(option.setTitle, [option]);
  }

  return Object.freeze(
    Array.from(groupsBySet, ([setTitle, groupOptions]) =>
      Object.freeze({
        setTitle,
        options: Object.freeze([...groupOptions]),
      }),
    ),
  );
}

export function App({ initialLevelId = 'dependency-chain', storage, offlineStatus }: AppProps) {
  const defaultStorage = storage === undefined ? resolveBrowserStorage() : null;
  const resolvedStorage = defaultStorage?.storage ?? storage ?? null;
  const initialPersistenceNotice = defaultStorage?.notice ?? null;
  const game = useGame(initialLevelId, resolvedStorage, initialPersistenceNotice);
  const resultHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (game.score.complete) resultHeading.current?.focus({ preventScroll: true });
  }, [game.score.complete]);
  const offlineNotice = offlineNoticeFor(offlineStatus);
  const placedBlockCount = game.schedule.placements.length;
  const totalBlockCount = game.schedule.operations.length;
  const nextLevelId = LEVEL_IDS[LEVEL_IDS.indexOf(game.levelId) + 1];
  const nextLevel = game.levelOptions.find(
    (option) => option.levelId === nextLevelId && option.unlocked,
  );
  const preview =
    game.selectedExplanation?.status === 'legal'
      ? {
          operationId: game.selectedExplanation.operationId,
          earliestStart: game.selectedExplanation.earliestStart,
        }
      : null;

  return (
    <>
      <a className="skip-link" href="#play-surface">
        Skip to play surface
      </a>

      <header className="top-rail" aria-label="Sensei cockpit">
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
              {groupLevelOptions(game.levelOptions).map((group) => (
                <optgroup key={group.setTitle} label={group.setTitle}>
                  {group.options.map((option) => (
                    <option key={option.levelId} value={option.levelId} disabled={!option.unlocked}>
                      {option.patternLabel
                        ? `${option.title} (${option.patternLabel})`
                        : option.title}
                    </option>
                  ))}
                </optgroup>
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

      <main
        className="app-shell"
        onKeyDown={(event) => {
          if (event.key === 'Escape') game.clearSelection();
        }}
      >
        <div className="cockpit-grid" id="play-surface">
          <LevelGuide
            key={`guide-${game.levelId}`}
            level={game.level}
            score={game.score}
            levelOptions={game.levelOptions}
          />

          {game.score.complete ? (
            <section className="attempt-result" aria-label="Completed attempt">
              <div className="attempt-result__mark" aria-hidden="true">
                ✓
              </div>
              <div>
                <p className="learning-label">
                  {game.score.mastered ? 'Goal achieved' : 'Schedule complete'}
                </p>
                <h2 ref={resultHeading} tabIndex={-1}>
                  {game.score.makespan} ticks{' '}
                  <span>· {game.score.peakActivationMemory} peak activation units</span>
                </h2>
                <p>
                  {game.score.mastered
                    ? 'Inspect your schedule, explain the tradeoff, then take the next challenge.'
                    : 'Your schedule is legal. Inspect the remaining mastery targets or Undo to try a different order.'}
                </p>
              </div>
              {nextLevel ? (
                <button
                  className="command-button command-button--primary"
                  type="button"
                  onClick={() => game.changeLevel(nextLevel.levelId)}
                >
                  Next lesson →
                </button>
              ) : null}
            </section>
          ) : (
            <OperationTray
              level={game.level}
              classifications={game.moveClassifications}
              selectedOperationId={game.selectedOperationId}
              onActivate={game.activateOperation}
              onInspect={game.selectOperation}
            />
          )}

          <GameControls
            complete={game.score.complete}
            level={game.level}
            selectedBlockStatus={game.selectedBlockStatus}
            canUndo={game.cursor > 0}
            canRedo={game.cursor < game.actions.length}
            canReadySet={game.canReadySet}
            readySetReason={game.readySetReason}
            hintReason={game.hintReason}
            automationReason={game.automationReason}
            canSolve={game.canSolve}
            patternCheck={game.buildingBlockCheck}
            onWait={game.waitOneTick}
            onPlaceSelected={game.placeSelectedOperation}
            onClearSelection={game.clearSelection}
            onShare={game.shareAttempt}
            onUndo={game.undo}
            onRedo={game.redo}
            onReadySet={game.showReadySet}
            onHint={game.showHint}
            onAutomate={game.automate}
            onSolve={game.solveFromHere}
            onStampPattern={game.stampBuildingBlockPlan}
            onReset={game.reset}
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

          <ScheduleBoard
            key={`board-${game.levelId}`}
            {...(game.policyComparison
              ? { referencePolicyId: game.policyComparison.policyId }
              : {})}
            schedule={game.schedule}
            selectedOperationId={game.selectedOperationId}
            preview={preview}
            onInspect={game.selectOperation}
          />

          <LearningLab
            key={`learning-${game.levelId}`}
            schedule={game.schedule}
            selectedOperationId={game.selectedOperationId}
            onInspect={game.selectOperation}
            onClearSelection={game.clearSelection}
          />

          <aside className="score-rail" aria-label="Score rail">
            <MoveInspector
              level={game.level}
              operationId={game.selectedOperationId}
              explanation={game.selectedExplanation}
            />
            <MetricsPanel
              level={game.level}
              score={game.score}
              currentMemory={game.schedule.currentMemory}
              attemptTuple={game.attemptTuple}
              policyComparison={game.policyComparison}
              rankMemory={memoryByRank(game.schedule)}
            />
          </aside>
        </div>
      </main>
    </>
  );
}
