import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { ErrorBoundary } from './app/ErrorBoundary';
import {
  registerOfflineSupport,
  scheduleOfflineRegistration,
  type OfflineStatus,
} from './offline/register';
import './styles/app.css';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root container #root not found');
}

const root = createRoot(container);
root.render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);

if (import.meta.env.PROD) {
  scheduleOfflineRegistration({
    register: async () => {
      const result = await registerOfflineSupport();
      if (result.status === 'ready') {
        return result;
      }

      root.render(
        <StrictMode>
          <ErrorBoundary>
            <App offlineStatus={result.status satisfies OfflineStatus} />
          </ErrorBoundary>
        </StrictMode>,
      );
      return result;
    },
  });
}
