import type { CSSProperties } from 'react';
import type { ExplanationResult } from '../coaching/coaching';
import type { BlockReason, ResourceDelay } from '../engine/replay';
import type {
  LevelConfig,
  Operation,
  OperationId,
  PipelineDirection,
  ResidencyEffect,
} from '../engine/types';
import { formatOperationCode, formatOperationName } from '../app/useGame';
import {
  operationKindsForLevel,
  operationNotationKey,
  parseOperationId,
} from '../engine/operations';
import { operationVisualKey, operationVisualVars } from './operationVisuals';

type InspectorExplanation = ExplanationResult & { readonly operation?: Operation };

interface MoveInspectorProps {
  readonly level: LevelConfig;
  readonly operationId: OperationId | null;
  readonly explanation: InspectorExplanation | null;
}

export function MoveInspector({ level, operationId, explanation }: MoveInspectorProps) {
  const operationIdentity = operationId === null ? null : parseOperationId(operationId);
  const ownerRank = ownerRankForExplanation(explanation);
  const showOwnerRank = operationIdentity !== null && ownerRank !== null;
  const selectedDirection = directionLabel(operationIdentity?.direction);

  return (
    <section className="panel inspector-panel" aria-labelledby="move-inspector-heading">
      <h2 id="move-inspector-heading">Move inspector</h2>
      {operationId === null || explanation === null ? <p>Select a block to inspect it.</p> : null}

      {operationId !== null && explanation !== null && operationIdentity !== null ? (
        <div className="inspector-content">
          <div className="inspector-operation">
            <span
              className="inspector-operation__swatch"
              data-testid={`inspector-identity-${operationId}`}
              data-operation-visual={
                operationIdentity ? operationVisualKey(operationIdentity) : undefined
              }
              data-kind={operationIdentity?.kind}
              aria-hidden="true"
              style={
                operationIdentity ? (operationVisualVars(operationIdentity) as CSSProperties) : {}
              }
            />
            <div className="inspector-operation__copy">
              <strong>{formatOperationName(operationId)}</strong>
              <span className="mono">{formatOperationCode(operationId)}</span>
            </div>
            <span className="inspector-operation__status">{explanation.status}</span>
          </div>
          <ul className="inspector-facts" aria-label="Selected block facts">
            {showOwnerRank ? <li>Owner R{ownerRank}</li> : null}
            {selectedDirection ? <li>{selectedDirection}</li> : null}
            <li>{compactDependencyFact(explanation.dependencyIds)}</li>
            {explanation.status === 'legal' && explanation.resourceDelay ? (
              <li>{compactResourceDelayFact(explanation.resourceDelay)}</li>
            ) : null}
          </ul>

          {explanation.status === 'blocked' ? (
            <>
              <p>Blocked by:</p>
              <ul className="inspector-list">
                {explanation.explanations.map((entry, index) => (
                  <li key={`${entry.kind}-${index}`}>
                    <span>{humanBlockedMessage(entry.reason)}</span>
                    {typedReasonLabel(entry.reason) ? (
                      <>
                        {' '}
                        <span className="mono">{typedReasonLabel(entry.reason)}</span>
                      </>
                    ) : null}
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          {explanation.status === 'legal' ? (
            <>
              <p>
                Legal now. Earliest start {explanation.earliestStart}. Duration{' '}
                {explanation.operation?.duration}. Memory after: {explanation.projectedMemory}.
              </p>
              {explanation.residencyEffect ? (
                <p className="inspector-note">{residencyEffectText(explanation.residencyEffect)}</p>
              ) : null}
            </>
          ) : null}

          {explanation.status === 'completed' ? (
            <>
              <p>
                Placed on rank {explanation.placement?.rank} from {explanation.placement?.start} to{' '}
                {explanation.placement?.end}. Duration {explanation.operation?.duration}.
              </p>
              {explanation.residencyEffect ? (
                <p className="inspector-note">{residencyEffectText(explanation.residencyEffect)}</p>
              ) : null}
            </>
          ) : null}

          <details className="inspector-learning" data-testid="inspector-learning-disclosure">
            <summary>Why this block?</summary>
            <div className="inspector-learning__body">
              <p className="inspector-learning__decode">
                {formatOperationCode(operationId)} means{' '}
                {operationKindLabel(explanation.operation?.kind ?? operationIdentity.kind)} on stage{' '}
                {explanation.operation?.stage ?? operationIdentity.stage}, microbatch{' '}
                {explanation.operation?.microbatch ?? operationIdentity.microbatch}.
              </p>
              <p className="inspector-learning__notation">
                Naming: {operationNotationKey(operationKindsForLevel(level))}.
              </p>
              <p className="inspector-learning__status">{learningStatusText(explanation)}</p>
              <ul className="inspector-learning__facts" aria-label="Selected block decoded facts">
                {showOwnerRank ? <li>Rank R{ownerRank}</li> : null}
                {explanation.operation ? <li>Duration {explanation.operation.duration}t</li> : null}
                {selectedDirection ? <li>{selectedDirection}</li> : null}
                <li>Status {explanation.status}</li>
              </ul>
              <div>
                <p className="inspector-learning__label">Dependency gates</p>
                {explanation.dependencyIds.length === 0 ? (
                  <p className="inspector-learning__empty">No dependency gates.</p>
                ) : (
                  <ul className="inspector-gates" aria-label="Dependency gates">
                    {explanation.dependencyIds.map((dependencyId) => {
                      const waiting = waitingDependencyIds(explanation).has(dependencyId);
                      return (
                        <li
                          key={dependencyId}
                          className="inspector-gate"
                          data-state={waiting ? 'waiting' : 'satisfied'}
                        >
                          <span className="mono">{formatOperationCode(dependencyId)}</span>
                          <span>{waiting ? 'waiting' : 'satisfied'}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          </details>
        </div>
      ) : null}
    </section>
  );
}

function ownerRankForExplanation(explanation: InspectorExplanation | null): number | null {
  if (explanation === null) {
    return null;
  }
  if (explanation.operation) {
    return explanation.operation.rank;
  }
  if (explanation.status === 'completed') {
    return explanation.placement?.rank ?? null;
  }
  return null;
}

function directionLabel(direction: Operation['direction']): string | null {
  switch (direction) {
    case 'asc':
      return 'Direction Up';
    case 'desc':
      return 'Direction Down';
    case undefined:
      return null;
  }
}

function compactDirectionLabel(direction: PipelineDirection | undefined): string | null {
  switch (direction) {
    case 'asc':
      return 'Up';
    case 'desc':
      return 'Down';
    case undefined:
      return null;
  }
}

function dependencyLabel(operationId: OperationId): string {
  const parsed = parseOperationId(operationId);
  const direction = compactDirectionLabel(parsed.direction);
  return direction
    ? `${formatOperationCode(operationId)} ${direction}`
    : formatOperationCode(operationId);
}

function compactDependencyFact(dependencyIds: readonly OperationId[]): string {
  if (dependencyIds.length === 0) {
    return 'Deps none';
  }
  return `Deps ${dependencyIds.map(dependencyLabel).join(', ')}`;
}

function compactResourceDelayFact(delay: ResourceDelay): string {
  const direction = compactDirectionLabel(delay.direction);
  const directionText = direction ? ` ${direction}` : '';
  return `Wait R${delay.rank} ${delay.start}->${delay.end}${directionText}`;
}

function learningStatusText(explanation: InspectorExplanation): string {
  switch (explanation.status) {
    case 'blocked': {
      const count = explanation.explanations.length;
      return `Status: blocked by ${count} dependency gate${count === 1 ? '' : 's'}.`;
    }
    case 'legal':
      return `Status: ready at t=${explanation.earliestStart}; memory after ${explanation.projectedMemory}.`;
    case 'completed':
      return explanation.placement
        ? `Status: placed on R${explanation.placement.rank} from t=${explanation.placement.start} to t=${explanation.placement.end}.`
        : 'Status: completed.';
  }
}

function operationKindLabel(kind: Operation['kind']): string {
  switch (kind) {
    case 'F':
      return 'forward pass';
    case 'B':
      return 'backward pass';
    case 'W':
      return 'weight-gradient pass';
  }
}

function waitingDependencyIds(explanation: InspectorExplanation): ReadonlySet<OperationId> {
  if (explanation.status !== 'blocked') {
    return new Set<OperationId>();
  }

  return new Set(
    explanation.explanations
      .map((entry) =>
        entry.reason.kind === 'dependency-not-finished' ? entry.reason.operationId : null,
      )
      .filter((operationId): operationId is OperationId => operationId !== null),
  );
}

function humanBlockedMessage(reason: BlockReason): string {
  switch (reason.kind) {
    case 'dependency-not-finished':
      return `Waiting for ${formatOperationName(reason.operationId)}.`;
    case 'memory-cap':
      return `Rank ${reason.rank} is at activation cap ${reason.resident}/${reason.cap}.`;
    case 'residency-memory-cap':
      return `Rank ${reason.rank} would exceed memory cap ${reason.cap} after residency admission.`;
    case 'already-placed':
      return `${formatOperationName(reason.operationId)} is already placed.`;
    case 'invalid-rank':
      return `Rank ${reason.rank} is not a valid wait target.`;
    case 'unknown-operation-id':
      return `${reason.operationId} is not part of this level.`;
  }
}

function typedReasonLabel(reason: BlockReason): string | null {
  switch (reason.kind) {
    case 'dependency-not-finished':
      return null;
    case 'memory-cap':
      return `memory-cap rank=${reason.rank} resident=${reason.resident} cap=${reason.cap}`;
    case 'residency-memory-cap':
      return `residency-cap rank=${reason.rank} activation=${reason.activationMemory} weights=${reason.residentWeightMemory} cap=${reason.cap}`;
    case 'already-placed':
      return formatOperationCode(reason.operationId);
    case 'invalid-rank':
      return `invalid-rank ${reason.rank}`;
    case 'unknown-operation-id':
      return reason.operationId;
  }
}

function residencyEffectText(effect: ResidencyEffect): string {
  const cache = effect.residentStages.map((stage) => `S${stage}`).join(', ') || 'empty';
  const evicted =
    effect.evictedStages.length === 0
      ? ''
      : ` Evicted ${effect.evictedStages.map((stage) => `S${stage}`).join(', ')}.`;
  const verb = effect.action === 'gather' ? 'Gathers weights' : 'Reuses resident weights';
  const cap = effect.cap === null ? 'no cap' : `cap ${effect.cap}`;
  return `${verb}. ${effect.activationMemory} activation + ${effect.residentWeightMemory} weights (${cap}). Cache: ${cache}.${evicted}`;
}
