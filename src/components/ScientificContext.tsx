import type { LevelConfig } from '../engine/types';
import { scientificContextFor } from '../levels/scientificContext';

export function ScientificContext({
  level,
  showSource = true,
}: {
  readonly level: LevelConfig;
  readonly showSource?: boolean;
}) {
  const source = scientificContextFor(level);
  const split = level.operationModel?.backward === 'split';
  return (
    <details className="scientific-context">
      <summary>
        <span>Source & assumptions</span>
        <span className="model-badge">Teaching model</span>
      </summary>
      <div className="scientific-context__body">
        {showSource ? (
          <>
            <a href={source.url} target="_blank" rel="noreferrer">
              {source.title} ↗
            </a>
            <p className="source-locator">{source.locator}</p>
            <p>{source.mechanism}</p>
            <p>
              <strong>Model boundary.</strong> {source.boundary}
            </p>
          </>
        ) : null}
        <dl>
          <div>
            <dt>Time</dt>
            <dd>Abstract ticks, with per-operation costs. No communication or optimizer time.</dd>
          </div>
          <div>
            <dt>Stored activations</dt>
            <dd>
              One unit per stage and microbatch, from F completion to {split ? 'W' : 'B'}{' '}
              completion. Transient compute memory is omitted; units are not bytes. Simultaneous
              acquire/release counts acquisition first for peak scoring.
            </dd>
          </div>
          {level.residencyModel ? (
            <div>
              <dt>Weights</dt>
              <dd>
                {level.residencyModel.weightUnit} units per resident stage. Gather and eviction
                occur at forward start with zero modeled duration. The cap covers activations plus
                resident weights.
              </dd>
            </div>
          ) : null}
          <div>
            <dt>Comparisons</dt>
            <dd>
              References are replay-validated local policies, not global optima or measured
              speedups. Partial-run bubble is provisional.
            </dd>
          </div>
        </dl>
      </div>
    </details>
  );
}
