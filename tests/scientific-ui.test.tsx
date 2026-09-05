import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ScientificContext } from '../src/components/ScientificContext';
import { ScheduleBoard, CELL_WIDTH } from '../src/components/ScheduleBoard';
import { OperationTray } from '../src/components/OperationTray';
import { MetricsPanel } from '../src/components/MetricsPanel';
import { operationHue } from '../src/components/operationVisuals';
import { getLevel, LEVEL_IDS } from '../src/levels/levels';
import { MASTERED_ACTIONS } from '../src/levels/fixtures';
import { replay, classifyMoves } from '../src/engine/replay';
import { score, memoryByRank, attemptRankingTuple } from '../src/engine/score';
import { expectState, makeConfig, placeIds } from '../src/test/factories';

afterEach(cleanup);

describe('scientific reading surface', () => {
  it('keeps microbatch color stable across passes, stages and directions', () => {
    for (const microbatch of [0, 1, 2]) {
      const color = operationHue({ kind: 'F', stage: 0, microbatch });
      for (const kind of ['F', 'B', 'W'] as const) {
        expect(operationHue({ kind, stage: 3, microbatch, direction: 'desc' })).toBe(color);
      }
    }
    expect(operationHue({ kind: 'F', stage: 0, microbatch: 1 })).not.toBe(
      operationHue({ kind: 'F', stage: 0, microbatch: 0 }),
    );
  });

  it('keeps every split-gradient operation focusable and available for inspection', () => {
    const level = getLevel('split-backward');
    const state = expectState(replay(level, []));
    const inspect = vi.fn();
    render(
      <OperationTray
        level={level}
        classifications={classifyMoves(state)}
        selectedOperationId={null}
        onActivate={vi.fn()}
        onInspect={inspect}
      />,
    );
    const buttons = within(screen.getByRole('region', { name: 'Ready queue' })).getAllByRole(
      'button',
    );
    expect(buttons).toHaveLength(state.operations.length);
    const weight = screen.getByRole('button', { name: /Inspect W stage 1 microbatch 1/ });
    expect(weight).toBeEnabled();
    fireEvent.focus(weight);
    expect(inspect).toHaveBeenCalledWith('W:1:1');
  });

  it.each(LEVEL_IDS)('gives %s a source and explicit timing/memory boundaries', (id) => {
    render(<ScientificContext level={getLevel(id)} />);
    fireEvent.click(screen.getByText('Source & assumptions'));
    expect(screen.getByRole('link').getAttribute('href')).toMatch(/^https:\/\/arxiv.org\//);
    expect(screen.getByText(/units are not bytes/)).toBeInTheDocument();
    expect(screen.getByText(/not global optima or measured speedups/)).toBeInTheDocument();
  });

  it('qualifies DualPipe overlap and split-gradient reference fidelity', () => {
    const { rerender } = render(<ScientificContext level={getLevel('dualpipe-balance')} />);
    fireEvent.click(screen.getByText('Source & assumptions'));
    expect(screen.getByText(/Slot utilization is not GPU utilization/)).toBeInTheDocument();
    rerender(<ScientificContext level={getLevel('zero-bubble-h1')} />);
    expect(screen.getByText(/not verified reproductions/)).toBeInTheDocument();
    expect(screen.getByText(/to W completion/)).toBeInTheDocument();
  });

  it('draws the selected dependency at its actual predecessor end and target start', () => {
    const state = expectState(replay(makeConfig(), placeIds('F:0:0', 'F:1:0')));
    render(
      <ScheduleBoard
        schedule={state}
        selectedOperationId="F:1:0"
        preview={null}
        onInspect={vi.fn()}
      />,
    );
    const path = screen.getByTestId('dependency-F:0:0');
    expect(path.getAttribute('d')).toMatch(new RegExp(`^M ${CELL_WIDTH} `));
    expect(path.querySelector('title')?.textContent).toBe('F0:S0:D0 must finish before F1:S1:D0');
  });

  it('keeps the stored activation highlighted until W, not input-gradient completion', () => {
    const level = getLevel('split-backward');
    const state = expectState(replay(level, MASTERED_ACTIONS['split-backward']));
    const forward = state.placements.find((p) => p.operationId === 'F:0:0')!;
    const release = state.placements.find((p) => p.operationId === 'W:0:0')!;
    render(
      <ScheduleBoard
        schedule={state}
        selectedOperationId="B:0:0"
        preview={null}
        onInspect={vi.fn()}
      />,
    );
    const interval = screen.getByRole('img', {
      name: `Stored activation on rank 0 from ${forward.end} to ${release.end}`,
    });
    expect(interval.querySelector('rect')).toHaveAttribute(
      'width',
      String((release.end - forward.end) * CELL_WIDTH),
    );
  });

  it('shows a replayed reference on demand without changing the learner schedule', () => {
    const level = getLevel('dualpipe-balance');
    const state = expectState(replay(level, MASTERED_ACTIONS['dualpipe-balance']));
    const inspect = vi.fn();
    render(
      <ScheduleBoard
        schedule={state}
        selectedOperationId={null}
        preview={null}
        onInspect={inspect}
        referencePolicyId="dualpipe-one-direction"
      />,
    );
    expect(screen.queryByRole('group', { name: 'Reference timeline' })).not.toBeInTheDocument();
    const compare = screen.getByRole('button', { name: 'Compare reference' });
    fireEvent.click(compare);
    expect(compare).toHaveAttribute('aria-pressed', 'true');
    const reference = screen.getByRole('group', { name: 'Reference timeline' });
    expect(reference.querySelectorAll('rect')).toHaveLength(state.operations.length);
    expect(reference.textContent).toContain('same time scale');
    expect(reference).toHaveAttribute('data-reference-end', '18');
    expect(score(state).makespan).toBe(9);
    expect(screen.getAllByTestId(/^rank-tile-/)).toHaveLength(state.placements.length);
    expect(inspect).not.toHaveBeenCalled();
    fireEvent.click(compare);
    expect(screen.queryByRole('group', { name: 'Reference timeline' })).not.toBeInTheDocument();
  });

  it('separates stored activation peaks, current weights and each rank cap', () => {
    const level = makeConfig({ memoryCaps: [4, 2], residencyModel: { weightUnit: 2 } });
    const state = expectState(replay(level, placeIds('F:0:0')));
    expect(memoryByRank(state)[0]).toEqual({
      rank: 0,
      activationUnits: 1,
      weightUnits: 2,
      totalUnits: 3,
      peakActivationUnits: 1,
      cap: 4,
    });
    render(
      <MetricsPanel
        level={level}
        score={score(state)}
        currentMemory={state.currentMemory}
        rankMemory={memoryByRank(state)}
        attemptTuple={attemptRankingTuple(state)}
        policyComparison={null}
      />,
    );
    expect(screen.getByText('Peak activations')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Memory by rank'));
    const rows = within(screen.getByRole('table', { name: 'Rank memory snapshots' })).getAllByRole(
      'row',
    );
    expect(rows[1]?.textContent).toBe('R012341');
    expect(rows[2]?.textContent).toBe('R100020');
  });
});
