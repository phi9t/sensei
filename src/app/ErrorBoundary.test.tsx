import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from './ErrorBoundary';

function BrokenChild(): ReactElement {
  throw new Error('render failed');
}

describe('ErrorBoundary', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders a recoverable shell when a child crashes', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <BrokenChild />
      </ErrorBoundary>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(/The game shell hit an error/i);
    expect(screen.getByText(/Reset the page to start a fresh attempt/i)).toBeInTheDocument();
  });
});
