import type { CSSProperties } from 'react';
import type { ExplanationResult } from '../coaching/coaching';
import type { BlockReason, ResourceDelay } from '../engine/replay';
import type { Operation, OperationId, PipelineDirection, ResidencyEffect } from '../engine/types';
import { formatOperationCode, formatOperationName } from '../app/useGame';
import { parseOperationId } from '../engine/operations';
import { operationVisualKey, operationVisualVars } from './operationVisuals';

type InspectorExplanation = ExplanationResult & { readonly operation?: Operation };

interface MoveInspectorProps {
  readonly operationId: OperationId | null;
  readonly explanation: InspectorExplanation | null;
}

export function MoveInspector({ operationId, explanation }: MoveInspectorProps) {
  const operationIdentity = operationId === null ? null : parseOperationId(operationId);
  const ownerRank = ownerRankForExplanation(explanation);
  const showOwnerRank = operationIdentity !== null && ownerRank !== null;
  const dependencySummary =
    explanation && operationId !== null ? dependencySummaryText(explanation.dependencyIds) : null;

  return (
    <section className="panel inspector-panel" aria-labelledby="move-inspector-heading">
      <h2 id="move-inspector-heading">Move inspector</h2>
      {operationId === null || explanation === null ? <p>Select a block to inspect it.</p> : null}

      {operationId !== null && explanation !== null ? (
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
              {showOwnerRank ? (
                <span className="inspector-operation__owner">Owner rank {ownerRank}</span>
              ) : null}
              {directionLabel(operationIdentity?.direction) ? (
                <span className="inspector-operation__owner">
                  {directionLabel(operationIdentity?.direction)}
                </span>
              ) : null}
            </div>
            <span className="inspector-operation__status">{explanation.status}</span>
          </div>

          {explanation.status === 'blocked' ? (
            <>
              {dependencySummary ? <p className="inspector-note">{dependencySummary}</p> : null}
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
              {dependencySummary ? <p className="inspector-note">{dependencySummary}</p> : null}
              {explanation.resourceDelay ? (
                <p className="inspector-note">{resourceDelayText(explanation.resourceDelay)}</p>
              ) : null}
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
              {dependencySummary ? <p className="inspector-note">{dependencySummary}</p> : null}
              {explanation.residencyEffect ? (
                <p className="inspector-note">{residencyEffectText(explanation.residencyEffect)}</p>
              ) : null}
            </>
          ) : null}
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
      return 'Direction up';
    case 'desc':
      return 'Direction down';
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

function dependencySummaryText(dependencyIds: readonly OperationId[]): string {
  if (dependencyIds.length === 0) {
    return 'Deps none.';
  }
  return `Deps ${dependencyIds.map(dependencyLabel).join(', ')}.`;
}

function resourceDelayText(delay: ResourceDelay): string {
  const direction = compactDirectionLabel(delay.direction);
  const directionText = direction ? `, ${direction}` : '';
  return `Resource wait R${delay.rank} ${delay.start}->${delay.end}${directionText}; shared ${delay.sharedCapacity}, dir slots ${delay.directionalSlots}.`;
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
