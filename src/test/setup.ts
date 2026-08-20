import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';

afterEach(() => {
  try {
    window.localStorage.clear();
  } catch {
    // Some tests deliberately simulate an unavailable browser storage surface.
  }
});
