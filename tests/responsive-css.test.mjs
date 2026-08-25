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
    const cockpitGridBlock = extractBlock(css, '.cockpit-grid');
    const cockpitChildrenBlock = extractBlock(css, '.cockpit-grid > *');

    expect(appShellBlock).toMatch(/\.app-shell\s*\{[^}]*\bmin-width:\s*0\s*;/);
    expect(withoutDeclaration(appShellBlock, /\s*min-width:\s*0\s*;\n?/)).not.toMatch(
      /\.app-shell\s*\{[^}]*\bmin-width:\s*0\s*;/,
    );

    expect(cockpitGridBlock).toMatch(/\.cockpit-grid\s*\{[^}]*\bdisplay:\s*grid\s*;/);
    expect(cockpitGridBlock).toMatch(/\.cockpit-grid\s*\{[^}]*\bmin-width:\s*0\s*;/);
    expect(cockpitGridBlock).toMatch(
      /\.cockpit-grid\s*\{[^}]*\bmin-height:\s*calc\(100vh - 5\.25rem\)\s*;/,
    );
    expect(cockpitGridBlock).toMatch(
      /grid-template-columns:\s*minmax\(0,\s*1fr\) minmax\(16rem,\s*19rem\)\s*;/,
    );
    expect(cockpitGridBlock).toMatch(
      /'guide score'\s*'tray score'\s*'commands score'\s*'feedback score'\s*'board score'/,
    );

    expect(cockpitChildrenBlock).toMatch(/\.cockpit-grid\s*>\s*\*\s*\{[^}]*\bmin-width:\s*0\s*;/);
    expect(withoutDeclaration(cockpitChildrenBlock, /\s*min-width:\s*0\s*;\n?/)).not.toMatch(
      /\.cockpit-grid\s*>\s*\*\s*\{[^}]*\bmin-width:\s*0\s*;/,
    );

    expect(css).toMatch(
      /@media\s*\(max-width:\s*58rem\)[\s\S]*?\.cockpit-grid\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)\s*;/,
    );
    expect(css).toMatch(
      /@media\s*\(max-width:\s*58rem\)[\s\S]*?\.cockpit-grid\s*\{[\s\S]*?'guide'\s*'tray'\s*'commands'\s*'feedback'\s*'board'\s*'score'/,
    );
  });

  it('allocates the lower workspace to the schedule board on laptop layouts', async () => {
    const css = await readFile(new URL('../src/styles/app.css', import.meta.url), 'utf8');
    const cockpitGridBlock = extractBlock(css, '.cockpit-grid');
    const levelGuideBlock = extractBlock(css, '.level-guide-panel');
    const trayPanelBlock = extractBlock(css, '.tray-panel');
    const commandRailBlock = extractBlock(css, '.schedule-command-rail');
    const boardPanelBlock = extractBlock(css, '.board-panel');
    const boardHeaderBlock = extractBlock(css, '.board-panel__header');
    const boardScrollBlock = extractBlock(css, '.board-scroll-region');

    expect(cockpitGridBlock).toMatch(
      /grid-template-rows:\s*auto minmax\(0,\s*auto\) auto auto minmax\(45dvh,\s*1fr\)\s*;/,
    );
    expect(levelGuideBlock).toMatch(/\.level-guide-panel\s*\{[^}]*\bmin-height:\s*0\s*;/);
    expect(trayPanelBlock).toMatch(
      /\.tray-panel\s*\{[^}]*\bmax-height:\s*min\(22dvh,\s*14rem\)\s*;/,
    );
    expect(commandRailBlock).toMatch(
      /\.schedule-command-rail\s*\{[^}]*\bmin-height:\s*2\.5rem\s*;/,
    );
    expect(boardPanelBlock).toMatch(/\.board-panel\s*\{[^}]*\bmin-height:\s*45dvh\s*;/);
    expect(boardPanelBlock).toMatch(/\.board-panel\s*\{[^}]*\bdisplay:\s*grid\s*;/);
    expect(boardPanelBlock).toMatch(
      /\.board-panel\s*\{[^}]*\bgrid-template-rows:\s*auto minmax\(0,\s*1fr\) auto\s*;/,
    );
    expect(boardHeaderBlock).toMatch(/\.board-panel__header\s*\{[^}]*\bmin-width:\s*0\s*;/);
    expect(boardScrollBlock).toMatch(/\.board-scroll-region\s*\{[^}]*\bmin-height:\s*0\s*;/);
  });

  it('uses comfortable controls, visible feedback, and a compact two-row block dock on mobile', async () => {
    const css = await readFile(new URL('../src/styles/app.css', import.meta.url), 'utf8');
    const commandRailBlock = extractBlock(css, '.schedule-command-rail');
    const commandRailPrimaryBlock = extractBlock(css, '.schedule-command-rail__primary');
    const commandRailSecondaryBlock = extractBlock(css, '.schedule-command-rail__secondary');
    const commandButtonBlock = extractBlock(css, '.command-button');
    const commandFeedbackBlock = extractBlock(css, '.command-feedback');
    const trayPanelBlock = extractBlock(css, '.tray-panel');
    const operationTrayGridBlock = extractBlock(css, '.operation-tray-grid');
    const batchReadyBlock = extractBlock(css, ".batch-lane[data-phase='ready']");
    const batchDoneBlock = extractBlock(css, "\n.batch-lane[data-phase='done'] {");
    const operationButtonBlock = extractBlock(css, '\n.operation-button {');
    const operationCodeBlock = extractBlock(css, '\n.operation-button__code {');
    const operationSecondaryBlock = extractBlock(css, '.operation-button__meta,');
    const batchStacksBlock = extractBlock(css, '\n.batch-lane__stacks {');
    const batchStackBlock = extractBlock(css, '.batch-stack');
    const batchStackTokensBlock = extractBlock(css, '.batch-stack__tokens');
    const readyCountBlock = extractBlock(css, '.ready-count');

    expect(commandRailBlock).toMatch(
      /\.schedule-command-rail\s*\{[^}]*\bgrid-area:\s*commands\s*;/,
    );
    expect(commandRailBlock).toMatch(/\.schedule-command-rail\s*\{[^}]*\bdisplay:\s*flex\s*;/);
    expect(commandRailBlock).toMatch(/\.schedule-command-rail\s*\{[^}]*\bflex-wrap:\s*wrap\s*;/);
    expect(commandRailPrimaryBlock).toMatch(
      /\.schedule-command-rail__primary,\s*\.schedule-command-rail__secondary\s*\{[^}]*\bdisplay:\s*flex\s*;/,
    );
    expect(commandRailSecondaryBlock).toMatch(
      /\.schedule-command-rail__secondary\s*\{[^}]*\bmin-width:\s*0\s*;/,
    );
    expect(commandButtonBlock).toMatch(/\.command-button\s*\{[^}]*\bmin-height:\s*2\.25rem\s*;/);
    expect(commandButtonBlock).toMatch(/\.command-button\s*\{[^}]*\bborder-radius:\s*6px\s*;/);
    expect(commandButtonBlock).toMatch(
      /\.command-button\s*\{[^}]*\bpadding:\s*0\.42rem 0\.58rem\s*;/,
    );
    expect(commandButtonBlock).toMatch(/\.command-button\s*\{[^}]*\bfont-size:\s*0\.72rem\s*;/);
    expect(commandFeedbackBlock).toMatch(/\.command-feedback\s*\{[^}]*\bgrid-area:\s*feedback\s*;/);
    expect(commandFeedbackBlock).toMatch(
      /\.command-feedback\s*\{[^}]*\bmargin-top:\s*-0\.5rem\s*;/,
    );
    expect(commandFeedbackBlock).toMatch(/\.command-feedback\s*\{[^}]*\bmin-height:\s*1\.8rem\s*;/);
    expect(commandFeedbackBlock).not.toMatch(/\bposition:\s*absolute\s*;/);
    expect(commandFeedbackBlock).not.toMatch(/\bwidth:\s*1px\s*;/);
    expect(commandFeedbackBlock).not.toMatch(/\boverflow:\s*hidden\s*;/);
    expect(commandFeedbackBlock).not.toMatch(/\bclip:\s*rect\(0,\s*0,\s*0,\s*0\)\s*;/);
    const patternCheckBlock = extractBlock(css, '.pattern-check');
    const patternCheckStatusBlock = extractBlock(css, '.pattern-check__copy,');
    expect(patternCheckBlock).toMatch(/\.pattern-check\s*\{[^}]*\bdisplay:\s*grid\s*;/);
    expect(patternCheckBlock).toMatch(
      /grid-template-columns:\s*auto minmax\(4\.75rem,\s*auto\) minmax\(3\.75rem,\s*auto\) auto\s*;/,
    );
    expect(patternCheckBlock).toMatch(
      /\.pattern-check\s*\{[^}]*\bmax-width:\s*min\(100%,\s*22rem\)\s*;/,
    );
    expect(patternCheckBlock).toMatch(/\.pattern-check\s*\{[^}]*\bmin-width:\s*0\s*;/);
    expect(patternCheckBlock).toMatch(/\.pattern-check\s*\{[^}]*\bborder-radius:\s*7px\s*;/);
    expect(patternCheckStatusBlock).toMatch(
      /\.pattern-check__copy,\s*\.pattern-check__status\s*\{[^}]*\boverflow:\s*hidden\s*;/,
    );
    expect(patternCheckStatusBlock).toMatch(
      /\.pattern-check__copy,\s*\.pattern-check__status\s*\{[^}]*\btext-overflow:\s*ellipsis\s*;/,
    );
    expect(css).toMatch(
      /@media\s*\(max-width:\s*48rem\)[\s\S]*?\.pattern-check\s*\{[\s\S]*?grid-template-columns:\s*auto minmax\(0,\s*1fr\) auto\s*;/,
    );
    expect(trayPanelBlock).toMatch(/\.tray-panel\s*\{[^}]*\boverflow:\s*hidden\s*;/);
    expect(operationTrayGridBlock).toMatch(
      /\.operation-tray-grid\s*\{[^}]*\bgrid-auto-flow:\s*column\s*;/,
    );
    expect(operationTrayGridBlock).toMatch(
      /\.operation-tray-grid\s*\{[^}]*\bgrid-auto-columns:\s*minmax\(10\.5rem,\s*13rem\)\s*;/,
    );
    expect(operationTrayGridBlock).toMatch(
      /\.operation-tray-grid\s*\{[^}]*\boverflow-x:\s*auto\s*;/,
    );
    expect(operationButtonBlock).toMatch(
      /\.operation-button\s*\{[^}]*\bgrid-template-rows:\s*minmax\(0,\s*1fr\)\s*;/,
    );
    expect(operationButtonBlock).toMatch(/\.operation-button\s*\{[^}]*\bheight:\s*1\.875rem\s*;/);
    expect(operationButtonBlock).toMatch(
      /\.operation-button\s*\{[^}]*\bmin-height:\s*1\.875rem\s*;/,
    );
    expect(operationButtonBlock).toMatch(
      /\.operation-button\s*\{[^}]*\bmax-height:\s*1\.875rem\s*;/,
    );
    expect(operationButtonBlock).toMatch(
      /\.operation-button\s*\{[^}]*\bpadding:\s*0\.16rem 0\.75rem 0\.28rem 0\.28rem\s*;/,
    );
    const operationDirectionBlock = extractBlock(css, '.operation-button__direction');
    expect(operationDirectionBlock).toMatch(
      /\.operation-button__direction\s*\{[^}]*\bmax-width:\s*2\.1rem\s*;/,
    );
    expect(operationDirectionBlock).toMatch(
      /\.operation-button__direction\s*\{[^}]*\boverflow:\s*hidden\s*;/,
    );
    expect(operationDirectionBlock).toMatch(
      /\.operation-button__direction\s*\{[^}]*\bfont-size:\s*0\.5rem\s*;/,
    );
    expect(operationCodeBlock).toMatch(
      /\.operation-button__code\s*\{[^}]*\bline-height:\s*1\.05\s*;/,
    );
    expect(operationSecondaryBlock).toMatch(
      /\.operation-button__meta,\s*\.operation-button__state\s*\{[^}]*\bposition:\s*absolute\s*;/,
    );
    expect(operationSecondaryBlock).toMatch(
      /\.operation-button__meta,\s*\.operation-button__state\s*\{[^}]*\bwidth:\s*1px\s*;/,
    );
    expect(operationSecondaryBlock).toMatch(
      /\.operation-button__meta,\s*\.operation-button__state\s*\{[^}]*\bheight:\s*1px\s*;/,
    );
    expect(operationSecondaryBlock).toMatch(
      /\.operation-button__meta,\s*\.operation-button__state\s*\{[^}]*\bclip:\s*rect\(0,\s*0,\s*0,\s*0\)\s*;/,
    );
    expect(batchStacksBlock).toMatch(
      /\.batch-lane__stacks\s*\{[^}]*\bgrid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)\s*;/,
    );
    expect(batchReadyBlock).toMatch(
      /\.batch-lane\[data-phase='ready'\]\s*\{[^}]*\bborder-color:\s*color-mix\(in srgb,\s*var\(--batch-accent,\s*var\(--ready\)\) 34%,\s*var\(--line\)\)\s*;/,
    );
    expect(batchDoneBlock).toMatch(
      /\.batch-lane\[data-phase='done'\]\s*\{[^}]*\bopacity:\s*0\.64\s*;/,
    );
    expect(css).toMatch(
      /\.batch-lane\[data-phase='done'\]\s+\.operation-button\s*\{[\s\S]*?height:\s*1\.45rem\s*;/,
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
      /@media\s*\(max-width:\s*40rem\)[\s\S]*?\.operation-button\s*\{[\s\S]*?height:\s*2\.75rem\s*;[\s\S]*?min-height:\s*2\.75rem\s*;[\s\S]*?max-height:\s*2\.75rem\s*;/,
    );
    expect(css).toMatch(
      /@media\s*\(max-width:\s*40rem\)[\s\S]*?\.batch-lane\s*\{[\s\S]*?scroll-snap-align:\s*start\s*;/,
    );
    expect(css).toMatch(
      /@media\s*\(max-width:\s*40rem\)[\s\S]*?\.top-rail\s*\{[\s\S]*?gap:\s*0\.45rem\s*;[\s\S]*?padding:\s*0\.55rem 0\.65rem\s*;/,
    );
    expect(css).toMatch(
      /@media\s*\(max-width:\s*40rem\)[\s\S]*?\.top-rail__brand h1\s*\{[\s\S]*?font-size:\s*1\.2rem\s*;/,
    );
    expect(css).not.toMatch(
      /@media\s*\(max-width:\s*40rem\)[\s\S]*?\.top-rail__brand h1\s*\{[\s\S]*?font-size:\s*2rem\s*;/,
    );
  });

  it('stacks score rail children without stale nested grid placement', async () => {
    const css = await readFile(new URL('../src/styles/app.css', import.meta.url), 'utf8');
    const scoreRailBlock = extractBlock(css, '.score-rail');

    expect(scoreRailBlock).toMatch(/\.score-rail\s*\{[^}]*\bdisplay:\s*grid\s*;/);
    expect(scoreRailBlock).toMatch(/\.score-rail\s*\{[^}]*\bgap:\s*0\.65rem\s*;/);
    expect(css).not.toMatch(/\.inspector-panel\s*\{[^}]*\bgrid-area\s*:/);
    expect(css).not.toMatch(/\.metrics-panel\s*\{[^}]*\bgrid-area\s*:/);
  });

  it('keeps schedule SVG geometry intrinsic and gives memory strips explicit non-default paint', async () => {
    const css = await readFile(new URL('../src/styles/app.css', import.meta.url), 'utf8');
    const scheduleBoardSource = await readFile(
      new URL('../src/components/ScheduleBoard.tsx', import.meta.url),
      'utf8',
    );
    const boardSvgBlock = extractBlock(css, '.schedule-board-svg');
    const scheduleRectBlock = extractBlock(css, '.schedule-rect');
    const scheduleLabelBlock = extractBlock(css, '\n.schedule-label {');
    const previewBlock = extractBlock(css, '.schedule-preview-rect');
    const previewLabelBlock = extractBlock(css, '.schedule-preview-label');
    const rankBandBlock = extractBlock(css, '.rank-band');
    const memorySegmentBlock = extractBlock(css, '.memory-strip__segment');
    const memoryActiveBlock = extractBlock(css, '.memory-strip__segment--active');
    const memoryLabelBlock = extractBlock(css, '.memory-strip__label');

    expect(scheduleBoardSource).toMatch(/export const CELL_WIDTH = 60;/);
    expect(scheduleBoardSource).toMatch(/const WORK_BLOCK_HEIGHT = 44;/);
    expect(scheduleBoardSource).toMatch(/const ROW_HEIGHT = 84;/);
    expect(scheduleBoardSource).toMatch(/const DUALPIPE_ROW_HEIGHT = 132;/);
    expect(scheduleBoardSource).toMatch(/const MIN_BOARD_WIDTH = 920;/);
    expect(scheduleBoardSource).toMatch(
      /return operation\.direction === 'asc' \? 0 : WORK_BLOCK_HEIGHT \+ 4;/,
    );
    expect(boardSvgBlock).toMatch(/\.schedule-board-svg\s*\{[^}]*\bwidth:\s*100%\s*;/);
    expect(boardSvgBlock).toMatch(/\.schedule-board-svg\s*\{[^}]*\bmax-width:\s*none\s*;/);
    expect(scheduleRectBlock).toMatch(
      /\.schedule-rect\s*\{[^}]*\bstroke:\s*var\(--operation-accent\)\s*;/,
    );
    expect(rankBandBlock).toMatch(
      /\.rank-band\s*\{[^}]*\bfill:\s*rgba\(23,\s*33,\s*35,\s*0\.025\)\s*;/,
    );
    expect(previewBlock).toMatch(
      /\.schedule-preview-rect\s*\{[^}]*\bfill:\s*hsl\(var\(--operation-hue\) 58% 48% \/ 0\.16\)\s*;/,
    );
    expect(previewBlock).toMatch(
      /\.schedule-preview-rect\s*\{[^}]*\bstroke:\s*var\(--operation-accent\)\s*;/,
    );
    expect(previewBlock).toMatch(/\.schedule-preview-rect\s*\{[^}]*\bstroke-dasharray:\s*5 4\s*;/);
    expect(previewBlock).toMatch(/\.schedule-preview-rect\s*\{[^}]*\bstroke-width:\s*2\s*;/);
    expect(scheduleLabelBlock).toMatch(/\.schedule-label\s*\{[^}]*\bfont-size:\s*0\.62rem\s*;/);
    expect(scheduleLabelBlock).toMatch(
      /\.schedule-label\s*\{[^}]*\bfont-family:\s*var\(--font-mono\)\s*;/,
    );
    expect(scheduleLabelBlock).toMatch(/\.schedule-label\s*\{[^}]*\bpointer-events:\s*none\s*;/);
    const directionLabelBlock = extractBlock(css, '.schedule-direction-label');
    expect(directionLabelBlock).toMatch(
      /\.schedule-direction-label\s*\{[^}]*\bfont-size:\s*0\.48rem\s*;/,
    );
    expect(directionLabelBlock).toMatch(
      /\.schedule-direction-label\s*\{[^}]*\btext-transform:\s*uppercase\s*;/,
    );
    expect(previewLabelBlock).toMatch(
      /\.schedule-preview-label,\s*\.schedule-label\s*\{[^}]*\bfont-size:\s*0\.62rem\s*;/,
    );

    expect(memorySegmentBlock).toMatch(
      /\.memory-strip__segment\s*\{[^}]*\bfill:\s*rgba\(101,\s*113,\s*123,\s*0\.08\)\s*;/,
    );
    expect(memoryActiveBlock).toMatch(
      /\.memory-strip__segment--active\s*\{[^}]*\bfill:\s*rgba\(8,\s*120,\s*134,\s*0\.22\)\s*;/,
    );
    expect(memoryLabelBlock).toMatch(/\.memory-strip__label\s*\{[^}]*\bfont-size:\s*0\.625rem\s*;/);
  });

  it('keeps virtual-stage topology copy compact and horizontally scrollable', async () => {
    const css = await readFile(new URL('../src/styles/app.css', import.meta.url), 'utf8');
    const topologyOwnersBlock = extractBlock(css, '.rank-owner-list');

    expect(topologyOwnersBlock).toMatch(/\.rank-owner-list\s*\{[^}]*\boverflow-x:\s*auto\s*;/);
  });

  it('keeps compact labels whole and supports two or three ready-queue stacks', async () => {
    const css = await readFile(new URL('../src/styles/app.css', import.meta.url), 'utf8');
    const guideChipBlock = extractBlock(css, '\n.level-guide-panel__chip {');
    const guideDetailsBlock = extractBlock(css, '.level-guide-panel__details');
    const guideConceptsBlock = extractBlock(css, '.level-guide-panel__concepts');
    const guideConceptListBlock = extractBlock(css, '.level-guide-panel__concept-list');
    const batchStacksBlock = extractBlock(css, '\n.batch-lane__stacks {');
    const batchThreeStackBlock = extractBlock(css, ".batch-lane__stacks[data-stack-count='3']");
    const operationButtonBlock = extractBlock(css, '\n.operation-button {');
    const operationCodeBlock = extractBlock(css, '\n.operation-button__code {');

    expect(guideChipBlock).toMatch(
      /\.level-guide-panel__chip\s*\{[^}]*\bwhite-space:\s*nowrap\s*;/,
    );
    expect(guideChipBlock).toMatch(
      /\.level-guide-panel__chip\s*\{[^}]*\btext-overflow:\s*ellipsis\s*;/,
    );
    expect(guideDetailsBlock).toMatch(
      /\.level-guide-panel__details\s*\{[^}]*\bmax-width:\s*min\(100%,\s*36rem\)\s*;/,
    );
    expect(guideConceptsBlock).toMatch(
      /\.level-guide-panel__concepts\s*\{[^}]*\bmax-height:\s*6\.5rem\s*;/,
    );
    expect(guideConceptsBlock).toMatch(
      /\.level-guide-panel__concepts\s*\{[^}]*\boverflow:\s*auto\s*;/,
    );
    expect(guideConceptListBlock).toMatch(
      /\.level-guide-panel__concept-list\s*\{[^}]*\bdisplay:\s*flex\s*;/,
    );
    expect(guideConceptListBlock).toMatch(
      /\.level-guide-panel__concept-list\s*\{[^}]*\bflex-wrap:\s*wrap\s*;/,
    );
    expect(batchStacksBlock).toMatch(
      /\.batch-lane__stacks\s*\{[^}]*\bgrid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)\s*;/,
    );
    expect(batchThreeStackBlock).toMatch(
      /\.batch-lane__stacks\[data-stack-count='3'\]\s*\{[^}]*\bgrid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)\s*;/,
    );
    expect(operationButtonBlock).toMatch(/\.operation-button\s*\{[^}]*\bheight:\s*1\.875rem\s*;/);
    expect(operationButtonBlock).toMatch(
      /\.operation-button\s*\{[^}]*\bmin-height:\s*1\.875rem\s*;/,
    );
    expect(operationCodeBlock).toMatch(
      /\.operation-button__code\s*\{[^}]*\bwhite-space:\s*nowrap\s*;/,
    );
  });

  it('keeps queue and board scroll local and supports reduced motion', async () => {
    const css = await readFile(new URL('../src/styles/app.css', import.meta.url), 'utf8');
    const htmlBlock = extractBlock(css, 'html');
    const bodyBlock = extractBlock(css, 'body');
    const trayPanelBlock = extractBlock(css, '.tray-panel');
    const operationTrayGridBlock = extractBlock(css, '.operation-tray-grid');
    const boardScrollBlock = extractBlock(css, '.board-scroll-region');

    expect(htmlBlock).toMatch(/\bmin-width:\s*0\s*;/);
    expect(bodyBlock).toMatch(/\bmin-width:\s*0\s*;/);
    expect(trayPanelBlock).toMatch(/\boverflow:\s*hidden\s*;/);
    expect(operationTrayGridBlock).toMatch(/\boverflow-x:\s*auto\s*;/);
    expect(boardScrollBlock).toMatch(/\boverflow-x:\s*auto\s*;/);
    expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
    expect(css).toMatch(/transition:\s*none !important/);
  });

  it('keeps keyboard focus visible on scrollable schedule regions', async () => {
    const css = await readFile(new URL('../src/styles/app.css', import.meta.url), 'utf8');

    expect(css).toMatch(/\.board-scroll-region:focus-visible\s*\{/);
    expect(css).toMatch(
      /\.board-scroll-region:focus-visible\s*\{[\s\S]*?outline:\s*var\(--focus-ring\)\s*;/,
    );
    expect(css).toMatch(
      /\.board-scroll-region:focus-visible\s*\{[\s\S]*?outline-offset:\s*2px\s*;/,
    );
  });

  it('keeps selected identity and score summary compact in the right rail', async () => {
    const css = await readFile(new URL('../src/styles/app.css', import.meta.url), 'utf8');
    const inspectorOperationBlock = extractBlock(css, '.inspector-operation');
    const inspectorSwatchBlock = extractBlock(css, '.inspector-operation__swatch');
    const metricsPanelBlock = extractBlock(css, '.metrics-panel');
    const scoreboardBlock = extractBlock(css, '.scoreboard');
    const scoreboardCardBlock = extractBlock(css, '.scoreboard-card');
    const policyComparisonBlock = extractBlock(css, '.policy-comparison');

    expect(inspectorOperationBlock).toMatch(
      /\.inspector-operation\s*\{[^}]*\bborder:\s*1px solid color-mix\(in srgb,\s*var\(--operation-accent\) 42%,\s*var\(--line\)\)\s*;/,
    );
    expect(inspectorOperationBlock).toMatch(
      /\.inspector-operation\s*\{[^}]*\bbackground:\s*hsl\(var\(--operation-hue\) 56% 95%\)\s*;/,
    );
    expect(inspectorSwatchBlock).toMatch(
      /\.inspector-operation__swatch\s*\{[^}]*\bbackground:\s*var\(--operation-accent\)\s*;/,
    );
    expect(metricsPanelBlock).toMatch(/\.metrics-panel\s*\{[^}]*\bdisplay:\s*grid\s*;/);
    expect(scoreboardBlock).toMatch(
      /\.scoreboard\s*\{[^}]*\bgrid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)\s*;/,
    );
    expect(scoreboardCardBlock).toMatch(/\.scoreboard-card\s*\{[^}]*\bborder-radius:\s*8px\s*;/);
    expect(policyComparisonBlock).toMatch(
      /\.policy-comparison\s*\{[^}]*\bborder-radius:\s*8px\s*;/,
    );
    expect(policyComparisonBlock).toMatch(/\.policy-comparison\s*\{[^}]*\boverflow:\s*hidden\s*;/);
    expect(policyComparisonBlock).not.toMatch(/\bposition:\s*absolute\s*;/);
  });
});
