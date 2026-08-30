// @vitest-environment node

import { access, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const repoRoot = new URL('../../', import.meta.url);
const scriptPaths = [
  'scripts/agentic/doctor',
  'scripts/agentic/setup',
  'scripts/agentic/check-fast',
  'scripts/agentic/check-full',
  'scripts/agentic/review-branch',
  'scripts/agentic/new-worktree',
  'scripts/agentic/task-start',
  'scripts/agentic/task-finish',
];

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    ...options,
  });
}

async function read(path) {
  return readFile(new URL(path, repoRoot), 'utf8');
}

describe('agentic bootstrap scripts', () => {
  it('ships executable command adapters with shell syntax that parses', async () => {
    for (const scriptPath of scriptPaths) {
      const absolutePath = new URL(scriptPath, repoRoot);
      const source = await read(scriptPath);
      const mode = (await stat(absolutePath)).mode;

      expect(source.startsWith('#!/usr/bin/env bash')).toBe(true);
      expect(mode & constants.S_IXUSR).toBeGreaterThan(0);

      const parse = run('bash', ['-n', scriptPath]);
      expect(parse.status, `${scriptPath}: ${parse.stderr}`).toBe(0);
    }
  });

  it('exposes dry-run command plans for deterministic repository gates', () => {
    const cases = [
      ['scripts/agentic/setup', ['npm ci']],
      [
        'scripts/agentic/check-fast',
        ['npm run format:check', 'npm run lint', 'npm run typecheck', 'npm test'],
      ],
      ['scripts/agentic/check-full', ['npm run verify', 'git diff --check']],
      [
        'scripts/agentic/review-branch',
        ['scripts/agentic/check-full', 'roborev review --branch --base master --wait --quiet'],
      ],
    ];

    for (const [scriptPath, expectedCommands] of cases) {
      const result = run(scriptPath, ['--dry-run']);
      expect(result.status, `${scriptPath}: ${result.stderr}`).toBe(0);
      for (const expectedCommand of expectedCommands) {
        expect(result.stdout).toContain(expectedCommand);
      }
    }
  });

  it('documents resolved local tool configuration without unresolved placeholders', async () => {
    const agenticConfig = await read('agentic.toml');
    const roborevConfig = await read('.roborev.toml');
    const agents = await read('AGENTS.md');
    const claude = await read('CLAUDE.md');
    const gitignore = await read('.gitignore');
    const doctor = await read('scripts/agentic/doctor');

    expect(agenticConfig).toContain('base_branch = "master"');
    expect(agenticConfig).toContain('review_agent = "gemini"');
    expect(agenticConfig).toContain('remote_review_ci_enabled = false');
    expect(roborevConfig).toContain('agent = "gemini"');
    expect(roborevConfig).toContain('mode = "current"');
    expect(agents).toContain('Kata is the system of record');
    expect(agents).toContain('Every task commit must contain:');
    expect(claude.trim()).toBe('@AGENTS.md');
    expect(gitignore).toMatch(/^\.agentic\/$/m);
    expect(gitignore).toMatch(/^\.roborev\/$/m);
    expect(doctor).toContain('command -v rg');
    expect(doctor).toContain('grep -R -n -E');

    const disallowedMarkers = [
      'T'.concat('BD'),
      'TO'.concat('DO'),
      ['REVIEW', 'AGENT'].join('_'),
      ['PRIMARY', 'AGENT'].join('_'),
    ];
    const scanned = [agenticConfig, roborevConfig, agents, claude].join('\n');
    expect(scanned).not.toMatch(
      new RegExp(`\\b(?:${disallowedMarkers.map((marker) => marker).join('|')})\\b`),
    );
  });

  it('keeps task lifecycle helpers explicit about safe inputs', async () => {
    const newWorktree = await read('scripts/agentic/new-worktree');
    const taskStart = await read('scripts/agentic/task-start');
    const taskFinish = await read('scripts/agentic/task-finish');

    expect(newWorktree).toContain('kata claim "$kata_cli_ref"');
    expect(newWorktree).not.toContain('--force');
    expect(newWorktree).toContain('main_worktree_root');
    expect(newWorktree).toContain('scripts/agentic/setup');
    expect(newWorktree).toContain('scripts/agentic/check-fast');
    expect(taskStart).toContain('refuse_when_owned_by_other');
    expect(taskFinish).toContain('ensure_not_base_branch');
    expect(taskFinish).toContain('scripts/agentic/review-branch');
    expect(taskFinish).toContain('kata close "$kata_cli_ref" --done');
  });

  it('normalizes local Kata references before invoking the Kata CLI', () => {
    const result = run('bash', [
      '-lc',
      [
        'source scripts/agentic/lib.sh',
        'normalize_kata_ref y3v5',
        'normalize_kata_ref kata#y3v5',
      ].join('; '),
    ]);

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout.trim().split('\n')).toEqual(['y3v5', 'y3v5']);
  });

  it('writes run manifests with correctly mapped fields', async () => {
    const manifestPath = join(await mkdtemp(join(tmpdir(), 'sensei-agentic-')), 'manifest.json');
    const result = run(
      'bash',
      [
        '-lc',
        [
          'set -euo pipefail',
          'source scripts/agentic/lib.sh',
          'ref_short_id() { printf "y3v5\\n"; }',
          'current_actor() { printf "agent@example:bootstrap\\n"; }',
          'config_value() { case "$1" in base_branch) printf "master\\n" ;; review_agent) printf "gemini\\n" ;; *) return 1 ;; esac; }',
          'write_run_manifest kata#y3v5 "$manifest_path" "2026-08-29T00:00:00Z" "abc123"',
        ].join('; '),
      ],
      {
        env: {
          ...process.env,
          manifest_path: manifestPath,
        },
      },
    );

    expect(result.status, result.stderr || result.stdout).toBe(0);
    const data = JSON.parse(await readFile(manifestPath, 'utf8'));
    expect(data).toMatchObject({
      kata_ref: 'kata#y3v5',
      actor: 'agent@example:bootstrap',
      review_agent: 'gemini',
      branch: 'chore/agentic-engineering-bootstrap',
      head_sha: 'abc123',
      finished_at: '2026-08-29T00:00:00Z',
    });
    expect(new Date(data.started_at).toString()).not.toBe('Invalid Date');
  });

  it('preserves the original start time when refreshing a run manifest', async () => {
    const manifestPath = join(await mkdtemp(join(tmpdir(), 'sensei-agentic-')), 'manifest.json');
    await writeFile(
      manifestPath,
      JSON.stringify({ started_at: '2026-08-28T00:00:00Z' }, null, 2) + '\n',
    );
    const result = run(
      'bash',
      [
        '-lc',
        [
          'set -euo pipefail',
          'source scripts/agentic/lib.sh',
          'ref_short_id() { printf "y3v5\\n"; }',
          'current_actor() { printf "agent@example:bootstrap\\n"; }',
          'config_value() { case "$1" in base_branch) printf "master\\n" ;; review_agent) printf "gemini\\n" ;; *) return 1 ;; esac; }',
          'write_run_manifest kata#y3v5 "$manifest_path" "2026-08-29T00:00:00Z" "abc123"',
        ].join('; '),
      ],
      {
        env: {
          ...process.env,
          manifest_path: manifestPath,
        },
      },
    );

    expect(result.status, result.stderr || result.stdout).toBe(0);
    const data = JSON.parse(await readFile(manifestPath, 'utf8'));
    expect(data.started_at).toBe('2026-08-28T00:00:00Z');
    expect(data.finished_at).toBe('2026-08-29T00:00:00Z');
  });

  it('makes the agentic documentation reachable from the root docs', async () => {
    await access(new URL('docs/agentic-engineering/README.md', repoRoot), constants.R_OK);
    await access(new URL('docs/agentic-engineering/ARCHITECTURE.md', repoRoot), constants.R_OK);
    await access(new URL('docs/agentic-engineering/WORKFLOW.md', repoRoot), constants.R_OK);
    await access(new URL('docs/agentic-engineering/COMMANDS.md', repoRoot), constants.R_OK);
    await access(new URL('docs/agentic-engineering/BASELINE.md', repoRoot), constants.R_OK);
    await access(new URL('docs/agentic-engineering/REMOTE_EXECUTION.md', repoRoot), constants.R_OK);
  });
});
