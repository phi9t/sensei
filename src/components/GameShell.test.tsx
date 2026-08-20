import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../app/App';

afterEach(() => {
  cleanup();
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
      within(pointerMetrics).getByText(/Current attempt tuple: 1 -> 1 -> 0 -> 1/i),
    ).toBeInTheDocument();
    expect(
      within(keyboardMetrics).getByText(/Current attempt tuple: 1 -> 1 -> 0 -> 1/i),
    ).toBeInTheDocument();
  });

  it('renders owning rank, correct start end geometry, and dependency-forced gap text', async () => {
    const user = userEvent.setup();
    render(<App initialLevelId="dependency-chain" />);

    await user.click(screen.getByRole('button', { name: /place F stage 0 microbatch 0/i }));
    await user.click(screen.getByRole('button', { name: /place F stage 1 microbatch 0/i }));

    const tile = screen.getByTestId('tile-F:1:0');
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
      within(metrics).getByText(/Current attempt tuple: 1 -> 1 -> 0 -> 1/i),
    ).toBeInTheDocument();

    await user.click(within(controls).getByRole('button', { name: /redo next action/i }));
    expect(
      within(metrics).getByText(/Current attempt tuple: 2 -> 2 -> 0 -> 2/i),
    ).toBeInTheDocument();

    await user.click(within(controls).getByRole('button', { name: /undo last action/i }));
    await user.click(screen.getByRole('button', { name: /place F stage 1 microbatch 0/i }));
    expect(
      within(metrics).getByText(/Current attempt tuple: 2 -> 1 -> 0 -> 2/i),
    ).toBeInTheDocument();
    expect(within(controls).getByRole('button', { name: /redo next action/i })).toBeDisabled();

    await user.click(within(controls).getByRole('button', { name: /reset current attempt/i }));
    expect(
      within(metrics).getByText(/Current attempt tuple: 0 -> 0 -> 0 -> 0/i),
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

    expect(within(metrics).getByText(/Intentional idle: 1/i)).toBeInTheDocument();
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

    expect(within(inspector).getByText(/Placed on rank 0 from 0 to 1/i)).toBeInTheDocument();
    expect(within(board).getAllByText(/F:0:0/)).toHaveLength(1);
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
