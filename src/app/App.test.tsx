import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { MASTERED_ACTIONS } from '../levels/fixtures';
import { encodeAttempt } from '../persistence/storage';

function createMemoryStorage(seed: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(seed));

  return {
    get length() {
      return data.size;
    },
    clear() {
      data.clear();
    },
    getItem(key) {
      return data.get(key) ?? null;
    },
    key(index) {
      return [...data.keys()][index] ?? null;
    },
    removeItem(key) {
      data.delete(key);
    },
    setItem(key, value) {
      data.set(key, value);
    },
  };
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  window.location.hash = '';
});

describe('App', () => {
  it('announces Sensei as a pipeline scheduling game', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /^sensei$/i })).toBeInTheDocument();
    expect(screen.getByText(/pipeline scheduling/i)).toBeInTheDocument();
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
    try {
      localStorageGetter.mockImplementation(() => {
        throw new Error('denied');
      });

      render(<App />);

      expect(
        screen.getByText(
          /Could not access saved progress\. Progress is staying in this tab only\./i,
        ),
      ).toBeInTheDocument();
    } finally {
      localStorageGetter.mockRestore();
    }
  });

  it('loads shared URL attempts even when persistent storage is unavailable', () => {
    window.location.hash = `#attempt=${encodeAttempt({
      schemaVersion: 1,
      levelId: 'dependency-chain',
      levelVersion: 1,
      actions: MASTERED_ACTIONS['dependency-chain'],
    })}`;

    render(<App storage={null} />);

    const metrics = screen.getByRole('region', { name: /metrics panel/i });
    expect(within(metrics).getByText(/^Legal completion$/i)).toBeInTheDocument();
    expect(within(metrics).getByText(/^Mastered$/i)).toBeInTheDocument();
    expect(screen.getByRole('status', { name: /interaction feedback/i })).toHaveTextContent(
      /Loaded Dependency Chain from a shared attempt/i,
    );
  });

  it('surfaces malformed shared URL recovery in the default app path', () => {
    window.location.hash = '#attempt=%ZZ';

    render(<App storage={createMemoryStorage()} />);

    expect(screen.getByRole('status', { name: /saved progress notice/i })).toHaveTextContent(
      /Shared attempt could not be read: malformed-uri/i,
    );
  });

  it('gives ready set, hint, and automation controls their explanatory descriptions', () => {
    render(<App initialLevelId="memory-wall" />);

    const controls = screen.getByRole('region', { name: /schedule command rail/i });
    expect(
      within(controls).getByRole('button', { name: /show ready operations/i }),
    ).toHaveAccessibleDescription(/Ready set is available on Memory Wall\./i);
    expect(
      within(controls).getByRole('button', { name: /show local hint/i }),
    ).toHaveAccessibleDescription(/Local hint is available on Memory Wall\./i);
    expect(
      within(controls).getByRole('button', { name: /run until interesting boundary/i }),
    ).toHaveAccessibleDescription(/Automation is available on Memory Wall\./i);
  });

  it('announces persistence notices through a polite status region', async () => {
    const user = userEvent.setup();
    const storage = createMemoryStorage();
    const setItem = vi.spyOn(storage, 'setItem').mockImplementation(() => {
      throw new Error('disk full');
    });

    render(<App storage={storage} />);

    await user.click(screen.getByRole('button', { name: /place F stage 0 microbatch 0/i }));
    await user.click(screen.getByRole('button', { name: /place F stage 1 microbatch 0/i }));
    await user.click(screen.getByRole('button', { name: /place B stage 1 microbatch 0/i }));
    await user.click(screen.getByRole('button', { name: /place B stage 0 microbatch 0/i }));

    const status = screen.getByRole('status', {
      name: /saved progress notice/i,
    });
    expect(status).toHaveTextContent(
      /Could not save progress\. Progress is staying in this tab only\./i,
    );
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(screen.getAllByRole('status')).toHaveLength(2);

    setItem.mockRestore();
  });

  it('clears a stale persistence notice after a later successful save', async () => {
    const user = userEvent.setup();
    const storage = createMemoryStorage();
    const setItem = vi.spyOn(storage, 'setItem');
    setItem.mockImplementationOnce(() => {
      throw new Error('disk full');
    });

    render(<App storage={storage} />);

    await user.click(screen.getByRole('button', { name: /place F stage 0 microbatch 0/i }));
    await user.click(screen.getByRole('button', { name: /place F stage 1 microbatch 0/i }));
    await user.click(screen.getByRole('button', { name: /place B stage 1 microbatch 0/i }));
    await user.click(screen.getByRole('button', { name: /place B stage 0 microbatch 0/i }));

    expect(screen.getByRole('status', { name: /saved progress notice/i })).toHaveTextContent(
      /Could not save progress\. Progress is staying in this tab only\./i,
    );

    const controls = screen.getByRole('region', { name: /schedule command rail/i });
    await user.click(within(controls).getByRole('button', { name: /reset current attempt/i }));
    await user.click(screen.getByRole('button', { name: /place F stage 0 microbatch 0/i }));
    await user.click(screen.getByRole('button', { name: /place F stage 1 microbatch 0/i }));
    await user.click(screen.getByRole('button', { name: /place B stage 1 microbatch 0/i }));
    await user.click(screen.getByRole('button', { name: /place B stage 0 microbatch 0/i }));

    expect(
      screen.queryByRole('status', { name: /saved progress notice/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Could not save progress\. Progress is staying in this tab only\./i),
    ).not.toBeInTheDocument();
  });

  it('can access localStorage normally after the denied-storage test', () => {
    window.localStorage.setItem('sensei-smoke', 'ok');
    expect(window.localStorage.getItem('sensei-smoke')).toBe('ok');
  });
});
