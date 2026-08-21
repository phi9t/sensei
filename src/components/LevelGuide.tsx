import type { ScoreResult } from '../engine/score';
import type { LevelConfig } from '../engine/types';

interface LevelGuideProps {
  readonly level: LevelConfig;
  readonly score: ScoreResult;
}

function levelConcept(level: LevelConfig): string {
  switch (level.id) {
    case 'dependency-chain':
      return 'Read the dependency chain before placing backward work.';
    case 'fill-the-pipe':
      return 'Place forward blocks to fill the pipeline before draining it.';
    case 'backward-is-heavier':
      return 'Account for backward blocks taking longer than forward blocks.';
    case 'memory-wall':
      return 'Keep activation memory under the cap while preserving pipeline flow.';
    default:
      return 'Place the next legal block and watch the schedule take shape.';
  }
}

function primaryGoal(level: LevelConfig): string {
  const makespanTarget = level.masteryTargets.find((target) => target.metric === 'makespan');
  return makespanTarget
    ? `Goal: makespan ${makespanTarget.op} ${makespanTarget.value}`
    : 'Goal: complete the schedule';
}

export function LevelGuide({ level, score }: LevelGuideProps) {
  return (
    <section className="panel level-guide-panel" aria-label="Level guide">
      <div>
        <p className="panel-kicker">Level guide</p>
        <h2 id="level-guide-heading">{level.title}</h2>
        <p className="level-guide-panel__copy">{levelConcept(level)}</p>
      </div>
      <div className="level-guide-panel__chips" aria-label="Level progress summary">
        <span>{primaryGoal(level)}</span>
        <span>{score.complete ? 'Complete' : 'In progress'}</span>
        <span>makespan {score.makespan}</span>
      </div>
    </section>
  );
}
