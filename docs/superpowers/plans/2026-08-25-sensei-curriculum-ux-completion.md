# Sensei Curriculum UX Completion Plan

**Goal:** Finish the next Sensei UI/UX pass by making the full curriculum easier
to understand from the cockpit without adding a bulky rules panel, then verify
and redeploy the result.

**Spec:** `docs/superpowers/specs/2026-08-25-sensei-curriculum-ux-completion.md`

## Constraints

- Keep block placement as the primary interaction.
- Keep the board visually dominant.
- Do not wire in a long visible `Pipeline rules` panel.
- Preserve visible operation codes such as `F0:S0:D1`.
- Do not touch unrelated untracked work unless it becomes part of this plan.

## Design Direction

- Product type: technical learning game / dense scheduling cockpit.
- Audience: engineers learning pipeline parallel algorithms through repeated
  scheduling attempts.
- Tone: calm, technical, compact, readable.
- Memorable detail: operation identity travels unchanged from queue to preview,
  board, inspector, and explanations.
- Interaction model: progressive disclosure; explain only what is relevant to
  the current level or selected block.

## Execution Tasks

- [x] Read requested design skills and current cockpit docs.
- [x] Query UI guidance for dense learning cockpit, accessibility, responsive
      board behavior, and React implementation constraints.
- [x] Write the executable completion spec.
- [x] Add focused tests for compact curriculum progress and optional concept
      detail.
- [x] Add CSS contract tests for bounded concept disclosure.
- [x] Implement compact curriculum orientation in the level guide.
- [x] Run focused tests.
- [x] Run full verification.
- [x] Capture desktop and mobile visual sanity screenshots.
- [x] Redeploy the verified artifact to Goofy Preview alias `groovy`.
- [x] Append post-execution review and plan corrections.

## Verification

Run:

```bash
npm test -- src/components/GameShell.test.tsx tests/responsive-css.test.mjs tests/accessibility.test.tsx
npm run verify
npm run build
```

Visual sanity:

- start a production preview from `dist`;
- capture a 13-inch laptop-sized viewport;
- capture a narrow mobile viewport;
- confirm the guide remains shallow, Concepts is collapsed by default, the ready
  queue is compact, and the board occupies the lower workspace.

Deployment:

```bash
bytedcli --json goofy preview deploy dist --alias groovy --override --description "<description>"
curl -I -L --max-time 20 https://groovy.gf-preview.bytedance.net/
```

## Post-Execution Review

### Completed Changes

- Added compact curriculum progress to `LevelGuide`: current level ordinal and
  set-local progress are now visible without opening a rules panel.
- Added a collapsed `Concepts` disclosure in the existing guide. It uses
  `LevelConfig.algorithm.objective` and `introducedModel`, and includes the next
  level hint only inside the optional detail area.
- Kept the guide to a four-chip visible ceiling so the board-first cockpit
  hierarchy remains intact.
- Added CSS bounds for the disclosure: max width, local scroll, compact concept
  chips, and existing focus-visible behavior through native `summary`.
- Added behavior and CSS contract tests for the new guide surface.

### Verification Results

- `npm test -- src/components/GameShell.test.tsx -t "curriculum progress"`:
  passed.
- `npm test -- tests/responsive-css.test.mjs -t "compact labels whole"`:
  passed.
- `npm test -- src/components/GameShell.test.tsx tests/responsive-css.test.mjs tests/accessibility.test.tsx`:
  passed, 57 tests.
- `npm run verify`: passed. This covered Prettier, ESLint, TypeScript, 423
  Vitest tests, and production build.

### Visual Sanity

Production preview was run with `npx vite preview --host 127.0.0.1 --port 4173`.
Headless Chrome screenshots were captured at:

- `/tmp/sensei-curriculum-ux-screens/1280x800.png`
- `/tmp/sensei-curriculum-ux-screens/390x844.png`
- `/tmp/sensei-curriculum-ux-screens/1280x800-final.png`
- `/tmp/sensei-curriculum-ux-screens/390x844-final.png`

Observed result:

- desktop guide remains shallow and Concepts is collapsed by default;
- ready queue remains compact and subordinate to the board;
- board still starts immediately below command feedback and owns the lower
  workspace;
- mobile layout keeps local ready-queue scroll, touch-sized controls, and no
  visible text overflow in the guide.

Chrome's bounded screenshot wrapper exited on alarm after writing the files
because headless Chrome did not terminate cleanly on this machine. The files were
written and visually inspected.

### Deployment Results

- `bytedcli --json goofy preview deploy dist --alias groovy --override --description "Sensei curriculum UX completion master <landed-sha>"`:
  passed.
- Goofy Preview alias: `https://groovy.gf-preview.bytedance.net/`
- Preview id: `89670`; channel id: `5782520`.
- The alias was redeployed after landing so the Goofy description points at the
  committed work, not the pre-commit working tree.
- `curl -I -L --max-time 20 https://groovy.gf-preview.bytedance.net/`:
  returned `200 OK`.
- The served HTML references the final verified production build assets:
  `index-BVQH_2Ry.css` and `index-CyVeBc0f.js`.

### Review Notes

- The visible level guide stays under the four-chip ceiling: goal, combined
  status/makespan, level progress, and collapsed Concepts.
- Algorithm explanation is available through progressive disclosure only; no
  long visible `Pipeline rules` panel was introduced.
- The untracked `src/components/PipelineLessonPanel.tsx` file remains outside
  this plan and was not staged.

### Plan Corrections

- Future visual plans should use `perl -e 'alarm shift; exec @ARGV'` or another
  available bounded wrapper on this machine; `timeout` is not installed.
- Keep curriculum orientation in `LevelGuide` metadata rather than adding a new
  visible lesson panel. The untracked `PipelineLessonPanel.tsx` remains outside
  this plan.
- For Goofy Preview alias redeploys, verify the served HTML asset hashes after
  deploy; preview metadata may report the existing deployment id even when the
  alias content has been refreshed.
