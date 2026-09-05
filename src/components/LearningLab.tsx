import { useState } from 'react';
import type { ScheduleState } from '../engine/replay';
import type { OperationId } from '../engine/types';
import { parseOperationId, predecessorsOf } from '../engine/operations';
import { score } from '../engine/score';
import { formatOperationCode } from '../app/useGame';
import { learningContentFor } from '../levels/learningContent';
import { scientificContextFor } from '../levels/scientificContext';
import { ScientificContext } from './ScientificContext';
import { SectionJump } from './SectionJump';

interface LearningLabProps {
  readonly schedule: ScheduleState;
  readonly selectedOperationId: OperationId | null;
  readonly onInspect: (operationId: OperationId) => void;
  readonly onClearSelection: () => void;
}

function traceLabel(id: OperationId): string {
  const direction = parseOperationId(id).direction;
  return `${formatOperationCode(id)}${direction ? (direction === 'asc' ? ' Up' : ' Down') : ''}`;
}

function DependencyTrace({
  schedule,
  selectedOperationId,
  onInspect,
  onClearSelection,
}: LearningLabProps) {
  const operation =
    schedule.operations.find((entry) => entry.id === selectedOperationId) ?? schedule.operations[0];
  if (!operation) return null;
  const dependencies = predecessorsOf(operation.id, schedule.config);
  const placement = schedule.placementById[operation.id];

  return (
    <section
      className="dependency-trace"
      aria-labelledby="dependency-trace-heading"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          onClearSelection();
        }
      }}
    >
      <div className="dependency-trace__heading">
        <h3 id="dependency-trace-heading">
          {selectedOperationId ? 'Your selected block' : 'Trace a real block'}
        </h3>
        <span>Connected to your timeline</span>
      </div>
      <div className="dependency-trace__flow">
        <div>
          <p className="learning-label">Must finish first</p>
          {dependencies.length ? (
            <div className="dependency-trace__gates">
              {dependencies.map((id) => (
                <button
                  type="button"
                  key={id}
                  className="dependency-trace__gate"
                  onClick={() => onInspect(id)}
                  aria-label={`Trace dependency ${traceLabel(id)}`}
                >
                  <strong>{traceLabel(id)}</strong>
                  <span>
                    {schedule.placementById[id]
                      ? `ends at ${schedule.placementById[id].end}`
                      : 'not placed'}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <p className="dependency-trace__empty">
              No predecessor gates.
              <br />
              Resource and memory limits still apply.
            </p>
          )}
        </div>
        <span className="dependency-trace__arrow" aria-hidden="true">
          →
        </span>
        <button
          type="button"
          className="dependency-trace__selected"
          aria-label={`Show ${traceLabel(operation.id)} on the timeline`}
          aria-pressed={selectedOperationId === operation.id}
          onClick={() => onInspect(operation.id)}
        >
          <strong>{traceLabel(operation.id)}</strong>
          <span>
            Stage {operation.stage} · rank {operation.rank} · microbatch {operation.microbatch}
          </span>
          <span>
            {operation.duration} {operation.duration === 1 ? 'tick' : 'ticks'}
            {placement ? ` · placed ${placement.start}–${placement.end}` : ' · not placed'}
          </span>
        </button>
      </div>
      <p className="dependency-trace__note">
        Select a dependency to follow the chain. These are actual gates for this lesson; inspecting
        them does not place work.
      </p>
    </section>
  );
}

export function LearningLab(props: LearningLabProps) {
  const { schedule } = props;
  const level = schedule.config;
  const content = learningContentFor(level);
  const source = scientificContextFor(level);
  const metrics = score(schedule);
  const [view, setView] = useState<'idea' | 'algorithm'>('idea');

  return (
    <section className="learning-lab" aria-labelledby="learning-heading" id="learn" tabIndex={-1}>
      <header className="learning-lab__header">
        <div>
          <p className="panel-kicker">Theory ↔ practice</p>
          <h2 id="learning-heading">Understand this schedule</h2>
        </div>
        <div className="learning-lab__jumps">
          <SectionJump target="source-reading">Paper & reading guide ↓</SectionJump>
          <SectionJump target="schedule-board-heading">Back to the timeline ↑</SectionJump>
        </div>
      </header>
      <div className="learning-lab__layout">
        <div className="learning-lab__lesson">
          <div className="learning-lab__views" role="group" aria-label="Explanation view">
            <button type="button" aria-pressed={view === 'idea'} onClick={() => setView('idea')}>
              The idea
            </button>
            <button
              type="button"
              aria-pressed={view === 'algorithm'}
              onClick={() => setView('algorithm')}
            >
              Algorithm walkthrough
            </button>
          </div>
          <div className="learning-lab__explanation">
            <h3>{content.question}</h3>
            {view === 'idea' ? (
              <>
                <p className="learning-lab__lead">{content.idea}</p>
                <p>{content.tradeoff}</p>
              </>
            ) : (
              <>
                <p className="learning-lab__scope">
                  Conceptual strategy. Your moves remain free; the engine checks legality.
                </p>
                <ol className="algorithm-walkthrough">
                  {content.steps.map((step) => (
                    <li key={step.title}>
                      <strong>{step.title}</strong>
                      <p>{step.explanation}</p>
                    </li>
                  ))}
                </ol>
              </>
            )}
          </div>
          <DependencyTrace {...props} />
          <details className="learning-derivation">
            <summary>Why this bubble score?</summary>
            <div>
              <p>
                Sensei measures unused capacity over the schedule so far. Makespan is the latest
                rank frontier; work is the sum of placed operation durations.
              </p>
              <p className="learning-equation">bubble = (capacity − work) / capacity</p>
              {metrics.capacity > 0 ? (
                <p className="learning-equation" aria-label="Bubble calculation">
                  ({metrics.capacity} − {metrics.totalWork}) / {metrics.capacity} ={' '}
                  {(metrics.bubbleRatio * 100).toFixed(1)}%
                </p>
              ) : (
                <p>
                  Place work to create a nonzero time window before interpreting a bubble
                  percentage.
                </p>
              )}
              <p>
                Capacity counts rank-time slots
                {level.dualPipeModel ? ', including the modeled shared-capacity limit' : ''}.{' '}
                {metrics.complete
                  ? 'This is a completed schedule.'
                  : 'This attempt is incomplete; its percentage is provisional.'}{' '}
                Some papers divide bubble time by ideal compute time instead. Check the denominator
                before comparing numbers.
              </p>
            </div>
          </details>
          <div className="learning-practice">
            <div>
              <p className="learning-label">Try it on the board</p>
              <h3>{level.algorithm.objective}</h3>
            </div>
            <p>{content.practice}</p>
            <SectionJump target="schedule-board-heading">Return to practice ↑</SectionJump>
          </div>
        </div>
        <aside
          className="learning-lab__reading"
          aria-label="Source reading guide"
          id="source-reading"
          tabIndex={-1}
        >
          <p className="learning-label">Read the primary source</p>
          <a className="learning-source-title" href={source.url} target="_blank" rel="noreferrer">
            {source.title} <span aria-hidden="true">↗</span>
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
          <p className="source-locator">{source.locator}</p>
          <div className="learning-reading-prompt">
            <h3>What to look for</h3>
            <p>{content.reading}</p>
          </div>
          <p className="learning-label">Paper → this exercise</p>
          <p className="learning-source-boundary">{source.boundary}</p>
          {level.dualPipeModel ? (
            <p className="learning-model-fact">
              This lesson: {level.dualPipeModel.resourceModel.sharedCapacity} shared capacity per
              rank; {level.dualPipeModel.resourceModel.directionalSlots} slot per direction.
            </p>
          ) : null}
          <ScientificContext level={level} showSource={false} />
        </aside>
      </div>
    </section>
  );
}
