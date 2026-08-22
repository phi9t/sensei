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

function scheduleLabelIn(container: HTMLElement, operationId: string): HTMLElement {
  return within(container).getByTestId(`rank-label-${operationId}`);
}

describe('Game shell', () => {
  it('lays out the cockpit around guide, queue, command rail, schedule, and score rail', () => {
    render(<App initialLevelId="backward-is-heavier" />);

    expect(screen.getByRole('banner', { name: /sensei cockpit/i })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /level guide/i })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /^ready queue$/i })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /schedule command rail/i })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /schedule board/i })).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: /score rail/i })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: /pipeline rules/i })).not.toBeInTheDocument();
    expect(screen.getByText(/\(F\/B, stage_id, micro_batch_id\)/i)).toBeInTheDocument();
  });

  it('surfaces the current algorithm set and pattern without adding a rules panel', () => {
    render(<App initialLevelId="gpipe-afab" />);

    const guide = screen.getByRole('region', { name: /level guide/i });

    expect(within(guide).getByText(/^GPipe$/i)).toBeInTheDocument();
    expect(within(guide).getByRole('heading', { name: /^GPipe AFAB$/i })).toBeInTheDocument();
    expect(
      within(guide).getByText(/Run all forward work first, then drain all backward work/i),
    ).toBeInTheDocument();
    expect(within(guide).getByText(/^AFAB$/i)).toBeInTheDocument();
    expect(
      within(guide).getByText(/Build the AFAB shape and notice the activation memory it holds/i),
    ).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: /pipeline rules/i })).not.toBeInTheDocument();
  });

  it('groups the level picker by curriculum set', () => {
    render(<App initialLevelId="dependency-chain" />);

    const picker = screen.getByRole('combobox', { name: /choose level/i });
    const groups = Array.from(picker.querySelectorAll('optgroup')).map((group) =>
      group.getAttribute('label'),
    );

    expect(groups).toEqual(['Foundations', 'GPipe', '1F1B']);
    expect(
      picker.querySelector('optgroup[label="1F1B"] option[value="tie-at-the-frontier"]'),
    ).not.toBeNull();
  });

  it('keeps core schedule commands in a thin command rail', () => {
    render(<App initialLevelId="dependency-chain" />);

    const rail = screen.getByRole('region', { name: /schedule command rail/i });
    expect(within(rail).getByText(/^Schedule$/i)).toBeInTheDocument();
    expect(within(rail).getByRole('button', { name: /undo last action/i })).toBeDisabled();
    expect(within(rail).getByRole('button', { name: /redo next action/i })).toBeDisabled();
    expect(within(rail).getByRole('button', { name: /place selected operation/i })).toBeEnabled();
    expect(within(rail).getByRole('button', { name: /clear selected operation/i })).toBeEnabled();
    expect(within(rail).getByRole('button', { name: /wait one tick on rank 0/i })).toBeEnabled();
  });

  it('keeps blocked operations focusable and explains every blocker', async () => {
    const user = userEvent.setup();
    render(<App initialLevelId="dependency-chain" />);

    const blocked = screen.getByRole('button', {
      name: /inspect B stage 0 microbatch 0/i,
    });

    expect(blocked).not.toBeDisabled();

    await tabUntil(user, blocked);
    await user.keyboard('{Enter}');

    const inspector = screen.getByRole('region', { name: /move inspector/i });
    expect(within(inspector).getByText(/Waiting for F stage 0 microbatch 0/i)).toBeInTheDocument();
    expect(within(inspector).getByText(/Waiting for B stage 1 microbatch 0/i)).toBeInTheDocument();
    expect(within(inspector).getByText(/F0:S0:B0/)).toBeInTheDocument();
    expect(within(inspector).getByText(/B1:S1:B0/)).toBeInTheDocument();
    expect(blocked).toHaveAccessibleName(/inspect B stage 0 microbatch 0, 2 ticks, blocked/i);
  });

  it('previews a legal focused operation and can place the selected move from controls', async () => {
    const user = userEvent.setup();
    render(<App initialLevelId="dependency-chain" />);

    const firstMove = screen.getByRole('button', {
      name: /place F stage 0 microbatch 0, 1 tick, ready/i,
    });
    await tabUntil(user, firstMove);

    const inspector = screen.getByRole('region', { name: /move inspector/i });
    expect(within(inspector).getByText(/Legal now\. Earliest start 0/i)).toBeInTheDocument();
    const preview = screen.getByTestId('preview-tile-F:0:0');
    expect(preview).toHaveAttribute('x', '0');
    expect(preview).toHaveAttribute('width', '56');

    await user.click(
      within(screen.getByRole('region', { name: /schedule command rail/i })).getByRole('button', {
        name: /place selected operation/i,
      }),
    );

    expect(screen.getByRole('status', { name: /interaction feedback/i })).toHaveTextContent(
      /Placed F stage 0 microbatch 0 on rank 0/i,
    );
    expect(
      scheduleLabelIn(screen.getByRole('region', { name: /schedule board/i }), 'F:0:0'),
    ).toHaveAccessibleName('F0:S0:B0');
    expect(screen.queryByTestId('preview-tile-F:0:0')).not.toBeInTheDocument();
  });

  it('shows only legal selections as board previews', async () => {
    const user = userEvent.setup();
    render(<App initialLevelId="dependency-chain" />);

    await user.click(screen.getByRole('button', { name: /inspect B stage 0 microbatch 0/i }));
    expect(screen.queryByTestId('preview-tile-B:0:0')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /place F stage 0 microbatch 0/i }));
    await tabUntil(user, screen.getByRole('button', { name: /place F stage 1 microbatch 0/i }));

    const preview = screen.getByTestId('preview-tile-F:1:0');
    expect(preview).toHaveAttribute('x', '56');
    expect(preview).toHaveAttribute('data-duration', '1');
    expect(screen.getByTestId('preview-label-F:1:0')).toHaveAccessibleName('F1:S1:B0');
  });

  it('can clear the selected operation without changing the attempt', async () => {
    const user = userEvent.setup();
    render(<App initialLevelId="dependency-chain" />);

    await user.click(screen.getByRole('button', { name: /place F stage 0 microbatch 0/i }));
    await user.click(
      within(screen.getByRole('region', { name: /schedule command rail/i })).getByRole('button', {
        name: /clear selected operation/i,
      }),
    );

    expect(screen.getByRole('status', { name: /interaction feedback/i })).toHaveTextContent(
      /Cleared the selected operation/i,
    );
    expect(screen.getByText(/Select a block to inspect it/i)).toBeInTheDocument();
    expect(
      within(
        metricRowIn(
          screen.getByRole('region', { name: /metrics panel/i }),
          /current attempt tuple/i,
        ),
      ).getByText(/^1 -> 1 -> 0 -> 1$/i),
    ).toBeInTheDocument();
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
      name: /inspect B stage 0 microbatch 0/i,
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
    expect(forward).toHaveStyle({ '--tile-duration': '1' });
    expect(backward).toHaveStyle({ '--tile-duration': '2' });
    expect(
      within(screen.getByRole('region', { name: /^ready queue$/i })).getAllByText(/^1 ready$/i)
        .length,
    ).toBeGreaterThan(0);
  });

  it('groups compact block tokens by microbatch and pass stack', () => {
    render(<App initialLevelId="backward-is-heavier" />);

    const blocks = screen.getByRole('region', { name: /^ready queue$/i });
    const batchZero = within(blocks).getByRole('region', { name: /batch 0 blocks/i });
    const forwardStack = within(batchZero).getByRole('group', {
      name: /batch 0 forward blocks/i,
    });
    const backwardStack = within(batchZero).getByRole('group', {
      name: /batch 0 backward blocks/i,
    });

    expect(within(batchZero).getByText(/^Batch 0$/i)).toBeInTheDocument();
    expect(batchZero).toHaveAttribute('data-phase', 'ready');
    expect(batchZero).toHaveAttribute('data-ready-count', '1');
    expect(within(batchZero).getByText(/^1 ready$/i)).toBeInTheDocument();
    expect(within(forwardStack).getByText(/^FWD$/i)).toBeInTheDocument();
    expect(within(backwardStack).getByText(/^BWD$/i)).toBeInTheDocument();
    expect(within(forwardStack).getByText(/^F0:S0:B0$/i)).toBeInTheDocument();
    expect(within(forwardStack).getByText(/^F1:S1:B0$/i)).toBeInTheDocument();
    expect(within(forwardStack).getByText(/^F2:S2:B0$/i)).toBeInTheDocument();
    expect(within(backwardStack).getByText(/^B0:S0:B0$/i)).toBeInTheDocument();
    expect(within(backwardStack).getByText(/^B1:S1:B0$/i)).toBeInTheDocument();
    expect(within(backwardStack).getByText(/^B2:S2:B0$/i)).toBeInTheDocument();
    expect(within(batchZero).queryByText(/^F:0:0$/)).not.toBeInTheDocument();
    expect(
      within(forwardStack).getByRole('button', {
        name: /place F stage 0 microbatch 0, 1 tick, ready/i,
      }),
    ).toBeInTheDocument();
  });

  it('keeps operation visual identity consistent from selector to preview and board', async () => {
    const user = userEvent.setup();
    render(<App initialLevelId="dependency-chain" />);

    const tile = screen.getByRole('button', {
      name: /place F stage 0 microbatch 0, 1 tick, ready/i,
    });
    expect(tile).toHaveAttribute('data-operation-visual', 'F-0-0');
    expect(tile).toHaveStyle({
      '--operation-hue': '184',
      '--operation-accent': 'hsl(184 44% 40%)',
    });

    await tabUntil(user, tile);

    const inspectorIdentity = screen.getByTestId('inspector-identity-F:0:0');
    expect(inspectorIdentity).toHaveAttribute('data-operation-visual', 'F-0-0');
    expect(inspectorIdentity).toHaveStyle({
      '--operation-hue': '184',
      '--operation-accent': 'hsl(184 44% 40%)',
    });

    const preview = screen.getByTestId('preview-tile-F:0:0');
    expect(preview).toHaveAttribute('data-operation-visual', 'F-0-0');
    expect(preview).toHaveStyle({
      '--operation-hue': '184',
      '--operation-accent': 'hsl(184 44% 40%)',
    });

    await user.keyboard('{Enter}');

    const placed = screen.getByTestId('rank-tile-F:0:0');
    expect(placed).toHaveAttribute('data-operation-visual', 'F-0-0');
    expect(placed).toHaveStyle({
      '--operation-hue': '184',
      '--operation-accent': 'hsl(184 44% 40%)',
    });
  });

  it('does not repeat the block inventory inside the timeline', () => {
    render(<App initialLevelId="dependency-chain" />);

    const board = screen.getByRole('region', { name: /schedule board/i });
    expect(within(board).queryByText(/inventory geometry/i)).not.toBeInTheDocument();
    expect(within(board).queryByTestId('tile-F:0:0')).not.toBeInTheDocument();
  });

  it('renders per-rank activation-memory strips aligned to time and updates on forward acquire and backward release', async () => {
    const user = userEvent.setup();
    render(<App initialLevelId="dependency-chain" />);

    expect(screen.getByTestId('memory-strip-rank-0')).toBeInTheDocument();
    expect(screen.getByTestId('memory-strip-rank-1')).toBeInTheDocument();
    expect(screen.getByText(/Rank 0 memory timeline: 0-2 => 0 units/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /place F stage 0 microbatch 0/i }));

    expect(
      within(screen.getByRole('region', { name: /schedule board/i })).getByText(
        /Rank 0 memory timeline: 0-1 => 0 units; 1-2 => 1 units/i,
      ),
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
    expect(within(metricRowIn(metrics, /mastery/i)).getByText(/^Mastered$/i)).toBeInTheDocument();
    expect(within(metrics).getByRole('group', { name: /scoreboard/i })).toBeInTheDocument();
    expect(within(metrics).getByText(/^Run state$/i)).toBeInTheDocument();
    expect(within(metrics).getByText(/^Metric details$/i)).toBeInTheDocument();
  });

  it('compresses completed and waiting batches into phase-aware lanes', async () => {
    const user = userEvent.setup();
    render(<App initialLevelId="fill-the-pipe" />);

    await user.click(screen.getByRole('button', { name: /place F stage 0 microbatch 0/i }));
    await user.click(screen.getByRole('button', { name: /place F stage 1 microbatch 0/i }));
    await user.click(screen.getByRole('button', { name: /place B stage 1 microbatch 0/i }));
    await user.click(screen.getByRole('button', { name: /place B stage 0 microbatch 0/i }));

    const blocks = screen.getByRole('region', { name: /^ready queue$/i });
    const batchZero = within(blocks).getByRole('region', { name: /batch 0 blocks, done/i });
    const batchOne = within(blocks).getByRole('region', { name: /batch 1 blocks, 1 ready/i });
    const batchTwo = within(blocks).getByRole('region', { name: /batch 2 blocks, 1 ready/i });

    expect(batchZero).toHaveAttribute('data-phase', 'done');
    expect(batchZero).toHaveAttribute('data-ready-count', '0');
    expect(within(batchZero).getByText(/^Done$/i)).toBeInTheDocument();
    expect(batchOne).toHaveAttribute('data-phase', 'ready');
    expect(batchTwo).toHaveAttribute('data-phase', 'ready');
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

    expect(scheduleLabelIn(pointerBoard, 'F:0:0')).toHaveAccessibleName('F0:S0:B0');
    expect(scheduleLabelIn(keyboardBoard, 'F:0:0')).toHaveAccessibleName('F0:S0:B0');
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
    expect(tile).toHaveAttribute('x', '56');
    expect(tile).toHaveAttribute('width', '56');

    const board = screen.getByRole('region', { name: /schedule board/i });
    expect(
      within(board).getByRole('img', { name: /pipeline schedule board/i }),
    ).toBeInTheDocument();
    expect(within(board).getByTestId('rank-band-0')).toHaveAttribute('data-rank-parity', 'even');
    expect(within(board).getByTestId('rank-band-1')).toHaveAttribute('data-rank-parity', 'odd');
    expect(
      within(board).getByText(/dependency-forced gap on rank 1 from 0 to 1/i),
    ).toBeInTheDocument();
    expect(scheduleLabelIn(board, 'F:1:0')).toHaveAccessibleName('F1:S1:B0');
    expect(within(board).getByText(/Rank 1, start 1, end 2, duration 1/i)).toBeInTheDocument();
  });

  it('supports undo redo reset and truncates redo after a new action', async () => {
    const user = userEvent.setup();
    render(<App initialLevelId="fill-the-pipe" />);

    await user.click(screen.getByRole('button', { name: /place F stage 0 microbatch 0/i }));
    await user.click(screen.getByRole('button', { name: /place F stage 0 microbatch 1/i }));

    const controls = screen.getByRole('region', { name: /schedule command rail/i });
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
    expect(screen.getByText(/Select a block to inspect it/i)).toBeInTheDocument();
  });

  it('adds one intentional idle tick for a per-rank wait action', async () => {
    const user = userEvent.setup();
    render(<App initialLevelId="dependency-chain" />);

    const controls = screen.getByRole('region', { name: /schedule command rail/i });
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

    const controls = screen.getByRole('region', { name: /schedule command rail/i });
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

    expect(status).toHaveTextContent(/Automation stopped at a memory boundary/i);
    expect(status).toHaveTextContent(/F0:S0:B3/i);

    const board = screen.getByRole('region', { name: /schedule board/i });
    expect(scheduleLabelIn(board, 'F:0:0')).toHaveAccessibleName('F0:S0:B0');
    expect(scheduleLabelIn(board, 'F:0:1')).toHaveAccessibleName('F0:S0:B1');
    expect(scheduleLabelIn(board, 'F:0:2')).toHaveAccessibleName('F0:S0:B2');
    expect(within(board).queryByText(/wait/i)).not.toBeInTheDocument();
  });

  it('keeps completed operations inspectable without duplicating placement', async () => {
    const user = userEvent.setup();
    render(<App initialLevelId="dependency-chain" />);

    await user.click(screen.getByRole('button', { name: /place F stage 0 microbatch 0/i }));
    await user.click(screen.getByRole('button', { name: /inspect F stage 0 microbatch 0/i }));

    const inspector = screen.getByRole('region', { name: /move inspector/i });
    const board = screen.getByRole('region', { name: /schedule board/i });
    const completed = screen.getByRole('button', {
      name: /inspect F stage 0 microbatch 0, 1 tick, completed/i,
    });

    expect(within(inspector).getByText(/Placed on rank 0 from 0 to 1/i)).toBeInTheDocument();
    expect(scheduleLabelIn(board, 'F:0:0')).toHaveAccessibleName('F0:S0:B0');
    expect(completed).toHaveAttribute('aria-current', 'true');
  });

  it('exposes named regions and truthful controls while keeping blocked moves inspectable', () => {
    render(<App initialLevelId="dependency-chain" />);

    expect(screen.getByRole('region', { name: /^ready queue$/i })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /schedule board/i })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /move inspector/i })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /metrics panel/i })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /schedule command rail/i })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: /pipeline rules/i })).not.toBeInTheDocument();

    const blocked = screen.getByRole('button', {
      name: /inspect B stage 0 microbatch 0/i,
    });
    expect(blocked).not.toHaveAttribute('aria-disabled');
    expect(blocked).not.toBeDisabled();

    const controls = screen.getByRole('region', { name: /schedule command rail/i });
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
    expect(within(controls).queryByText(/more controls/i)).not.toBeInTheDocument();
  });

  it('keeps naming terse while the inspector explains blockers', async () => {
    const user = userEvent.setup();
    render(<App initialLevelId="dependency-chain" />);

    await user.click(screen.getByRole('button', { name: /inspect B stage 0 microbatch 0/i }));

    expect(screen.getByText(/\(F\/B, stage_id, micro_batch_id\)/i)).toBeInTheDocument();
    const inspector = screen.getByRole('region', { name: /move inspector/i });
    expect(within(inspector).getByText(/Waiting for F stage 0 microbatch 0/i)).toBeInTheDocument();
    expect(within(inspector).getByText(/Waiting for B stage 1 microbatch 0/i)).toBeInTheDocument();
  });
});
