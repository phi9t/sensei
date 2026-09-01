import { readFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DIST_DIR = resolve(fileURLToPath(new URL('../dist/', import.meta.url)));
const CHECKED_FILES = [
  '/index.html',
  '/manifest.webmanifest',
  '/icons/icon.svg',
  '/_headers',
  '/sw.js',
];

const EXPECTED_MANIFEST = {
  name: 'Sensei Pipeline Scheduling',
  short_name: 'Sensei',
  description: 'An offline-capable pipeline scheduling game.',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  background_color: '#11191b',
  theme_color: '#11191b',
};

const EXPECTED_ICON = {
  src: '/icons/icon.svg',
  sizes: 'any',
  type: 'image/svg+xml',
  purpose: 'any maskable',
};

const REQUIRED_HEADER_TOKENS = [
  'Content-Security-Policy:',
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "manifest-src 'self'",
  "worker-src 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  'X-Content-Type-Options: nosniff',
  'Referrer-Policy: strict-origin-when-cross-origin',
  'Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), fullscreen=(self)',
  '/assets/*',
  'Cache-Control: public, max-age=31536000, immutable',
  '/sw.js',
  'Cache-Control: no-cache',
  '/manifest.webmanifest',
  'Cache-Control: public, max-age=3600',
  '/icons/*',
];

function assertContains(source, token, fileLabel) {
  if (!source.includes(token)) {
    throw new Error(`${fileLabel} is missing ${token}`);
  }
}

function assertNotContains(source, token, fileLabel) {
  if (source.includes(token)) {
    throw new Error(`${fileLabel} must not contain ${token}`);
  }
}

function assertManifest(manifest) {
  for (const [key, expected] of Object.entries(EXPECTED_MANIFEST)) {
    if (manifest[key] !== expected) {
      throw new Error(`manifest.webmanifest field ${key} must be ${JSON.stringify(expected)}`);
    }
  }

  if (!Array.isArray(manifest.icons)) {
    throw new Error('manifest.webmanifest icons must be an array');
  }

  const hasExpectedIcon = manifest.icons.some(
    (icon) =>
      icon.src === EXPECTED_ICON.src &&
      icon.sizes === EXPECTED_ICON.sizes &&
      icon.type === EXPECTED_ICON.type &&
      icon.purpose === EXPECTED_ICON.purpose,
  );
  if (!hasExpectedIcon) {
    throw new Error('manifest.webmanifest is missing the /icons/icon.svg install icon');
  }
}

function assertHtmlMetadata(indexHtml) {
  for (const token of [
    '<title>Sensei Pipeline Scheduling</title>',
    '<meta name="theme-color" content="#11191b" />',
    '<meta name="application-name" content="Sensei" />',
    '<meta name="color-scheme" content="light dark" />',
    '<meta name="description" content="An offline-capable pipeline scheduling game." />',
    '<link rel="manifest" href="/manifest.webmanifest" />',
    '<link rel="icon" type="image/svg+xml" href="/icons/icon.svg" />',
  ]) {
    assertContains(indexHtml, token, 'index.html');
  }
}

function assertHeaders(headers) {
  for (const token of REQUIRED_HEADER_TOKENS) {
    assertContains(headers, token, '_headers');
  }
}

function assertServiceWorker(serviceWorker) {
  assertContains(serviceWorker, 'sensei-shell-', 'sw.js');
  assertContains(serviceWorker, '"/"', 'sw.js');
  assertContains(serviceWorker, '"/index.html"', 'sw.js');
  assertNotContains(serviceWorker, '_headers', 'sw.js');
  assertNotContains(serviceWorker, 'manifest.webmanifest', 'sw.js');
  assertNotContains(serviceWorker, 'icon.svg', 'sw.js');
}

function assertIcon(iconSvg) {
  assertContains(iconSvg, '<svg', 'icons/icon.svg');
  assertContains(iconSvg, '</svg>', 'icons/icon.svg');
  assertNotContains(iconSvg.toLowerCase(), '<script', 'icons/icon.svg');
}

export async function verifyProductionArtifacts({ distDir = DIST_DIR } = {}) {
  const resolvedDistDir = resolve(distDir);
  const [indexHtml, manifestSource, iconSvg, headers, serviceWorker] = await Promise.all([
    readFile(join(resolvedDistDir, 'index.html'), 'utf8'),
    readFile(join(resolvedDistDir, 'manifest.webmanifest'), 'utf8'),
    readFile(join(resolvedDistDir, 'icons', 'icon.svg'), 'utf8'),
    readFile(join(resolvedDistDir, '_headers'), 'utf8'),
    readFile(join(resolvedDistDir, 'sw.js'), 'utf8'),
  ]);

  assertHtmlMetadata(indexHtml);
  assertManifest(JSON.parse(manifestSource));
  assertIcon(iconSvg);
  assertHeaders(headers);
  assertServiceWorker(serviceWorker);

  return {
    ok: true,
    checked: CHECKED_FILES,
  };
}

const entrypoint = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (entrypoint === import.meta.url) {
  verifyProductionArtifacts()
    .then((result) => {
      console.log(`Verified production artifacts: ${result.checked.join(', ')}`);
    })
    .catch((error) => {
      const label = basename(process.argv[1] ?? 'verify-production-artifacts.mjs');
      console.error(`${label}:`, error);
      process.exitCode = 1;
    });
}
