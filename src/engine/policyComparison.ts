import { REFERENCE_POLICIES, projectReferencePolicy, recognizeSchedule } from './policies';
import type { ReferencePolicyId } from './types';
import type { ScheduleState } from './replay';
import { score } from './score';

export type PolicyMatchKind = 'exact' | 'order-only' | 'unmatched';

export interface PolicyComparison {
  readonly policyId: ReferencePolicyId;
  readonly label: string;
  readonly matchedPolicyId: ReferencePolicyId | null;
  readonly matchedLabel: string | null;
  readonly match: PolicyMatchKind;
  readonly current: PolicyComparisonStats;
  readonly reference: PolicyComparisonStats;
  readonly delta: PolicyComparisonStats;
}

export interface PolicyComparisonStats {
  readonly makespan: number;
  readonly bubbleRatio: number;
  readonly peakActivationMemory: number;
  readonly intentionalIdle: number;
  readonly actionCount: number;
}

function subtractTuples(
  current: PolicyComparisonStats,
  reference: PolicyComparisonStats,
): PolicyComparisonStats {
  return Object.freeze({
    makespan: current.makespan - reference.makespan,
    bubbleRatio: current.bubbleRatio - reference.bubbleRatio,
    peakActivationMemory: current.peakActivationMemory - reference.peakActivationMemory,
    intentionalIdle: current.intentionalIdle - reference.intentionalIdle,
    actionCount: current.actionCount - reference.actionCount,
  });
}

function comparisonStats(state: ScheduleState): PolicyComparisonStats {
  const result = score(state);
  return Object.freeze({
    makespan: result.makespan,
    bubbleRatio: result.bubbleRatio,
    peakActivationMemory: result.peakActivationMemory,
    intentionalIdle: result.intentionalIdle,
    actionCount: state.actions.length,
  });
}

function firstProjectablePolicyId(
  state: ScheduleState,
  candidatePolicyIds: readonly ReferencePolicyId[],
): ReferencePolicyId | null {
  return (
    candidatePolicyIds.find((candidate) => {
      const projected = projectReferencePolicy(state.config, candidate);
      return projected.ok;
    }) ?? null
  );
}

export function compareToReferencePolicy(state: ScheduleState): PolicyComparison | null {
  if (state.placements.length !== state.operations.length) {
    return null;
  }

  const recognition = recognizeSchedule(state);
  if (recognition.candidatePolicyIds.length === 0) {
    return null;
  }

  const matchedPolicyId = recognition.kind === 'matched' ? recognition.policyId : null;
  const matchedLabel = recognition.kind === 'matched' ? recognition.label : null;
  const policyId =
    state.config.referencePolicy?.comparisonPolicyId ??
    matchedPolicyId ??
    firstProjectablePolicyId(state, recognition.candidatePolicyIds);

  if (!policyId) {
    return null;
  }

  const projected = projectReferencePolicy(state.config, policyId);
  if (!projected.ok) {
    return null;
  }

  const current = comparisonStats(state);
  const reference = comparisonStats(projected.state);
  const match: PolicyMatchKind =
    recognition.kind === 'matched' ? (recognition.exact ? 'exact' : 'order-only') : 'unmatched';
  const label = REFERENCE_POLICIES[policyId].label;

  return Object.freeze({
    policyId,
    label,
    matchedPolicyId,
    matchedLabel,
    match,
    current,
    reference,
    delta: subtractTuples(current, reference),
  });
}
