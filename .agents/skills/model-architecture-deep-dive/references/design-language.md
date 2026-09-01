# Design Language for Interactive Architecture Deep Dives

## Contents

- Design thesis
- Information architecture
- Visual grammar
- Interaction grammar
- Responsive transformation
- Accessibility corrections
- Sensei translation
- Review rubric

## Design thesis

Treat the page as a readable technical essay wrapped around a small analytical
instrument. Its visual quality should come from precision, hierarchy, and linked
meaning rather than decoration.

The source archetype succeeds through five properties:

1. It declares a concrete engineering perspective.
2. It keeps the whole-system spine visible beside one expanded subsystem.
3. It reuses a stable diagram under several analytical lenses.
4. It links derived numbers back to the components that contribute them.
5. It uses quiet, repeatable visual encodings instead of a large legend.

Do not preserve the source archetype's defects: pointer-only SVG controls, weak
contrast, tiny targets, unlabeled pan regions, and desktop geometry merely placed
inside a mobile scroller.

## Information architecture

Use three nested levels of comprehension.

### Level 1: argument

The prose establishes the question, why existing representations are insufficient,
and what the reader should notice. Keep paragraphs near 60 to 75 characters per
line and use meaningful headings.

### Level 2: system orientation

Show a compact vertical or horizontal spine of major repeated units. Compress
repetition with explicit multiplicity, such as `expert block x 58`, while retaining
the operation order. Highlight the selected unit without hiding its siblings.

### Level 3: analytical instrument

Expand the selected unit into operations, tensors, dependencies, and boundaries.
Keep the drawing stable while a lens changes annotations and emphasis. Put derived
tables or equations close enough for bidirectional highlighting.

```text
PROSE: why this representation exists

SYSTEM SPINE              SELECTED DETAIL
tokens                    input residual
  |                       +------------------------+
embedding                 | attention operations   |
  |                       +------------------------+
block x N  =============> | feed-forward / experts |
  |                       +------------------------+
head                      output residual

DERIVATION: row or term <======> exact contributing nodes
```

## Visual grammar

Create semantic tokens before components. Suitable roles include:

| Token role     | Intended use                      | Required distinction                 |
| -------------- | --------------------------------- | ------------------------------------ |
| canvas         | Long-form page background         | Separate gently from instruments     |
| surface        | Diagram and table ground          | Clear boundary without heavy chrome  |
| ink            | Primary prose and labels          | At least 4.5:1 for normal text       |
| muted-ink      | Dimensions and annotations        | Still at least 4.5:1 when textual    |
| topology       | Connectors and neutral borders    | At least 3:1 when meaningful         |
| selection      | Current node or pinned relation   | Color plus border, weight, or marker |
| communication  | Collective or cross-device edge   | Distinct hue plus explicit label     |
| retained-state | Saved activation or resident data | Label or glyph in addition to hue    |
| hypothetical   | Counterfactual or simulated state | Dashed geometry plus text label      |
| focus-ring     | Keyboard location                 | At least 3:1 against adjacent colors |

Use a 4/8 spacing rhythm. Keep outer editorial spacing generous and internal graph
spacing compact. Avoid ornamental gradients, glass effects, inflated cards, and
decorative motion.

Typography should separate reading from measurement:

- prose and UI: a highly legible sans-serif or system stack;
- identifiers, tensor shapes, formulas, and exact counts: a compact monospace;
- operation names: medium or semibold;
- dimensions and secondary metadata: smaller but never below 12px in interactive
  content and never below contrast requirements.

## Interaction grammar

Use coordinated views with explicit state.

| User intent        | Pointer                           | Keyboard                        | State                                |
| ------------------ | --------------------------------- | ------------------------------- | ------------------------------------ |
| Preview relation   | Hover                             | Focus                           | Temporary emphasis                   |
| Compare or inspect | Click                             | Enter or Space                  | Pinned selection                     |
| Clear comparison   | Click selected item or background | Escape                          | No selection                         |
| Change subsystem   | Select overview node              | Select native tab/button        | Stable geometry updates              |
| Change lens        | Segmented control                 | Arrow keys or tab then activate | `aria-pressed` or tab state          |
| Inspect derivation | Hover/click row or term           | Focus/activate row or term      | Contributors highlighted             |
| Pan a large graph  | Drag or scroll                    | Arrow keys in focused region    | Position announced or contextualized |

Use one source of truth for selection. A table must not maintain highlights separate
from the diagram. Prefer data such as `selectedNodeId`, `previewNodeId`, and
`activeLens`, then derive all presentations.

Use motion only to preserve object continuity. Fade or interpolate emphasis over
roughly 120 to 220 milliseconds; avoid layout-changing spectacle. Under
`prefers-reduced-motion`, update immediately.

## Responsive transformation

Do not equate responsiveness with fitting pixels. Preserve the learning task.

### Wide desktop

Keep prose narrow. Let the analytical instrument extend beyond the prose measure.
Show system spine, detail, and a compact derivation together where space permits.

### Laptop and tablet

Preserve readable labels first. Collapse secondary legends or move them into a
compact inspector. If the graph pans, show an edge fade, scrollbar, minimap, or
explicit `Pan to explore` instruction.

### Mobile

Transform into focus mode:

1. choose a subsystem from a scroll-free overview;
2. fit that subsystem to the viewport;
3. inspect one operation in an in-flow panel or bottom sheet;
4. provide previous/next controls for topology traversal;
5. preserve a textual outline of the full system.

Never shrink the desktop graph until its labels become decorative texture. Avoid a
horizontal scroller nested inside the page unless the task intrinsically requires
spatial comparison.

## Accessibility corrections

For SVG or canvas diagrams:

- provide a concise figure title and description;
- expose an equivalent structured outline or table;
- implement each operable node as a semantic control or give it equivalent role,
  name, state, focus, and keyboard activation;
- make scrollable regions focusable and label their navigation behavior;
- provide non-pointer alternatives for hover-only detail;
- make hit areas at least 44 by 44 CSS pixels on touch devices;
- ensure selection survives high-contrast and monochrome rendering;
- announce consequential lens or selection changes without stealing focus;
- test at 200% zoom and with text-spacing overrides;
- test reduced motion and keyboard-only traversal.

Automated audits cannot prove that an SVG explanation is understandable. Follow an
axe pass with manual keyboard, screen-reader-outline, zoom, and mobile checks.

## Sensei translation

Apply the pattern without turning the game into a documentation page.

```text
level question + objective
ready queue / batch overview       active lens
------------------------------------------------
                 schedule board
------------------------------------------------
contextual next move               selected block inspector
```

The schedule remains the dominant instrument. Selecting an operation such as
`F0:S0:D1` may coordinate these views:

- highlight predecessors and successors on the board;
- highlight its batch in the ready queue;
- show activation residency in the inspector;
- explain its contribution to bubble time or memory;
- compare the learner move with a policy or oracle without changing legality.

Introduce lenses progressively by curriculum level. Early levels need legality and
dependency emphasis; later levels may add memory, communication, and objective
trade-offs. Do not expose every lens at once.

## Review rubric

Score each dimension from 0 to 2. A design is ready only when no dimension is 0.

| Dimension     | 0                       | 1                   | 2                                   |
| ------------- | ----------------------- | ------------------- | ----------------------------------- |
| Question      | Decorative or undefined | Implied             | Explicit and testable               |
| Truth         | Duplicated numbers      | Partly derived      | One canonical model                 |
| Orientation   | Reader gets lost        | Overview exists     | Overview and detail stay linked     |
| Lenses        | Independent redraws     | Some continuity     | Stable objects across lenses        |
| Derivation    | Claims are opaque       | Partial mapping     | Every claim traces to contributors  |
| Interaction   | Pointer-only            | Keyboard incomplete | Equivalent pointer/keyboard paths   |
| Responsive    | Shrunk desktop          | Pan-only fallback   | Deliberate task-preserving modes    |
| Accessibility | Color/hover dependent   | Mostly semantic     | Named, operable, contrast-safe      |
| Restraint     | Decorative noise        | Mixed hierarchy     | Semantic ink and quiet framing      |
| Evidence      | Unsupported claims      | Sources listed      | Claim limits and provenance visible |

## Provenance

This design language was independently synthesized from a UI/UX audit of
`https://deepseek-v3.ezyang.com/studies/01-deepseek-diagram.html` and generalized
with the `ui-ux-pro-max` accessibility and responsive-design guidance. The source
page is evidence for observed interaction patterns only. It is not a source for
code, wording, assets, exact layout measurements, or palette values.
