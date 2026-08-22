import type { AttemptRankingTuple, ScoreResult } from '../engine/score';
import type { LevelConfig } from '../engine/types';

interface MetricsPanelProps {
  readonly level: LevelConfig;
  readonly score: ScoreResult;
  readonly currentMemory: readonly number[];
  readonly attemptTuple: AttemptRankingTuple;
}

function formatTuple(tuple: AttemptRankingTuple): string {
  return `${tuple.makespan} -> ${tuple.peakActivationMemory} -> ${tuple.intentionalIdle} -> ${tuple.actionCount}`;
}

function formatBubbleRatio(value: number): string {
  return `${value.toFixed(3)} (${(value * 100).toFixed(1)}%)`;
}

function formatMasteryTarget(target: LevelConfig['masteryTargets'][number]): string {
  if ('metric' in target) {
    return `${target.metric} ${target.op} ${target.value}`;
  }

  return `pattern ${target.pattern.toUpperCase()}`;
}

export function MetricsPanel({ level, score, currentMemory, attemptTuple }: MetricsPanelProps) {
  const masteryTargets =
    level.masteryTargets.length === 0
      ? 'None'
      : level.masteryTargets.map(formatMasteryTarget).join('; ');
  const memoryCap = level.memoryCaps === null ? null : Math.max(...level.memoryCaps);
  const memorySummary =
    memoryCap === null
      ? `${score.peakActivationMemory} peak`
      : `${score.peakActivationMemory}/${memoryCap} peak`;

  return (
    <section className="panel metrics-panel" aria-labelledby="metrics-panel-heading">
      <p className="panel-kicker">Score</p>
      <h2 id="metrics-panel-heading" aria-label="Metrics panel">
        Run state
      </h2>
      <div className="scoreboard" role="group" aria-label="Scoreboard">
        <div className="scoreboard-card scoreboard-card--primary">
          <span className="scoreboard-card__label">Makespan</span>
          <strong>{score.makespan}</strong>
        </div>
        <div className="scoreboard-card">
          <span className="scoreboard-card__label">Bubble</span>
          <strong>{(score.bubbleRatio * 100).toFixed(1)}%</strong>
        </div>
        <div className="scoreboard-card">
          <span className="scoreboard-card__label">Memory</span>
          <strong>{memorySummary}</strong>
        </div>
        <div className="scoreboard-card">
          <span className="scoreboard-card__label">Status</span>
          <strong>
            {score.mastered ? 'Mastered' : score.complete ? 'Complete' : 'In progress'}
          </strong>
        </div>
      </div>
      <details className="metrics-details">
        <summary>
          <span>Metric details</span>
          <span className="metrics-summary__value">{formatTuple(attemptTuple)}</span>
        </summary>
        <dl className="metrics-grid">
          <div>
            <dt>Completion</dt>
            <dd>{score.complete ? 'Legal completion' : 'Incomplete'}</dd>
          </div>
          <div>
            <dt>Mastery</dt>
            <dd>{score.mastered ? 'Mastered' : 'In progress'}</dd>
          </div>
          <div>
            <dt>Makespan</dt>
            <dd>{score.makespan}</dd>
          </div>
          <div>
            <dt>Total work</dt>
            <dd>{score.totalWork}</dd>
          </div>
          <div>
            <dt>Capacity</dt>
            <dd>{score.capacity}</dd>
          </div>
          <div>
            <dt>Bubble</dt>
            <dd>1 - work/capacity = {formatBubbleRatio(score.bubbleRatio)}</dd>
          </div>
          <div>
            <dt>Intentional idle</dt>
            <dd>{score.intentionalIdle}</dd>
          </div>
          <div>
            <dt>Current activation memory</dt>
            <dd>{currentMemory.join(', ')}</dd>
          </div>
          <div>
            <dt>Peak activation memory</dt>
            <dd>{score.peakActivationMemory}</dd>
          </div>
          <div>
            <dt>Mastery targets</dt>
            <dd>{masteryTargets}</dd>
          </div>
          <div>
            <dt>Current attempt tuple</dt>
            <dd>{formatTuple(attemptTuple)}</dd>
          </div>
        </dl>
      </details>
    </section>
  );
}
