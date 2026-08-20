// @vitest-environment node

import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('document title contract', () => {
  it('uses the prevailing product name in index.html', async () => {
    const indexHtml = await readFile(new URL('../index.html', import.meta.url), 'utf8');

    expect(indexHtml).toMatch(/<title>\s*Sensei Pipeline Scheduling\s*<\/title>/);
  });
});
