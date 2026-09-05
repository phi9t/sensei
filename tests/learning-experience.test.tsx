import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/app/App';
import { LearningLab } from '../src/components/LearningLab';
import { TimelineHelp } from '../src/components/TimelineHelp';
import { getLevel, LEVEL_IDS } from '../src/levels/levels';
import { MASTERED_ACTIONS } from '../src/levels/fixtures';
import { replay } from '../src/engine/replay';
import { score } from '../src/engine/score';
import { expectState, placeIds } from '../src/test/factories';

beforeEach(() => {
  window.history.replaceState(null, '', '/');
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.history.replaceState(null, '', '/');
});

describe('learn and practice', () => {
  it.each(LEVEL_IDS)('exposes a primary source and a working walkthrough for %s', (id) => {
    const schedule = expectState(replay(getLevel(id), []));
    const inspect = vi.fn();
    render(
      <LearningLab
        schedule={schedule}
        selectedOperationId={null}
        onInspect={inspect}
        onClearSelection={vi.fn()}
      />,
    );
    const reading = screen.getByRole('complementary', { name: 'Source reading guide' });
    const source = within(reading).getByRole('link');
    expect(source).toBeVisible();
    expect(source).toHaveAttribute('href', expect.stringMatching(/^https:\/\/arxiv.org\//));
    expect(within(reading).getByText('What to look for')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Algorithm walkthrough' }));
    expect(screen.getByRole('button', { name: 'Algorithm walkthrough' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(source).toBeVisible();
    expect(inspect).not.toHaveBeenCalled();
    expect(schedule.actions).toHaveLength(0);
  });

  it('coordinates the explanation, dependency strip and inspector without placing operations', async () => {
    const user = userEvent.setup();
    render(<App storage={null} />);
    await user.click(screen.getByRole('button', { name: /inspect F stage 1 microbatch 0/i }));
    const trace = screen.getByRole('region', { name: 'Your selected block' });
    const block = within(trace).getByRole('button', { name: 'Show F1:S1:D0 on the timeline' });
    expect(block).toHaveAttribute('aria-pressed', 'true');
    const gate = within(trace).getByRole('button', { name: 'Trace dependency F0:S0:D0' });
    gate.focus();
    await user.keyboard('{Enter}');
    expect(
      within(trace).getByRole('button', { name: 'Show F0:S0:D0 on the timeline' }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('region', { name: 'Move inspector' })).toHaveTextContent('F0:S0:D0');
    expect(screen.getByRole('group', { name: 'Selected block status' })).toHaveTextContent(
      'F0:S0:D0',
    );
    expect(screen.queryAllByTestId(/^rank-tile-/)).toHaveLength(0);
    fireEvent.keyDown(trace, { key: 'Escape' });
    expect(screen.getByText('Select a block to inspect it.')).toBeVisible();
  });

  it('derives dependency timing and bubble arithmetic from replay, including DualPipe capacity', () => {
    const level = getLevel('dualpipe-balance');
    const schedule = expectState(replay(level, MASTERED_ACTIONS['dualpipe-balance']));
    const metrics = score(schedule);
    render(
      <LearningLab
        schedule={schedule}
        selectedOperationId="B:1:1:desc"
        onInspect={vi.fn()}
        onClearSelection={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText('Why this bubble score?'));
    expect(screen.getByLabelText('Bubble calculation')).toHaveTextContent(
      `(${metrics.capacity} − ${metrics.totalWork}) / ${metrics.capacity} = ${(metrics.bubbleRatio * 100).toFixed(1)}%`,
    );
    expect(screen.getByText(/2 shared capacity per rank/)).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Show B1:S1:D1 Down on the timeline' }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows a placed predecessor end from the same timeline state', () => {
    const schedule = expectState(replay(getLevel('dependency-chain'), placeIds('F:0:0')));
    render(
      <LearningLab
        schedule={schedule}
        selectedOperationId="F:1:0"
        onInspect={vi.fn()}
        onClearSelection={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Trace dependency F0:S0:D0' })).toHaveTextContent(
      'ends at 1',
    );
    fireEvent.click(screen.getByText('Why this bubble score?'));
    expect(screen.getByText(/percentage is provisional/)).toBeVisible();
  });

  it('offers keyboard/touch help with Escape, close and outside dismissal', async () => {
    const user = userEvent.setup();
    render(
      <>
        <TimelineHelp level={getLevel('split-backward')} />
        <button type="button">Outside</button>
      </>,
    );
    const trigger = screen.getByRole('button', { name: /how to read this/i });
    trigger.focus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('dialog', { name: 'Reading the timeline' })).toHaveTextContent(
      'F / B / W',
    );
    await user.keyboard('{Tab}');
    expect(screen.getByRole('button', { name: 'Close timeline help' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    await user.click(trigger);
    await user.click(screen.getByRole('button', { name: 'Close timeline help' }));
    expect(trigger).toHaveFocus();
    await user.click(trigger);
    await user.click(screen.getByRole('button', { name: 'Outside' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(trigger);
    fireEvent(window, new Event('resize'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('moves focus between theory, sources and practice without replacing a shared attempt URL', () => {
    const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView');
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      value: vi.fn(),
      configurable: true,
    });
    try {
      render(<App storage={null} />);
      window.history.replaceState(null, '', '/#attempt=keep-this-artifact');
      fireEvent.click(screen.getByRole('button', { name: /theory & source material/i }));
      expect(screen.getByRole('region', { name: 'Understand this schedule' })).toHaveFocus();
      fireEvent.click(screen.getByRole('button', { name: /paper & reading guide/i }));
      expect(screen.getByRole('complementary', { name: 'Source reading guide' })).toHaveFocus();
      fireEvent.click(screen.getByRole('button', { name: /return to practice/i }));
      expect(screen.getByRole('heading', { name: 'Schedule board' })).toHaveFocus();
      expect(window.location.hash).toBe('#attempt=keep-this-artifact');
    } finally {
      if (original) Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', original);
      else Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
    }
  });

  it('switches completed attempts to review, preserves undo/redo and enters the next lesson', async () => {
    const errors = vi.spyOn(console, 'error');
    const user = userEvent.setup();
    render(<App storage={null} />);
    await user.click(screen.getByRole('button', { name: 'Solve from current state' }));
    expect(screen.getByRole('region', { name: 'Completed attempt' })).toHaveTextContent(
      'Goal achieved',
    );
    expect(
      within(screen.getByRole('region', { name: 'Completed attempt' })).getByRole('heading'),
    ).toHaveFocus();
    expect(screen.queryByRole('region', { name: 'Ready queue' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Place selected operation' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /review the theory/i })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Undo last action' }));
    expect(screen.getByRole('region', { name: 'Ready queue' })).toBeVisible();
    expect(screen.queryByRole('region', { name: 'Completed attempt' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Redo next action' }));
    await user.click(screen.getByRole('button', { name: /next lesson/i }));
    expect(screen.getByRole('combobox', { name: 'Choose level' })).toHaveValue('fill-the-pipe');
    expect(screen.getByRole('region', { name: 'Ready queue' })).toBeVisible();
    expect(errors).not.toHaveBeenCalled();
  });

  it('has no serious or critical accessibility violations with the deep dive and help open', async () => {
    const { container } = render(<App storage={null} initialLevelId="split-backward" />);
    fireEvent.click(screen.getByRole('button', { name: /how to read this/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Algorithm walkthrough' }));
    fireEvent.click(screen.getByText('Source & assumptions'));
    fireEvent.click(screen.getByText('Why this bubble score?'));
    const result = await axe.run(container, { resultTypes: ['violations'] });
    expect(
      result.violations
        .filter((entry) => entry.impact === 'serious' || entry.impact === 'critical')
        .map((entry) => ({ id: entry.id, targets: entry.nodes.map((node) => node.target) })),
    ).toEqual([]);
  });
});
