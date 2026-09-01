#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

function run(command, args) {
  try {
    return execFileSync(command, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trimEnd();
  } catch (error) {
    const stderr = error?.stderr?.toString?.().trim();
    return stderr ? `[failed] ${stderr}` : `[failed] ${command} ${args.join(' ')}`;
  }
}

function section(title) {
  console.log(`\n## ${title}`);
}

function listDirectory(path) {
  if (!existsSync(path)) {
    console.log('(missing)');
    return;
  }

  const entries = readdirSync(path).sort();
  if (entries.length === 0) {
    console.log('(empty)');
    return;
  }

  for (const entry of entries) {
    const fullPath = join(path, entry);
    const marker = statSync(fullPath).isDirectory() ? '/' : '';
    console.log(`- ${entry}${marker}`);
  }
}

console.log('# Sensei Agent Status');

section('Git');
console.log(run('git', ['branch', '--show-current']) || '(detached)');
console.log(run('git', ['status', '--short']) || '(clean)');

section('Recent Commits');
console.log(run('git', ['log', '--oneline', '-5']) || '(none)');

section('Agent Templates');
listDirectory('.agents/templates');

section('Agent Docs');
for (const path of ['AGENTS.md', 'CLAUDE.md', 'docs/agentic-engineering.md']) {
  console.log(`- ${path}: ${existsSync(path) ? 'present' : 'missing'}`);
}

section('Recommended Checks');
console.log('- npm run agent:check');
console.log('- npm run verify');
