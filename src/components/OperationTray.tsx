import type { CSSProperties } from 'react';
import type { MoveClassification } from '../engine/replay';
import type { OperationId } from '../engine/types';
import { formatOperationCode, formatOperationName } from '../app/useGame';

interface OperationTrayProps {
  readonly classifications: readonly MoveClassification[];
  readonly selectedOperationId: OperationId | null;
  readonly onActivate: (operationId: OperationId) => void;
}

function visibleStateLabel(classification: MoveClassification): string {
  switch (classification.status) {
    case 'legal':
      return 'Ready';
    case 'blocked':
      return 'Blocked';
    case 'completed':
      return 'Completed';
  }
}

export function OperationTray({
  classifications,
  selectedOperationId,
  onActivate,
}: OperationTrayProps) {
  return (
    <section className="panel tray-panel" aria-labelledby="operation-tray-heading">
      <h2 id="operation-tray-heading">Operation tray</h2>
      <p className="panel-intro">
        Choose any operation. Blocked moves stay focusable so the inspector can explain them.
      </p>
      <div className="operation-tray-grid">
        {classifications.map((classification) => {
          const { operation } = classification;
          const stateLabel = visibleStateLabel(classification);
          const isBlocked = classification.status === 'blocked';
          const isSelected = selectedOperationId === operation.id;

          return (
            <button
              key={operation.id}
              type="button"
              className="operation-button"
              data-kind={operation.kind}
              data-state={classification.status}
              data-selected={isSelected ? 'true' : 'false'}
              aria-label={`Place ${formatOperationName(operation)}`}
              aria-disabled={isBlocked ? 'true' : undefined}
              aria-pressed={isSelected}
              onClick={() => onActivate(operation.id)}
              style={
                {
                  '--tile-duration': String(operation.duration),
                } as CSSProperties
              }
            >
              <span className="operation-button__code">{formatOperationCode(operation)}</span>
              <span className="operation-button__meta">
                {operation.kind} • rank {operation.rank} • {operation.duration} tick
                {operation.duration === 1 ? '' : 's'}
              </span>
              <span className="operation-button__state">{stateLabel}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
