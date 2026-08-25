import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { replay, type ScheduleState } from '../engine/replay';
import { expectState, makeConfig, placeIds } from '../test/factories';
import { ScheduleBoard } from './ScheduleBoard';

afterEach(() => {
  cleanup();
});

describe('ScheduleBoard', () => {
  it('uses readable board geometry for placed blocks and two-line labels', () => {
    const schedule = expectState(replay(makeConfig(), placeIds('F:0:0')));
    const handleInspect = vi.fn();

    render(
      <ScheduleBoard
        schedule={schedule}
        selectedOperationId={null}
        preview={null}
        onInspect={handleInspect}
      />,
    );

    const placed = screen.getByTestId('rank-tile-F:0:0');
    const label = screen.getByTestId('rank-label-F:0:0');
    const interactiveTile = screen.getByRole('button', {
      name: /inspect F stage 0 microbatch 0, placed on rank 0 from 0 to 1/i,
    });

    expect(placed).toHaveAttribute('width', '60');
    expect(placed).toHaveAttribute('height', '44');
    expect(label).toHaveAccessibleName('F0:S0:B0');
    expect(label.querySelectorAll('tspan')).toHaveLength(2);
    expect(interactiveTile).toHaveAttribute('tabindex', '0');
  });

  it('renders replay-owned activation and residency timeline segments', () => {
    const base = expectState(replay(makeConfig(), placeIds('F:0:0')));
    const schedule: ScheduleState = Object.freeze({
      ...base,
      config: Object.freeze({
        ...base.config,
        residencyModel: Object.freeze({ weightUnit: 1 }),
      }),
      activationMemoryTimelineByRank: Object.freeze([
        Object.freeze([{ start: 0, end: 2, value: 7 }]),
        Object.freeze([{ start: 0, end: 2, value: 3 }]),
      ]),
      weightResidencyTimelineByRank: Object.freeze([
        Object.freeze([{ start: 0, end: 2, value: 5 }]),
        Object.freeze([{ start: 0, end: 2, value: 4 }]),
      ]),
    });

    render(
      <ScheduleBoard
        schedule={schedule}
        selectedOperationId={null}
        preview={null}
        onInspect={vi.fn()}
      />,
    );

    expect(screen.getByTestId('memory-segment-rank-0-0')).toHaveAttribute('data-memory', '7');
    expect(screen.getByTestId('weight-segment-rank-0-0')).toHaveAttribute('data-memory', '5');
    expect(screen.getByText(/Rank 0 memory timeline: 0-2 => 7 units/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Rank 0 weight residency timeline: 0-2 => 5 units/i),
    ).toBeInTheDocument();
  });

  it('selects a placed block from the board by pointer and keyboard', () => {
    const schedule = expectState(replay(makeConfig(), placeIds('F:0:0')));
    const handleInspect = vi.fn();

    render(
      <ScheduleBoard
        schedule={schedule}
        selectedOperationId={null}
        preview={null}
        onInspect={handleInspect}
      />,
    );

    const tile = screen.getByRole('button', {
      name: /inspect F stage 0 microbatch 0, placed on rank 0 from 0 to 1/i,
    });

    fireEvent.click(tile);
    expect(handleInspect).toHaveBeenLastCalledWith('F:0:0');

    fireEvent.focus(tile);
    expect(handleInspect).toHaveBeenLastCalledWith('F:0:0');
  });
});
