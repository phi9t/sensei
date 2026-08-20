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

export function MetricsPanel({ level, score, currentMemory, attemptTuple }: MetricsPanelProps) {
  const masteryTargets =
    level.masteryTargets.length === 0
      ? 'None'
      : level.masteryTargets
          .map((target) => `${target.metric} ${target.op} ${target.value}`)
          .join('; ');

  return (
    <section className="panel metrics-panel" aria-labelledby="metrics-panel-heading">
      <h2 id="metrics-panel-heading">Metrics panel</h2>
      <div className="metrics-summary">
        <p>Intentional idle: {score.intentionalIdle}</p>
        <p>Current attempt tuple: {formatTuple(attemptTuple)}</p>
      </div>
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
          <dd>1 - work/capacity = {score.bubbleRatio}</dd>
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
    </section>
  );
}
