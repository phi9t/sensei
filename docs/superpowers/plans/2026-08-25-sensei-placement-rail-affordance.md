# Sensei Placement Rail Affordance Plan

**Goal:** Make the schedule command rail communicate the selected block and
whether `Place` is actionable, without adding a new rules panel or slowing the
direct block-placement loop.

**Spec:** `docs/superpowers/specs/2026-08-25-sensei-placement-rail-affordance.md`

## Constraints

- Keep block placement as the main interaction.
- Keep direct click-to-place on ready blocks.
- Keep blocked and completed blocks focusable/inspectable.
- Keep the schedule board visually dominant.
- Do not add a `Pipeline rules` region.
- Do not stage `src/components/PipelineLessonPanel.tsx`.

## Design Direction

- Product type: dense technical learning game.
- Audience: engineers learning pipeline parallel scheduling algorithms.
- Tone: calm, compact, scannable, precise.
- Memorable detail: a small selected-block capsule beside `Place` names the
  current block and its placeability.
- UI pattern: command-state cue in the rail; inspector remains the deeper
  explanation surface.

## UI Guidance Used

- `ui-ux-pro-max` search: `"placement affordance feedback" --domain ux`
  returned input affordance and nearby feedback guidance.
- `ui-ux-pro-max` search: `"disabled button feedback" --domain ux` returned
  disabled-state clarity guidance.
- React stack search: `"button state accessible label" --stack react` reinforced
  accessible queries and semantic button state testing.
- `frontend-design-direction`: preserve the utilitarian cockpit and improve the
  actual repeated workflow instead of adding a marketing-style or lesson region.

## Execution Tasks

- [x] Read requested route and design skills.
- [x] Inspect command rail, operation tray, selected explanation, tests, and CSS.
- [x] Query UI guidance for placement affordance and disabled-state clarity.
- [x] Write this executable spec and plan.
- [x] Add failing behavior tests for selected-block rail state.
- [x] Add failing CSS contract tests for bounded status layout.
- [x] Implement the selected-block rail status and stateful `Place` button.
- [x] Run focused tests.
- [x] Run full verification.
- [x] Capture desktop and mobile visual sanity screenshots.
- [x] Deploy the verified artifact to Goofy Preview alias `groovy`.
- [x] Run post-execution review, apply fixes if needed, and commit.

## Verification Plan

Run:

```bash
npm test -- src/components/GameShell.test.tsx -t "selected block"
npm test -- tests/responsive-css.test.mjs -t "command rail"
npm test -- src/components/GameShell.test.tsx tests/responsive-css.test.mjs tests/accessibility.test.tsx
npm run verify
```

Results so far:

- `npm test -- src/components/GameShell.test.tsx -t "selected block"` passed
  3 focused behavior tests.
- `npm test -- tests/responsive-css.test.mjs -t "command rail"` passed 1
  focused CSS contract test.
- `npm test -- src/components/GameShell.test.tsx tests/responsive-css.test.mjs tests/accessibility.test.tsx`
  passed 64 tests.
- `npm run verify` passed Prettier, ESLint, TypeScript, 431 Vitest tests, and
  the production build.
- Final `npm run verify` passed Prettier, ESLint, TypeScript, 431 Vitest tests,
  and the production build after the command-rail layout adjustment.
- Production build emitted `dist/assets/index-JudbxKKf.css` and
  `dist/assets/index-S_rK286_.js`.

Visual sanity:

- start a production preview from `dist`;
- capture desktop and mobile screenshots after selecting ready, blocked, and
  completed blocks;
- confirm `Place` reads disabled when no legal selected block exists;
- confirm selected status text fits without page-level horizontal overflow;
- confirm the schedule board remains the dominant workspace.

Results:

- Production preview served from `http://127.0.0.1:4173/`.
- Headless Chrome screenshots captured selected-block states at 1280x800 and
  390x844.
- Empty, blocked, and completed selected states disabled `Place`; ready
  selection enabled `Place`.
- The selected-block status text fit in the command rail with no page-level
  horizontal overflow on checked laptop and mobile widths.
- Visual review kept the command rail compact and the schedule board dominant.

Deployment:

```bash
bytedcli --json goofy preview deploy dist --alias groovy --override --description "<description>"
curl -I -L --max-time 20 https://groovy.gf-preview.bytedance.net/
```

Results:

- The Goofy Preview deploy command succeeded with description
  `Sensei placement rail affordance master afe7a23`.
- Goofy deployment id: `31617302`.
- Preview URL: `https://groovy.gf-preview.bytedance.net/`.
- Smoke check returned `HTTP/1.1 200 OK`.
- Preview HTML served `ver: 1.0.0.31617302.tar_deploy` with
  `/assets/index-S_rK286_.js` and `/assets/index-JudbxKKf.css`.

## Post-Execution Review

- The final UI keeps placement feedback in the existing command rail and does
  not add a new rules or lesson surface.
- Visual review initially showed the selected-block capsule made the laptop rail
  taller than needed; the layout was tightened to keep the primary rail on one
  row at laptop/desktop widths while allowing bounded wrapping on mobile.
- `Place` is now semantically disabled unless the selected block is legal, while
  direct ready-block click placement and blocked/completed inspection remain
  intact.
- `src/components/PipelineLessonPanel.tsx` remains unrelated untracked WIP and
  was not staged.
