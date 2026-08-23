export type OperationKind = 'F' | 'B' | 'W';

export type OperationId = `${OperationKind}:${number}:${number}`;

export interface OperationModel {
  readonly backward: 'fused' | 'split';
}

export interface OperationDurationOverride {
  readonly kind: OperationKind;
  readonly stage: number;
  readonly duration: number;
}

export interface Operation {
  id: OperationId;
  kind: OperationKind;
  stage: number;
  rank: number;
  microbatch: number;
  duration: number;
}

export interface PlaceOperationAction {
  type: 'place';
  operationId: OperationId;
}

export interface InsertIdleAction {
  type: 'wait';
  rank: number;
}

export type Action = PlaceOperationAction | InsertIdleAction;

export interface BuildingBlockOperation {
  readonly operationId: OperationId;
  readonly offset: number;
}

export interface BuildingBlockPlan {
  readonly period: number;
  readonly trajectory: readonly BuildingBlockOperation[];
}

export type BuildingBlockViolation =
  | { readonly kind: 'invalid-period'; readonly period: number }
  | { readonly kind: 'invalid-offset'; readonly operationId: OperationId; readonly offset: number }
  | { readonly kind: 'unknown-operation'; readonly operationId: OperationId }
  | { readonly kind: 'duplicate-operation'; readonly operationId: OperationId }
  | { readonly kind: 'missing-operation'; readonly operationId: OperationId }
  | {
      readonly kind: 'duplicate-rank-residue';
      readonly rank: number;
      readonly residue: number;
      readonly operationIds: readonly OperationId[];
    }
  | {
      readonly kind: 'unsatisfied-dependency';
      readonly operationId: OperationId;
      readonly dependencyId: OperationId;
    }
  | {
      readonly kind: 'memory-cap';
      readonly rank: number;
      readonly peak: number;
      readonly cap: number;
    };

export interface BuildingBlockValidation {
  readonly ok: boolean;
  readonly period: number;
  readonly violations: readonly BuildingBlockViolation[];
  readonly projectedPeakMemory: readonly number[];
}

export interface BuildingBlockLevelMetadata {
  readonly label: string;
  readonly plan: BuildingBlockPlan;
}

export interface ScoreModel {
  readonly internalBubble?: boolean;
}

export interface MicrobatchGrouping {
  readonly groupSize: number;
  readonly groupLabels?: readonly string[];
}

export interface MetricMasteryTarget {
  metric:
    'makespan' | 'bubbleRatio' | 'internalBubbleRatio' | 'intentionalIdle' | 'peakActivationMemory';
  op: '<=';
  value: number;
}

export interface SchedulePatternMasteryTarget {
  kind: 'schedule-pattern';
  pattern: 'afab';
}

export type MasteryTarget = MetricMasteryTarget | SchedulePatternMasteryTarget;

export type PipelineTopologyPlacement = 'one-to-one' | 'wrap' | 'v-shape';

export interface PipelineTopology {
  readonly placement: PipelineTopologyPlacement;
  readonly virtualStagesPerRank: number;
}

export type AlgorithmFamily =
  | 'foundations'
  | 'gpipe'
  | 'one-f-one-b'
  | 'building-block'
  | 'interleaved-one-f-one-b'
  | 'zero-bubble'
  | 'grouped'
  | 'fsdp-residency'
  | 'dualpipe';

export interface AlgorithmLevelMetadata {
  readonly family: AlgorithmFamily;
  readonly setTitle: string;
  readonly concept: string;
  readonly objective: string;
  readonly patternLabel: string | null;
  readonly introducedModel: readonly string[];
}

export type ReferencePolicyId =
  | 'gpipe-afab'
  | 'one-f-one-b'
  | 'interleaved-one-f-one-b'
  | 'group-major'
  | 'zero-bubble-h1'
  | 'zero-bubble-h2'
  | 'zero-bubble-deep';

export interface ReferencePolicyModel {
  readonly candidatePolicyIds: readonly ReferencePolicyId[];
  readonly comparisonPolicyId?: ReferencePolicyId;
}

export interface LevelConfig {
  id: string;
  version: number;
  title: string;
  rankCount: number;
  stageCount: number;
  microbatchCount: number;
  durations: Readonly<Record<'F' | 'B', number> & Partial<Record<'W', number>>>;
  durationOverrides?: readonly OperationDurationOverride[];
  memoryCaps: readonly number[] | null;
  masteryTargets: readonly MasteryTarget[];
  coaching: { readySet: boolean; suggest: boolean; auto: boolean };
  algorithm: AlgorithmLevelMetadata;
  buildingBlock?: BuildingBlockLevelMetadata;
  microbatchGrouping?: MicrobatchGrouping;
  scoreModel?: ScoreModel;
  topology?: PipelineTopology;
  operationModel?: OperationModel;
  referencePolicy?: ReferencePolicyModel;
}
