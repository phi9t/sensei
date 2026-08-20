import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
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
});
