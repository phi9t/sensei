import { useState } from 'react';
import type { ScoreResult } from '../engine/score';
import type { LevelOptionState } from '../app/useGame';
import type { LevelConfig, MasteryTarget, MetricMasteryTarget } from '../engine/types';
import { LEVEL_IDS, getLevel } from '../levels/levels';
import { SectionJump } from './SectionJump';

interface LevelGuideProps {
  readonly level: LevelConfig;
  readonly score: ScoreResult;
  readonly levelOptions: readonly LevelOptionState[];
}

interface CurriculumProgress {
  readonly levelIndex: number;
  readonly levelCount: number;
  readonly setIndex: number;
  readonly setCount: number;
  readonly nextTitle: string | null;
}

interface CurriculumPathNode {
  readonly setTitle: string;
  readonly state: 'current' | 'open' | 'locked';
  readonly currentIndex: number | null;
  readonly levelCount: number;
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

function curriculumPath(
  level: LevelConfig,
  levelOptions: readonly LevelOptionState[],
): readonly CurriculumPathNode[] {
  const groups = new Map<string, LevelOptionState[]>();

  for (const option of levelOptions) {
    const group = groups.get(option.setTitle);
    if (group) {
      group.push(option);
      continue;
    }

    groups.set(option.setTitle, [option]);
  }

  return Object.freeze(
    Array.from(groups, ([setTitle, options]) => {
      const currentIndex = options.findIndex((option) => option.levelId === level.id);
      const unlocked = options.some((option) => option.unlocked);
      return Object.freeze({
        setTitle,
        state: currentIndex >= 0 ? 'current' : unlocked ? 'open' : 'locked',
        currentIndex: currentIndex >= 0 ? currentIndex + 1 : null,
        levelCount: options.length,
      });
    }),
  );
}

function pathNodeLabel(node: CurriculumPathNode): string {
  if (node.currentIndex !== null) {
    return `${node.setTitle} set, current, level ${node.currentIndex} of ${node.levelCount}`;
  }
  return `${node.setTitle} set, ${node.state}, ${node.levelCount} ${
    node.levelCount === 1 ? 'level' : 'levels'
  }`;
}

function pathNodeProgress(node: CurriculumPathNode): string {
  return node.currentIndex === null
    ? `${node.levelCount} ${node.levelCount === 1 ? 'level' : 'levels'}`
    : `${node.currentIndex}/${node.levelCount}`;
}

function pathNodeStateLabel(state: CurriculumPathNode['state']): string {
  switch (state) {
    case 'current':
      return 'Current';
    case 'open':
      return 'Open';
    case 'locked':
      return 'Locked';
  }
}

export function LevelGuide({ level, score, levelOptions }: LevelGuideProps) {
  const [conceptsOpen, setConceptsOpen] = useState(false);
  const progress = curriculumProgress(level);
  const pathNodes = curriculumPath(level, levelOptions);

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
        <SectionJump className="level-guide__learn-link" target="learn">
          Theory & source material ↓
        </SectionJump>
        <details
          className="level-guide-panel__concepts"
          data-testid="level-guide-concepts"
          onToggle={(event) => setConceptsOpen(event.currentTarget.open)}
        >
          <summary>Concepts</summary>
          <div className="level-guide-panel__concept-body">
            <p>{level.algorithm.objective}</p>
            {conceptsOpen ? (
              <div className="curriculum-path-block">
                <p className="level-guide-panel__concept-label">Course path</p>
                <ul className="curriculum-path" aria-label="Curriculum course path">
                  {pathNodes.map((node) => (
                    <li
                      key={node.setTitle}
                      className="curriculum-path__node"
                      data-state={node.state}
                      data-testid="curriculum-path-node"
                      aria-label={pathNodeLabel(node)}
                    >
                      <span className="curriculum-path__title">{node.setTitle}</span>
                      <span className="curriculum-path__progress">{pathNodeProgress(node)}</span>
                      <span className="curriculum-path__state">
                        {pathNodeStateLabel(node.state)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
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
