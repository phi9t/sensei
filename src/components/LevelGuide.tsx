import type { ScoreResult } from '../engine/score';
import type { LevelConfig, MasteryTarget, MetricMasteryTarget } from '../engine/types';

interface LevelGuideProps {
  readonly level: LevelConfig;
  readonly score: ScoreResult;
}

function primaryGoal(level: LevelConfig): string {
  const makespanTarget = level.masteryTargets
    .filter((target): target is MetricMasteryTarget => isMetricTarget(target))
    .find((target) => target.metric === 'makespan');
  return makespanTarget
    ? `Goal: makespan ${makespanTarget.op} ${makespanTarget.value}`
    : 'Goal: complete the schedule';
}

function isMetricTarget(target: MasteryTarget): target is MetricMasteryTarget {
  return 'metric' in target;
}

function topologyLabel(level: LevelConfig): string | null {
  if (!level.topology || level.topology.placement === 'one-to-one') {
    return null;
  }
  return `V-stage x${level.topology.virtualStagesPerRank}`;
}

export function LevelGuide({ level, score }: LevelGuideProps) {
  const topology = topologyLabel(level);

  return (
    <section className="panel level-guide-panel" aria-label="Level guide">
      <div>
        <p className="panel-kicker">{level.algorithm.setTitle}</p>
        <h2 id="level-guide-heading">{level.title}</h2>
        <p className="level-guide-panel__copy">{level.algorithm.concept}</p>
      </div>
      <div className="level-guide-panel__chips" aria-label="Level progress summary">
        <span>{primaryGoal(level)}</span>
        {topology ? <span className="topology-chip">{topology}</span> : null}
        {level.algorithm.patternLabel ? <span>{level.algorithm.patternLabel}</span> : null}
        <span>{level.algorithm.objective}</span>
        <span>{score.complete ? 'Complete' : 'In progress'}</span>
        <span>makespan {score.makespan}</span>
      </div>
    </section>
  );
}
