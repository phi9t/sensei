import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const CACHE_PREFIX = 'sensei-shell-';
const DIGEST_LENGTH = 16;
const DIST_DIR = resolve(fileURLToPath(new URL('../dist/', import.meta.url)));

async function readAssetFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const absolutePath = join(directory, entry.name);
      if (entry.isDirectory()) {
        return readAssetFiles(absolutePath);
      }
      return [absolutePath];
    }),
  );

  return files.flat();
}

function toAssetPath(assetsDir, assetPath) {
  return `/${relative(assetsDir, assetPath).split(sep).join('/')}`;
}

function toManifestPath(assetsDir, assetPath) {
  return `/assets${toAssetPath(assetsDir, assetPath)}`;
}

function hashManifest(entries) {
  const digest = createHash('sha256');
  for (const entry of entries) {
    digest.update(entry.path);
    digest.update('\0');
    digest.update(entry.content);
    digest.update('\0');
  }
  return digest.digest('hex').slice(0, DIGEST_LENGTH);
}

function renderServiceWorker({ cacheName, shellManifest, staticAssets }) {
  return `const CACHE_NAME = ${JSON.stringify(cacheName)};
const SHELL_MANIFEST = ${JSON.stringify(shellManifest, null, 2)};
const STATIC_ASSET_MANIFEST = new Set(${JSON.stringify(staticAssets, null, 2)});

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(SHELL_MANIFEST);
      self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();
      if (!cacheNames.includes(CACHE_NAME)) {
        return;
      }

      await Promise.all(
        cacheNames
          .filter((cacheName) => cacheName.startsWith(${JSON.stringify(CACHE_PREFIX)}))
          .filter((cacheName) => cacheName !== CACHE_NAME)
          .map((cacheName) => caches.delete(cacheName)),
      );

      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') {
    return;
  }

  const requestUrl = new URL(request.url);
  if (requestUrl.origin !== self.location.origin) {
    return;
  }

  if (STATIC_ASSET_MANIFEST.has(requestUrl.pathname)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const cachedResponse = await cache.match(requestUrl.pathname);
        if (cachedResponse) {
          return cachedResponse;
        }

        const networkResponse = await fetch(request);
        if (networkResponse.ok) {
          await cache.put(requestUrl.pathname, networkResponse.clone());
        }
        return networkResponse;
      })(),
    );
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        try {
          const networkResponse = await fetch(request);
          if (networkResponse.ok) {
            await cache.put('/index.html', networkResponse.clone());
          }
          return networkResponse;
        } catch {
          const fallback = await cache.match('/index.html');
          if (fallback) {
            return fallback;
          }
          throw new Error('Navigation request failed and /index.html is not cached.');
        }
      })(),
    );
  }
});
`;
}

export async function generateServiceWorker({ distDir = DIST_DIR } = {}) {
  const resolvedDistDir = resolve(distDir);
  const indexHtmlPath = join(resolvedDistDir, 'index.html');
  const assetsDir = join(resolvedDistDir, 'assets');
  const indexHtmlContent = await readFile(indexHtmlPath);
  const assetPaths = await readAssetFiles(assetsDir);

  const emittedAssets = (
    await Promise.all(
      assetPaths.map(async (assetPath) => ({
        path: toManifestPath(assetsDir, assetPath),
        content: await readFile(assetPath),
      })),
    )
  )
    .filter((asset) => asset.path.endsWith('.js') || asset.path.endsWith('.css'))
    .sort((left, right) => left.path.localeCompare(right.path));

  const shellEntries = [
    { path: '/', content: indexHtmlContent },
    { path: '/index.html', content: indexHtmlContent },
    ...emittedAssets,
  ];
  const cacheName = `${CACHE_PREFIX}${hashManifest(shellEntries)}`;
  const serviceWorker = renderServiceWorker({
    cacheName,
    shellManifest: shellEntries.map((entry) => entry.path),
    staticAssets: emittedAssets.map((entry) => entry.path),
  });
  const serviceWorkerPath = join(resolvedDistDir, 'sw.js');

  await writeFile(serviceWorkerPath, serviceWorker);

  return {
    cacheName,
    manifest: shellEntries.map((entry) => entry.path),
    serviceWorkerPath,
  };
}

const entrypoint = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (entrypoint === import.meta.url) {
  generateServiceWorker().catch((error) => {
    const label = basename(process.argv[1] ?? 'generate-service-worker.mjs');
    console.error(`${label}:`, error);
    process.exitCode = 1;
  });
}
