# Learn and practice

## Intent

Help a learner answer: why does this pipeline schedule work, and which change
would improve it? The user requested prominent theory and primary sources below
the timeline and delegated presentation decisions. Continue the approved cockpit
design without another approval gate.

## Layout

```text
DESKTOP
lesson question / objective                  course selector
ready blocks                                 selected block
placement / undo / assistance                 score
TIMELINE                                     score
UNDERSTAND THIS SCHEDULE                      READ THE PAPER
idea | algorithm                             locator / reading question
trace an actual dependency                    model assumptions
practice prompt / return to board

MOBILE / TABLET
lesson / ready blocks / controls
timeline (labeled keyboard-accessible pan)
understand this schedule / idea | algorithm
trace an actual dependency / practice prompt
primary source / assumptions
inspector / score
```

An always-visible short explanation introduces the learning question. Algorithm
steps are available in a second view. The primary paper and reading guide remain
visible in both. A small dismissible dialog explains timeline notation, using
click, keyboard and touch; no essential content requires hover.

## Canonical truth and interactions

The schedule, operation costs and predecessor graph come from the pure engine.
Selecting a dependency in the learning section updates the same selected operation
as the board and inspector. It never places work. Escape clears selection.
Theory view changes do not change actions or selection. Level changes clear
local reading state; Reset clears the attempt and selection. Completed attempts replace the queue with a result
and review prompt; Undo restores placement. Keep share/reset and next lesson
available. Numeric completion claims come only from score().

## Visual language

Retain the scientific cockpit tokens: canvas #edf2f8, surface #ffffff, ink
#172b46, muted text #586b82, selection #315cce, retained-state #087a68.
Use Avenir/system sans for reading and Menlo/system monospace for identifiers.
The signature is an engine-derived dependency strip connecting prose to the
learner's own blocks. Keep readable prose near 65 characters per line, use space
and thin rules instead of a card for every fact.

## Evidence and boundaries

Source-backed mechanisms are separate from local practice strategies and model
assumptions. GPipe, Megatron-LM, Zero Bubble, Controllable Memory, BF-PP and
DeepSeek-V3 are primary sources. Local policies are not paper-exact schedules.
Time is abstract; stored activation units are not bytes. No new engine semantics,
paper-optimality claims, copied source assets or runtime solver dependencies.

## Verification

Test source visibility for all levels, keyboard help dismissal/focus, shared
selection, algorithm view stability, completion/undo/next, and axe accessibility.
Inspect live layouts at 375, 768, 1024 and 1440px, plus zoom/text spacing. Run
npm run verify and git diff --check. The optional ui-ux-pro-max skill referenced
by the deep-dive skill is not installed; use its explicit local accessibility
contracts and browser verification instead.
