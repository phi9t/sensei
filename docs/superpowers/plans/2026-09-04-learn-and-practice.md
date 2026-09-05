# Learn and practice implementation plan

**Goal:** Connect beautiful scheduling practice to prominent, source-backed theory.

**Architecture:** Typed family teaching content, one below-board learning section,
an engine-derived dependency strip, and an accessible timeline help dialog.
Existing engine and Action[] semantics remain authoritative.

**Tech stack:** React, TypeScript, CSS, Vitest and Testing Library.

- [x] Add concise family explanations, algorithm steps, reading prompts and local
      practice questions in src/levels/learningContent.ts.
- [x] Implement LearningLab and TimelineHelp. Reuse ScientificContext and the
      shared operation selection; add semantic interaction tests.
- [x] Integrate below the timeline, add lesson jump link and completion presentation,
      and refine responsive layout without rewriting existing WIP.
- [x] Verify focus/keyboard, selection, sources, completion and axe; visually review
      desktop/tablet/mobile and run repository gates.
