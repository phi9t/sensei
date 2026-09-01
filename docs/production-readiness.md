# Production Readiness

Sensei is a static React app. A production release is the checked-in source plus the generated `dist/` directory from the release gate below. The game engine and replay state remain client-side only.

## Release Gate

Run the release gate from a clean checkout:

```bash
npm ci
npm run verify
git diff --check
git status --short
```

`npm run verify` runs formatting, lint, typecheck, the full test suite, production build, service-worker generation, and `npm run verify:production`.

`npm run verify:production` validates the generated `dist/` delivery contract:

- `dist/index.html` has the product metadata, manifest link, and SVG icon link.
- `dist/manifest.webmanifest` has the install metadata used by browsers.
- `dist/icons/icon.svg` is present and script-free.
- `dist/_headers` carries the static security and cache policy.
- `dist/sw.js` uses the content-digested `sensei-shell-*` cache and does not precache install metadata.

## Static Hosting Requirements

Serve the contents of `dist/` as the site root.

The static host must honor `dist/_headers` or equivalent configuration. If the host does not support `_headers`, copy the same policy into that host's native header mechanism before release.

The required cache behavior is:

- `/assets/*`: `Cache-Control: public, max-age=31536000, immutable`
- `/icons/*`: `Cache-Control: public, max-age=31536000, immutable`
- `/manifest.webmanifest`: `Cache-Control: public, max-age=3600`
- `/sw.js`: `Cache-Control: no-cache`

Do not rewrite `/sw.js` to a long-lived cache policy. A stale service worker can pin users to an old app shell after a rollback or hotfix.

## Security Policy

The production CSP is:

```text
default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; manifest-src 'self'; worker-src 'self'; base-uri 'none'; form-action 'none'; object-src 'none'; frame-ancestors 'none'; upgrade-insecure-requests
```

`style-src 'unsafe-inline'` is intentional for this release because the current React UI uses inline style attributes for CSS custom properties, board geometry, and SVG layout. Removing it requires a separate UI refactor and browser verification pass.

No production header should grant camera, microphone, geolocation, payment, or USB access.

## Offline Behavior

Offline support is production-only. The service worker precaches `/`, `/index.html`, and emitted JavaScript/CSS assets. It intentionally does not precache `_headers`, `manifest.webmanifest`, or install icons.

Current static assets are cache-first. Same-origin navigations are network-first with cached `/index.html` fallback. Non-GET, cross-origin, and arbitrary runtime data are not intercepted.

Rollback rule: deploy the previous verified `dist/` as a full static artifact, including its matching `/sw.js`. Do not mix an older HTML shell with a newer service worker or newer assets.

## Manual Smoke Checks

After deployment, check:

1. Open the deployed root URL and place a legal first block.
2. Reload and verify the page still renders the same unlocked state.
3. In browser devtools, confirm `/sw.js`, `/manifest.webmanifest`, `/icons/icon.svg`, and hashed `/assets/*` return the expected cache headers.
4. Toggle offline mode after one successful load and confirm the app shell reloads.
5. Confirm the console has no CSP violations or service-worker install failures.
