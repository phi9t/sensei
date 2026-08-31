# Sensei Inspector Learning Disclosure Plan

**Goal:** Improve selected-block learning by adding a compact inspector
disclosure that explains the selected operation without adding a visible rules
panel.

**Spec:** `docs/superpowers/specs/2026-08-25-sensei-inspector-learning-disclosure.md`

## Constraints

- Keep block placement as the main interaction.
- Keep the schedule board visually dominant.
- Preserve visible operation codes such as `F0:S0:D1`.
- Keep algorithm explanation contextual and optional.
- Do not stage `src/components/PipelineLessonPanel.tsx`.

## Design Direction

- Product type: dense technical learning game.
- Audience: engineers learning pipeline parallel scheduling by repeated attempts.
- Tone: calm, compact, scannable, precise.
- Memorable detail: every inspector explanation starts from the exact selected
  token identity.
- UI pattern: selected-object summary first; optional detail behind native
  disclosure; compact status chips for machine-checkable gates.

## Execution Tasks

- [x] Read requested route and design skills.
- [x] Inspect the current cockpit, inspector, tests, and untracked lesson panel.
- [x] Query UI guidance for compact detail overflow and React focus.
- [x] Write the executable inspector disclosure spec.
- [x] Add failing behavior tests at the `App` UI seam.
- [x] Add failing CSS contract tests for bounded inspector disclosure.
- [x] Implement the inspector disclosure using existing explanation data.
- [x] Run focused tests.
- [x] Run full verification.
- [x] Capture desktop and mobile visual sanity screenshots.
- [x] Deploy the verified artifact to Goofy Preview alias `groovy`.
- [x] Run post-execution review, apply fixes if needed, and commit.

## Verification Plan

Run:

```bash
npm test -- src/components/GameShell.test.tsx -t "why this block"
npm test -- tests/responsive-css.test.mjs -t "inspector learning disclosure"
npm test -- src/components/GameShell.test.tsx tests/responsive-css.test.mjs tests/accessibility.test.tsx
npm run verify
```

Visual sanity:

- start a production preview from `dist`;
- capture desktop and mobile screenshots;
- confirm the inspector remains compact when the disclosure is closed;
- confirm the disclosure is useful and bounded when opened;
- confirm the board still owns the lower workspace.

Deployment:

```bash
bytedcli --json goofy preview deploy dist --alias groovy --override --description "<description>"
curl -I -L --max-time 20 https://groovy.gf-preview.bytedance.net/
```

## Post-Execution Review

### Completed Changes

- Added a closed-by-default `Why this block?` disclosure to `MoveInspector`.
- The disclosure decodes the selected `F0:S0:D1`-style token into pass, stage,
  microbatch, rank, duration, direction when present, and current status.
- Dependency gates are shown as compact `satisfied` or `waiting` rows using the
  existing `ExplanationResult` dependency data.
- The existing default inspector remains compact: selected operation, fact
  chips, and current legal/blocked/completed message stay visible before the
  optional detail.
- No `Pipeline rules` region was added and `PipelineLessonPanel.tsx` remains
  outside the change.

### Verification Results

- `npm test -- src/components/GameShell.test.tsx -t "selected-block learning"`:
  passed.
- `npm test -- tests/responsive-css.test.mjs -t "inspector learning disclosure"`:
  passed.
- `npm test -- src/components/GameShell.test.tsx -t "selected-block learning|split-backward notation|dependency-free|keeps naming terse"`:
  passed, 4 tests.
- `npm test -- tests/responsive-css.test.mjs -t "inspector learning disclosure"`:
  passed, 1 test.
- `npm run typecheck`: passed.
- `npm test -- src/components/GameShell.test.tsx tests/responsive-css.test.mjs tests/accessibility.test.tsx`:
  passed, 61 tests.
- `npm run verify`: passed. Final passing run covered Prettier, ESLint,
  TypeScript, 428 Vitest tests, and production build.

### Visual Sanity

Production preview was run with
`npm exec vite -- preview --host 127.0.0.1 --port 4173`.
Headless Chrome screenshots were captured at:

- `/tmp/sensei-inspector-learning-screens/1280x800-open-final.png`
- `/tmp/sensei-inspector-learning-screens/390x844-open-final.png`

Observed result:

- desktop and mobile keep the board-first cockpit hierarchy;
- the inspector disclosure is useful when opened and not visible when no block
  is selected;
- both common dependency gates are visible without page-level horizontal
  overflow;
- the disclosure remains bounded in the score rail.

### Deployment

- `bytedcli --json goofy preview deploy dist --alias groovy --override --description "Sensei inspector learning disclosure master d770ad7"`:
  passed.
- Preview id: `89670`.
- Channel id: `5782520`.
- Deployment id: `31617302`.
- URL: `https://groovy.gf-preview.bytedance.net/`.
- Smoke check: `curl -I -L --max-time 20 https://groovy.gf-preview.bytedance.net/`
  returned `HTTP/1.1 200 OK`.

### Plan Corrections

- The first visual cap, `10rem`, clipped the second dependency gate in the common
  blocked state. The implemented cap is `min(14rem, 48dvh)`, which preserves a
  local scroll boundary while fitting the normal two-gate case.
- When using raw Chrome DevTools screenshots, wait for React to render the
  selected inspector disclosure after clicking the operation; opening it in the
  same immediate evaluation can race the state update.
