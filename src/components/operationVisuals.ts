import type { Operation } from '../engine/types';

export interface OperationVisualVars {
  readonly '--operation-hue': string;
  readonly '--operation-accent': string;
}

type OperationVisualIdentity = Pick<Operation, 'kind' | 'stage' | 'microbatch' | 'direction'>;

const OPERATION_HUES = [184, 38, 132, 258, 88, 214, 12, 164, 296, 52, 228, 112] as const;

export function operationVisualKey(operation: OperationVisualIdentity): string {
  const baseKey = `${operation.kind}-${operation.stage}-${operation.microbatch}`;
  return operation.direction ? `${baseKey}-${operation.direction}` : baseKey;
}

export function operationHue(operation: OperationVisualIdentity): number {
  const kindOffset = operation.kind === 'F' ? 0 : operation.kind === 'B' ? 5 : 8;
  const directionOffset = operation.direction === 'desc' ? 3 : 0;
  const index =
    (operation.microbatch * 3 + operation.stage * 2 + kindOffset + directionOffset) %
    OPERATION_HUES.length;
  return OPERATION_HUES[index]!;
}

export function operationVisualVars(operation: OperationVisualIdentity): OperationVisualVars {
  const hue = operationHue(operation);
  return {
    '--operation-hue': String(hue),
    '--operation-accent': `hsl(${hue} 44% 40%)`,
  };
}
