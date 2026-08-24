import type { BuildingBlockValidation } from '../engine/types';

export interface PatternCheckModel {
  readonly label: string;
  readonly period: number;
  readonly validation: BuildingBlockValidation;
  readonly canStamp: boolean;
}

interface PatternCheckProps {
  readonly check: PatternCheckModel;
  readonly onStamp: () => void;
}

function assertNever(value: never): never {
  throw new Error(`Unhandled building-block violation: ${JSON.stringify(value)}`);
}

function validationSummary(validation: BuildingBlockValidation): string {
  if (validation.ok) {
    const peak = Math.max(...validation.projectedPeakMemory, 0);
    return `Pattern valid. Peak memory ${peak}.`;
  }

  const first = validation.violations[0];
  if (!first) {
    return 'Pattern invalid.';
  }

  switch (first.kind) {
    case 'invalid-period':
      return `Invalid period ${first.period}.`;
    case 'invalid-offset':
      return `Invalid offset for ${first.operationId}.`;
    case 'unknown-operation':
      return `Unknown block ${first.operationId}.`;
    case 'duplicate-operation':
      return `Duplicate block ${first.operationId}.`;
    case 'missing-operation':
      return `Missing block ${first.operationId}.`;
    case 'duplicate-rank-residue':
      return `Residue conflict on R${first.rank} at ${first.residue}.`;
    case 'unsatisfied-dependency':
      return `${first.operationId} waits for ${first.dependencyId}.`;
    case 'memory-cap':
      return `R${first.rank} peak ${first.peak} exceeds cap ${first.cap}.`;
    default:
      return assertNever(first);
  }
}

function validationWord(validation: BuildingBlockValidation): string {
  return validation.ok ? 'valid' : 'blocked';
}

function compactValidationSummary(validation: BuildingBlockValidation): string {
  if (validation.ok) {
    return `Peak ${Math.max(...validation.projectedPeakMemory, 0)}`;
  }

  const first = validation.violations[0];
  if (!first) {
    return 'Check failed';
  }

  switch (first.kind) {
    case 'invalid-period':
      return `Period ${first.period}`;
    case 'invalid-offset':
      return 'Offset';
    case 'unknown-operation':
      return 'Unknown block';
    case 'duplicate-operation':
      return 'Duplicate';
    case 'missing-operation':
      return 'Missing';
    case 'duplicate-rank-residue':
      return `R${first.rank} conflict`;
    case 'unsatisfied-dependency':
      return 'Dependency';
    case 'memory-cap':
      return `R${first.rank} memory`;
    default:
      return assertNever(first);
  }
}

function extraViolationLabel(validation: BuildingBlockValidation): string | null {
  const extra = validation.violations.length - 1;
  return extra > 0 ? `+${extra} more` : null;
}

export function PatternCheck({ check, onStamp }: PatternCheckProps) {
  const extra = extraViolationLabel(check.validation);

  return (
    <div
      className="pattern-check"
      role="group"
      aria-label={`Pattern check: ${validationSummary(check.validation)}`}
      data-status={check.validation.ok ? 'valid' : 'invalid'}
      data-compact="true"
    >
      <span className="control-cluster__label">Pattern</span>
      <span className="pattern-check__copy">
        <strong>{validationWord(check.validation)}</strong>
        <span>period {check.period}</span>
      </span>
      <span className="pattern-check__status">
        {compactValidationSummary(check.validation)}
        {extra ? <span className="pattern-check__extra"> {extra}</span> : null}
      </span>
      <button
        type="button"
        className="command-button"
        aria-label="Stamp building-block pattern"
        onClick={onStamp}
        disabled={!check.canStamp}
      >
        Stamp
      </button>
    </div>
  );
}
