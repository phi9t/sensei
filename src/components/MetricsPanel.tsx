import type { AttemptRankingTuple, ScoreResult } from '../engine/score';
import type { PolicyComparison } from '../engine/policyComparison';
import type { LevelConfig, MetricMasteryTarget } from '../engine/types';

interface MetricsPanelProps {
  readonly level: LevelConfig;
  readonly score: ScoreResult;
  readonly currentMemory: readonly number[];
  readonly attemptTuple: AttemptRankingTuple;
  readonly policyComparison: PolicyComparison | null;
}

function formatTuple(tuple: AttemptRankingTuple): string {
  const parts = [tuple.makespan, tuple.peakActivationMemory];
  if (tuple.allGatherCount !== undefined) {
    parts.push(tuple.allGatherCount);
  }
  parts.push(tuple.intentionalIdle, tuple.actionCount);
  return parts.join(' -> ');
}

function formatBubbleRatio(value: number): string {
  return `${value.toFixed(3)} (${(value * 100).toFixed(1)}%)`;
}

function formatPercentageDelta(value: number): string {
  const percentage = value * 100;
  if (percentage > 0) {
    return `+${percentage.toFixed(1)} pp`;
  }
  return `${percentage.toFixed(1)} pp`;
}

function formatDelta(value: number): string {
  if (value > 0) {
    return `+${value}`;
  }
  return `${value}`;
}

function formatMatch(match: PolicyComparison['match']): string {
  switch (match) {
    case 'exact':
      return 'Exact reference match';
    case 'order-only':
      return 'Same per-rank order';
    case 'unmatched':
      return 'Different order';
  }
}

function formatRecognizedPolicy(policyComparison: PolicyComparison): string {
  if (
    !policyComparison.matchedLabel ||
    policyComparison.matchedPolicyId === policyComparison.policyId
  ) {
    return formatMatch(policyComparison.match);
  }

  switch (policyComparison.match) {
    case 'exact':
      return `${policyComparison.matchedLabel} exact`;
    case 'order-only':
      return `${policyComparison.matchedLabel} order`;
    case 'unmatched':
      return 'Different order';
  }
}

function metricLabel(metric: MetricMasteryTarget['metric']): string {
  switch (metric) {
    case 'makespan':
      return 'makespan';
    case 'bubbleRatio':
      return 'bubble';
    case 'internalBubbleRatio':
      return 'internal bubble';
    case 'intentionalIdle':
      return 'intentional idle';
    case 'peakActivationMemory':
      return 'peak activation memory';
    case 'allGatherCount':
      return 'all-gathers';
  }
}

function formatMasteryTarget(target: LevelConfig['masteryTargets'][number]): string {
  if ('metric' in target) {
    return `${metricLabel(target.metric)} ${target.op} ${target.value}`;
  }

  return `pattern ${target.pattern.toUpperCase()}`;
}

export function MetricsPanel({
  level,
  score,
  currentMemory,
  attemptTuple,
  policyComparison,
}: MetricsPanelProps) {
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
        {score.internalBubbleRatio !== undefined ? (
          <div className="scoreboard-card">
            <span className="scoreboard-card__label">Internal bubble</span>
            <strong>{(score.internalBubbleRatio * 100).toFixed(1)}%</strong>
          </div>
        ) : null}
        <div className="scoreboard-card">
          <span className="scoreboard-card__label">Memory</span>
          <strong>{memorySummary}</strong>
        </div>
        {score.allGatherCount !== undefined ? (
          <div className="scoreboard-card">
            <span className="scoreboard-card__label">Gathers</span>
            <strong>{score.allGatherCount}</strong>
          </div>
        ) : null}
        <div className="scoreboard-card">
          <span className="scoreboard-card__label">Status</span>
          <strong>
            {score.mastered ? 'Mastered' : score.complete ? 'Complete' : 'In progress'}
          </strong>
        </div>
      </div>
      {policyComparison ? (
        <details className="policy-comparison">
          <summary>
            <span>Reference comparison</span>
            <span className="metrics-summary__value">{policyComparison.label}</span>
          </summary>
          <dl className="metrics-grid" role="group" aria-label="Reference comparison">
            <div>
              <dt>Policy</dt>
              <dd>{policyComparison.label} reference</dd>
            </div>
            <div>
              <dt>Recognized</dt>
              <dd>{formatRecognizedPolicy(policyComparison)}</dd>
            </div>
            <div>
              <dt>Reference makespan</dt>
              <dd>{policyComparison.reference.makespan}</dd>
            </div>
            <div>
              <dt>Makespan delta</dt>
              <dd>{formatDelta(policyComparison.delta.makespan)}</dd>
            </div>
            <div>
              <dt>Reference bubble</dt>
              <dd>{formatBubbleRatio(policyComparison.reference.bubbleRatio)}</dd>
            </div>
            <div>
              <dt>Bubble delta</dt>
              <dd>{formatPercentageDelta(policyComparison.delta.bubbleRatio)}</dd>
            </div>
            <div>
              <dt>Reference peak memory</dt>
              <dd>{policyComparison.reference.peakActivationMemory}</dd>
            </div>
            <div>
              <dt>Peak memory delta</dt>
              <dd>{formatDelta(policyComparison.delta.peakActivationMemory)} memory</dd>
            </div>
          </dl>
        </details>
      ) : null}
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
          {score.internalBubbleRatio !== undefined ? (
            <div>
              <dt>Internal bubble</dt>
              <dd>{formatBubbleRatio(score.internalBubbleRatio)}</dd>
            </div>
          ) : null}
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
          {score.allGatherCount !== undefined ? (
            <div>
              <dt>All-gathers</dt>
              <dd>{score.allGatherCount}</dd>
            </div>
          ) : null}
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
