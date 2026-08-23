import type { LevelConfig } from './types';

export function microbatchGroupIndex(config: LevelConfig, microbatch: number): number {
  return Math.floor(microbatch / (config.microbatchGrouping?.groupSize ?? 1));
}

export function microbatchGroupLabel(config: LevelConfig, microbatch: number): string | null {
  if (!config.microbatchGrouping) {
    return null;
  }

  const groupIndex = microbatchGroupIndex(config, microbatch);
  return config.microbatchGrouping.groupLabels?.[groupIndex] ?? `G${groupIndex}`;
}
