// @vitest-environment node

import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('document metadata contract', () => {
  it('uses the prevailing product metadata in index.html', async () => {
    const indexHtml = await readFile(new URL('../index.html', import.meta.url), 'utf8');

    expect(indexHtml).toMatch(/<title>\s*Sensei Pipeline Scheduling\s*<\/title>/);
    expect(indexHtml).toMatch(/<meta name="application-name" content="Sensei" \/>/);
    expect(indexHtml).toMatch(/<meta name="color-scheme" content="light dark" \/>/);
    expect(indexHtml).toMatch(/<link rel="manifest" href="\/manifest.webmanifest" \/>/);
    expect(indexHtml).toMatch(
      /<link rel="icon" type="image\/svg\+xml" href="\/icons\/icon.svg" \/>/,
    );
  });

  it('defines the install manifest served with the production build', async () => {
    const manifestSource = await readFile(
      new URL('../public/manifest.webmanifest', import.meta.url),
      'utf8',
    );
    const manifest = JSON.parse(manifestSource);

    expect(manifest).toMatchObject({
      name: 'Sensei Pipeline Scheduling',
      short_name: 'Sensei',
      description: 'An offline-capable pipeline scheduling game.',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      background_color: '#11191b',
      theme_color: '#11191b',
    });
    expect(manifest.icons).toContainEqual({
      src: '/icons/icon.svg',
      sizes: 'any',
      type: 'image/svg+xml',
      purpose: 'any maskable',
    });
  });
});
