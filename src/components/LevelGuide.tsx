import type { ScoreResult } from '../engine/score';
import type { LevelConfig, MasteryTarget, MetricMasteryTarget } from '../engine/types';
import { LEVEL_IDS, getLevel } from '../levels/levels';

interface LevelGuideProps {
  readonly level: LevelConfig;
  readonly score: ScoreResult;
}

interface CurriculumProgress {
  readonly levelIndex: number;
  readonly levelCount: number;
  readonly setIndex: number;
  readonly setCount: number;
  readonly nextTitle: string | null;
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
  const progress = curriculumProgress(level);
  return Object.freeze(
    [
      primaryGoal(level),
      `${score.complete ? 'Complete' : 'In progress'} - makespan ${score.makespan}`,
      primaryModifier(level),
      `Level ${progress.levelIndex}/${progress.levelCount}`,
    ].filter((label): label is string => label !== null),
  );
}

function curriculumProgress(level: LevelConfig): CurriculumProgress {
  const levelIndex = LEVEL_IDS.indexOf(level.id as (typeof LEVEL_IDS)[number]);
  const levelOrdinal = levelIndex >= 0 ? levelIndex + 1 : 1;
  const nextLevelId = levelIndex >= 0 ? LEVEL_IDS[levelIndex + 1] : undefined;
  const currentSetLevels = LEVEL_IDS.filter(
    (levelId) => getLevel(levelId).algorithm.setTitle === level.algorithm.setTitle,
  );
  const setLevelIndex = currentSetLevels.indexOf(level.id as (typeof LEVEL_IDS)[number]);

  return Object.freeze({
    levelIndex: levelOrdinal,
    levelCount: LEVEL_IDS.length,
    setIndex: setLevelIndex >= 0 ? setLevelIndex + 1 : 1,
    setCount: currentSetLevels.length,
    nextTitle: nextLevelId ? getLevel(nextLevelId).title : null,
  });
}

export function LevelGuide({ level, score }: LevelGuideProps) {
  const progress = curriculumProgress(level);

  return (
    <section className="panel level-guide-panel" aria-label="Level guide">
      <div className="level-guide-panel__copy-block">
        <p className="panel-kicker">{level.algorithm.setTitle}</p>
        <h2 id="level-guide-heading">{level.title}</h2>
        <p className="level-guide-panel__copy">{level.algorithm.concept}</p>
      </div>
      <div className="level-guide-panel__details">
        <div className="level-guide-panel__chips" aria-label="Level progress summary">
          {guideChips(level, score).map((label) => (
            <span key={label} className="level-guide-panel__chip" data-testid="level-guide-chip">
              {label}
            </span>
          ))}
        </div>
        <details className="level-guide-panel__concepts" data-testid="level-guide-concepts">
          <summary>Concepts</summary>
          <div className="level-guide-panel__concept-body">
            <p>{level.algorithm.objective}</p>
            <ul className="level-guide-panel__concept-list" aria-label="Introduced concepts">
              {level.algorithm.introducedModel.map((concept) => (
                <li key={concept}>{concept}</li>
              ))}
            </ul>
            <p className="level-guide-panel__next">
              Set step {progress.setIndex}/{progress.setCount}
            </p>
            <p className="level-guide-panel__next">
              {progress.nextTitle ? `Next ${progress.nextTitle}` : 'Final level'}
            </p>
          </div>
        </details>
      </div>
    </section>
  );
}
