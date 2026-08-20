// @vitest-environment node

import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('responsive shell CSS contract', () => {
  it('allows grid children to shrink and wraps the mobile hero controls', async () => {
    const css = await readFile(new URL('../src/styles/app.css', import.meta.url), 'utf8');

    expect(css).toMatch(/\.app-shell[\s\S]*?min-width:\s*0/);
    expect(css).toMatch(/\.content-grid[\s\S]*?min-width:\s*0/);
    expect(css).toMatch(/\.content-grid\s*>\s*\*[\s\S]*?min-width:\s*0/);
    expect(css).toMatch(
      /@media\s*\(max-width:\s*764px\)[\s\S]*?\.hero-panel__topline[\s\S]*?flex-wrap:\s*wrap/,
    );
  });
});
