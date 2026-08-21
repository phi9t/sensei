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

    expect(controlsBlock).toMatch(/\.controls-panel\s*\{[^}]*\bdisplay:\s*grid\s*;/);
    expect(commandButtonBlock).toMatch(/\.command-button\s*\{[^}]*\bmin-height:\s*2\.75rem\s*;/);
    expect(operationButtonBlock).toMatch(/\.operation-button\s*\{[^}]*\bmin-height:\s*3rem\s*;/);
    expect(css).toMatch(
      /@media\s*\(max-width:\s*40rem\)[\s\S]*?\.operation-tray-grid\s*\{[\s\S]*?grid-template-rows:\s*repeat\(2,\s*auto\)\s*;/,
    );
  });

  it('keeps schedule SVG geometry intrinsic and gives memory strips explicit non-default paint', async () => {
    const css = await readFile(new URL('../src/styles/app.css', import.meta.url), 'utf8');
    const boardSvgBlock = extractBlock(css, '.schedule-board-svg');
    const memorySegmentBlock = extractBlock(css, '.memory-strip__segment');
    const memoryActiveBlock = extractBlock(css, '.memory-strip__segment--active');
    const memoryLabelBlock = extractBlock(css, '.memory-strip__label');

    expect(boardSvgBlock).toMatch(/\.schedule-board-svg\s*\{[^}]*\bwidth:\s*100%\s*;/);
    expect(boardSvgBlock).toMatch(/\.schedule-board-svg\s*\{[^}]*\bmax-width:\s*none\s*;/);

    expect(memorySegmentBlock).toMatch(
      /\.memory-strip__segment\s*\{[^}]*\bfill:\s*rgba\(101,\s*113,\s*123,\s*0\.08\)\s*;/,
    );
    expect(memoryActiveBlock).toMatch(
      /\.memory-strip__segment--active\s*\{[^}]*\bfill:\s*rgba\(8,\s*120,\s*134,\s*0\.22\)\s*;/,
    );
    expect(memoryLabelBlock).toMatch(/\.memory-strip__label\s*\{[^}]*\bfont-size:\s*0\.625rem\s*;/);
  });
});
