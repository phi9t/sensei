import type { ExplanationResult } from '../coaching/coaching';
import type { BlockReason } from '../engine/replay';
import type { OperationId } from '../engine/types';
import { formatOperationCode, formatOperationName } from '../app/useGame';

interface MoveInspectorProps {
  readonly operationId: OperationId | null;
  readonly explanation: ExplanationResult | null;
}

export function MoveInspector({ operationId, explanation }: MoveInspectorProps) {
  return (
    <section className="panel inspector-panel" aria-labelledby="move-inspector-heading">
      <h2 id="move-inspector-heading">Move inspector</h2>
      {operationId === null || explanation === null ? <p>Select a block to inspect it.</p> : null}

      {operationId !== null && explanation !== null ? (
        <div className="inspector-content">
          <p className="inspector-operation">
            <strong>{formatOperationName(operationId)}</strong>{' '}
            <span className="mono">{formatOperationCode(operationId)}</span>
          </p>

          {explanation.status === 'blocked' ? (
            <>
              <p>Blocked by:</p>
              <ul className="inspector-list">
                {explanation.explanations.map((entry, index) => (
                  <li key={`${entry.kind}-${index}`}>
                    <span>{humanBlockedMessage(entry.reason)}</span>{' '}
                    <span className="mono">{typedReasonLabel(entry.reason)}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          {explanation.status === 'legal' ? (
            <p>
              Legal now. Earliest start {explanation.earliestStart}. Memory after:{' '}
              {explanation.projectedMemory}.
            </p>
          ) : null}

          {explanation.status === 'completed' ? (
            <p>
              Placed on rank {explanation.placement?.rank} from {explanation.placement?.start} to{' '}
              {explanation.placement?.end}.
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function humanBlockedMessage(reason: BlockReason): string {
  switch (reason.kind) {
    case 'dependency-not-finished':
      return `Waiting for ${formatOperationName(reason.operationId)}.`;
    case 'memory-cap':
      return `Rank ${reason.rank} is at activation cap ${reason.resident}/${reason.cap}.`;
    case 'already-placed':
      return `${formatOperationName(reason.operationId)} is already placed.`;
    case 'invalid-rank':
      return `Rank ${reason.rank} is not a valid wait target.`;
    case 'unknown-operation-id':
      return `${reason.operationId} is not part of this level.`;
  }
}

function typedReasonLabel(reason: BlockReason): string {
  switch (reason.kind) {
    case 'dependency-not-finished':
      return formatOperationCode(reason.operationId);
    case 'memory-cap':
      return `memory-cap rank=${reason.rank} resident=${reason.resident} cap=${reason.cap}`;
    case 'already-placed':
      return formatOperationCode(reason.operationId);
    case 'invalid-rank':
      return `invalid-rank ${reason.rank}`;
    case 'unknown-operation-id':
      return reason.operationId;
  }
}
