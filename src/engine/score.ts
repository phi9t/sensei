import type { ScheduleState } from './replay';
import type { MasteryTarget } from './types';

export interface AttemptRankingTuple {
  makespan: number;
  peakActivationMemory: number;
  intentionalIdle: number;
  actionCount: number;
}

export interface ScoreResult {
  makespan: number;
  totalWork: number;
  capacity: number;
  bubbleRatio: number;
  intentionalIdle: number;
  peakActivationMemoryByRank: readonly number[];
  peakActivationMemory: number;
  complete: boolean;
  mastered: boolean;
}

function totalPlacedWork(state: ScheduleState): number {
  const durationById = new Map(
    state.operations.map((operation) => [operation.id, operation.duration]),
  );
  let total = 0;

  for (const placement of state.placements) {
    total += durationById.get(placement.operationId) ?? 0;
  }

  return total;
}

function intentionalIdleDuration(state: ScheduleState): number {
  return state.gaps.reduce((total, gap) => {
    if (gap.kind !== 'intentional') {
      return total;
    }
    return total + (gap.end - gap.start);
  }, 0);
}

function isComplete(state: ScheduleState): boolean {
  if (state.placements.length !== state.operations.length) {
    return false;
  }

  const remaining = new Set(state.operations.map((operation) => operation.id));
  for (const placement of state.placements) {
    if (!remaining.delete(placement.operationId)) {
      return false;
    }
  }

  return remaining.size === 0;
}

function masteryMetricValue(scoreResult: ScoreResult, target: MasteryTarget): number {
  switch (target.metric) {
    case 'makespan':
      return scoreResult.makespan;
    case 'bubbleRatio':
      return scoreResult.bubbleRatio;
    case 'intentionalIdle':
      return scoreResult.intentionalIdle;
    case 'peakActivationMemory':
      return scoreResult.peakActivationMemory;
  }
}

function satisfiesTarget(scoreResult: ScoreResult, target: MasteryTarget): boolean {
  const actual = masteryMetricValue(scoreResult, target);
  switch (target.op) {
    case '<=':
      return actual <= target.value;
  }
}

export function score(state: ScheduleState): ScoreResult {
  const makespan = state.rankFrontiers.reduce((max, frontier) => Math.max(max, frontier), 0);
  const totalWork = totalPlacedWork(state);
  const capacity = state.config.rankCount * makespan;
  const bubbleRatio = capacity === 0 ? 0 : (capacity - totalWork) / capacity;
  const intentionalIdle = intentionalIdleDuration(state);
  const peakActivationMemoryByRank = [...state.peakMemory];
  const peakActivationMemory = peakActivationMemoryByRank.reduce(
    (max, resident) => Math.max(max, resident),
    0,
  );
  const complete = isComplete(state);

  const scoreResultWithoutMastery: ScoreResult = {
    makespan,
    totalWork,
    capacity,
    bubbleRatio,
    intentionalIdle,
    peakActivationMemoryByRank: Object.freeze(peakActivationMemoryByRank),
    peakActivationMemory,
    complete,
    mastered: false,
  };

  const mastered =
    complete &&
    state.config.masteryTargets.every((target) =>
      satisfiesTarget(scoreResultWithoutMastery, target),
    );

  return {
    ...scoreResultWithoutMastery,
    mastered,
  };
}

export function attemptRankingTuple(state: ScheduleState): AttemptRankingTuple {
  const result = score(state);
  return {
    makespan: result.makespan,
    peakActivationMemory: result.peakActivationMemory,
    intentionalIdle: result.intentionalIdle,
    actionCount: state.actions.length,
  };
}

export function compareAttempts(left: AttemptRankingTuple, right: AttemptRankingTuple): number {
  const deltas = [
    left.makespan - right.makespan,
    left.peakActivationMemory - right.peakActivationMemory,
    left.intentionalIdle - right.intentionalIdle,
    left.actionCount - right.actionCount,
  ];

  for (const delta of deltas) {
    if (delta !== 0) {
      return delta;
    }
  }

  return 0;
}
