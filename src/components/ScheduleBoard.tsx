import { useMemo, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { TimelineHelp } from './TimelineHelp';
import type { Gap, MemoryTimelineSegment, Placement, ScheduleState } from '../engine/replay';
import { formatOperationCode, formatOperationName } from '../app/useGame';
import type { Operation, OperationId, OperationKind, PipelineDirection } from '../engine/types';
import { predecessorsOf, releasesActivation } from '../engine/operations';
import { projectReferencePolicy, REFERENCE_POLICIES } from '../engine/policies';
import { replay } from '../engine/replay';
import type { ReferencePolicyId } from '../engine/types';
import { topologyForLevel } from '../engine/topology';
import { operationVisualKey, operationVisualVars } from './operationVisuals';

export const CELL_WIDTH = 60;
const RIGHT_PADDING = 32;
const MEMORY_STRIP_HEIGHT = 8;
const MEMORY_STRIP_GAP = 8;
const WORK_BLOCK_HEIGHT = 44;
const ROW_HEIGHT = 84;
const DUALPIPE_ROW_HEIGHT = 132;
const TOP_PADDING = 48;
const LEFT_PADDING = 78;
const MIN_BOARD_WIDTH = 800;

interface ScheduleBoardProps {
  readonly schedule: ScheduleState;
  readonly selectedOperationId: OperationId | null;
  readonly preview: {
    readonly operationId: OperationId;
    readonly earliestStart: number;
  } | null;
  readonly onInspect: (operationId: OperationId) => void;
  readonly referencePolicyId?: ReferencePolicyId;
}

function kindPatternId(kind: OperationKind): string {
  switch (kind) {
    case 'F':
      return 'pattern-forward';
    case 'B':
      return 'pattern-backward';
    case 'W':
      return 'pattern-weight';
  }
}

interface RankOwnerLabel {
  readonly rank: number;
  readonly stages: readonly number[];
}

function operationById(state: ScheduleState, operationId: OperationId) {
  const operation = state.operations.find((candidate) => candidate.id === operationId);
  if (!operation) {
    throw new Error(`Operation ${operationId} not found on board`);
  }
  return operation;
}

function maxEndTime(state: ScheduleState): number {
  const placementEnd = state.placements.reduce((max, placement) => Math.max(max, placement.end), 0);
  const frontierEnd = state.rankFrontiers.reduce((max, frontier) => Math.max(max, frontier), 0);
  return Math.max(placementEnd, frontierEnd, 2);
}

function gapLabel(gap: Gap): string {
  return `${gap.kind} gap on rank ${gap.rank} from ${gap.start} to ${gap.end}`;
}

function placementSummary(state: ScheduleState, placement: Placement): string {
  const operation = operationById(state, placement.operationId);
  return `Rank ${placement.rank}, start ${placement.start}, end ${placement.end}, duration ${operation.duration}`;
}

function placementActionLabel(operation: Operation, placement: Placement): string {
  const tickLabel = operation.duration === 1 ? '1 tick' : `${operation.duration} ticks`;
  return `Inspect ${formatOperationName(operation)}, placed on rank ${placement.rank} from ${placement.start} to ${placement.end}, ${tickLabel}`;
}

function timelineExtent(state: ScheduleState): number {
  return LEFT_PADDING + maxEndTime(state) * CELL_WIDTH + RIGHT_PADDING;
}

function rowHeightForSchedule(state: ScheduleState): number {
  return state.config.dualPipeModel ? DUALPIPE_ROW_HEIGHT : ROW_HEIGHT;
}

function rankRowTopForSchedule(state: ScheduleState, rank: number): number {
  return TOP_PADDING + rank * rowHeightForSchedule(state);
}

function memoryTimelineText(segments: readonly MemoryTimelineSegment[], rank: number): string {
  return `Rank ${rank} memory timeline: ${segments
    .map((segment) => `${segment.start}-${segment.end} => ${segment.value} units`)
    .join('; ')}`;
}

function residencyTimelineText(segments: readonly MemoryTimelineSegment[], rank: number): string {
  return `Rank ${rank} weight residency timeline: ${segments
    .map((segment) => `${segment.start}-${segment.end} => ${segment.value} units`)
    .join('; ')}`;
}

function rankOwnersForSchedule(state: ScheduleState): readonly RankOwnerLabel[] {
  const topology = topologyForLevel(state.config);
  if (topology.placement === 'one-to-one') {
    return [];
  }

  const stagesByRank = new Map<number, Set<number>>();
  for (const operation of state.operations) {
    let stages = stagesByRank.get(operation.rank);
    if (!stages) {
      stages = new Set<number>();
      stagesByRank.set(operation.rank, stages);
    }
    stages.add(operation.stage);
  }

  return Object.freeze(
    Array.from({ length: state.config.rankCount }, (_, rank) =>
      Object.freeze({
        rank,
        stages: Object.freeze(
          [...(stagesByRank.get(rank) ?? [])].sort((left, right) => left - right),
        ),
      }),
    ),
  );
}

function rankOwnerText(owner: RankOwnerLabel): string {
  return `Rank ${owner.rank} owns ${owner.stages.map((stage) => `S${stage}`).join(', ')}`;
}

function splitOperationCode(operation: Operation): readonly [string, string] {
  const [pass, stage, batch] = formatOperationCode(operation).split(':') as [
    string,
    string,
    string,
  ];
  return [pass, `${stage}:${batch}`];
}

function ScheduleOperationLabel({
  operation,
  x,
  y,
  className,
  testId,
}: {
  readonly operation: Operation;
  readonly x: number;
  readonly y: number;
  readonly className: string;
  readonly testId: string;
}) {
  const code = formatOperationCode(operation);
  const [passCode, coordinateCode] = splitOperationCode(operation);

  return (
    <text
      x={x}
      y={y}
      textAnchor="middle"
      className={className}
      data-testid={testId}
      aria-label={code}
    >
      <tspan x={x}>{passCode}</tspan>
      <tspan x={x} dy="0.95em">
        {coordinateCode}
      </tspan>
    </text>
  );
}

function directionLabel(direction: PipelineDirection | undefined): string | null {
  switch (direction) {
    case 'asc':
      return 'Up';
    case 'desc':
      return 'Down';
    case undefined:
      return null;
  }
}

function operationLaneOffset(operation: Operation, hasDualPipe: boolean): number {
  if (!hasDualPipe || !operation.direction) {
    return 0;
  }
  return operation.direction === 'asc' ? 0 : WORK_BLOCK_HEIGHT + 4;
}

function handleTileKeyDown(
  event: KeyboardEvent<SVGGElement>,
  operationId: OperationId,
  onInspect: (operationId: OperationId) => void,
): void {
  if (event.key !== 'Enter' && event.key !== ' ') {
    return;
  }

  event.preventDefault();
  onInspect(operationId);
}

export function ScheduleBoard({
  schedule,
  selectedOperationId,
  preview,
  onInspect,
  referencePolicyId,
}: ScheduleBoardProps) {
  const [showReference, setShowReference] = useState(false);
  const reference = useMemo(() => {
    if (!showReference || !referencePolicyId) return null;
    const projected = projectReferencePolicy(schedule.config, referencePolicyId);
    if (!projected.ok) return null;
    const validated = replay(projected.state.config, projected.state.actions);
    return validated.ok ? validated.state : null;
  }, [showReference, referencePolicyId, schedule.config]);
  const hasResidency = schedule.config.residencyModel !== undefined;
  const hasDualPipe = schedule.config.dualPipeModel !== undefined;
  const resourceStripHeight = hasResidency ? MEMORY_STRIP_HEIGHT * 2 + 2 : MEMORY_STRIP_HEIGHT;
  const workTopOffset = resourceStripHeight + MEMORY_STRIP_GAP;
  const previewOperation = preview ? operationById(schedule, preview.operationId) : null;
  const previewStart = preview?.earliestStart ?? 0;
  const previewEnd = previewOperation ? previewStart + previewOperation.duration : 0;
  const rankOwners = rankOwnersForSchedule(schedule);
  const svgWidth = Math.max(
    timelineExtent(schedule),
    reference ? timelineExtent(reference) : 0,
    MIN_BOARD_WIDTH,
    LEFT_PADDING + previewEnd * CELL_WIDTH + RIGHT_PADDING,
  );
  const mainHeight = TOP_PADDING + schedule.config.rankCount * rowHeightForSchedule(schedule) + 20;
  const svgHeight =
    mainHeight + (reference ? 48 + schedule.config.rankCount * (hasDualPipe ? 60 : 34) : 0);
  const timelineEnd = Math.max(
    maxEndTime(schedule),
    previewEnd,
    reference ? maxEndTime(reference) : 0,
    Math.floor((MIN_BOARD_WIDTH - LEFT_PADDING - RIGHT_PADDING) / CELL_WIDTH),
  );
  const selected = schedule.operations.find((operation) => operation.id === selectedOperationId);
  const selectedPlacement =
    schedule.placements.find((placement) => placement.operationId === selectedOperationId) ??
    (preview && selected
      ? {
          operationId: selected.id,
          rank: selected.rank,
          start: preview.earliestStart,
          end: previewEnd,
        }
      : null);
  const dependencyIds = selected ? predecessorsOf(selected.id, schedule.config) : [];
  const dependencies = schedule.placements.filter((placement) =>
    dependencyIds.includes(placement.operationId),
  );
  const sameActivation = (operation: Operation) =>
    selected &&
    operation.stage === selected.stage &&
    operation.microbatch === selected.microbatch &&
    operation.direction === selected.direction;
  const forward = schedule.operations.find(
    (operation) => sameActivation(operation) && operation.kind === 'F',
  );
  const release = schedule.operations.find(
    (operation) => sameActivation(operation) && releasesActivation(schedule.config, operation.kind),
  );
  const forwardPlacement = schedule.placements.find(
    (placement) => placement.operationId === forward?.id,
  );
  const releasePlacement = schedule.placements.find(
    (placement) => placement.operationId === release?.id,
  );
  const activationEnd =
    releasePlacement?.end ?? (selected ? (schedule.rankFrontiers[selected.rank] ?? 0) : 0);
  const laneY = (operation: Operation) =>
    rankRowTopForSchedule(schedule, operation.rank) +
    workTopOffset +
    operationLaneOffset(operation, hasDualPipe);

  return (
    <section className="panel board-panel" aria-labelledby="schedule-board-heading">
      <div className="board-panel__header">
        <div className="board-title-row">
          <div>
            <p className="panel-kicker">Execution timeline</p>
            <h2 id="schedule-board-heading" tabIndex={-1}>
              Schedule board
            </h2>
          </div>
          <div className="board-tools">
            <TimelineHelp level={schedule.config} />
            <span>
              {schedule.config.rankCount} ranks · {schedule.config.stageCount} stages ·{' '}
              {schedule.config.microbatchCount} microbatches
            </span>
            {referencePolicyId ? (
              <button
                type="button"
                className="command-button"
                aria-pressed={showReference}
                onClick={() => setShowReference(!showReference)}
              >
                Compare reference
              </button>
            ) : null}
          </div>
        </div>
        <div className="board-legend" role="group" aria-label="Timeline legend">
          <span>
            <i data-kind="F" /> F · forward
          </span>
          <span>
            <i data-kind="B" /> B ·{' '}
            {schedule.config.operationModel?.backward === 'split' ? 'input gradient' : 'backward'}
          </span>
          {schedule.config.operationModel?.backward === 'split' ? (
            <span>
              <i data-kind="W" /> W · weight gradient
            </span>
          ) : null}
          <span>Color = microbatch</span>
          {hasDualPipe ? <span>Up = increasing stage · Down = decreasing stage</span> : null}
          <span>A = stored activations{hasResidency ? ' · P = resident parameters' : ''}</span>
        </div>
        {rankOwners.length > 0 ? (
          <div className="rank-owner-list" aria-label="Rank stage ownership">
            {rankOwners.map((owner) => (
              <span key={`rank-owner-${owner.rank}`}>{rankOwnerText(owner)}</span>
            ))}
          </div>
        ) : null}
      </div>
      <div
        className="board-scroll-region"
        role="group"
        aria-label="Schedule board horizontal scroll region"
        tabIndex={0}
      >
        <svg
          className="schedule-board-svg"
          style={{ minWidth: `${svgWidth}px` }}
          width={svgWidth}
          height={svgHeight}
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          aria-labelledby="schedule-svg-title schedule-svg-desc"
          role="group"
        >
          <title id="schedule-svg-title">Pipeline schedule board</title>
          <desc id="schedule-svg-desc">
            Rank timelines, placed blocks, gaps, activation memory, optional weight residency, and
            optional bidirectional overlap lanes.
          </desc>
          <text x={LEFT_PADDING} y="18" className="time-axis-label">
            Time → (ticks)
          </text>
          <defs>
            <marker
              id="dependency-arrow"
              viewBox="0 0 8 8"
              refX="7"
              refY="4"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M0 0 L8 4 L0 8Z" fill="var(--accent)" />
            </marker>
            <pattern
              id="pattern-forward"
              width="6"
              height="6"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <line x1="0" y1="0" x2="0" y2="6" className="tile-pattern tile-pattern--forward" />
            </pattern>
            <pattern id="pattern-backward" width="8" height="8" patternUnits="userSpaceOnUse">
              <line x1="0" y1="1" x2="8" y2="1" className="tile-pattern tile-pattern--backward" />
              <line x1="0" y1="5" x2="8" y2="5" className="tile-pattern tile-pattern--backward" />
            </pattern>
            <pattern id="pattern-weight" width="8" height="8" patternUnits="userSpaceOnUse">
              <path d="M0 8 L8 0" className="tile-pattern tile-pattern--weight" />
              <path d="M-4 4 L4 -4 M4 12 L12 4" className="tile-pattern tile-pattern--weight" />
            </pattern>
          </defs>

          {schedule.rankFrontiers.map((_, rank) => {
            const y = rankRowTopForSchedule(schedule, rank);
            const stripY = y;
            const lineY = y + workTopOffset + 12;
            return (
              <g key={`rank-${rank}`}>
                <rect
                  data-testid={`rank-band-${rank}`}
                  x={LEFT_PADDING}
                  y={y - 12}
                  width={timelineEnd * CELL_WIDTH}
                  height={rowHeightForSchedule(schedule) - 10}
                  className="rank-band"
                  data-rank-parity={rank % 2 === 0 ? 'even' : 'odd'}
                />
                <text x="12" y={lineY + 4} className="rank-label">
                  Rank {rank}
                </text>
                <g
                  className="memory-strip"
                  data-testid={`memory-strip-rank-${rank}`}
                  transform={`translate(${LEFT_PADDING} 0)`}
                >
                  {(schedule.activationMemoryTimelineByRank[rank] ?? []).map((segment, index) => (
                    <g key={`memory-${rank}-${segment.start}-${segment.end}-${segment.value}`}>
                      <rect
                        data-testid={`memory-segment-rank-${rank}-${index}`}
                        x={segment.start * CELL_WIDTH}
                        y={stripY}
                        width={(segment.end - segment.start) * CELL_WIDTH}
                        height={MEMORY_STRIP_HEIGHT}
                        className={`memory-strip__segment${
                          segment.value > 0 ? ' memory-strip__segment--active' : ''
                        }`}
                        data-resource="activation"
                        data-memory={segment.value}
                      />
                      <text
                        x={segment.start * CELL_WIDTH + 4}
                        y={stripY + 9}
                        className="memory-strip__label"
                      >
                        A{segment.value}
                      </text>
                    </g>
                  ))}
                </g>
                {hasResidency ? (
                  <g
                    className="memory-strip memory-strip--weights"
                    data-testid={`weight-strip-rank-${rank}`}
                    transform={`translate(${LEFT_PADDING} 0)`}
                  >
                    {(schedule.weightResidencyTimelineByRank[rank] ?? []).map((segment, index) => (
                      <g key={`weight-${rank}-${segment.start}-${segment.end}-${segment.value}`}>
                        <rect
                          data-testid={`weight-segment-rank-${rank}-${index}`}
                          x={segment.start * CELL_WIDTH}
                          y={stripY + MEMORY_STRIP_HEIGHT + 2}
                          width={(segment.end - segment.start) * CELL_WIDTH}
                          height={MEMORY_STRIP_HEIGHT}
                          className={`memory-strip__segment memory-strip__segment--weights${
                            segment.value > 0 ? ' memory-strip__segment--resident' : ''
                          }`}
                          data-resource="weights"
                          data-memory={segment.value}
                        />
                        <text
                          x={segment.start * CELL_WIDTH + 4}
                          y={stripY + MEMORY_STRIP_HEIGHT + 11}
                          className="memory-strip__label memory-strip__label--weights"
                        >
                          P{segment.value}
                        </text>
                      </g>
                    ))}
                  </g>
                ) : null}
                <line
                  x1={LEFT_PADDING}
                  x2={LEFT_PADDING + timelineEnd * CELL_WIDTH}
                  y1={lineY}
                  y2={lineY}
                  className="rank-line"
                />
              </g>
            );
          })}

          <g transform={`translate(${LEFT_PADDING} 0)`}>
            {Array.from({ length: timelineEnd + 1 }, (_, tick) => {
              const x = tick * CELL_WIDTH;
              return (
                <g key={`tick-${tick}`}>
                  <line
                    x1={x}
                    x2={x}
                    y1={TOP_PADDING - 6}
                    y2={
                      TOP_PADDING + schedule.config.rankCount * rowHeightForSchedule(schedule) - 8
                    }
                    className="tick-line"
                  />
                  <text x={x} y={TOP_PADDING - 10} textAnchor="middle" className="tick-label">
                    {tick}
                  </text>
                </g>
              );
            })}

            {schedule.gaps.map((gap) => {
              const y = rankRowTopForSchedule(schedule, gap.rank) + workTopOffset;
              const x = gap.start * CELL_WIDTH;
              const width = (gap.end - gap.start) * CELL_WIDTH;
              return (
                <g key={`gap-${gap.rank}-${gap.start}-${gap.end}-${gap.kind}`}>
                  <rect
                    x={x}
                    y={y}
                    width={width}
                    height={WORK_BLOCK_HEIGHT}
                    className="gap-rect"
                    data-kind={gap.kind}
                  />
                  <text x={x + width / 2} y={y + 19} textAnchor="middle" className="gap-label">
                    {gap.kind === 'intentional' ? 'WAIT' : 'GAP'}
                  </text>
                </g>
              );
            })}

            {selected && forwardPlacement && activationEnd > forwardPlacement.end ? (
              <g
                className="activation-lifespan"
                role="img"
                aria-label={`Stored activation on rank ${selected.rank} from ${forwardPlacement.end} to ${activationEnd}${releasePlacement ? '' : ', still resident'}`}
              >
                <rect
                  x={forwardPlacement.end * CELL_WIDTH}
                  y={rankRowTopForSchedule(schedule, selected.rank) - 3}
                  width={(activationEnd - forwardPlacement.end) * CELL_WIDTH}
                  height={MEMORY_STRIP_HEIGHT + 6}
                  rx="3"
                />
                <title>
                  Stored activation: F completion →{' '}
                  {releasePlacement
                    ? `${release?.kind} completion`
                    : 'rank frontier (still resident)'}
                </title>
              </g>
            ) : null}
            {schedule.placements.map((placement) => {
              const operation = operationById(schedule, placement.operationId);
              const width = operation.duration * CELL_WIDTH;
              const x = placement.start * CELL_WIDTH;
              const y =
                rankRowTopForSchedule(schedule, placement.rank) +
                workTopOffset +
                operationLaneOffset(operation, hasDualPipe);
              const isSelected = selectedOperationId === placement.operationId;

              const actionLabel = placementActionLabel(operation, placement);

              return (
                <g
                  key={placement.operationId}
                  className="schedule-tile-control"
                  data-related={
                    !selected || operation.microbatch === selected.microbatch ? 'true' : 'false'
                  }
                  role="button"
                  tabIndex={0}
                  aria-label={actionLabel}
                  aria-current={isSelected ? 'true' : undefined}
                  onClick={() => onInspect(placement.operationId)}
                  onFocus={() => onInspect(placement.operationId)}
                  onKeyDown={(event) => handleTileKeyDown(event, placement.operationId, onInspect)}
                >
                  <title>{actionLabel}</title>
                  <rect
                    data-testid={`rank-tile-${operation.id}`}
                    x={x}
                    y={y}
                    width={width}
                    height={WORK_BLOCK_HEIGHT}
                    rx="6"
                    className="schedule-rect"
                    data-operation-visual={operationVisualKey(operation)}
                    data-kind={operation.kind}
                    data-direction={operation.direction}
                    data-duration={operation.duration}
                    data-selected={isSelected ? 'true' : 'false'}
                    fill="hsl(var(--operation-hue) 52% 88%)"
                    style={operationVisualVars(operation) as CSSProperties}
                  />
                  <rect
                    className="schedule-texture"
                    x={x}
                    y={y}
                    width={width}
                    height={WORK_BLOCK_HEIGHT}
                    rx="6"
                    fill={`url(#${kindPatternId(operation.kind)})`}
                  />
                  {directionLabel(operation.direction) ? (
                    <text
                      x={x + width - 6}
                      y={y + WORK_BLOCK_HEIGHT - 6}
                      textAnchor="end"
                      className="schedule-direction-label"
                    >
                      {directionLabel(operation.direction)}
                    </text>
                  ) : null}
                  <ScheduleOperationLabel
                    operation={operation}
                    x={x + width / 2}
                    y={y + 12}
                    className="schedule-label"
                    testId={`rank-label-${operation.id}`}
                  />
                </g>
              );
            })}

            {selected && selectedPlacement
              ? dependencies.map((dependency) => {
                  const source = operationById(schedule, dependency.operationId);
                  const x1 = dependency.end * CELL_WIDTH;
                  const x2 = selectedPlacement.start * CELL_WIDTH;
                  const y1 = laneY(source) + WORK_BLOCK_HEIGHT / 2;
                  const y2 = laneY(selected) + WORK_BLOCK_HEIGHT / 2;
                  return (
                    <path
                      key={`dependency-${dependency.operationId}`}
                      className="dependency-link"
                      data-testid={`dependency-${dependency.operationId}`}
                      d={`M ${x1} ${y1} C ${x1 + 18} ${y1}, ${x2 - 18} ${y2}, ${x2} ${y2}`}
                      markerEnd="url(#dependency-arrow)"
                    >
                      <title>
                        {formatOperationCode(source)} must finish before{' '}
                        {formatOperationCode(selected)}
                      </title>
                    </path>
                  );
                })
              : null}
            {preview && previewOperation ? (
              <g>
                <title>{`${formatOperationName(previewOperation)} preview on rank ${
                  previewOperation.rank
                } from ${preview.earliestStart} to ${previewEnd}`}</title>
                <rect
                  data-testid={`preview-tile-${previewOperation.id}`}
                  x={preview.earliestStart * CELL_WIDTH}
                  y={
                    rankRowTopForSchedule(schedule, previewOperation.rank) +
                    workTopOffset +
                    operationLaneOffset(previewOperation, hasDualPipe)
                  }
                  width={previewOperation.duration * CELL_WIDTH}
                  height={WORK_BLOCK_HEIGHT}
                  rx="6"
                  className="schedule-preview-rect"
                  data-operation-visual={operationVisualKey(previewOperation)}
                  data-kind={previewOperation.kind}
                  data-direction={previewOperation.direction}
                  data-duration={previewOperation.duration}
                  style={operationVisualVars(previewOperation) as CSSProperties}
                />
                <ScheduleOperationLabel
                  operation={previewOperation}
                  x={
                    preview.earliestStart * CELL_WIDTH +
                    (previewOperation.duration * CELL_WIDTH) / 2
                  }
                  y={
                    rankRowTopForSchedule(schedule, previewOperation.rank) +
                    workTopOffset +
                    operationLaneOffset(previewOperation, hasDualPipe) +
                    12
                  }
                  className="schedule-preview-label"
                  testId={`preview-label-${previewOperation.id}`}
                />
                {directionLabel(previewOperation.direction) ? (
                  <text
                    x={
                      preview.earliestStart * CELL_WIDTH +
                      previewOperation.duration * CELL_WIDTH -
                      6
                    }
                    y={
                      rankRowTopForSchedule(schedule, previewOperation.rank) +
                      workTopOffset +
                      operationLaneOffset(previewOperation, hasDualPipe) +
                      WORK_BLOCK_HEIGHT -
                      6
                    }
                    textAnchor="end"
                    className="schedule-direction-label"
                  >
                    {directionLabel(previewOperation.direction)}
                  </text>
                ) : null}
              </g>
            ) : null}
          </g>
          {reference && referencePolicyId ? (
            <g
              className="reference-schedule"
              role="group"
              aria-label="Reference timeline"
              data-reference-end={maxEndTime(reference)}
            >
              <text x={LEFT_PADDING} y={mainHeight + 14} className="reference-title">
                {REFERENCE_POLICIES[referencePolicyId].label} · local policy · same time scale
                {reference.config.dualPipeModel
                  ? ` · capacity ${reference.config.dualPipeModel.resourceModel.sharedCapacity}/rank`
                  : ''}
              </text>
              {reference.rankFrontiers.map((_, rank) => (
                <text
                  key={rank}
                  x="12"
                  y={mainHeight + 46 + rank * (hasDualPipe ? 60 : 34)}
                  className="rank-label"
                >
                  Rank {rank}
                </text>
              ))}
              {reference.placements.map((placement) => {
                const operation = operationById(reference, placement.operationId);
                const x = LEFT_PADDING + placement.start * CELL_WIDTH;
                const y =
                  mainHeight +
                  28 +
                  placement.rank * (hasDualPipe ? 60 : 34) +
                  (operation.direction === 'desc' ? 27 : 0);
                return (
                  <g key={operation.id} style={operationVisualVars(operation) as CSSProperties}>
                    <title>
                      {formatOperationName(operation)} · {placement.start}–{placement.end}
                    </title>
                    <rect
                      x={x}
                      y={y}
                      width={operation.duration * CELL_WIDTH}
                      height="25"
                      rx="3"
                      fill="hsl(var(--operation-hue) 52% 88%)"
                      stroke="var(--operation-accent)"
                    />
                    <text x={x + 5} y={y + 17} className="reference-label">
                      {operation.kind}
                      {operation.stage}:D{operation.microbatch}
                      {operation.direction === 'desc' ? ' ↓' : ''}
                    </text>
                  </g>
                );
              })}
            </g>
          ) : null}
        </svg>
      </div>

      <p className="board-selection-note">
        {selected
          ? `${formatOperationCode(selected)} · Rank ${selected.rank} · ${dependencyIds.length} predecessor${dependencyIds.length === 1 ? '' : 's'}${forwardPlacement ? ` · stored activation ${forwardPlacement.end} → ${releasePlacement ? activationEnd : 'still resident'}` : ''}`
          : 'Select a block to trace its dependencies and stored activation lifetime.'}
      </p>
      <details className="board-details">
        <summary>Timeline details</summary>
        <div className="board-details__grid">
          <div>
            <h3 className="board-subheading">Gaps</h3>
            <dl className="board-list">
              {schedule.gaps.length === 0 ? (
                <div>
                  <dt>None</dt>
                  <dd>No replayed gaps yet.</dd>
                </div>
              ) : (
                schedule.gaps.map((gap) => (
                  <div key={`gap-detail-${gap.rank}-${gap.start}-${gap.end}-${gap.kind}`}>
                    <dt>{gapLabel(gap)}</dt>
                    <dd>
                      {gap.kind === 'intentional'
                        ? 'Added by a learner wait action.'
                        : 'Created because dependencies delayed the owning rank.'}
                    </dd>
                  </div>
                ))
              )}
            </dl>
          </div>

          <div>
            <h3 className="board-subheading">Placed operations</h3>
            <dl className="board-list">
              {schedule.placements.length === 0 ? (
                <div>
                  <dt>None</dt>
                  <dd>No operations are placed yet.</dd>
                </div>
              ) : (
                schedule.placements.map((placement) => {
                  const operation = operationById(schedule, placement.operationId);
                  return (
                    <div key={`placement-detail-${placement.operationId}`}>
                      <dt>{formatOperationName(operation)}</dt>
                      <dd>{placementSummary(schedule, placement)}</dd>
                    </div>
                  );
                })
              )}
            </dl>
          </div>

          <div>
            <h3 className="board-subheading">Activation memory</h3>
            <dl className="board-list">
              {Array.from({ length: schedule.config.rankCount }, (_, rank) => {
                const segments = schedule.activationMemoryTimelineByRank[rank] ?? [];
                return (
                  <div key={`memory-detail-${rank}`}>
                    <dt>Rank {rank}</dt>
                    <dd>{memoryTimelineText(segments, rank)}</dd>
                  </div>
                );
              })}
            </dl>
          </div>
          {hasResidency ? (
            <div>
              <h3 className="board-subheading">Weight residency</h3>
              <dl className="board-list">
                {Array.from({ length: schedule.config.rankCount }, (_, rank) => {
                  const segments = schedule.weightResidencyTimelineByRank[rank] ?? [];
                  return (
                    <div key={`residency-detail-${rank}`}>
                      <dt>Rank {rank}</dt>
                      <dd>{residencyTimelineText(segments, rank)}</dd>
                    </div>
                  );
                })}
              </dl>
            </div>
          ) : null}
        </div>
      </details>
    </section>
  );
}
