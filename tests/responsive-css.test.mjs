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

describe('responsive shell CSS contract', () => {
  it('allows grid children to shrink and wraps the mobile hero controls', async () => {
    const css = await readFile(new URL('../src/styles/app.css', import.meta.url), 'utf8');
    const appShellBlock = extractBlock(css, '.app-shell');
    const contentGridBlock = extractBlock(css, '.content-grid');
    const contentGridChildrenBlock = extractBlock(css, '.content-grid > *');
    const mobileBlock = extractBlock(css, '@media (max-width: 764px)');
    const heroToplineBlock = extractBlock(mobileBlock, '.hero-panel__topline');

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

    expect(heroToplineBlock).toMatch(/\.hero-panel__topline\s*\{[^}]*\bflex-wrap:\s*wrap\s*;/);
    expect(withoutDeclaration(heroToplineBlock, /\s*flex-wrap:\s*wrap\s*;\n?/)).not.toMatch(
      /\.hero-panel__topline\s*\{[^}]*\bflex-wrap:\s*wrap\s*;/,
    );
  });
});
