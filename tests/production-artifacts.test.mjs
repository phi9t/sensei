// @vitest-environment node

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { verifyProductionArtifacts } from '../scripts/verify-production-artifacts.mjs';

const INDEX_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#11191b" />
    <meta name="application-name" content="Sensei" />
    <meta name="color-scheme" content="light dark" />
    <title>Sensei Pipeline Scheduling</title>
    <meta name="description" content="An offline-capable pipeline scheduling game." />
    <link rel="manifest" href="/manifest.webmanifest" />
    <link rel="icon" type="image/svg+xml" href="/icons/icon.svg" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/assets/app.js"></script>
  </body>
</html>
`;

const MANIFEST = {
  name: 'Sensei Pipeline Scheduling',
  short_name: 'Sensei',
  description: 'An offline-capable pipeline scheduling game.',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  background_color: '#11191b',
  theme_color: '#11191b',
  icons: [
    {
      src: '/icons/icon.svg',
      sizes: 'any',
      type: 'image/svg+xml',
      purpose: 'any maskable',
    },
  ],
};

const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" role="img" aria-labelledby="title">
  <title>Sensei</title>
  <rect width="128" height="128" rx="24" fill="#11191b" />
  <path d="M28 82h72" stroke="#f5c451" stroke-width="10" stroke-linecap="round" />
</svg>
`;

const HEADERS = `/*
  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; manifest-src 'self'; worker-src 'self'; base-uri 'none'; form-action 'none'; object-src 'none'; frame-ancestors 'none'; upgrade-insecure-requests
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), fullscreen=(self)

/assets/*
  Cache-Control: public, max-age=31536000, immutable

/sw.js
  Cache-Control: no-cache

/manifest.webmanifest
  Cache-Control: public, max-age=3600

/icons/*
  Cache-Control: public, max-age=31536000, immutable
`;

const SERVICE_WORKER = `const CACHE_NAME = "sensei-shell-abc123";
const SHELL_MANIFEST = [
  "/",
  "/index.html",
  "/assets/app.css",
  "/assets/app.js"
];
`;

async function writeDistFixture({ headers = HEADERS } = {}) {
  const rootDir = await mkdtemp(join(tmpdir(), 'sensei-production-artifacts-'));
  const distDir = join(rootDir, 'dist');
  await mkdir(join(distDir, 'icons'), { recursive: true });

  await Promise.all([
    writeFile(join(distDir, 'index.html'), INDEX_HTML),
    writeFile(join(distDir, 'manifest.webmanifest'), `${JSON.stringify(MANIFEST, null, 2)}\n`),
    writeFile(join(distDir, 'icons', 'icon.svg'), ICON_SVG),
    writeFile(join(distDir, '_headers'), headers),
    writeFile(join(distDir, 'sw.js'), SERVICE_WORKER),
  ]);

  return { rootDir, distDir };
}

describe('production artifact verifier', () => {
  it('accepts a complete static build contract', async () => {
    const fixture = await writeDistFixture();
    try {
      await expect(verifyProductionArtifacts({ distDir: fixture.distDir })).resolves.toEqual({
        ok: true,
        checked: ['/index.html', '/manifest.webmanifest', '/icons/icon.svg', '/_headers', '/sw.js'],
      });
    } finally {
      await rm(fixture.rootDir, { recursive: true, force: true });
    }
  });

  it('rejects headers that omit the content security policy', async () => {
    const fixture = await writeDistFixture({
      headers: `/*
  X-Content-Type-Options: nosniff
`,
    });
    try {
      await expect(verifyProductionArtifacts({ distDir: fixture.distDir })).rejects.toThrow(
        /Content-Security-Policy/,
      );
    } finally {
      await rm(fixture.rootDir, { recursive: true, force: true });
    }
  });
});
