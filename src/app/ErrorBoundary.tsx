import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  readonly children: ReactNode;
}

interface ErrorBoundaryState {
  readonly error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Sensei render error', error, info.componentStack);
  }

  override render() {
    if (this.state.error) {
      return (
        <main className="app-shell">
          <section className="panel error-panel" role="alert" aria-labelledby="error-heading">
            <h1 id="error-heading">Sensei Pipeline Scheduling</h1>
            <h2>The game shell hit an error.</h2>
            <p>Reset the page to start a fresh attempt.</p>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}
