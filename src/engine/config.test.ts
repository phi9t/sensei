import { describe, expect, it } from 'vitest';
import { validateLevelConfig } from './config';
import { makeConfig } from '../test/factories';

describe('validateLevelConfig', () => {
  it('accepts a valid default config', () => {
    expect(() => validateLevelConfig(makeConfig())).not.toThrow();
  });

  it('rejects non-positive rankCount', () => {
    expect(() => validateLevelConfig({ ...makeConfig(), rankCount: 0 })).toThrow(
      /rankCount must be positive/,
    );
  });

  it('rejects non-positive stageCount', () => {
    expect(() => validateLevelConfig({ ...makeConfig(), stageCount: 0 })).toThrow(
      /stageCount must be positive/,
    );
  });

  it('rejects non-positive microbatchCount', () => {
    expect(() => validateLevelConfig({ ...makeConfig(), microbatchCount: 0 })).toThrow(
      /microbatchCount must be positive/,
    );
  });

  it('rejects non-positive forward duration', () => {
    expect(() => validateLevelConfig({ ...makeConfig(), durations: { F: 0, B: 2 } })).toThrow(
      /F duration must be positive/,
    );
  });

  it('rejects non-positive backward duration', () => {
    expect(() => validateLevelConfig({ ...makeConfig(), durations: { F: 1, B: 0 } })).toThrow(
      /B duration must be positive/,
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
      /memoryCaps values must be positive/,
    );
  });

  it('rejects all caps below 1', () => {
    expect(() =>
      validateLevelConfig({ ...makeConfig(), rankCount: 2, stageCount: 2, memoryCaps: [0, 0] }),
    ).toThrow(/memoryCaps values must be positive/);
  });

  it('accepts null memoryCaps', () => {
    expect(() => validateLevelConfig(makeConfig({ memoryCaps: null }))).not.toThrow();
  });

  it('accepts valid caps', () => {
    expect(() => validateLevelConfig({ ...makeConfig(), memoryCaps: [2, 2] })).not.toThrow();
  });
});
