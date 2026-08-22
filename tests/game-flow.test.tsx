import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../src/app/App';
import { replay } from '../src/engine/replay';
import { attemptRankingTuple } from '../src/engine/score';
import type { Action } from '../src/engine/types';
import { LEGAL_ACTIONS, MASTERED_ACTIONS } from '../src/levels/fixtures';
import { LEVEL_IDS, getLevel, type LevelId } from '../src/levels/levels';
import { STORAGE_KEY, deserializeProgress, type Progress } from '../src/persistence/storage';

afterEach(() => {
  cleanup();
  window.location.hash = '';
});

interface MemoryStorage extends Storage {
  snapshot(): string | null;
}

function createMemoryStorage(initial: string | null = null): MemoryStorage {
  const values = new Map<string, string>();
  if (initial !== null) {
    values.set(STORAGE_KEY, initial);
  }

  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    key(index: number) {
      return [...values.keys()][index] ?? null;
    },
    removeItem(key: string) {
      values.delete(key);
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
    snapshot() {
      return values.get(STORAGE_KEY) ?? null;
    },
  };
}

function createThrowingStorage(kind: 'get' | 'set'): Storage {
  const delegate = createMemoryStorage();
  return {
    get length() {
      return delegate.length;
    },
    clear: delegate.clear.bind(delegate),
    key: delegate.key.bind(delegate),
    removeItem: delegate.removeItem.bind(delegate),
    getItem(key: string) {
      if (kind === 'get') {
        throw new DOMException('denied', 'SecurityError');
      }
      return delegate.getItem(key);
    },
    setItem(key: string, value: string) {
      if (kind === 'set') {
        throw new DOMException('full', 'QuotaExceededError');
      }
      delegate.setItem(key, value);
    },
  };
}

function parseProgressFrom(storage: MemoryStorage): Progress {
  const raw = storage.snapshot();
  if (raw === null) {
    throw new Error('expected persisted progress');
  }
  const deserialized = deserializeProgress(raw, getLevel);
  if (!deserialized.ok) {
    throw new Error(`expected valid persisted progress, got ${deserialized.reason}`);
  }
  return deserialized.progress;
}

function bestAttempt(progress: Progress, levelId: LevelId) {
  return progress.bestMasteredAttempts[levelId] ?? progress.bestLegalAttempts[levelId];
}

function createProgressStorageThrough(levelId: LevelId): MemoryStorage {
  const storage = createMemoryStorage();
  const unlocked = LEVEL_IDS.slice(0, LEVEL_IDS.indexOf(levelId) + 1);
  storage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      unlockedLevelIds: unlocked,
      bestLegalAttempts: {},
      bestMasteredAttempts: {},
      historicalAttempts: [],
    }),
  );
  return storage;
}

function attemptSummary(levelId: LevelId, actions: readonly Action[]) {
  const result = replay(getLevel(levelId), actions);
  if (!result.ok) {
    throw new Error(`fixture replay failed for ${levelId} at ${result.index}`);
  }

  return {
    score: attemptRankingTuple(result.state),
    complete: result.state.placements.length === result.state.operations.length,
  };
}

function labelForAction(action: Action): RegExp {
  if (action.type === 'wait') {
    return new RegExp(`wait one tick on rank ${action.rank}`, 'i');
  }

  const [kind, stage, microbatch] = action.operationId.split(':');
  return new RegExp(`place ${kind} stage ${stage} microbatch ${microbatch}`, 'i');
}

async function focusAndPress(user: ReturnType<typeof userEvent.setup>, target: HTMLElement) {
  target.focus();
  expect(document.activeElement).toBe(target);
  await user.keyboard('{Enter}');
}

async function runJourney(
  user: ReturnType<typeof userEvent.setup>,
  actions: readonly Action[],
  mode: 'pointer' | 'keyboard',
) {
  for (const action of actions) {
    const control = screen.getByRole('button', { name: labelForAction(action) });
    if (mode === 'pointer') {
      await user.click(control);
    } else {
      await focusAndPress(user, control);
    }
  }
}

describe('game flow', () => {
  it('names the recognized reference policy when a current-engine schedule completes', async () => {
    const user = userEvent.setup();

    render(<App initialLevelId="gpipe-afab" />);

    await runJourney(user, MASTERED_ACTIONS['gpipe-afab'], 'pointer');

    expect(screen.getByRole('status', { name: /interaction feedback/i })).toHaveTextContent(
      /Completed as GPipe AFAB reference\. Mastered\./i,
    );
  }, 10000);

  it('plays every legal and mastered fixture journey through public controls, unlocks by completion, and keeps the better persisted attempt', async () => {
    const user = userEvent.setup();
    const storage = createMemoryStorage();

    render(<App storage={storage} />);

    const levelPicker = screen.getByRole('combobox', { name: /choose level/i });
    expect(within(levelPicker).getByRole('option', { name: 'Dependency Chain' })).toBeEnabled();
    expect(
      screen.getByText(/complete dependency chain to unlock fill the pipe\./i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/complete fill the pipe to unlock backward is heavier\./i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/complete backward is heavier to unlock memory wall\./i),
    ).toBeInTheDocument();

    for (const levelId of LEVEL_IDS) {
      const level = getLevel(levelId);
      const levelTitle = level.title;
      const legal = LEGAL_ACTIONS[levelId];
      const mastered = MASTERED_ACTIONS[levelId];

      await user.selectOptions(levelPicker, levelId);
      expect(levelPicker).toHaveValue(levelId);
      expect(screen.getByRole('heading', { name: levelTitle })).toBeInTheDocument();

      await runJourney(user, legal, 'pointer');
      expect(screen.getAllByText(/legal completion/i).length).toBeGreaterThan(0);

      await waitFor(() => {
        expect(bestAttempt(parseProgressFrom(storage), levelId)?.tuple).toEqual(
          attemptSummary(levelId, legal).score,
        );
      });
      const legalProgress = parseProgressFrom(storage);
      expect(legalProgress.unlockedLevelIds).toContain(levelId);
      const nextLevelId = LEVEL_IDS[LEVEL_IDS.indexOf(levelId) + 1];
      if (nextLevelId !== undefined) {
        expect(legalProgress.unlockedLevelIds).toContain(nextLevelId);
      }

      const legalSummary = attemptSummary(levelId, legal);
      expect(bestAttempt(legalProgress, levelId)?.tuple).toEqual(legalSummary.score);
      expect(bestAttempt(legalProgress, levelId)?.actions).toEqual(legal);

      await user.click(screen.getByRole('button', { name: /reset current attempt/i }));
      await runJourney(user, mastered, 'keyboard');
      expect(screen.getAllByText(/mastered/i).length).toBeGreaterThan(0);

      const masteredSummary = attemptSummary(levelId, mastered);
      await waitFor(() => {
        expect(bestAttempt(parseProgressFrom(storage), levelId)?.tuple).toEqual(
          masteredSummary.score,
        );
      });
      const masteredProgress = parseProgressFrom(storage);
      expect(bestAttempt(masteredProgress, levelId)?.tuple).toEqual(masteredSummary.score);
      expect(bestAttempt(masteredProgress, levelId)?.actions).toEqual(mastered);
      expect(bestAttempt(masteredProgress, levelId)?.outcome).toBe('mastered');

      await user.click(screen.getByRole('button', { name: /reset current attempt/i }));
      await runJourney(user, legal, 'pointer');

      const afterWorseRetry = parseProgressFrom(storage);
      expect(bestAttempt(afterWorseRetry, levelId)?.tuple).toEqual(masteredSummary.score);
      expect(bestAttempt(afterWorseRetry, levelId)?.actions).toEqual(mastered);
    }
  }, 40000);

  it('restores persisted progress across reload, preserves session progress when storage is unavailable, and surfaces polite fallback notices', async () => {
    const firstUser = userEvent.setup();
    const reloadStorage = createMemoryStorage();
    const completedLevel = getLevel('dependency-chain').title;

    const firstView = render(<App storage={reloadStorage} />);
    await runJourney(firstUser, LEGAL_ACTIONS['dependency-chain'], 'pointer');
    expect(screen.getAllByText(/legal completion/i).length).toBeGreaterThan(0);
    firstView.unmount();

    const secondUser = userEvent.setup();
    render(<App storage={reloadStorage} />);
    const pickerAfterReload = screen.getByRole('combobox', { name: /choose level/i });
    await secondUser.selectOptions(pickerAfterReload, 'fill-the-pipe');
    expect(pickerAfterReload).toHaveValue('fill-the-pipe');
    expect(
      screen.getByRole('heading', { name: getLevel('fill-the-pipe').title }),
    ).toBeInTheDocument();
    expect(screen.getByText(/progress restored/i)).toBeInTheDocument();
    expect(
      screen.getByText(/complete fill the pipe to unlock backward is heavier/i),
    ).toBeInTheDocument();

    cleanup();

    const loadOnlyUser = userEvent.setup();
    render(<App storage={createThrowingStorage('get')} initialLevelId="dependency-chain" />);
    expect(screen.getByText(/progress is staying in this tab only/i)).toBeInTheDocument();
    await runJourney(loadOnlyUser, LEGAL_ACTIONS['dependency-chain'], 'pointer');
    expect(screen.getAllByText(/legal completion/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/could not access saved progress/i)).toBeInTheDocument();

    cleanup();

    const saveOnlyUser = userEvent.setup();
    render(<App storage={createThrowingStorage('set')} initialLevelId="dependency-chain" />);
    await runJourney(saveOnlyUser, LEGAL_ACTIONS['dependency-chain'], 'pointer');
    expect(screen.getByText(/progress is staying in this tab only/i)).toBeInTheDocument();
    expect(screen.getByText(/could not save progress/i)).toBeInTheDocument();
    expect(screen.getByDisplayValue(completedLevel)).toBeInTheDocument();
  });

  it('matches coaching availability to the level ladder and formats representative stop reasons through the live region', async () => {
    const user = userEvent.setup();
    const dependencyView = render(
      <App
        storage={createProgressStorageThrough('dependency-chain')}
        initialLevelId="dependency-chain"
      />,
    );

    expect(screen.getByRole('button', { name: /show ready operations/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /show local hint/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /run until interesting boundary/i })).toBeDisabled();
    expect(screen.getByText(/ready set is unavailable on dependency chain/i)).toBeInTheDocument();
    dependencyView.unmount();

    const fillView = render(
      <App
        storage={createProgressStorageThrough('fill-the-pipe')}
        initialLevelId="fill-the-pipe"
      />,
    );
    expect(screen.getByRole('button', { name: /show ready operations/i })).toBeDisabled();
    expect(
      screen.getByText(/ready set unlocks after completing Fill the Pipe once/i),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /show local hint/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /run until interesting boundary/i })).toBeDisabled();
    fillView.unmount();

    const backwardView = render(
      <App
        storage={createProgressStorageThrough('backward-is-heavier')}
        initialLevelId="backward-is-heavier"
      />,
    );
    expect(screen.getByRole('button', { name: /show ready operations/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /show local hint/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /run until interesting boundary/i })).toBeDisabled();
    backwardView.unmount();

    render(
      <App storage={createProgressStorageThrough('memory-wall')} initialLevelId="memory-wall" />,
    );
    expect(screen.getByRole('button', { name: /show ready operations/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /show local hint/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /run until interesting boundary/i })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: /show ready operations/i }));
    expect(screen.getByRole('status', { name: /interaction feedback/i })).toHaveTextContent(
      /ready set:/i,
    );

    await user.click(screen.getByRole('button', { name: /show local hint/i }));
    expect(screen.getByRole('status', { name: /interaction feedback/i })).toHaveTextContent(
      /local hint: place/i,
    );

    await user.click(screen.getByRole('button', { name: /run until interesting boundary/i }));
    expect(screen.getByRole('status', { name: /interaction feedback/i })).toHaveTextContent(
      /(choice|dependency gap|memory boundary|would complete|deadlock|memory deadlock)/i,
    );
  });

  it('treats automation as one undoable batch, keeps ordinary actions as single-item batches, and truncates redo after a new action', async () => {
    const user = userEvent.setup();
    render(
      <App storage={createProgressStorageThrough('memory-wall')} initialLevelId="memory-wall" />,
    );

    for (const name of [
      /place F stage 0 microbatch 0/i,
      /place F stage 0 microbatch 1/i,
      /place F stage 0 microbatch 2/i,
      /place F stage 1 microbatch 0/i,
      /place F stage 1 microbatch 1/i,
      /place F stage 2 microbatch 0/i,
      /place B stage 2 microbatch 0/i,
      /place B stage 1 microbatch 0/i,
      /place B stage 0 microbatch 0/i,
    ]) {
      await user.click(screen.getByRole('button', { name }));
    }

    await user.click(screen.getByRole('button', { name: /run until interesting boundary/i }));
    const tupleAfterAutomation =
      screen.getByText(/current attempt tuple/i).nextElementSibling?.textContent;
    expect(tupleAfterAutomation).not.toBe('0 -> 0 -> 0 -> 0');

    await user.click(screen.getByRole('button', { name: /undo last action/i }));
    expect(screen.getByRole('status', { name: /interaction feedback/i })).toHaveTextContent(
      /undid 1 batch/i,
    );
    expect(screen.getByText(/current attempt tuple/i).nextElementSibling).toHaveTextContent(
      /^9 -> 3 -> 0 -> 9$/,
    );

    await user.click(screen.getByRole('button', { name: /redo next action/i }));
    expect(screen.getByRole('status', { name: /interaction feedback/i })).toHaveTextContent(
      /redid 1 batch/i,
    );

    await user.click(screen.getByRole('button', { name: /wait one tick on rank 0/i }));
    await user.click(screen.getByRole('button', { name: /undo last action/i }));
    expect(screen.getByRole('status', { name: /interaction feedback/i })).toHaveTextContent(
      /undid 1 action/i,
    );

    await user.click(screen.getByRole('button', { name: /undo last action/i }));
    await user.click(screen.getByRole('button', { name: /place F stage 2 microbatch 1/i }));
    expect(screen.getByRole('button', { name: /redo next action/i })).toBeDisabled();
  });

  it('persists identical canonical logs for pointer and keyboard journeys', async () => {
    const pointerStorage = createMemoryStorage();
    const keyboardStorage = createMemoryStorage();

    const pointerUser = userEvent.setup();
    const pointerView = render(<App storage={pointerStorage} initialLevelId="dependency-chain" />);
    await runJourney(pointerUser, MASTERED_ACTIONS['dependency-chain'], 'pointer');
    pointerView.unmount();

    const keyboardUser = userEvent.setup();
    render(<App storage={keyboardStorage} initialLevelId="dependency-chain" />);
    await runJourney(keyboardUser, MASTERED_ACTIONS['dependency-chain'], 'keyboard');

    const pointerProgress = parseProgressFrom(pointerStorage);
    const keyboardProgress = parseProgressFrom(keyboardStorage);
    expect(bestAttempt(pointerProgress, 'dependency-chain')?.actions).toEqual(
      bestAttempt(keyboardProgress, 'dependency-chain')?.actions,
    );
  });
});
