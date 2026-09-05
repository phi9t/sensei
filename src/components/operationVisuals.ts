import type { Operation } from '../engine/types';

export interface OperationVisualVars {
  readonly '--operation-hue': string;
  readonly '--operation-accent': string;
}

type OperationVisualIdentity = Pick<Operation, 'kind' | 'stage' | 'microbatch' | 'direction'>;

const OPERATION_HUES = [184, 38, 258, 132, 12, 214, 296, 88, 164, 52, 228, 112] as const;

export function operationVisualKey(operation: OperationVisualIdentity): string {
  const baseKey = `${operation.kind}-${operation.stage}-${operation.microbatch}`;
  return operation.direction ? `${baseKey}-${operation.direction}` : baseKey;
}

export function operationHue(operation: OperationVisualIdentity): number {
  // Color follows a microbatch through the entire pipeline. Text, texture,
  // position and direction cues carry the other independent dimensions.
  const index = operation.microbatch % OPERATION_HUES.length;
  return OPERATION_HUES[index]!;
}

export function operationVisualVars(operation: OperationVisualIdentity): OperationVisualVars {
  const hue = operationHue(operation);
  return {
    '--operation-hue': String(hue),
    '--operation-accent': `hsl(${hue} 44% 40%)`,
  };
}
