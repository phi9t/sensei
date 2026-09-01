---
name: model-architecture-deep-dive
description: Design, review, or implement rigorous interactive model-architecture explainers and technical deep dives. Use for model diagrams, systems visualizations, architecture walkthroughs, parameter or memory accounting views, coordinated overview/detail diagrams, and learning surfaces that connect prose, executable model state, derived quantities, and evidence.
---

# Model Architecture Deep Dive

Build a technical explainer as an executable argument: orient the reader, expose
one canonical model through coordinated lenses, and let every derived claim trace
back to the components that produce it.

Read [references/design-language.md](references/design-language.md) before making
visual or interaction decisions. Apply `$ui-ux-pro-max` for current accessibility,
responsive-layout, color, typography, and stack guidance.

## Workflow

### 1. Frame the question

Write one sentence naming the question the visualization answers, such as:

- Which kernels dominate execution?
- Where does parameter or activation memory live?
- How does data move through stages, experts, or devices?
- Why does one schedule outperform another?

Choose one primary question per view. Reject a diagram that merely tries to show
everything.

### 2. Establish canonical truth

Define a typed, testable semantic model before drawing. Derive labels, totals,
highlights, and alternate views from that shared model. Never maintain independent
numbers in prose, diagrams, and tables.

For Sensei, keep scheduling semantics in the pure engine and render from engine
state. Preserve `Action[]` as the durable learner artifact.

Classify claims when evidence matters:

- source evidence
- executable contract
- interpretation
- simulator boundary
- missing evidence

### 3. Compose the explanation

Use this sequence:

```text
question and stakes
  -> conventional view and its limitation
  -> stable system overview
  -> selected detail
  -> question-oriented lens
  -> linked derivation or evidence
  -> concise conclusion and next question
```

Keep prose in a readable column. Let the analytical instrument break wider when
its topology requires it. Use prose to teach how to read the visual, not to repeat
everything already visible.

### 4. Build coordinated lenses

Maintain one stable geometry when switching among views such as:

- structure
- kernels or operations
- tensor shapes
- parameter count
- activation memory
- communication
- device placement
- schedule legality and performance

A lens changes the question, not the underlying model. Preserve object identity
and spatial position across transitions.

Use the interaction grammar:

- hover or focus previews a relationship;
- click or Enter/Space pins it;
- Escape clears a pin;
- a selected overview node controls the detail view;
- a derived table row highlights every contributing component;
- meaningful state is deep-linkable when practical.

Do not rely on hover. Use native buttons or links where possible. Custom diagram
nodes need a role, accessible name, state, keyboard handling, and visible focus.

### 5. Apply the visual language

Use quiet editorial framing and semantic ink:

- warm or neutral page canvas;
- high-contrast text and restrained surfaces;
- system or highly legible sans-serif for prose and UI;
- monospace only for dimensions, formulas, identifiers, and measurements;
- thin connectors and borders for topology;
- stronger weight for expensive or primary operations;
- one warm selection accent;
- one optional cool accent for communication or a second semantic family;
- generous whitespace around prose, compact spacing inside the instrument;
- little or no decorative shadow.

Generate project-specific semantic tokens. Do not copy a reference page's CSS,
exact colors, dimensions, assets, wording, or arrangement.

### 6. Adapt by viewport

Desktop may show overview and detail side by side. Tablet may narrow the overview
and allow a clearly signposted pan region. Mobile must become a deliberate focus
mode:

```text
overview selector
  -> fitted selected subsystem
  -> operation inspector or bottom sheet
```

Do not solve mobile by shrinking labels below readable size. Avoid nested scrolling
when a focused rendition can replace it. If horizontal pan is essential, label it,
make the region keyboard-focusable, and provide overview/minimap context.

### 7. Verify the learning experience

Test all of the following before delivery:

- a first-time reader can state what question the view answers;
- overview selection and detail selection remain synchronized;
- every displayed total is derived from canonical data;
- preview, pin, clear, and lens changes work with keyboard only;
- selected state is not conveyed by color alone;
- normal text meets 4.5:1 contrast and meaningful graphics meet 3:1;
- compact controls have at least a 44 by 44 CSS-pixel hit area on touch;
- reduced motion preserves all information;
- 375, 768, 1024, and 1440 pixel widths preserve readable labels;
- zoom and text spacing do not clip content;
- an automated accessibility audit has no serious or critical violations;
- the visual still communicates when animations and hover are unavailable.

## Output Contract

For a design task, return or write:

1. the reader's question and audience;
2. the canonical semantic model;
3. an ASCII layout at desktop and mobile widths;
4. the lens and interaction matrix;
5. semantic visual tokens and state rules;
6. accessibility and responsive contracts;
7. evidence, claim limits, and unresolved questions;
8. implementation boundaries and verification commands.

For implementation, add tests for derived values, cross-view synchronization,
keyboard operation, responsive reflow, and accessibility. Prefer semantic queries
such as `getByRole` and `getByLabelText`.

## Clean-Room Boundary

The motivating reference is an observational design input, not an implementation
source. Extract principles such as overview/detail coordination, semantic styling,
and linked derivations. Do not copy its source, layout measurements, artwork, text,
palette, or component code. Record provenance and independently derive the result
from the current product's goals and semantic model.
