// @vitest-environment node

import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/app/App';
import { generateServiceWorker } from '../scripts/generate-service-worker.mjs';
import { registerOfflineSupport } from '../src/offline/register';

afterEach(async () => {
  vi.restoreAllMocks();
});

function createTempDirFixture() {
  return mkdtemp(join(tmpdir(), 'sensei-offline-'));
}

async function writeDistFixture(rootDir) {
  const distDir = join(rootDir, 'dist');
  const assetsDir = join(distDir, 'assets');
  await mkdir(assetsDir, { recursive: true });

  const indexHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Sensei</title>
    <link rel="stylesheet" crossorigin href="/assets/app-abc123.css" />
    <script type="module" crossorigin src="/assets/app-abc123.js"></script>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>
`;
  const jsAsset = `console.log('sensei app');\n`;
  const cssAsset = `.app-shell { color: rgb(12, 34, 56); }\n`;
  const ignoredAsset = `{"ignored":true}\n`;

  await Promise.all([
    writeFile(join(distDir, 'index.html'), indexHtml),
    writeFile(join(assetsDir, 'app-abc123.js'), jsAsset),
    writeFile(join(assetsDir, 'app-abc123.css'), cssAsset),
    writeFile(join(assetsDir, 'manifest.json'), ignoredAsset),
  ]);

  return {
    distDir,
    files: {
      indexHtml,
      jsAsset,
      cssAsset,
    },
    manifest: ['/', '/index.html', '/assets/app-abc123.css', '/assets/app-abc123.js'],
  };
}

function expectedDigest({ indexHtml, jsAsset, cssAsset }) {
  const hash = createHash('sha256');
  for (const [pathname, content] of [
    ['/', indexHtml],
    ['/index.html', indexHtml],
    ['/assets/app-abc123.css', cssAsset],
    ['/assets/app-abc123.js', jsAsset],
  ]) {
    hash.update(pathname);
    hash.update('\0');
    hash.update(content);
    hash.update('\0');
  }
  return hash.digest('hex').slice(0, 16);
}

function normalizeCacheKey(input) {
  if (typeof input === 'string') {
    return input;
  }

  if (input instanceof URL) {
    return input.pathname;
  }

  if (typeof input?.url === 'string') {
    return new URL(input.url).pathname;
  }

  throw new Error(`Unsupported cache key: ${String(input)}`);
}

class FakeCache {
  constructor(name, buckets, addAllCalls, failAddAllFor) {
    this.name = name;
    this.buckets = buckets;
    this.addAllCalls = addAllCalls;
    this.failAddAllFor = failAddAllFor;
  }

  async addAll(requests) {
    const manifest = requests.map((request) => normalizeCacheKey(request));
    this.addAllCalls.push({
      cacheName: this.name,
      manifest,
    });
    if (this.failAddAllFor === this.name) {
      throw new Error(`Failed to precache ${this.name}`);
    }
  }

  async match(request) {
    return this.buckets.get(this.name)?.get(normalizeCacheKey(request));
  }

  async put(request, response) {
    const bucket = this.buckets.get(this.name);
    if (!bucket) {
      throw new Error(`Missing cache bucket for ${this.name}`);
    }
    bucket.set(normalizeCacheKey(request), response.clone());
  }
}

function createServiceWorkerHarness(source, { initialCaches = {}, fetchImpl, failAddAllFor } = {}) {
  const listeners = new Map();
  const buckets = new Map(
    Object.entries(initialCaches).map(([cacheName, entries]) => [
      cacheName,
      new Map(Object.entries(entries).map(([path, body]) => [path, new Response(body)])),
    ]),
  );
  const addAllCalls = [];
  const deleteCalls = [];
  let skipWaitingCalls = 0;
  let claimCalls = 0;

  const caches = {
    async open(cacheName) {
      if (!buckets.has(cacheName)) {
        buckets.set(cacheName, new Map());
      }
      return new FakeCache(cacheName, buckets, addAllCalls, failAddAllFor);
    },
    async keys() {
      return [...buckets.keys()];
    },
    async delete(cacheName) {
      deleteCalls.push(cacheName);
      return buckets.delete(cacheName);
    },
  };

  const self = {
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    skipWaiting() {
      skipWaitingCalls += 1;
    },
    clients: {
      claim() {
        claimCalls += 1;
      },
    },
    location: new URL('https://example.test/'),
  };

  vm.runInNewContext(source, {
    self,
    caches,
    fetch: fetchImpl ?? vi.fn(),
    URL,
    Response,
    Set,
    Promise,
    console,
  });

  async function dispatch(type, event) {
    const listener = listeners.get(type);
    if (!listener) {
      throw new Error(`Missing ${type} listener`);
    }

    const pending = [];
    const envelope = {
      ...event,
      waitUntil(promise) {
        pending.push(Promise.resolve(promise));
      },
    };
    listener(envelope);
    return Promise.allSettled(pending);
  }

  async function dispatchFetch(request) {
    const listener = listeners.get('fetch');
    if (!listener) {
      throw new Error('Missing fetch listener');
    }

    let responsePromise;
    listener({
      request,
      respondWith(promise) {
        responsePromise = Promise.resolve(promise);
      },
    });
    return responsePromise;
  }

  return {
    addAllCalls,
    buckets,
    deleteCalls,
    dispatch,
    dispatchFetch,
    get claimCalls() {
      return claimCalls;
    },
    get skipWaitingCalls() {
      return skipWaitingCalls;
    },
  };
}

describe('offline support', () => {
  it('writes a digest-named service worker that precaches the current shell manifest and installs atomically', async () => {
    const rootDir = await createTempDirFixture();
    try {
      const fixture = await writeDistFixture(rootDir);
      await generateServiceWorker({ distDir: fixture.distDir });
      const source = await readFile(join(fixture.distDir, 'sw.js'), 'utf8');

      expect(source).toContain(
        `const CACHE_NAME = "sensei-shell-${expectedDigest(fixture.files)}"`,
      );
      expect(source).toContain(`"/"`);
      expect(source).toContain(`"/index.html"`);
      expect(source).toContain(`"/assets/app-abc123.css"`);
      expect(source).toContain(`"/assets/app-abc123.js"`);
      expect(source).not.toContain('manifest.json');

      const harness = createServiceWorkerHarness(source);
      await harness.dispatch('install', {});

      expect(harness.addAllCalls).toEqual([
        {
          cacheName: `sensei-shell-${expectedDigest(fixture.files)}`,
          manifest: fixture.manifest,
        },
      ]);
      expect(harness.skipWaitingCalls).toBe(1);

      const cacheName = `sensei-shell-${expectedDigest(fixture.files)}`;
      const failureHarness = createServiceWorkerHarness(source, {
        initialCaches: {
          'sensei-shell-old': {
            '/index.html': 'stable shell',
          },
        },
        failAddAllFor: cacheName,
      });
      await expect(failureHarness.dispatch('install', {})).resolves.toEqual([
        expect.objectContaining({ status: 'rejected' }),
      ]);
      expect(await failureHarness.buckets.get('sensei-shell-old')?.get('/index.html')?.text()).toBe(
        'stable shell',
      );
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });

  it('deletes only older sensei-shell caches during activation, and only when the new cache exists', async () => {
    const rootDir = await createTempDirFixture();
    try {
      const fixture = await writeDistFixture(rootDir);
      await generateServiceWorker({ distDir: fixture.distDir });
      const source = await readFile(join(fixture.distDir, 'sw.js'), 'utf8');
      const cacheName = `sensei-shell-${expectedDigest(fixture.files)}`;

      const readyHarness = createServiceWorkerHarness(source, {
        initialCaches: {
          [cacheName]: {},
          'sensei-shell-old-a': {},
          'sensei-shell-old-b': {},
          runtime: {},
        },
      });
      await readyHarness.dispatch('activate', {});
      expect(readyHarness.deleteCalls).toEqual(['sensei-shell-old-a', 'sensei-shell-old-b']);
      expect(readyHarness.claimCalls).toBe(1);

      const missingHarness = createServiceWorkerHarness(source, {
        initialCaches: {
          'sensei-shell-old-a': {},
          runtime: {},
        },
      });
      await missingHarness.dispatch('activate', {});
      expect(missingHarness.deleteCalls).toEqual([]);
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });

  it('serves navigations network-first with cached index fallback and uses cache-first for emitted assets', async () => {
    const rootDir = await createTempDirFixture();
    try {
      const fixture = await writeDistFixture(rootDir);
      await generateServiceWorker({ distDir: fixture.distDir });
      const source = await readFile(join(fixture.distDir, 'sw.js'), 'utf8');
      const cacheName = `sensei-shell-${expectedDigest(fixture.files)}`;
      const fetchMock = vi
        .fn()
        .mockRejectedValueOnce(new Error('offline'))
        .mockImplementationOnce(async () => new Response('network asset'));

      const harness = createServiceWorkerHarness(source, {
        initialCaches: {
          [cacheName]: {
            '/index.html': fixture.files.indexHtml,
            '/assets/app-abc123.js': 'cached asset body',
          },
        },
        fetchImpl: fetchMock,
      });

      const navigationResponse = await harness.dispatchFetch({
        method: 'GET',
        mode: 'navigate',
        url: 'https://example.test/levels/dependency-chain',
      });
      expect(await navigationResponse.text()).toContain('<!doctype html>');

      const assetResponse = await harness.dispatchFetch({
        method: 'GET',
        mode: 'no-cors',
        url: 'https://example.test/assets/app-abc123.js',
      });
      expect(await assetResponse.text()).toBe('cached asset body');
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });

  it('returns unavailable instead of throwing when service-worker registration rejects', async () => {
    await expect(
      registerOfflineSupport({
        isProduction: true,
        navigator: {
          serviceWorker: {
            register: vi.fn().mockRejectedValue(new Error('boom')),
          },
        },
      }),
    ).resolves.toEqual({ status: 'unavailable' });
  });

  it('renders polite offline notices only for unavailable and unsupported states', () => {
    const readyMarkup = renderToStaticMarkup(
      createElement(App, { storage: null, offlineStatus: 'ready' }),
    );
    expect(readyMarkup).not.toMatch(/offline support/i);

    const unavailableMarkup = renderToStaticMarkup(
      createElement(App, { storage: null, offlineStatus: 'unavailable' }),
    );
    expect(unavailableMarkup).toMatch(/offline support is temporarily unavailable/i);

    const unsupportedMarkup = renderToStaticMarkup(
      createElement(App, { storage: null, offlineStatus: 'unsupported' }),
    );
    expect(unsupportedMarkup).toMatch(/offline support is not available in this environment/i);
  });
});
