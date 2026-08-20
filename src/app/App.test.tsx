import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';

afterEach(() => {
  cleanup();
});

describe('App', () => {
  it('announces Sensei as a pipeline scheduling game', () => {
    render(<App />);
    expect(
      screen.getByRole('heading', { name: /sensei pipeline scheduling/i }),
    ).toBeInTheDocument();
  });

  it('uses canonical level titles in the level selector options', () => {
    render(<App />);

    const levelSelector = screen.getByRole('combobox', { name: /choose level/i });
    const options = screen.getAllByRole('option');

    expect(levelSelector).toBeInTheDocument();
    expect(options.map((option) => option.textContent)).toEqual([
      'Dependency Chain',
      'Fill the Pipe',
      'Backward Is Heavier',
      'Memory Wall',
    ]);
  });

  it('persists completed progress across remounts in the default browser-storage app path', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<App />);

    await user.click(screen.getByRole('button', { name: /place F stage 0 microbatch 0/i }));
    await user.click(screen.getByRole('button', { name: /place F stage 1 microbatch 0/i }));
    await user.click(screen.getByRole('button', { name: /place B stage 1 microbatch 0/i }));
    await user.click(screen.getByRole('button', { name: /place B stage 0 microbatch 0/i }));

    const metrics = screen.getByRole('region', { name: /metrics panel/i });
    expect(within(metrics).getByText(/^Legal completion$/i)).toBeInTheDocument();
    expect(within(metrics).getByText(/^Mastered$/i)).toBeInTheDocument();

    unmount();
    render(<App />);

    expect(screen.getByText(/Progress restored\./i)).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /choose level/i })).toHaveValue('dependency-chain');
    expect(screen.getByRole('option', { name: 'Fill the Pipe' })).toBeEnabled();
  });

  it('shows a polite session-only notice when browser storage is unavailable in the default app path', () => {
    const localStorageGetter = vi.spyOn(window, 'localStorage', 'get');
    localStorageGetter.mockImplementation(() => {
      throw new Error('denied');
    });

    render(<App />);

    expect(
      screen.getByText(/Could not access saved progress\. Progress is staying in this tab only\./i),
    ).toBeInTheDocument();
  });
});
