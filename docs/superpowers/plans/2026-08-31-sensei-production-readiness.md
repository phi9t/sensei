# Sensei Production Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add enforceable static-release contracts so Sensei is safer to host, install, cache offline, and verify before release.

**Architecture:** Keep gameplay and scheduling semantics untouched. Harden only the static delivery surface: HTML metadata, web manifest/icons, deploy security headers, release artifact validation, and release documentation. The production checker verifies built `dist/` output rather than source text alone.

**Tech Stack:** React 19, Vite 8, TypeScript 6, Vitest, Node.js ESM scripts, static hosting.

---

## File Structure

- Create `public/manifest.webmanifest` for install/offline metadata copied by Vite.
- Create `public/icons/icon.svg` as a same-origin install icon with no external assets.
- Create `public/_headers` for host-agnostic static security and cache policy.
- Modify `index.html` to link the manifest and icon and expose production metadata.
- Create `scripts/verify-production-artifacts.mjs` to validate `dist/index.html`, `dist/manifest.webmanifest`, `dist/icons/icon.svg`, `dist/_headers`, and `dist/sw.js` after build.
- Create `tests/production-artifacts.test.mjs` to test the verifier against a temporary built-artifact fixture.
- Modify `tests/title-contract.test.mjs` to assert required production metadata in `index.html`.
- Modify `tests/offline.test.mjs` to assert the service worker precache manifest stays intentionally limited to app shell assets, not install metadata.
- Modify `package.json` to add `verify:production` and include it in `npm run verify` after `npm run build`.
- Create `docs/production-readiness.md` for the release gate, static host assumptions, and deploy checklist.
- Modify `README.md` to point release operators at the production readiness gate.

## Task 1: Production Metadata And Release Artifact Tests

**Files:**

- Create: `public/manifest.webmanifest`
- Create: `public/icons/icon.svg`
- Modify: `index.html`
- Modify: `tests/title-contract.test.mjs`
- Modify: `tests/offline.test.mjs`

- [ ] **Step 1: Write failing metadata tests**

Add assertions in `tests/title-contract.test.mjs` that `index.html` contains:

```js
expect(indexHtml).toMatch(/<meta name="application-name" content="Sensei" \/>/);
expect(indexHtml).toMatch(/<meta name="color-scheme" content="light dark" \/>/);
expect(indexHtml).toMatch(/<link rel="manifest" href="\/manifest.webmanifest" \/>/);
expect(indexHtml).toMatch(/<link rel="icon" type="image\/svg\\+xml" href="\/icons\/icon.svg" \/>/);
```

Add a new test that reads and parses `public/manifest.webmanifest`, then asserts:

```js
expect(manifest).toMatchObject({
  name: 'Sensei Pipeline Scheduling',
  short_name: 'Sensei',
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
```

- [ ] **Step 2: Verify the metadata test fails**

Run:

```bash
npx vitest run tests/title-contract.test.mjs
```

Expected: FAIL because `index.html`, `public/manifest.webmanifest`, and `public/icons/icon.svg` do not yet provide the metadata contract.

- [ ] **Step 3: Add the metadata**

Create `public/manifest.webmanifest`:

```json
{
  "name": "Sensei Pipeline Scheduling",
  "short_name": "Sensei",
  "description": "An offline-capable pipeline scheduling game.",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "background_color": "#11191b",
  "theme_color": "#11191b",
  "icons": [
    {
      "src": "/icons/icon.svg",
      "sizes": "any",
      "type": "image/svg+xml",
      "purpose": "any maskable"
    }
  ]
}
```

Create `public/icons/icon.svg` with a square, text-free SVG icon using the Sensei palette.

Add these tags to `index.html` head:

```html
<meta name="application-name" content="Sensei" />
<meta name="color-scheme" content="light dark" />
<link rel="manifest" href="/manifest.webmanifest" />
<link rel="icon" type="image/svg+xml" href="/icons/icon.svg" />
```

- [ ] **Step 4: Verify metadata tests pass**

Run:

```bash
npx vitest run tests/title-contract.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Update offline scope test**

Add an assertion to `tests/offline.test.mjs` that generated `sw.js` does not precache `manifest.webmanifest` or `icon.svg`.

Run:

```bash
npx vitest run tests/offline.test.mjs
```

Expected: PASS.

## Task 2: Static Host Security Headers

**Files:**

- Create: `public/_headers`
- Create: `tests/production-artifacts.test.mjs`
- Create: `scripts/verify-production-artifacts.mjs`
- Modify: `package.json`

- [ ] **Step 1: Write failing production artifact verifier test**

Create `tests/production-artifacts.test.mjs` that imports `verifyProductionArtifacts` from `scripts/verify-production-artifacts.mjs`, builds a temporary `dist/` fixture, and asserts:

```js
await expect(verifyProductionArtifacts({ distDir })).resolves.toEqual({
  ok: true,
  checked: ['/index.html', '/manifest.webmanifest', '/icons/icon.svg', '/_headers', '/sw.js'],
});
```

Also add a failing case that writes `_headers` without a CSP and expects rejection matching `/Content-Security-Policy/`.

- [ ] **Step 2: Verify the production artifact test fails**

Run:

```bash
npx vitest run tests/production-artifacts.test.mjs
```

Expected: FAIL because the verifier script does not exist.

- [ ] **Step 3: Implement verifier**

Create `scripts/verify-production-artifacts.mjs` exporting:

```js
export async function verifyProductionArtifacts({ distDir = DIST_DIR } = {}) { ... }
```

The verifier must:

- read `dist/index.html`;
- parse manifest JSON from `dist/manifest.webmanifest`;
- read `dist/icons/icon.svg`;
- read `dist/_headers`;
- read `dist/sw.js`;
- assert the index links manifest and icon;
- assert manifest fields listed in Task 1;
- assert `_headers` contains `Content-Security-Policy`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and the expected cache policies;
- assert `sw.js` contains a `sensei-shell-` cache and does not precache `_headers` or manifest/icon metadata.

When run directly, print checked files and set `process.exitCode = 1` on failure.

- [ ] **Step 4: Add static headers**

Create `public/_headers`:

```text
/*
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
```

The CSP keeps `style-src 'unsafe-inline'` because current React components use inline CSS custom properties and SVG layout styles.

- [ ] **Step 5: Wire verifier into npm verification**

Update `package.json` scripts:

```json
"verify:production": "node scripts/verify-production-artifacts.mjs",
"verify": "npm run format:check && npm run lint && npm run typecheck && npm test && npm run build && npm run verify:production"
```

- [ ] **Step 6: Verify artifact tests and production verifier pass**

Run:

```bash
npx vitest run tests/production-artifacts.test.mjs
npm run build
npm run verify:production
```

Expected: all PASS.

## Task 3: Release Documentation And Final Gate

**Files:**

- Create: `docs/production-readiness.md`
- Modify: `README.md`

- [ ] **Step 1: Document release contract**

Create `docs/production-readiness.md` with:

- release command sequence: `npm ci`, `npm run verify`, `git diff --check`, `git status --short`;
- static hosting requirements: serve `dist/`, honor `_headers`, do not rewrite `/sw.js` to a long-lived cache;
- security policy note explaining why CSP has `style-src 'unsafe-inline'`;
- offline behavior and rollback rule;
- manual smoke checks after deployment.

Update `README.md` prerequisites/commands to mention `npm run verify:production` and the production-readiness doc.

- [ ] **Step 2: Run full verification**

Run:

```bash
npm run verify
git diff --check
```

Expected: PASS.

- [ ] **Step 3: Run branch review**

Run:

```bash
scripts/agentic/review-branch
```

Expected: PASS.

- [ ] **Step 4: Commit**

Stage explicit paths only:

```bash
git add index.html package.json package-lock.json public/manifest.webmanifest public/icons/icon.svg public/_headers scripts/verify-production-artifacts.mjs tests/title-contract.test.mjs tests/offline.test.mjs tests/production-artifacts.test.mjs docs/production-readiness.md README.md docs/superpowers/plans/2026-08-31-sensei-production-readiness.md
git commit -m "chore(release): harden static production artifacts" -m "Kata: kata#5zpg"
```
