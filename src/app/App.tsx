import { OperationTray } from '../components/OperationTray';
import { ScheduleBoard } from '../components/ScheduleBoard';
import { MoveInspector } from '../components/MoveInspector';
import { MetricsPanel } from '../components/MetricsPanel';
import { GameControls } from '../components/GameControls';
import { useGame } from './useGame';
import { LEVEL_IDS, type LevelId } from '../levels/levels';

interface AppProps {
  readonly initialLevelId?: LevelId;
}

function levelLabel(levelId: LevelId): string {
  return levelId
    .split('-')
    .map((part) => part[0]!.toUpperCase() + part.slice(1))
    .join(' ');
}

export function App({ initialLevelId = 'dependency-chain' }: AppProps) {
  const game = useGame(initialLevelId);

  return (
    <main className="app-shell">
      <section className="panel hero-panel" aria-labelledby="sensei-heading">
        <div className="hero-panel__topline">
          <div>
            <h1 id="sensei-heading">Sensei Pipeline Scheduling</h1>
            <p>Correct first. Efficient next.</p>
          </div>
          <label>
            <span className="sr-only">Choose level</span>
            <select
              aria-label="Choose level"
              value={game.levelId}
              onChange={(event) => game.changeLevel(event.target.value as LevelId)}
            >
              {LEVEL_IDS.map((levelId) => (
                <option key={levelId} value={levelId}>
                  {levelLabel(levelId)}
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
          onWait={game.waitOneTick}
          onUndo={game.undo}
          onRedo={game.redo}
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
