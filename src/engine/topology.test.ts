import { describe, expect, it } from 'vitest';
import { makeConfig } from '../test/factories';
import { ownerRankForStage, topologyForLevel } from './topology';

describe('topologyForLevel', () => {
  it('defaults omitted topology to one-to-one', () => {
    expect(topologyForLevel(makeConfig())).toEqual({
      placement: 'one-to-one',
      virtualStagesPerRank: 1,
    });
  });
});

describe('ownerRankForStage', () => {
  it('maps one-to-one stages to matching ranks', () => {
    const config = makeConfig({ rankCount: 3, stageCount: 3 });

    expect([0, 1, 2].map((stage) => ownerRankForStage(config, stage))).toEqual([0, 1, 2]);
  });

  it('maps wrap topology by stage modulo rank count', () => {
    const config = makeConfig({
      rankCount: 2,
      stageCount: 4,
      topology: { placement: 'wrap', virtualStagesPerRank: 2 },
    });

    expect([0, 1, 2, 3].map((stage) => ownerRankForStage(config, stage))).toEqual([0, 1, 0, 1]);
  });

  it('maps v-shape topology through mirrored rank ownership', () => {
    const config = makeConfig({
      rankCount: 2,
      stageCount: 4,
      topology: { placement: 'v-shape', virtualStagesPerRank: 2 },
    });

    expect([0, 1, 2, 3].map((stage) => ownerRankForStage(config, stage))).toEqual([0, 1, 1, 0]);
  });

  it('maps larger v-shape topology by repeating forward then reverse ownership', () => {
    const config = makeConfig({
      rankCount: 3,
      stageCount: 6,
      topology: { placement: 'v-shape', virtualStagesPerRank: 2 },
    });

    expect([0, 1, 2, 3, 4, 5].map((stage) => ownerRankForStage(config, stage))).toEqual([
      0, 1, 2, 2, 1, 0,
    ]);
  });

  it('rejects stage lookup outside the logical stage range', () => {
    const config = makeConfig({
      rankCount: 2,
      stageCount: 4,
      topology: { placement: 'wrap', virtualStagesPerRank: 2 },
    });

    expect(() => ownerRankForStage(config, -1)).toThrow(/stage -1 out of bounds/);
    expect(() => ownerRankForStage(config, 4)).toThrow(/stage 4 out of bounds/);
  });
});
