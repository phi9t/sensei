import { describe, expect, it } from 'vitest';
import { validateLevelConfig } from './config';
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

  it('rejects stageCount !== rankCount', () => {
    expect(() => validateLevelConfig({ ...makeConfig(), stageCount: 3 })).toThrow(
      /stageCount must equal rankCount/,
    );
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

  it('rejects NaN and Infinity for durations (non-integer durations are allowed)', () => {
    for (const { kind, values } of durations) {
      for (const value of values) {
        expect(() =>
          validateLevelConfig({
            ...makeConfig(),
            durations: { F: kind === 'F' ? value : 1, B: kind === 'B' ? value : 2 },
          }),
        ).toThrow(new RegExp(`${kind} duration must be a positive finite number`));
      }
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

  it('allows fractional durations (design does not require integer durations)', () => {
    expect(() =>
      validateLevelConfig({ ...makeConfig(), durations: { F: 1.5, B: 2.5 } }),
    ).not.toThrow();
  });
});
