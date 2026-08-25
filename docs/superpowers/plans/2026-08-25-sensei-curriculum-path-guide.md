# Sensei Curriculum Path Guide Plan

**Goal:** Add a compact curriculum path to the existing level guide `Concepts`
disclosure so learners can see the algorithm ladder without adding a new rules
panel.

**Spec:** `docs/superpowers/specs/2026-08-25-sensei-curriculum-path-guide.md`

## Constraints

- Keep block placement as the main interaction.
- Keep the schedule board visually dominant.
- Keep the level selector as the level navigation control.
- Do not add a `Pipeline rules` region.
- Do not stage `src/components/PipelineLessonPanel.tsx`.

## Design Direction

- Product type: dense technical learning game.
- Audience: engineers learning pipeline parallel scheduling algorithms.
- Tone: calm, compact, scannable, precise.
- Memorable detail: the full algorithm ladder appears as compact set nodes only
  when the learner opens `Concepts`.
- UI pattern: existing guide summary first; optional course path inside native
  disclosure; static status chips for current/open/locked.

## UI Guidance Used

- `ui-ux-pro-max` search: `"curriculum progress map compact" --domain ux`
  returned progress indicators and compact label semantics.
- React stack searches for `"responsive disclosure details"` and
  `"details summary keyboard"` returned no matches, so the implementation uses
  general native HTML disclosure guidance and existing React patterns.
- `frontend-design-direction`: preserve a utilitarian, compact cockpit; avoid a
  marketing-style or lesson-page layout.

## Execution Tasks

- [x] Read requested route and design skills.
- [x] Inspect the level guide, progress state, tests, and current CSS layout.
- [x] Query UI guidance for compact curriculum progress.
- [x] Write this executable spec and plan.
- [x] Add failing behavior tests for the course path.
- [x] Add failing CSS contract tests for bounded path layout.
- [x] Implement the course path using existing `levelOptions` state.
- [x] Run focused tests.
- [x] Run full verification.
- [x] Capture desktop and mobile visual sanity screenshots.
- [x] Deploy the verified artifact to Goofy Preview alias `groovy`.
- [x] Run post-execution review, apply fixes if needed, and commit.

## Verification Plan

Run:

```bash
npm test -- src/components/GameShell.test.tsx -t "curriculum path"
npm test -- tests/responsive-css.test.mjs -t "compact labels"
npm test -- src/components/GameShell.test.tsx tests/responsive-css.test.mjs tests/accessibility.test.tsx
npm run verify
```

Results:

- `npm test -- src/components/GameShell.test.tsx -t "curriculum path"` passed
  1 focused behavior test.
- `npm test -- tests/responsive-css.test.mjs -t "compact labels"` passed 1
  focused CSS contract test.
- `npm run verify` passed Prettier, ESLint, TypeScript, 429 Vitest tests, and
  the production build.
- Production build emitted `dist/assets/index-C6no5Bxq.css` and
  `dist/assets/index-CJ7OilMy.js`.

Visual sanity:

- start a production preview from `dist`;
- capture desktop and mobile screenshots with `Concepts` open;
- confirm the always-visible guide remains compact;
- confirm the path is locally scrollable or wrapped without page horizontal
  overflow;
- confirm the schedule board remains the dominant workspace.

Results:

- Production preview served from `http://127.0.0.1:4173/`.
- Headless Chrome screenshots captured at 1440x900, 1280x800, and 390x844.
- With `Concepts` open, the course path rendered 11 set nodes and no
  `Pipeline rules` region.
- The path was visible inside the disclosure at all checked widths and used
  local horizontal scrolling with no page-level horizontal overflow.
- Visual review kept the guide compact, ready queue compact, and schedule board
  as the dominant workspace.

Deployment:

```bash
bytedcli --json goofy preview deploy dist --alias groovy --override --description "<description>"
curl -I -L --max-time 20 https://groovy.gf-preview.bytedance.net/
```

Results:

- The Goofy Preview deploy command succeeded with description
  `Sensei curriculum path guide master d520330`.
- Goofy deployment id: `31617302`.
- Preview URL: `https://groovy.gf-preview.bytedance.net/`.
- Smoke check returned `HTTP/1.1 200 OK`.
- Preview HTML served `ver: 1.0.0.31617302.tar_deploy` with
  `/assets/index-CJ7OilMy.js` and `/assets/index-C6no5Bxq.css`.

## Post-Execution Review

- The final UI keeps the new course context inside the existing `Concepts`
  disclosure and does not add a second navigation or rules panel.
- Visual review initially showed the path below the clipped part of the
  disclosure; the implementation was adjusted to place `Course path` directly
  after the objective, making it visible on desktop, laptop, and mobile.
- `src/components/PipelineLessonPanel.tsx` remains unrelated untracked WIP and
  was not staged.
