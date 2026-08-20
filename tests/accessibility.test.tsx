import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../src/app/App';
import { LEGAL_ACTIONS } from '../src/levels/fixtures';
import { STORAGE_KEY } from '../src/persistence/storage';

afterEach(() => {
  document.body.innerHTML = '';
});

async function focusAndPress(user: ReturnType<typeof userEvent.setup>, target: HTMLElement) {
  for (let index = 0; index < 150; index += 1) {
    if (document.activeElement === target) {
      await user.keyboard('{Enter}');
      return;
    }
    await user.tab();
  }

  throw new Error(`could not focus ${target.textContent ?? target.getAttribute('aria-label')}`);
}

function labelForAction(action: (typeof LEGAL_ACTIONS)['memory-wall'][number]): RegExp {
  if (action.type === 'wait') {
    return new RegExp(`wait one tick on rank ${action.rank}`, 'i');
  }

  const [kind, stage, microbatch] = action.operationId.split(':');
  return new RegExp(`place ${kind} stage ${stage} microbatch ${microbatch}`, 'i');
}

function createUnlockedStorage(): Storage {
  const values = new Map<string, string>();
  values.set(
    STORAGE_KEY,
    JSON.stringify({
      unlockedLevelIds: ['dependency-chain', 'fill-the-pipe', 'backward-is-heavier', 'memory-wall'],
      bestLegalAttempts: {},
      bestMasteredAttempts: {},
      historicalAttempts: [],
    }),
  );

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
  };
}

describe('accessibility', () => {
  it('has no serious or critical axe violations on memory wall and supports a keyboard-only journey across all levels', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <App storage={createUnlockedStorage()} initialLevelId="memory-wall" />,
    );

    await user.click(screen.getByRole('button', { name: /show ready operations/i }));
    await user.click(screen.getByRole('button', { name: /show local hint/i }));

    for (const action of LEGAL_ACTIONS['memory-wall']) {
      const control = screen.getByRole('button', { name: labelForAction(action) });
      await focusAndPress(user, control);
    }

    const results = await axe.run(container, {
      resultTypes: ['violations'],
    });

    const seriousOrCritical = results.violations.flatMap((violation) =>
      violation.nodes
        .filter((node) => node.impact === 'serious' || node.impact === 'critical')
        .map((node) => ({ id: violation.id, impact: node.impact })),
    );

    expect(seriousOrCritical).toEqual([]);
    expect(screen.getAllByText(/legal completion/i).length).toBeGreaterThan(0);
  }, 15000);
});
