import type { CSSProperties } from 'react';
import type { MoveClassification } from '../engine/replay';
import type { OperationId } from '../engine/types';
import { formatOperationCode, formatOperationName } from '../app/useGame';

interface OperationTrayProps {
  readonly classifications: readonly MoveClassification[];
  readonly selectedOperationId: OperationId | null;
  readonly onActivate: (operationId: OperationId) => void;
  readonly onInspect: (operationId: OperationId) => void;
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

function accessibleOperationLabel(classification: MoveClassification): string {
  const { operation } = classification;
  const tickLabel = operation.duration === 1 ? '1 tick' : `${operation.duration} ticks`;
  const verb = classification.status === 'blocked' ? 'Inspect' : 'Place';
  return `${verb} ${formatOperationName(operation)}, ${tickLabel}, ${visibleStateLabel(classification)}`;
}

export function OperationTray({
  classifications,
  selectedOperationId,
  onActivate,
  onInspect,
}: OperationTrayProps) {
  const readyCount = classifications.filter(
    (classification) => classification.status === 'legal',
  ).length;

  return (
    <section className="panel tray-panel" aria-labelledby="operation-tray-heading">
      <div className="panel-heading-row">
        <div>
          <p className="panel-kicker">Ready queue</p>
          <h2 id="operation-tray-heading">Blocks</h2>
        </div>
        <div className="tray-panel__summary">
          <p className="ready-count">{readyCount} ready</p>
          <p className="notation-key">
            <span className="mono">(F/B, stage_id, micro_batch_id)</span>
          </p>
        </div>
      </div>
      <div className="operation-tray-grid">
        {classifications.map((classification) => {
          const { operation } = classification;
          const stateLabel = visibleStateLabel(classification);
          const isSelected = selectedOperationId === operation.id;

          return (
            <button
              key={operation.id}
              type="button"
              className="operation-button"
              data-testid={`tile-${operation.id}`}
              data-duration={operation.duration}
              data-kind={operation.kind}
              data-state={classification.status}
              data-selected={isSelected ? 'true' : 'false'}
              aria-label={accessibleOperationLabel(classification)}
              aria-current={isSelected ? 'true' : undefined}
              onClick={() => onActivate(operation.id)}
              onFocus={() => onInspect(operation.id)}
              style={
                {
                  '--tile-duration': String(operation.duration),
                } as CSSProperties
              }
            >
              <span className="operation-button__code">{formatOperationCode(operation)}</span>
              <span className="operation-button__meta">
                R{operation.rank} · {operation.duration}t
              </span>
              <span className="operation-button__state">{stateLabel}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
