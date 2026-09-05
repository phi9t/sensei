# Scientific cockpit redesign

Approved direction: the user accepted the repository review and requested implementation.

The subject is pipeline scheduling; the audience is a learner comparing legal schedules.
The page's primary job is placing and inspecting operations on a shared time axis.

## Visual direction

Use a light instrument surface with ink #172b46, slate #586b82, canvas #edf2f8,
white #ffffff, blue #315cce, and teal #137f78. Reserve a categorical palette for
microbatches. Use Avenir Next/system sans for headings and body, and SF Mono/Menlo
for time, operation labels, and measurements. These use local font fallbacks.

Keep the compact guide and horizontally scrollable ready queue above thin
controls. A large timeline and narrow inspector form the workspace. Reduce
decorative panels, heavy shadows, uppercase microcopy, and unused vertical space.
On narrow screens, use one column with deliberate horizontal scrolling inside
the queue and timeline. Never clip operations vertically without a scroll affordance.

The signature interaction is selection: trace immediate dependency edges and
the stored activation interval on the same timeline. Keep microbatch color stable
across stages and F/B/W; encode operation kind with text and texture.

## Scientific contract

- React derives geometry from replay state and predecessor contracts.
- Correct weight residency display to take effect at forward start. Acquisition
  has no modeled communication duration. Do not change action serialization or scoring.
- Preserve and name the existing stored-activation convention: F completion to
  fused B completion or split W completion, one abstract unit per stage/microbatch.
- Show activation peaks separately from current weight and combined residency,
  with rank-specific caps. Do not divide a peak by another rank's cap.
- Add source and assumptions disclosure for every family. Named policies are
  educational heuristics unless a source-conformance proof exists. DualPipe
  directional slots are not physical GPU throughput or communication simulation.
- Add an optional completed reference schedule on the same horizontal scale.
  Reference output must be obtained through the existing replay-validated projection.
- Correct README scope to the 25-level curriculum and document omitted costs.

## Acceptance

At 1280×720 the foundations board starts within the upper half of the viewport;
all queue operations remain reachable. At 390px there is no document horizontal
overflow. Keyboard focus and reduced-motion remain supported. Tests cover
weight timing, semantic color identity, source disclosure, selection geometry,
and reference comparison. Run full verification and visually inspect small,
split-gradient, residency, and bidirectional levels.
