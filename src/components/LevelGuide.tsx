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

function groupLabel(level: LevelConfig): string | null {
  return level.microbatchGrouping ? `Group x${level.microbatchGrouping.groupSize}` : null;
}

function primaryModifier(level: LevelConfig): string | null {
  const grouping = groupLabel(level);
  if (grouping) {
    return grouping;
  }
  if (level.residencyModel) {
    return 'Residency';
  }
  if (level.dualPipeModel) {
    return 'Bidirectional';
  }
  if ((level.durationOverrides ?? []).length > 0) {
    return 'Variable cost';
  }
  const topology = topologyLabel(level);
  if (topology) {
    return topology;
  }
  return level.algorithm.patternLabel;
}

function guideChips(level: LevelConfig, score: ScoreResult): readonly string[] {
  return Object.freeze(
    [
      primaryGoal(level),
      score.complete ? 'Complete' : 'In progress',
      `makespan ${score.makespan}`,
      primaryModifier(level),
    ].filter((label): label is string => label !== null),
  );
}

export function LevelGuide({ level, score }: LevelGuideProps) {
  return (
    <section className="panel level-guide-panel" aria-label="Level guide">
      <div>
        <p className="panel-kicker">{level.algorithm.setTitle}</p>
        <h2 id="level-guide-heading">{level.title}</h2>
        <p className="level-guide-panel__copy">{level.algorithm.concept}</p>
      </div>
      <div className="level-guide-panel__chips" aria-label="Level progress summary">
        {guideChips(level, score).map((label) => (
          <span key={label} className="level-guide-panel__chip" data-testid="level-guide-chip">
            {label}
          </span>
        ))}
      </div>
    </section>
  );
}
