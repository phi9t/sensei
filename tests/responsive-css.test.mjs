// @vitest-environment node

import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

function extractBlock(source, selector) {
  const start = source.indexOf(selector);
  expect(start).toBeGreaterThanOrEqual(0);

  const openBrace = source.indexOf('{', start);
  expect(openBrace).toBeGreaterThan(start);

  let depth = 0;
  for (let index = openBrace; index < source.length; index += 1) {
    const character = source[index];
    if (character === '{') {
      depth += 1;
    } else if (character === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }

  throw new Error(`Unable to extract CSS block for ${selector}`);
}

function withoutDeclaration(block, declaration) {
  const mutated = block.replace(declaration, '');
  expect(mutated).not.toBe(block);
  return mutated;
}

describe('responsive play surface CSS contract', () => {
  it('keeps the timeline dominant and stacks the play surface on narrow screens', async () => {
    const css = await readFile(new URL('../src/styles/app.css', import.meta.url), 'utf8');
    const appShellBlock = extractBlock(css, '.app-shell');
    const contentGridBlock = extractBlock(css, '.content-grid');
    const contentGridChildrenBlock = extractBlock(css, '.content-grid > *');

    expect(appShellBlock).toMatch(/\.app-shell\s*\{[^}]*\bmin-width:\s*0\s*;/);
    expect(withoutDeclaration(appShellBlock, /\s*min-width:\s*0\s*;\n?/)).not.toMatch(
      /\.app-shell\s*\{[^}]*\bmin-width:\s*0\s*;/,
    );

    expect(contentGridBlock).toMatch(/\.content-grid\s*\{[^}]*\bmin-width:\s*0\s*;/);
    expect(withoutDeclaration(contentGridBlock, /\s*min-width:\s*0\s*;\n?/)).not.toMatch(
      /\.content-grid\s*\{[^}]*\bmin-width:\s*0\s*;/,
    );

    expect(contentGridChildrenBlock).toMatch(
      /\.content-grid\s*>\s*\*\s*\{[^}]*\bmin-width:\s*0\s*;/,
    );
    expect(withoutDeclaration(contentGridChildrenBlock, /\s*min-width:\s*0\s*;\n?/)).not.toMatch(
      /\.content-grid\s*>\s*\*\s*\{[^}]*\bmin-width:\s*0\s*;/,
    );

    expect(contentGridBlock).toMatch(
      /grid-template-columns:\s*minmax\(0,\s*1fr\) minmax\(17rem,\s*21rem\)\s*;/,
    );
    expect(contentGridBlock).toMatch(/'tray tray'\s*'board inspector'\s*'controls metrics'/);
    expect(css).toMatch(
      /@media\s*\(max-width:\s*52rem\)[\s\S]*?\.content-grid\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)\s*;/,
    );
  });

  it('uses comfortable controls and a compact two-row block dock on mobile', async () => {
    const css = await readFile(new URL('../src/styles/app.css', import.meta.url), 'utf8');
    const controlsBlock = extractBlock(css, '.controls-panel');
    const commandButtonBlock = extractBlock(css, '.command-button');
    const operationButtonBlock = extractBlock(css, '\n.operation-button {');
    const batchStacksBlock = extractBlock(css, '.batch-lane__stacks');
    const batchStackBlock = extractBlock(css, '.batch-stack');
    const batchStackTokensBlock = extractBlock(css, '.batch-stack__tokens');
    const readyCountBlock = extractBlock(css, '.ready-count');

    expect(controlsBlock).toMatch(/\.controls-panel\s*\{[^}]*\bdisplay:\s*grid\s*;/);
    expect(commandButtonBlock).toMatch(/\.command-button\s*\{[^}]*\bmin-height:\s*2\.75rem\s*;/);
    expect(operationButtonBlock).toMatch(
      /\.operation-button\s*\{[^}]*\bmin-height:\s*2\.75rem\s*;/,
    );
    expect(batchStacksBlock).toMatch(
      /\.batch-lane__stacks\s*\{[^}]*\bgrid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)\s*;/,
    );
    expect(batchStackBlock).toMatch(/\.batch-stack\s*\{[^}]*\bmin-width:\s*0\s*;/);
    expect(batchStackTokensBlock).toMatch(/\.batch-stack__tokens\s*\{[^}]*\bdisplay:\s*grid\s*;/);
    expect(readyCountBlock).toMatch(/\.ready-count\s*\{[^}]*\bborder-radius:\s*999px\s*;/);
    expect(css).toMatch(
      /@media\s*\(max-width:\s*40rem\)[\s\S]*?\.operation-tray-grid\s*\{[\s\S]*?grid-auto-flow:\s*column\s*;/,
    );
    expect(css).toMatch(
      /@media\s*\(max-width:\s*40rem\)[\s\S]*?\.operation-tray-grid\s*\{[\s\S]*?grid-auto-columns:\s*minmax\(13\.75rem,\s*76vw\)\s*;/,
    );
    expect(css).toMatch(
      /@media\s*\(max-width:\s*40rem\)[\s\S]*?\.operation-tray-grid\s*\{[\s\S]*?grid-template-columns:\s*none\s*;/,
    );
    expect(css).toMatch(
      /@media\s*\(max-width:\s*40rem\)[\s\S]*?\.operation-tray-grid\s*\{[\s\S]*?overflow-x:\s*auto\s*;/,
    );
    expect(css).toMatch(
      /@media\s*\(max-width:\s*40rem\)[\s\S]*?\.operation-tray-grid\s*\{[\s\S]*?scroll-snap-type:\s*x proximity\s*;/,
    );
    expect(css).toMatch(
      /@media\s*\(max-width:\s*40rem\)[\s\S]*?\.batch-lane\s*\{[\s\S]*?scroll-snap-align:\s*start\s*;/,
    );
  });

  it('keeps schedule SVG geometry intrinsic and gives memory strips explicit non-default paint', async () => {
    const css = await readFile(new URL('../src/styles/app.css', import.meta.url), 'utf8');
    const boardSvgBlock = extractBlock(css, '.schedule-board-svg');
    const scheduleRectBlock = extractBlock(css, '.schedule-rect');
    const scheduleLabelBlock = extractBlock(css, '\n.schedule-label {');
    const previewBlock = extractBlock(css, '.schedule-preview-rect');
    const previewLabelBlock = extractBlock(css, '.schedule-preview-label');
    const memorySegmentBlock = extractBlock(css, '.memory-strip__segment');
    const memoryActiveBlock = extractBlock(css, '.memory-strip__segment--active');
    const memoryLabelBlock = extractBlock(css, '.memory-strip__label');

    expect(boardSvgBlock).toMatch(/\.schedule-board-svg\s*\{[^}]*\bwidth:\s*100%\s*;/);
    expect(boardSvgBlock).toMatch(/\.schedule-board-svg\s*\{[^}]*\bmax-width:\s*none\s*;/);
    expect(scheduleRectBlock).toMatch(
      /\.schedule-rect\s*\{[^}]*\bstroke:\s*var\(--operation-accent\)\s*;/,
    );
    expect(previewBlock).toMatch(
      /\.schedule-preview-rect\s*\{[^}]*\bfill:\s*hsl\(var\(--operation-hue\) 58% 48% \/ 0\.16\)\s*;/,
    );
    expect(previewBlock).toMatch(
      /\.schedule-preview-rect\s*\{[^}]*\bstroke:\s*var\(--operation-accent\)\s*;/,
    );
    expect(previewBlock).toMatch(/\.schedule-preview-rect\s*\{[^}]*\bstroke-dasharray:\s*5 4\s*;/);
    expect(previewBlock).toMatch(/\.schedule-preview-rect\s*\{[^}]*\bstroke-width:\s*2\s*;/);
    expect(scheduleLabelBlock).toMatch(/\.schedule-label\s*\{[^}]*\bfont-size:\s*0\.46rem\s*;/);
    expect(scheduleLabelBlock).toMatch(/\.schedule-label\s*\{[^}]*\bpointer-events:\s*none\s*;/);
    expect(previewLabelBlock).toMatch(
      /\.schedule-preview-label\s*\{[^}]*\bfont-size:\s*0\.46rem\s*;/,
    );

    expect(memorySegmentBlock).toMatch(
      /\.memory-strip__segment\s*\{[^}]*\bfill:\s*rgba\(101,\s*113,\s*123,\s*0\.08\)\s*;/,
    );
    expect(memoryActiveBlock).toMatch(
      /\.memory-strip__segment--active\s*\{[^}]*\bfill:\s*rgba\(8,\s*120,\s*134,\s*0\.22\)\s*;/,
    );
    expect(memoryLabelBlock).toMatch(/\.memory-strip__label\s*\{[^}]*\bfont-size:\s*0\.625rem\s*;/);
  });
});
