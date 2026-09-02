import { findExactScheduleFromState } from './exactOracle';
import { projectReferencePolicyFromState, referencePolicyCandidatesFor } from './policies';
import {
  applyAction,
  classifyMoves,
  replay,
  type MoveClassification,
  type ScheduleState,
} from './replay';
import { attemptRankingTuple, compareAttempts, score } from './score';
import type { Action, Operation, ReferencePolicyId } from './types';

export type CompletionStrategy = 'exact' | 'reference-policy' | 'heuristic';

export type CompletionResult =
  | {
      readonly ok: true;
      readonly actions: readonly Action[];
      readonly state: ScheduleState;
      readonly strategy: CompletionStrategy;
      readonly optimality: 'proven' | 'best-available';
      readonly label: string;
    }
  | {
      readonly ok: false;
      readonly reason: 'already-complete' | 'no-completion';
    };

type LegalMove = Extract<MoveClassification, { status: 'legal' }>;
type MovePreference = (left: LegalMove, right: LegalMove) => number;

const EXACT_REMAINING_LIMIT = 14;
const EXACT_STATE_LIMIT = 100_000;
const COMPLETION_STATE_LIMIT = 25_000;

function kindOrder(operation: Operation, order: readonly Operation['kind'][]): number {
  return order.indexOf(operation.kind);
}

function compareMove(
  left: LegalMove,
  right: LegalMove,
  kindPreference: readonly Operation['kind'][],
): number {
  return (
    left.earliestStart - right.earliestStart ||
    kindOrder(left.operation, kindPreference) - kindOrder(right.operation, kindPreference) ||
    left.operation.microbatch - right.operation.microbatch ||
    left.operation.stage - right.operation.stage ||
    left.operation.rank - right.operation.rank ||
    left.operation.id.localeCompare(right.operation.id)
  );
}

const HEURISTICS: readonly { readonly label: string; readonly compare: MovePreference }[] = [
  {
    label: 'earliest legal',
    compare: (left, right) => compareMove(left, right, ['B', 'W', 'F']),
  },
  {
    label: 'activation releasing',
    compare: (left, right) => compareMove(left, right, ['W', 'B', 'F']),
  },
  {
    label: 'forward progress',
    compare: (left, right) => compareMove(left, right, ['F', 'B', 'W']),
  },
];

function freezeTail(actions: readonly Action[]): readonly Action[] {
  return Object.freeze(actions.map((action) => Object.freeze({ ...action })));
}

function validatedCompletion(
  initial: ScheduleState,
  actions: readonly Action[],
  strategy: CompletionStrategy,
  optimality: 'proven' | 'best-available',
  label: string,
): Extract<CompletionResult, { ok: true }> | null {
  const tail = freezeTail(actions);
  const verified = replay(initial.config, [...initial.actions, ...tail]);
  if (!verified.ok || verified.state.placements.length !== verified.state.operations.length) {
    return null;
  }

  return Object.freeze({
    ok: true as const,
    actions: tail,
    state: verified.state,
    strategy,
    optimality,
    label,
  });
}

function greedyCompletion(
  initial: ScheduleState,
  preference: MovePreference,
): readonly Action[] | null {
  let current = initial;
  const actions: Action[] = [];
  const remaining = initial.operations.length - initial.placements.length;

  for (let step = 0; step < remaining; step += 1) {
    const move = classifyMoves(current)
      .filter((entry): entry is LegalMove => entry.status === 'legal')
      .sort(preference)[0];
    if (!move) return null;

    const action = Object.freeze({ type: 'place' as const, operationId: move.operation.id });
    const applied = applyAction(current, action);
    if (!applied.ok) {
      throw new Error(`classified legal move was rejected: ${applied.reason.kind}`);
    }
    actions.push(action);
    current = applied.state;
  }

  return Object.freeze(actions);
}

function completionStateKey(state: ScheduleState): string {
  const placements = state.placements
    .map((placement) => `${placement.operationId}@${placement.start}-${placement.end}`)
    .sort()
    .join(',');
  const residentWeights = state.residentWeightsByRank
    .map((stages) => [...stages].sort((left, right) => left - right).join(','))
    .join('|');
  return [
    placements,
    state.rankFrontiers.join(','),
    state.currentMemory.join(','),
    state.peakMemory.join(','),
    residentWeights,
    String(state.allGatherCount),
  ].join(';');
}

function searchCompletion(
  initial: ScheduleState,
  preference: MovePreference,
): readonly Action[] | null {
  const visited = new Set<string>();
  let statesVisited = 0;
  let bestState: ScheduleState | null = null;
  let bestActions: readonly Action[] | null = null;

  function visit(state: ScheduleState, actions: readonly Action[]): void {
    if (state.placements.length === state.operations.length) {
      if (
        bestState === null ||
        Number(score(state).mastered) > Number(score(bestState).mastered) ||
        (score(state).mastered === score(bestState).mastered &&
          compareAttempts(attemptRankingTuple(state), attemptRankingTuple(bestState)) < 0)
      ) {
        bestState = state;
        bestActions = actions;
      }
      return;
    }
    if (statesVisited >= COMPLETION_STATE_LIMIT) return;
    statesVisited += 1;

    const key = completionStateKey(state);
    if (visited.has(key)) return;
    visited.add(key);

    const legalMoves = classifyMoves(state)
      .filter((entry): entry is LegalMove => entry.status === 'legal')
      .sort(preference);
    for (const move of legalMoves) {
      const action = Object.freeze({ type: 'place' as const, operationId: move.operation.id });
      const applied = applyAction(state, action);
      if (!applied.ok) {
        throw new Error(`classified legal move was rejected: ${applied.reason.kind}`);
      }
      visit(applied.state, [...actions, action]);
    }
  }

  visit(initial, []);
  return bestActions;
}

function primaryPolicyIds(state: ScheduleState): readonly ReferencePolicyId[] {
  const referencePolicies = referencePolicyCandidatesFor(state.config);
  if (referencePolicies.length > 0) return referencePolicies;

  // Residency lessons use grouped ordering as a completion heuristic even though
  // they intentionally make no reference-policy recognition claim.
  return state.config.algorithm.family === 'fsdp-residency'
    ? Object.freeze(['group-major', 'one-f-one-b'])
    : Object.freeze([]);
}

function compareCompletions(
  left: Extract<CompletionResult, { ok: true }>,
  right: Extract<CompletionResult, { ok: true }>,
): number {
  const masteryDelta = Number(score(right.state).mastered) - Number(score(left.state).mastered);
  return (
    masteryDelta ||
    compareAttempts(attemptRankingTuple(left.state), attemptRankingTuple(right.state))
  );
}

export function completeFromCurrentState(state: ScheduleState): CompletionResult {
  const remaining = state.operations.length - state.placements.length;
  if (remaining === 0) {
    return Object.freeze({ ok: false as const, reason: 'already-complete' as const });
  }

  const candidates: Array<Extract<CompletionResult, { ok: true }>> = [];

  if (
    remaining <= EXACT_REMAINING_LIMIT &&
    !state.config.dualPipeModel &&
    !state.config.residencyModel
  ) {
    const exact = findExactScheduleFromState(state, {
      maxOperations: EXACT_REMAINING_LIMIT,
      maxStates: EXACT_STATE_LIMIT,
    });
    if (exact.ok) {
      const candidate = validatedCompletion(
        state,
        exact.actions.slice(state.actions.length),
        'exact',
        'proven',
        'optimal continuation',
      );
      if (candidate) candidates.push(candidate);
    } else if (exact.bestSoFar) {
      const candidate = validatedCompletion(
        state,
        exact.bestSoFar.actions.slice(state.actions.length),
        'exact',
        'best-available',
        'bounded exact-search continuation',
      );
      if (candidate) candidates.push(candidate);
    }
  }

  for (const policyId of primaryPolicyIds(state)) {
    if (policyId === 'dualpipe-one-direction') continue;
    const projected = projectReferencePolicyFromState(state, policyId);
    if (!projected.ok) continue;
    const candidate = validatedCompletion(
      state,
      projected.actions,
      'reference-policy',
      'best-available',
      `${policyId} reference`,
    );
    if (candidate) candidates.push(candidate);
  }

  for (const heuristic of HEURISTICS) {
    const actions =
      greedyCompletion(state, heuristic.compare) ?? searchCompletion(state, heuristic.compare);
    if (!actions) continue;
    const candidate = validatedCompletion(
      state,
      actions,
      'heuristic',
      'best-available',
      `${heuristic.label} continuation`,
    );
    if (candidate) candidates.push(candidate);
  }

  candidates.sort(compareCompletions);
  return candidates[0] ?? Object.freeze({ ok: false as const, reason: 'no-completion' as const });
}
