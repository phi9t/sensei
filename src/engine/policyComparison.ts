import {
  REFERENCE_POLICIES,
  projectReferencePolicy,
  recognizeSchedule,
  type ReferencePolicyId,
} from './policies';
import type { ScheduleState } from './replay';
import { attemptRankingTuple, type AttemptRankingTuple } from './score';

export type PolicyMatchKind = 'exact' | 'order-only' | 'unmatched';

export interface PolicyComparison {
  readonly policyId: ReferencePolicyId;
  readonly label: string;
  readonly match: PolicyMatchKind;
  readonly current: AttemptRankingTuple;
  readonly reference: AttemptRankingTuple;
  readonly delta: AttemptRankingTuple;
}

function isComparableFamily(family: ScheduleState['config']['algorithm']['family']): boolean {
  return family === 'gpipe' || family === 'one-f-one-b';
}

function subtractTuples(
  current: AttemptRankingTuple,
  reference: AttemptRankingTuple,
): AttemptRankingTuple {
  return Object.freeze({
    makespan: current.makespan - reference.makespan,
    peakActivationMemory: current.peakActivationMemory - reference.peakActivationMemory,
    intentionalIdle: current.intentionalIdle - reference.intentionalIdle,
    actionCount: current.actionCount - reference.actionCount,
  });
}

export function compareToReferencePolicy(state: ScheduleState): PolicyComparison | null {
  if (!isComparableFamily(state.config.algorithm.family)) {
    return null;
  }

  if (state.placements.length !== state.operations.length) {
    return null;
  }

  const recognition = recognizeSchedule(state);
  const policyId =
    recognition.kind === 'matched'
      ? recognition.policyId
      : recognition.candidatePolicyIds.find((candidate) => {
          const projected = projectReferencePolicy(state.config, candidate);
          return projected.ok;
        });

  if (!policyId) {
    return null;
  }

  const projected = projectReferencePolicy(state.config, policyId);
  if (!projected.ok) {
    return null;
  }

  const current = attemptRankingTuple(state);
  const reference = attemptRankingTuple(projected.state);
  const match: PolicyMatchKind =
    recognition.kind === 'matched' ? (recognition.exact ? 'exact' : 'order-only') : 'unmatched';
  const label =
    recognition.kind === 'matched' ? recognition.label : REFERENCE_POLICIES[policyId].label;

  return Object.freeze({
    policyId,
    label,
    match,
    current,
    reference,
    delta: subtractTuples(current, reference),
  });
}
