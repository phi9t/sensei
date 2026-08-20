import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../app/App';
import * as replayModule from '../engine/replay';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

beforeEach(() => {
  vi.restoreAllMocks();
});

async function tabUntil(
  user: ReturnType<typeof userEvent.setup>,
  target: HTMLElement,
): Promise<void> {
  for (let index = 0; index < 100; index += 1) {
    if (document.activeElement === target) {
      return;
    }
    await user.tab();
  }

  throw new Error(
    `Could not focus ${target.getAttribute('aria-label') ?? target.textContent ?? '<unknown>'}`,
  );
}

function metricRowIn(container: HTMLElement, name: RegExp): HTMLElement {
  const term = within(container)
    .getAllByText(name)
    .find((candidate) => candidate.tagName === 'DT');
  if (!term) {
    throw new Error(`Metric term not found for ${name.toString()}`);
  }
  const row = term.closest('div');
  if (!row) {
    throw new Error(`Metric row not found for ${name.toString()}`);
  }
  return row;
}

describe('Game shell', () => {
  it('keeps blocked operations focusable and explains every blocker', async () => {
    const user = userEvent.setup();
    render(<App initialLevelId="dependency-chain" />);

    const blocked = screen.getByRole('button', {
      name: /place B stage 0 microbatch 0/i,
    });

    expect(blocked).toHaveAttribute('aria-disabled', 'true');
    expect(blocked).not.toBeDisabled();

    await tabUntil(user, blocked);
    await user.keyboard('{Enter}');

    const inspector = screen.getByRole('region', { name: /move inspector/i });
    expect(within(inspector).getByText(/Waiting for F stage 0 microbatch 0/i)).toBeInTheDocument();
    expect(within(inspector).getByText(/Waiting for B stage 1 microbatch 0/i)).toBeInTheDocument();
    expect(within(inspector).getByText(/F:0:0/)).toBeInTheDocument();
    expect(within(inspector).getByText(/B:1:0/)).toBeInTheDocument();
    expect(blocked).toHaveAccessibleName(/place B stage 0 microbatch 0, 2 ticks, blocked/i);
  });

  it('surfaces legal-then-rejected engine inconsistencies instead of overlaying them', async () => {
    const user = userEvent.setup();
    const actualApplyAction = replayModule.applyAction;
    const applyActionSpy = vi
      .spyOn(replayModule, 'applyAction')
      .mockImplementation((state, action) => {
        if (action.type === 'place' && action.operationId === 'F:0:0') {
          return {
            ok: false,
            action,
            reason: { kind: 'dependency-not-finished', operationId: 'F:1:0' },
          };
        }
        return actualApplyAction(state, action);
      });

    render(<App initialLevelId="dependency-chain" />);

    const blocked = screen.getByRole('button', {
      name: /place B stage 0 microbatch 0/i,
    });
    await user.click(blocked);
    expect(screen.getByRole('status', { name: /interaction feedback/i })).toHaveTextContent(
      /blocked by 2 blockers/i,
    );

    await expect(
      user.click(screen.getByRole('button', { name: /place F stage 0 microbatch 0/i })),
    ).rejects.toThrow(/Engine inconsistency while placing F:0:0: dependency-not-finished/);

    expect(applyActionSpy).toHaveBeenCalled();
  });

  it('renders forward and backward duration geometry at a 1:2 ratio before placement', () => {
    render(<App initialLevelId="dependency-chain" />);

    const forward = screen.getByTestId('tile-F:0:0');
    const backward = screen.getByTestId('tile-B:0:0');

    expect(forward).toHaveAttribute('data-duration', '1');
    expect(backward).toHaveAttribute('data-duration', '2');
    expect(Number(forward.getAttribute('width'))).toBeGreaterThan(0);
    expect(Number(backward.getAttribute('width'))).toBe(Number(forward.getAttribute('width')) * 2);
  });

  it('gives inventory its own vertical band and sizes the board to contain the full inventory extent', () => {
    render(<App initialLevelId="dependency-chain" />);

    const dependencyBoard = screen.getByRole('img', { name: /pipeline schedule board/i });
    const dependencyInventory = screen.getByTestId('tile-F:0:0');
    const dependencyFirstRankMemory = screen.getByTestId('memory-segment-rank-0-0');
    const dependencyInventoryExtent = screen.getByTestId('inventory-extent');
    const dependencyViewBoxWidth = Number(
      dependencyBoard.getAttribute('viewBox')?.split(/\s+/).at(2),
    );

    expect(Number(dependencyInventory.getAttribute('y'))).toBeLessThan(
      Number(dependencyFirstRankMemory.getAttribute('y')),
    );
    expect(
      Number(dependencyInventory.getAttribute('y')) +
        Number(dependencyInventory.getAttribute('height')),
    ).toBeLessThanOrEqual(Number(dependencyFirstRankMemory.getAttribute('y')));
    expect(dependencyViewBoxWidth).toBeGreaterThanOrEqual(
      Number(dependencyInventoryExtent.getAttribute('x')) +
        Number(dependencyInventoryExtent.getAttribute('width')) +
        24,
    );

    cleanup();
    render(<App initialLevelId="memory-wall" />);

    const memoryBoard = screen.getByRole('img', { name: /pipeline schedule board/i });
    const memoryInventoryExtent = screen.getByTestId('inventory-extent');
    const memoryViewBoxWidth = Number(memoryBoard.getAttribute('viewBox')?.split(/\s+/).at(2));

    expect(memoryViewBoxWidth).toBeGreaterThanOrEqual(
      Number(memoryInventoryExtent.getAttribute('x')) +
        Number(memoryInventoryExtent.getAttribute('width')) +
        24,
    );
  });

  it('renders per-rank activation-memory strips aligned to time and updates on forward acquire and backward release', async () => {
    const user = userEvent.setup();
    render(<App initialLevelId="dependency-chain" />);

    expect(screen.getByTestId('memory-strip-rank-0')).toBeInTheDocument();
    expect(screen.getByTestId('memory-strip-rank-1')).toBeInTheDocument();
    expect(screen.getByText(/Rank 0 memory timeline: 0-2 => 0 units/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /place F stage 0 microbatch 0/i }));

    expect(
      screen.getByText(/Rank 0 memory timeline: 0-1 => 0 units; 1-2 => 1 units/i),
    ).toBeInTheDocument();
    const afterForwardSegments = within(screen.getByTestId('memory-strip-rank-0')).getAllByTestId(
      /memory-segment-rank-0-/,
    );
    expect(afterForwardSegments).toHaveLength(2);
    expect(afterForwardSegments[1]).toHaveAttribute('data-memory', '1');

    await user.click(screen.getByRole('button', { name: /place F stage 1 microbatch 0/i }));
    await user.click(screen.getByRole('button', { name: /place B stage 1 microbatch 0/i }));
    await user.click(screen.getByRole('button', { name: /place B stage 0 microbatch 0/i }));

    expect(
      screen.getByText(/Rank 1 memory timeline: 0-2 => 0 units; 2-4 => 1 units; 4-6 => 0 units/i),
    ).toBeInTheDocument();
    const releasedSegments = within(screen.getByTestId('memory-strip-rank-1')).getAllByTestId(
      /memory-segment-rank-1-/,
    );
    expect(releasedSegments.at(-1)).toHaveAttribute('data-memory', '0');
  });

  it('completes and masters level one using keyboard only', async () => {
    const user = userEvent.setup();
    render(<App initialLevelId="dependency-chain" />);

    const orderedMoves = [
      /place F stage 0 microbatch 0/i,
      /place F stage 1 microbatch 0/i,
      /place B stage 1 microbatch 0/i,
      /place B stage 0 microbatch 0/i,
    ];

    for (const name of orderedMoves) {
      const target = screen.getByRole('button', { name });
      await tabUntil(user, target);
      await user.keyboard('{Enter}');
    }

    const metrics = screen.getByRole('region', { name: /metrics panel/i });
    expect(within(metrics).getByText(/Legal completion/i)).toBeInTheDocument();
    expect(within(metrics).getByText(/^Mastered$/i)).toBeInTheDocument();
  });

  it('produces the same placed state from pointer and keyboard placement', async () => {
    const pointerUser = userEvent.setup();
    const keyboardUser = userEvent.setup();

    const pointerView = render(<App initialLevelId="dependency-chain" />);
    await pointerUser.click(
      within(pointerView.container).getByRole('button', {
        name: /place F stage 0 microbatch 0/i,
      }),
    );

    const pointerBoard = within(pointerView.container).getByRole('region', {
      name: /schedule board/i,
    });
    const pointerMetrics = within(pointerView.container).getByRole('region', {
      name: /metrics panel/i,
    });

    const keyboardView = render(<App initialLevelId="dependency-chain" />);
    const keyboardButton = within(keyboardView.container).getByRole('button', {
      name: /place F stage 0 microbatch 0/i,
    });
    await tabUntil(keyboardUser, keyboardButton);
    await keyboardUser.keyboard('{Enter}');

    const keyboardBoard = within(keyboardView.container).getByRole('region', {
      name: /schedule board/i,
    });
    const keyboardMetrics = within(keyboardView.container).getByRole('region', {
      name: /metrics panel/i,
    });

    expect(within(pointerBoard).getByText(/F:0:0/)).toBeInTheDocument();
    expect(within(keyboardBoard).getByText(/F:0:0/)).toBeInTheDocument();
    expect(
      within(metricRowIn(pointerMetrics, /current attempt tuple/i)).getByText(
        /^1 -> 1 -> 0 -> 1$/i,
      ),
    ).toBeInTheDocument();
    expect(
      within(metricRowIn(keyboardMetrics, /current attempt tuple/i)).getByText(
        /^1 -> 1 -> 0 -> 1$/i,
      ),
    ).toBeInTheDocument();
  });

  it('renders owning rank, correct start end geometry, and dependency-forced gap text', async () => {
    const user = userEvent.setup();
    render(<App initialLevelId="dependency-chain" />);

    await user.click(screen.getByRole('button', { name: /place F stage 0 microbatch 0/i }));
    await user.click(screen.getByRole('button', { name: /place F stage 1 microbatch 0/i }));

    const tile = screen.getByTestId('rank-tile-F:1:0');
    expect(tile).toHaveAttribute('data-duration', '1');
    expect(tile).toHaveAttribute('x', '48');
    expect(tile).toHaveAttribute('width', '48');

    const board = screen.getByRole('region', { name: /schedule board/i });
    expect(
      within(board).getByText(/dependency-forced gap on rank 1 from 0 to 1/i),
    ).toBeInTheDocument();
    expect(within(board).getByText(/F:1:0/)).toBeInTheDocument();
    expect(within(board).getByText(/Rank 1, start 1, end 2, duration 1/i)).toBeInTheDocument();
  });

  it('supports undo redo reset and truncates redo after a new action', async () => {
    const user = userEvent.setup();
    render(<App initialLevelId="fill-the-pipe" />);

    await user.click(screen.getByRole('button', { name: /place F stage 0 microbatch 0/i }));
    await user.click(screen.getByRole('button', { name: /place F stage 0 microbatch 1/i }));

    const controls = screen.getByRole('region', { name: /game controls/i });
    const metrics = screen.getByRole('region', { name: /metrics panel/i });

    await user.click(within(controls).getByRole('button', { name: /undo last action/i }));
    expect(
      within(metricRowIn(metrics, /current attempt tuple/i)).getByText(/^1 -> 1 -> 0 -> 1$/i),
    ).toBeInTheDocument();

    await user.click(within(controls).getByRole('button', { name: /redo next action/i }));
    expect(
      within(metricRowIn(metrics, /current attempt tuple/i)).getByText(/^2 -> 2 -> 0 -> 2$/i),
    ).toBeInTheDocument();

    await user.click(within(controls).getByRole('button', { name: /undo last action/i }));
    await user.click(screen.getByRole('button', { name: /place F stage 1 microbatch 0/i }));
    expect(
      within(metricRowIn(metrics, /current attempt tuple/i)).getByText(/^2 -> 1 -> 0 -> 2$/i),
    ).toBeInTheDocument();
    expect(within(controls).getByRole('button', { name: /redo next action/i })).toBeDisabled();

    await user.click(within(controls).getByRole('button', { name: /reset current attempt/i }));
    expect(
      within(metricRowIn(metrics, /current attempt tuple/i)).getByText(/^0 -> 0 -> 0 -> 0$/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/Select an operation to inspect its constraints/i)).toBeInTheDocument();
  });

  it('adds one intentional idle tick for a per-rank wait action', async () => {
    const user = userEvent.setup();
    render(<App initialLevelId="dependency-chain" />);

    const controls = screen.getByRole('region', { name: /game controls/i });
    await user.click(
      within(controls).getByRole('button', {
        name: /wait one tick on rank 0/i,
      }),
    );

    const metrics = screen.getByRole('region', { name: /metrics panel/i });
    const board = screen.getByRole('region', { name: /schedule board/i });

    expect(within(metricRowIn(metrics, /intentional idle/i)).getByText(/^1$/)).toBeInTheDocument();
    expect(within(board).getByText(/intentional gap on rank 0 from 0 to 1/i)).toBeInTheDocument();
  });

  it('uses coaching truth for hint and automation diagnostics', async () => {
    const user = userEvent.setup();
    render(<App initialLevelId="memory-wall" />);

    const controls = screen.getByRole('region', { name: /game controls/i });
    const status = screen.getByRole('status', { name: /interaction feedback/i });

    await user.click(within(controls).getByRole('button', { name: /show local hint/i }));
    expect(status).toHaveTextContent(/Local hint: place F stage 0 microbatch 0/i);

    for (const name of [
      /place F stage 0 microbatch 0/i,
      /place F stage 0 microbatch 1/i,
      /place F stage 0 microbatch 2/i,
      /place F stage 1 microbatch 0/i,
      /place F stage 1 microbatch 1/i,
      /place F stage 2 microbatch 0/i,
    ]) {
      await user.click(screen.getByRole('button', { name }));
    }

    await user.click(
      within(controls).getByRole('button', {
        name: /run until interesting boundary/i,
      }),
    );

    expect(status).toHaveTextContent(/Automation stopped at memory boundary/i);
    expect(status).toHaveTextContent(/F:0:3/i);

    const board = screen.getByRole('region', { name: /schedule board/i });
    expect(within(board).getByText(/^F:0:0$/)).toBeInTheDocument();
    expect(within(board).getByText(/^F:0:1$/)).toBeInTheDocument();
    expect(within(board).getByText(/^F:0:2$/)).toBeInTheDocument();
    expect(within(board).queryByText(/wait/i)).not.toBeInTheDocument();
  });

  it('keeps completed operations inspectable without duplicating placement', async () => {
    const user = userEvent.setup();
    render(<App initialLevelId="dependency-chain" />);

    await user.click(screen.getByRole('button', { name: /place F stage 0 microbatch 0/i }));
    await user.click(screen.getByRole('button', { name: /place F stage 0 microbatch 0/i }));

    const inspector = screen.getByRole('region', { name: /move inspector/i });
    const board = screen.getByRole('region', { name: /schedule board/i });
    const completed = screen.getByRole('button', {
      name: /place F stage 0 microbatch 0, 1 tick, completed/i,
    });

    expect(within(inspector).getByText(/Placed on rank 0 from 0 to 1/i)).toBeInTheDocument();
    expect(within(board).getAllByText(/F:0:0/)).toHaveLength(1);
    expect(completed).toHaveAttribute('aria-current', 'true');
  });

  it('exposes named regions and truthful controls while using aria-disabled for blocked moves', () => {
    render(<App initialLevelId="dependency-chain" />);

    expect(screen.getByRole('region', { name: /goal and introduction/i })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /operation tray/i })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /schedule board/i })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /move inspector/i })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /metrics panel/i })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /game controls/i })).toBeInTheDocument();

    const blocked = screen.getByRole('button', {
      name: /place B stage 0 microbatch 0/i,
    });
    expect(blocked).toHaveAttribute('aria-disabled', 'true');
    expect(blocked).not.toBeDisabled();

    const controls = screen.getByRole('region', { name: /game controls/i });
    expect(
      within(controls).getByRole('button', {
        name: /wait one tick on rank 0/i,
      }),
    ).toBeEnabled();
    expect(
      within(controls).getByRole('button', {
        name: /undo last action/i,
      }),
    ).toBeDisabled();
  });
});
