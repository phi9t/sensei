import type { CSSProperties } from 'react';
import type { MoveClassification } from '../engine/replay';
import type { LevelConfig, OperationId, OperationKind } from '../engine/types';
import { formatOperationCode, formatOperationName } from '../app/useGame';
import { microbatchGroupLabel } from '../engine/microbatchGroups';
import { operationNotationKey } from '../engine/operations';
import { operationVisualKey, operationVisualVars } from './operationVisuals';

const OPERATION_KIND_ORDER: readonly OperationKind[] = ['F', 'B', 'W'];

interface OperationTrayProps {
  readonly level: LevelConfig;
  readonly classifications: readonly MoveClassification[];
  readonly selectedOperationId: OperationId | null;
  readonly onActivate: (operationId: OperationId) => void;
  readonly onInspect: (operationId: OperationId) => void;
}

interface BatchGroup {
  readonly microbatch: number;
  readonly classifications: readonly MoveClassification[];
  readonly readyCount: number;
  readonly phase: BatchPhase;
}

type BatchPhase = 'ready' | 'waiting' | 'done';

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
  const verb = classification.status === 'legal' ? 'Place' : 'Inspect';
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
    .map(([microbatch, batchClassifications]) => {
      const sortedClassifications = Object.freeze(
        [...batchClassifications].sort(
          (left, right) =>
            OPERATION_KIND_ORDER.indexOf(left.operation.kind) -
              OPERATION_KIND_ORDER.indexOf(right.operation.kind) ||
            directionOrder(left.operation.direction) - directionOrder(right.operation.direction) ||
            left.operation.stage - right.operation.stage,
        ),
      );
      const readyCount = sortedClassifications.filter(
        (classification) => classification.status === 'legal',
      ).length;
      const completedCount = sortedClassifications.filter(
        (classification) => classification.status === 'completed',
      ).length;
      const phase: BatchPhase =
        completedCount === sortedClassifications.length
          ? 'done'
          : readyCount > 0
            ? 'ready'
            : 'waiting';

      return Object.freeze({
        microbatch,
        classifications: sortedClassifications,
        readyCount,
        phase,
      });
    });
}

function directionOrder(direction: MoveClassification['operation']['direction']): number {
  return direction === 'desc' ? 1 : 0;
}

function passLabel(kind: OperationKind): string {
  switch (kind) {
    case 'F':
      return 'FWD';
    case 'B':
      return 'BWD';
    case 'W':
      return 'WGT';
  }
}

function passAriaLabel(kind: OperationKind): string {
  switch (kind) {
    case 'F':
      return 'forward';
    case 'B':
      return 'backward';
    case 'W':
      return 'weight-gradient';
  }
}

function directionLabel(direction: MoveClassification['operation']['direction']): string | null {
  switch (direction) {
    case 'asc':
      return 'Up';
    case 'desc':
      return 'Down';
    case undefined:
      return null;
  }
}

function batchPhaseLabel(group: BatchGroup): string {
  switch (group.phase) {
    case 'ready':
      return `${group.readyCount} ready`;
    case 'waiting':
      return 'Waiting';
    case 'done':
      return 'Done';
  }
}

function batchVisualVars(microbatch: number): CSSProperties {
  const hue = (184 + microbatch * 42) % 360;
  return {
    '--batch-hue': String(hue),
    '--batch-accent': `hsl(${hue} 44% 40%)`,
  } as CSSProperties;
}

export function OperationTray({
  level,
  classifications,
  selectedOperationId,
  onActivate,
  onInspect,
}: OperationTrayProps) {
  const readyCount = classifications.filter(
    (classification) => classification.status === 'legal',
  ).length;
  const batchGroups = groupByMicrobatch(classifications);
  const operationKinds = OPERATION_KIND_ORDER.filter((kind) =>
    classifications.some((classification) => classification.operation.kind === kind),
  );
  const notationKey = operationNotationKey(operationKinds);

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
            <span className="mono">{notationKey}</span>
          </p>
        </div>
      </div>
      <div className="operation-tray-grid" aria-label="Blocks grouped by microbatch">
        {batchGroups.map((group) => (
          <BatchLane
            key={group.microbatch}
            group={group}
            groupLabel={microbatchGroupLabel(level, group.microbatch)}
            operationKinds={operationKinds}
            selectedOperationId={selectedOperationId}
            onActivate={onActivate}
            onInspect={onInspect}
          />
        ))}
      </div>
    </section>
  );
}

function BatchLane({
  group,
  groupLabel,
  operationKinds,
  selectedOperationId,
  onActivate,
  onInspect,
}: {
  readonly group: BatchGroup;
  readonly groupLabel: string | null;
  readonly operationKinds: readonly OperationKind[];
  readonly selectedOperationId: OperationId | null;
  readonly onActivate: (operationId: OperationId) => void;
  readonly onInspect: (operationId: OperationId) => void;
}) {
  return (
    <section
      className="batch-lane"
      aria-label={`Batch ${group.microbatch} blocks, ${batchPhaseLabel(group)}`}
      data-phase={group.phase}
      data-ready-count={group.readyCount}
      data-group={groupLabel ?? undefined}
      data-stack-count={operationKinds.length}
      style={batchVisualVars(group.microbatch)}
    >
      <div className="batch-lane__heading">
        <h3>Batch {group.microbatch}</h3>
        <span className="batch-lane__markers">
          {groupLabel ? <span className="batch-lane__group">{groupLabel}</span> : null}
          <span className="batch-lane__status">{batchPhaseLabel(group)}</span>
        </span>
      </div>
      <div className="batch-lane__stacks" data-stack-count={operationKinds.length}>
        {operationKinds.map((kind) => {
          const stackClassifications = group.classifications.filter(
            (classification) => classification.operation.kind === kind,
          );

          return (
            <div
              key={`${group.microbatch}-${kind}`}
              className="batch-stack"
              role="group"
              aria-label={`Batch ${group.microbatch} ${passAriaLabel(kind)} blocks`}
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
                      {directionLabel(operation.direction) ? (
                        <span className="operation-button__direction">
                          {directionLabel(operation.direction)}
                        </span>
                      ) : null}
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
  );
}
