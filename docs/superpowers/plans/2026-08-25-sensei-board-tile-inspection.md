# Sensei Board Tile Inspection Plan

**Goal:** Make placed schedule blocks inspectable directly from the board while
preserving the compact placement cockpit.

**Spec:** `docs/superpowers/specs/2026-08-25-sensei-board-tile-inspection.md`

## Constraints

- Keep block placement as the main loop.
- Do not add or wire a `Pipeline rules` panel.
- Reuse the existing selected-operation state, command rail, and inspector.
- Keep direct click-to-place from the ready queue unchanged.
- Keep compact block IDs like `F0:S0:B1`.
- Keep board and queue scroll local; no page-level horizontal overflow.
- Do not touch or stage `src/components/PipelineLessonPanel.tsx`.

## UI Guidance Used

- `frontend-design-direction`: improve the actual repeated workflow, keep the
  utilitarian cockpit, and avoid new marketing/tutorial surfaces.
- `ui-ux-pro-max` search: `"keyboard selectable diagram" --domain ux` returned
  high-severity keyboard-navigation guidance.
- `ui-ux-pro-max` search: `"buttons interface interactions" --stack react`
  returned semantic button/typed props guidance.
- `ui-ux-pro-max` quick reference: focus states, keyboard navigation, no
  hover-only interaction, web target size, color-not-only status, and stable
  motion.

## Implementation Tasks

- [x] Inspect current board, command rail, selection model, tests, and CSS.
- [x] Write this spec and plan.
- [x] Add failing behavior tests for board-tile pointer and keyboard
      inspection.
- [x] Add failing CSS contract tests for board-tile focus/hover styling.
- [x] Add an `onInspect` handler to `ScheduleBoard`.
- [x] Render placed board blocks as semantic SVG buttons.
- [x] Style hover/focus/selected affordances without resizing tiles.
- [x] Run focused tests.
- [x] Run full verification.
- [x] Capture desktop and mobile visual sanity checks.
- [x] Deploy the verified artifact to Goofy Preview alias `groovy`.
- [x] Run post-execution review, improve this plan if needed, and commit.

## Verification Plan

Run:

```bash
npm test -- src/components/GameShell.test.tsx -t "board tile"
npm test -- src/components/ScheduleBoard.test.tsx
npm test -- tests/responsive-css.test.mjs -t "schedule SVG"
npm test -- src/components/GameShell.test.tsx tests/responsive-css.test.mjs tests/accessibility.test.tsx
npm run verify
```

Visual sanity:

- Start a production preview from `dist`.
- Check `1280x800`, `1440x900`, `390x844`, and a short landscape viewport.
- Place at least two blocks, then select a placed board tile by pointer and by
  keyboard.
- Confirm the command rail status and inspector update.
- Confirm focus is visible and does not change board geometry.
- Confirm no page-level horizontal overflow.

Deployment:

```bash
bytedcli --json goofy preview deploy dist --alias groovy --override --description "<description>"
curl -I -L --max-time 20 https://groovy.gf-preview.bytedance.net/
```

## Post-Execution Review

Results:

- Focused behavior checks passed for board-tile pointer and keyboard
  inspection.
- Full `npm run verify` passed: Prettier, ESLint, TypeScript, 434 Vitest
  tests, and production build.
- Headless Chrome screenshots at desktop, mobile portrait, and mobile
  landscape rendered nonblank and did not show page-level horizontal overflow.
- Goofy Preview deploy updated alias `groovy`.
- Smoke check returned `200 OK` for `https://groovy.gf-preview.bytedance.net/`.

Review:

- Board interaction improves inspection inside the placement loop because the
  scheduled block itself is now selectable.
- The board remains the dominant lower workspace; no rules panel or extra
  always-visible lesson surface was added.
- Interactive SVG blocks are named, focusable, and reachable by keyboard in
  visual schedule order.
- Focus and hover affordances are applied through stroke and shadow only, so
  block geometry and text layout stay stable.
- Unrelated WIP in `src/components/PipelineLessonPanel.tsx` was left untouched
  and unstaged.

Plan improvement:

- Browser interaction proof should use an installed automation dependency in
  future passes. CDP scripting was skipped here because this Node build could
  not `require('node:ws')`; behavior coverage came from Testing Library tests
  and visual proof came from headless Chrome screenshots.
