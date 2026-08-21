import type { CSSProperties } from 'react';
import type { MoveClassification } from '../engine/replay';
import type { OperationId, OperationKind } from '../engine/types';
import { formatOperationCode, formatOperationName } from '../app/useGame';
import { operationVisualKey, operationVisualVars } from './operationVisuals';

interface OperationTrayProps {
  readonly classifications: readonly MoveClassification[];
  readonly selectedOperationId: OperationId | null;
  readonly onActivate: (operationId: OperationId) => void;
  readonly onInspect: (operationId: OperationId) => void;
}

interface BatchGroup {
  readonly microbatch: number;
  readonly classifications: readonly MoveClassification[];
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

function groupByMicrobatch(classifications: readonly MoveClassification[]): readonly BatchGroup[] {
  const groups = new Map<number, MoveClassification[]>();

  for (const classification of classifications) {
    const { microbatch } = classification.operation;
    const existing = groups.get(microbatch);
    if (existing) {
      existing.push(classification);
    } else {
      groups.set(microbatch, [classification]);
    }
  }

  return Array.from(groups.entries())
    .sort(([left], [right]) => left - right)
    .map(([microbatch, batchClassifications]) =>
      Object.freeze({
        microbatch,
        classifications: Object.freeze(
          [...batchClassifications].sort(
            (left, right) =>
              left.operation.stage - right.operation.stage ||
              left.operation.kind.localeCompare(right.operation.kind),
          ),
        ),
      }),
    );
}

function passLabel(kind: OperationKind): string {
  return kind === 'F' ? 'FWD' : 'BWD';
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
  const batchGroups = groupByMicrobatch(classifications);
  const operationKinds: readonly OperationKind[] = ['F', 'B'];

  return (
    <section className="panel tray-panel" aria-label="Ready queue">
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
      <div className="operation-tray-grid" aria-label="Blocks grouped by microbatch">
        {batchGroups.map((group) => (
          <section
            key={group.microbatch}
            className="batch-lane"
            aria-label={`Batch ${group.microbatch} blocks`}
          >
            <div className="batch-lane__heading">
              <h3>Batch {group.microbatch}</h3>
            </div>
            <div className="batch-lane__stacks">
              {operationKinds.map((kind) => {
                const stackClassifications = group.classifications.filter(
                  (classification) => classification.operation.kind === kind,
                );

                return (
                  <div
                    key={`${group.microbatch}-${kind}`}
                    className="batch-stack"
                    role="group"
                    aria-label={`Batch ${group.microbatch} ${
                      kind === 'F' ? 'forward' : 'backward'
                    } blocks`}
                    data-kind={kind}
                  >
                    <p className="batch-stack__label">{passLabel(kind)}</p>
                    <div className="batch-stack__tokens">
                      {stackClassifications.map((classification) => {
                        const { operation } = classification;
                        const stateLabel = visibleStateLabel(classification);
                        const isSelected = selectedOperationId === operation.id;

                        return (
                          <button
                            key={operation.id}
                            type="button"
                            className="operation-button"
                            data-testid={`tile-${operation.id}`}
                            data-operation-visual={operationVisualKey(operation)}
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
                                ...operationVisualVars(operation),
                                '--tile-duration': String(operation.duration),
                              } as CSSProperties
                            }
                          >
                            <span className="operation-button__code">
                              {formatOperationCode(operation)}
                            </span>
                            <span className="operation-button__meta">
                              R{operation.rank} - {operation.duration}t
                            </span>
                            <span className="operation-button__state">{stateLabel}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}
