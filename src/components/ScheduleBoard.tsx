import type { Gap, Placement, ScheduleState } from '../engine/replay';
import { formatOperationCode, formatOperationName } from '../app/useGame';
import type { Operation, OperationId } from '../engine/types';

export const CELL_WIDTH = 48;
const RIGHT_PADDING = 24;
const INVENTORY_TOP = 24;
const INVENTORY_HEIGHT = 18;
const INVENTORY_LABEL_Y = INVENTORY_TOP - 6;
const INVENTORY_GAP = 12;
const MEMORY_STRIP_HEIGHT = 12;
const MEMORY_STRIP_GAP = 8;
const ROW_HEIGHT = 44;
const TOP_PADDING = 72;
const LEFT_PADDING = 88;

interface ScheduleBoardProps {
  readonly schedule: ScheduleState;
  readonly selectedOperationId: OperationId | null;
}

function kindPatternId(kind: 'F' | 'B'): string {
  return kind === 'F' ? 'pattern-forward' : 'pattern-backward';
}

interface InventoryTile {
  readonly operation: Operation;
  readonly x: number;
  readonly width: number;
}

interface MemorySegment {
  readonly start: number;
  readonly end: number;
  readonly value: number;
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

function inventoryGeometry(state: ScheduleState): readonly InventoryTile[] {
  const placedIds = new Set(state.placements.map((placement) => placement.operationId));
  return state.operations
    .filter((operation) => !placedIds.has(operation.id))
    .map((operation, index) => ({
      operation,
      x: index * (CELL_WIDTH * 2 + INVENTORY_GAP),
      width: operation.duration * CELL_WIDTH,
    }));
}

function inventoryExtent(inventoryTiles: readonly InventoryTile[]): number {
  const rightmost = inventoryTiles.reduce((max, tile) => Math.max(max, tile.x + tile.width), 0);
  return LEFT_PADDING + rightmost + RIGHT_PADDING;
}

function timelineExtent(state: ScheduleState): number {
  return LEFT_PADDING + maxEndTime(state) * CELL_WIDTH + RIGHT_PADDING;
}

function rankRowTop(rank: number): number {
  return TOP_PADDING + rank * ROW_HEIGHT;
}

function memorySegmentsForRank(state: ScheduleState, rank: number): readonly MemorySegment[] {
  const horizon = maxEndTime(state);
  const events = state.placements
    .filter((placement) => placement.rank === rank)
    .map((placement) => {
      const operation = operationById(state, placement.operationId);
      return {
        time: placement.end,
        delta: operation.kind === 'F' ? 1 : -1,
      };
    })
    .sort((left, right) => left.time - right.time || right.delta - left.delta);

  const segments: MemorySegment[] = [];
  let cursor = 0;
  let value = 0;

  for (const event of events) {
    if (event.time > cursor) {
      segments.push({ start: cursor, end: event.time, value });
      cursor = event.time;
    }
    value += event.delta;
  }

  if (cursor < horizon) {
    segments.push({ start: cursor, end: horizon, value });
  }

  if (segments.length === 0) {
    segments.push({ start: 0, end: horizon, value: 0 });
  }

  return Object.freeze(segments);
}

function memoryTimelineText(segments: readonly MemorySegment[], rank: number): string {
  return `Rank ${rank} memory timeline: ${segments
    .map((segment) => `${segment.start}-${segment.end} => ${segment.value} units`)
    .join('; ')}`;
}

export function ScheduleBoard({ schedule, selectedOperationId }: ScheduleBoardProps) {
  const inventoryTiles = inventoryGeometry(schedule);
  const inventoryWidth = inventoryExtent(inventoryTiles);
  const svgWidth = Math.max(timelineExtent(schedule), inventoryWidth);
  const svgHeight = TOP_PADDING + schedule.config.rankCount * ROW_HEIGHT + 64;
  const timelineEnd = maxEndTime(schedule);

  return (
    <section className="panel board-panel" aria-labelledby="schedule-board-heading">
      <h2 id="schedule-board-heading">Schedule board</h2>
      <p className="panel-intro">
        Timelines show placed work only. The inventory strip previews truthful duration geometry.
      </p>
      <div
        className="board-scroll-region"
        role="group"
        aria-label="Schedule board horizontal scroll region"
      >
        <svg
          className="schedule-board-svg"
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          aria-labelledby="schedule-svg-title schedule-svg-desc"
          role="img"
        >
          <title id="schedule-svg-title">Pipeline schedule board</title>
          <desc id="schedule-svg-desc">
            Rank timelines, truthful duration tiles, gaps, and activation memory strips for the
            current replayed attempt.
          </desc>
          <defs>
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
          </defs>

          <g transform={`translate(${LEFT_PADDING} 0)`}>
            <text x="0" y={INVENTORY_LABEL_Y} className="board-caption">
              Inventory geometry
            </text>
            <rect
              data-testid="inventory-extent"
              x="0"
              y={INVENTORY_TOP}
              width={inventoryWidth - LEFT_PADDING}
              height={INVENTORY_HEIGHT}
              fill="transparent"
              pointerEvents="none"
              aria-hidden="true"
            />

            {inventoryTiles.map(({ operation, x, width }) => (
              <g key={`inventory-${operation.id}`} aria-hidden="true">
                <rect
                  data-testid={`tile-${operation.id}`}
                  x={x}
                  y={INVENTORY_TOP}
                  width={width}
                  height={INVENTORY_HEIGHT}
                  rx="2"
                  className="inventory-rect"
                  data-kind={operation.kind}
                  data-duration={operation.duration}
                  fill={`url(#${kindPatternId(operation.kind)})`}
                />
                <text x={x + 4} y={INVENTORY_TOP + 12} className="inventory-label">
                  {formatOperationCode(operation)}
                </text>
              </g>
            ))}
          </g>

          {schedule.rankFrontiers.map((_, rank) => {
            const y = rankRowTop(rank);
            const stripY = y;
            const lineY = y + MEMORY_STRIP_HEIGHT + MEMORY_STRIP_GAP + 12;
            return (
              <g key={`rank-${rank}`}>
                <text x="12" y={lineY + 4} className="rank-label">
                  Rank {rank}
                </text>
                <g
                  className="memory-strip"
                  data-testid={`memory-strip-rank-${rank}`}
                  transform={`translate(${LEFT_PADDING} 0)`}
                >
                  {memorySegmentsForRank(schedule, rank).map((segment, index) => (
                    <g key={`memory-${rank}-${segment.start}-${segment.end}-${segment.value}`}>
                      <rect
                        data-testid={`memory-segment-rank-${rank}-${index}`}
                        x={segment.start * CELL_WIDTH}
                        y={stripY}
                        width={(segment.end - segment.start) * CELL_WIDTH}
                        height={MEMORY_STRIP_HEIGHT}
                        className="memory-strip__segment"
                        data-memory={segment.value}
                      />
                      <text
                        x={segment.start * CELL_WIDTH + 4}
                        y={stripY + 9}
                        className="memory-strip__label"
                      >
                        M{segment.value}
                      </text>
                    </g>
                  ))}
                </g>
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
                    y2={TOP_PADDING + schedule.config.rankCount * ROW_HEIGHT - 8}
                    className="tick-line"
                  />
                  <text x={x} y={TOP_PADDING - 10} textAnchor="middle" className="tick-label">
                    {tick}
                  </text>
                </g>
              );
            })}

            {schedule.gaps.map((gap) => {
              const y = rankRowTop(gap.rank) + MEMORY_STRIP_HEIGHT + MEMORY_STRIP_GAP;
              const x = gap.start * CELL_WIDTH;
              const width = (gap.end - gap.start) * CELL_WIDTH;
              return (
                <g key={`gap-${gap.rank}-${gap.start}-${gap.end}-${gap.kind}`}>
                  <rect
                    x={x}
                    y={y}
                    width={width}
                    height="24"
                    className="gap-rect"
                    data-kind={gap.kind}
                  />
                  <text x={x + width / 2} y={y + 16} textAnchor="middle" className="gap-label">
                    {gap.kind === 'intentional' ? 'WAIT' : 'GAP'}
                  </text>
                </g>
              );
            })}

            {schedule.placements.map((placement) => {
              const operation = operationById(schedule, placement.operationId);
              const width = operation.duration * CELL_WIDTH;
              const x = placement.start * CELL_WIDTH;
              const y = rankRowTop(placement.rank) + MEMORY_STRIP_HEIGHT + MEMORY_STRIP_GAP;
              const isSelected = selectedOperationId === placement.operationId;

              return (
                <g key={placement.operationId}>
                  <title>{`${formatOperationName(operation)} on rank ${placement.rank} from ${placement.start} to ${placement.end}`}</title>
                  <rect
                    data-testid={`rank-tile-${operation.id}`}
                    x={x}
                    y={y}
                    width={width}
                    height="24"
                    rx="3"
                    className="schedule-rect"
                    data-kind={operation.kind}
                    data-duration={operation.duration}
                    data-selected={isSelected ? 'true' : 'false'}
                    fill={`url(#${kindPatternId(operation.kind)})`}
                  />
                  <text x={x + 6} y={y + 16} className="schedule-label">
                    {formatOperationCode(operation)}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      <div className="board-details">
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
              const segments = memorySegmentsForRank(schedule, rank);
              return (
                <div key={`memory-detail-${rank}`}>
                  <dt>Rank {rank}</dt>
                  <dd>{memoryTimelineText(segments, rank)}</dd>
                </div>
              );
            })}
          </dl>
        </div>
      </div>
    </section>
  );
}
