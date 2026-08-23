import { describe, expect, it } from 'vitest';
import { validateLevelConfig } from './config';
import type { PipelineTopologyPlacement } from './types';
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
      /V1 durations must be F=1 and B=2/,
    );
    expect(() => validateLevelConfig({ ...makeConfig(), durations: { F: 1, B: 3 } })).toThrow(
      /V1 durations must be F=1 and B=2/,
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
