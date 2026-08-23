import type { LevelConfig, PipelineTopology } from './types';

const DEFAULT_TOPOLOGY: PipelineTopology = {
  placement: 'one-to-one',
  virtualStagesPerRank: 1,
};

export function topologyForLevel(config: LevelConfig): PipelineTopology {
  return config.topology ?? DEFAULT_TOPOLOGY;
}

export function ownerRankForStage(config: LevelConfig, stage: number): number {
  if (!Number.isInteger(stage) || stage < 0 || stage >= config.stageCount) {
    throw new Error(`stage ${stage} out of bounds for stageCount ${config.stageCount}`);
  }

  const topology = topologyForLevel(config);

  if (topology.placement === 'one-to-one') {
    return stage;
  }

  if (topology.placement === 'wrap') {
    return stage % config.rankCount;
  }

  const chunk = Math.floor(stage / config.rankCount);
  const rankOffset = stage % config.rankCount;
  return chunk % 2 === 0 ? rankOffset : config.rankCount - 1 - rankOffset;
}
