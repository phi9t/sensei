import { describe, expect, it } from 'vitest';
import { validateLevelConfig } from './config';
import type { OperationKind, PipelineTopologyPlacement } from './types';
import { makeConfig } from '../test/factories';

describe('validateLevelConfig', () => {
  it('accepts a valid default config', () => {
    expect(() => validateLevelConfig(makeConfig())).not.toThrow();
  });

  it('rejects non-positive rankCount', () => {
    expect(() => validateLevelConfig({ ...makeConfig(), rankCount: 0 })).toThrow(
      /rankCount must be a positive finite integer/,
    );
  });

  it('rejects non-positive stageCount', () => {
    expect(() => validateLevelConfig({ ...makeConfig(), stageCount: 0 })).toThrow(
      /stageCount must be a positive finite integer/,
    );
  });

  it('rejects non-positive microbatchCount', () => {
    expect(() => validateLevelConfig({ ...makeConfig(), microbatchCount: 0 })).toThrow(
      /microbatchCount must be a positive finite integer/,
    );
  });

  it('rejects non-positive forward duration', () => {
    expect(() => validateLevelConfig({ ...makeConfig(), durations: { F: 0, B: 2 } })).toThrow(
      /F duration must be a positive finite number/,
    );
  });

  it('rejects non-positive backward duration', () => {
    expect(() => validateLevelConfig({ ...makeConfig(), durations: { F: 1, B: 0 } })).toThrow(
      /B duration must be a positive finite number/,
    );
  });

  it('accepts positive integer stage-specific duration overrides', () => {
    expect(() =>
      validateLevelConfig(
        makeConfig({
          durationOverrides: [{ kind: 'B', stage: 0, duration: 4 }],
        }),
      ),
    ).not.toThrow();
  });

  it('keeps base V1 durations fixed even when duration overrides exist', () => {
    expect(() =>
      validateLevelConfig(
        makeConfig({
          durations: { F: 2, B: 2 },
          durationOverrides: [{ kind: 'B', stage: 0, duration: 4 }],
        }),
      ),
    ).toThrow(/V1 base durations must be F=1 and B=2/);
  });

  it('accepts split backward levels with explicit W duration', () => {
    expect(() =>
      validateLevelConfig(
        makeConfig({
          durations: { F: 1, B: 1, W: 1 },
          operationModel: { backward: 'split' },
        }),
      ),
    ).not.toThrow();
  });

  it('rejects split backward levels without W duration', () => {
    expect(() =>
      validateLevelConfig(
        makeConfig({
          durations: { F: 1, B: 1 },
          operationModel: { backward: 'split' },
        }),
      ),
    ).toThrow(/split operationModel requires W duration/);
  });

  it('rejects malformed split backward base durations', () => {
    expect(() =>
      validateLevelConfig(
        makeConfig({
          durations: { F: 1, B: 2, W: 1 },
          operationModel: { backward: 'split' },
        }),
      ),
    ).toThrow(/split base durations must be F=1, B=1, and W=1/);
  });

  it('rejects W durations on fused backward levels', () => {
    expect(() =>
      validateLevelConfig(
        makeConfig({
          durations: { F: 1, B: 2, W: 1 },
        }),
      ),
    ).toThrow(/fused operationModel must not define W duration/);
  });

  it('rejects W duration overrides on fused backward levels', () => {
    expect(() =>
      validateLevelConfig(
        makeConfig({
          durationOverrides: [{ kind: 'W', stage: 0, duration: 2 }],
        }),
      ),
    ).toThrow(/W duration overrides require split operationModel/);
  });

  it('rejects duration overrides outside the logical stage range', () => {
    expect(() =>
      validateLevelConfig(
        makeConfig({
          durationOverrides: [{ kind: 'B', stage: 2, duration: 4 }],
        }),
      ),
    ).toThrow(/duration override stage 2 out of bounds for stageCount 2/);
  });

  it('rejects malformed duration override duration values', () => {
    for (const duration of [0, -1, 1.5, NaN, Infinity]) {
      expect(() =>
        validateLevelConfig(
          makeConfig({
            durationOverrides: [{ kind: 'B', stage: 0, duration }],
          }),
        ),
      ).toThrow(/duration override for B stage 0 must be a positive finite integer/);
    }
  });

  it('rejects duplicate duration overrides for the same kind and stage', () => {
    expect(() =>
      validateLevelConfig(
        makeConfig({
          durationOverrides: [
            { kind: 'B', stage: 0, duration: 4 },
            { kind: 'B', stage: 0, duration: 3 },
          ],
        }),
      ),
    ).toThrow(/duplicate duration override for B stage 0/);
  });

  it('rejects unsupported duration override kinds from untrusted config objects', () => {
    expect(() =>
      validateLevelConfig(
        makeConfig({
          durationOverrides: [{ kind: 'X' as OperationKind, stage: 0, duration: 4 }],
        }),
      ),
    ).toThrow(/duration override kind must be F, B, or W/);
  });

  it('rejects unsupported operation models from untrusted config objects', () => {
    expect(() =>
      validateLevelConfig(
        makeConfig({
          operationModel: { backward: 'sideways' as 'fused' },
        }),
      ),
    ).toThrow(/operationModel backward must be fused or split/);
  });

  it('accepts internal bubble scoring and known reference policies', () => {
    expect(() =>
      validateLevelConfig(
        makeConfig({
          scoreModel: { internalBubble: true },
          referencePolicy: { candidatePolicyIds: ['zero-bubble-h1', 'zero-bubble-h2'] },
          masteryTargets: [{ metric: 'internalBubbleRatio', op: '<=', value: 0 }],
        }),
      ),
    ).not.toThrow();
  });

  it('rejects malformed internal bubble score flags', () => {
    expect(() =>
      validateLevelConfig(
        makeConfig({
          scoreModel: { internalBubble: 'yes' as unknown as boolean },
        }),
      ),
    ).toThrow(/scoreModel internalBubble must be boolean/);
  });

  it('rejects internal bubble targets when the metric is not enabled', () => {
    expect(() =>
      validateLevelConfig(
        makeConfig({
          masteryTargets: [{ metric: 'internalBubbleRatio', op: '<=', value: 0 }],
        }),
      ),
    ).toThrow(/internalBubbleRatio targets require internal bubble scoring/);
  });

  it('rejects unknown and duplicate reference policy ids', () => {
    expect(() =>
      validateLevelConfig(
        makeConfig({
          referencePolicy: { candidatePolicyIds: ['unknown-policy' as 'gpipe-afab'] },
        }),
      ),
    ).toThrow(/reference policy id is not supported/);

    expect(() =>
      validateLevelConfig(
        makeConfig({
          referencePolicy: { candidatePolicyIds: ['gpipe-afab', 'gpipe-afab'] },
        }),
      ),
    ).toThrow(/duplicate reference policy id gpipe-afab/);
  });

  it('accepts grouped microbatch metadata and group-major reference policies', () => {
    expect(() =>
      validateLevelConfig(
        makeConfig({
          microbatchCount: 4,
          microbatchGrouping: { groupSize: 2, groupLabels: ['G0', 'G1'] },
          referencePolicy: { candidatePolicyIds: ['group-major', 'one-f-one-b'] },
          algorithm: {
            family: 'grouped',
            setTitle: 'Grouped',
            concept: 'Group test.',
            objective: 'Group objective.',
            patternLabel: 'Group major',
            introducedModel: ['microbatch group'],
          },
        }),
      ),
    ).not.toThrow();
  });

  it('rejects malformed grouped microbatch metadata', () => {
    expect(() =>
      validateLevelConfig(
        makeConfig({
          microbatchCount: 4,
          microbatchGrouping: { groupSize: 0 },
        }),
      ),
    ).toThrow(/microbatchGrouping groupSize must be a positive finite integer/);

    expect(() =>
      validateLevelConfig(
        makeConfig({
          microbatchCount: 4,
          microbatchGrouping: { groupSize: 5 },
        }),
      ),
    ).toThrow(/microbatchGrouping groupSize must not exceed microbatchCount/);

    expect(() =>
      validateLevelConfig(
        makeConfig({
          microbatchCount: 4,
          microbatchGrouping: { groupSize: 2, groupLabels: ['Only one'] },
        }),
      ),
    ).toThrow(/microbatchGrouping groupLabels length must match group count/);

    expect(() =>
      validateLevelConfig(
        makeConfig({
          microbatchCount: 4,
          microbatchGrouping: { groupSize: 2, groupLabels: ['G0', ' '] },
        }),
      ),
    ).toThrow(/microbatchGrouping groupLabels must be non-empty/);
  });

  it('rejects stageCount different from rankCount without virtual topology', () => {
    expect(() => validateLevelConfig({ ...makeConfig(), stageCount: 3 })).toThrow(
      /one-to-one topology requires stageCount to equal rankCount/,
    );
  });

  it('accepts wrap topology when stageCount equals rankCount times virtualStagesPerRank', () => {
    expect(() =>
      validateLevelConfig(
        makeConfig({
          rankCount: 2,
          stageCount: 4,
          topology: { placement: 'wrap', virtualStagesPerRank: 2 },
        }),
      ),
    ).not.toThrow();
  });

  it('accepts v-shape topology when stageCount equals rankCount times virtualStagesPerRank', () => {
    expect(() =>
      validateLevelConfig(
        makeConfig({
          rankCount: 2,
          stageCount: 4,
          topology: { placement: 'v-shape', virtualStagesPerRank: 2 },
        }),
      ),
    ).not.toThrow();
  });

  it('rejects virtual topology stage-count mismatches', () => {
    expect(() =>
      validateLevelConfig(
        makeConfig({
          rankCount: 2,
          stageCount: 5,
          topology: { placement: 'wrap', virtualStagesPerRank: 2 },
        }),
      ),
    ).toThrow(/virtual topology requires stageCount to equal rankCount times virtualStagesPerRank/);
  });

  it('rejects non-positive virtualStagesPerRank values', () => {
    expect(() =>
      validateLevelConfig(
        makeConfig({
          rankCount: 2,
          stageCount: 2,
          topology: { placement: 'wrap', virtualStagesPerRank: 0 },
        }),
      ),
    ).toThrow(/virtualStagesPerRank must be a positive finite integer/);
  });

  it('rejects one-to-one topology with more than one virtual stage per rank', () => {
    expect(() =>
      validateLevelConfig(
        makeConfig({
          rankCount: 2,
          stageCount: 4,
          topology: { placement: 'one-to-one', virtualStagesPerRank: 2 },
        }),
      ),
    ).toThrow(/one-to-one topology requires virtualStagesPerRank to equal 1/);
  });

  it('rejects unsupported topology placements', () => {
    expect(() =>
      validateLevelConfig(
        makeConfig({
          rankCount: 2,
          stageCount: 4,
          topology: {
            placement: 'diagonal' as unknown as PipelineTopologyPlacement,
            virtualStagesPerRank: 2,
          },
        }),
      ),
    ).toThrow(/topology placement must be one-to-one, wrap, or v-shape/);
  });

  it('rejects cap length mismatch', () => {
    expect(() => validateLevelConfig({ ...makeConfig(), memoryCaps: [1, 2, 3] })).toThrow(
      /memoryCaps length must equal rankCount/,
    );
  });

  it('rejects any cap below 1', () => {
    expect(() => validateLevelConfig({ ...makeConfig(), memoryCaps: [1, 0] })).toThrow(
      /memoryCaps values must be positive finite integers/,
    );
  });

  it('rejects all caps below 1', () => {
    expect(() =>
      validateLevelConfig({ ...makeConfig(), rankCount: 2, stageCount: 2, memoryCaps: [0, 0] }),
    ).toThrow(/memoryCaps values must be positive finite integers/);
  });

  it('accepts null memoryCaps', () => {
    expect(() => validateLevelConfig(makeConfig({ memoryCaps: null }))).not.toThrow();
  });

  it('accepts valid caps', () => {
    expect(() => validateLevelConfig({ ...makeConfig(), memoryCaps: [2, 2] })).not.toThrow();
  });
});

describe('validateLevelConfig boundary: NaN/Infinity/fractions', () => {
  const integerCounts: Array<{
    field: 'rankCount' | 'stageCount' | 'microbatchCount';
    values: number[];
  }> = [
    { field: 'rankCount', values: [NaN, Infinity, -Infinity, 1.5] },
    { field: 'stageCount', values: [NaN, Infinity, -Infinity, 1.5] },
    { field: 'microbatchCount', values: [NaN, Infinity, -Infinity, 1.5] },
  ];

  it('rejects NaN, Infinity, and fractions for integer counts', () => {
    for (const { field, values } of integerCounts) {
      for (const value of values) {
        expect(() => validateLevelConfig({ ...makeConfig(), [field]: value })).toThrow(
          new RegExp(`${field} must be a positive finite integer`),
        );
      }
    }
  });

  const durations: Array<{ kind: 'F' | 'B'; values: number[] }> = [
    { kind: 'F', values: [NaN, Infinity, -Infinity] },
    { kind: 'B', values: [NaN, Infinity, -Infinity] },
  ];

  it('rejects NaN, Infinity, and fractions for durations', () => {
    for (const { kind, values } of durations) {
      for (const value of values) {
        expect(() =>
          validateLevelConfig({
            ...makeConfig(),
            durations: { F: kind === 'F' ? value : 1, B: kind === 'B' ? value : 2 },
          }),
        ).toThrow(new RegExp(`${kind} duration must be a positive finite number`));
      }

      expect(() =>
        validateLevelConfig({
          ...makeConfig(),
          durations: { F: kind === 'F' ? 1.5 : 1, B: kind === 'B' ? 1.5 : 2 },
        }),
      ).toThrow(new RegExp(`${kind} duration must be a positive finite integer`));
    }
  });

  it('rejects NaN, Infinity, and fractions for memoryCaps values', () => {
    const badValues = [NaN, Infinity, -Infinity, 1.5];
    for (const value of badValues) {
      expect(() =>
        validateLevelConfig({
          ...makeConfig(),
          rankCount: 2,
          stageCount: 2,
          memoryCaps: [value, 2],
        }),
      ).toThrow(/memoryCaps values must be positive finite integers/);
    }
  });

  it('requires the V1 fixed F=1 and B=2 duration model', () => {
    expect(() => validateLevelConfig({ ...makeConfig(), durations: { F: 2, B: 2 } })).toThrow(
      /V1 base durations must be F=1 and B=2/,
    );
    expect(() => validateLevelConfig({ ...makeConfig(), durations: { F: 1, B: 3 } })).toThrow(
      /V1 base durations must be F=1 and B=2/,
    );
  });

  it('rejects NaN, Infinity, and fractions for virtualStagesPerRank', () => {
    for (const value of [NaN, Infinity, -Infinity, 1.5, -1]) {
      expect(() =>
        validateLevelConfig(
          makeConfig({
            rankCount: 2,
            stageCount: 4,
            topology: { placement: 'wrap', virtualStagesPerRank: value },
          }),
        ),
      ).toThrow(/virtualStagesPerRank must be a positive finite integer/);
    }
  });
});
