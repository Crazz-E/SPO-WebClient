/**
 * The context-router hook (.claude/hooks/context-router.sh).
 *
 * Tests that the worktree banner is emitted when the session is running in a worktree,
 * and omitted when running in the main checkout.
 */

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const ROOT = process.cwd();
const HOOK = path.join(ROOT, '.claude', 'hooks', 'context-router.sh');

// Use scratchpad to avoid /tmp disk space issues
const getTempDir = (): string => {
  const scratchpad = process.env.SCRATCHPAD_DIR || path.join(os.tmpdir(), '.cr-test');
  fs.mkdirSync(scratchpad, { recursive: true });
  return scratchpad;
};

interface RealRoots {
  main: string;
  wt: string;
  cleanup: () => void;
}

function makeRepoWithWorktree(): RealRoots {
  const gitEnv = {
    ...process.env,
    GIT_AUTHOR_NAME: 't',
    GIT_AUTHOR_EMAIL: 't@x',
    GIT_COMMITTER_NAME: 't',
    GIT_COMMITTER_EMAIL: 't@x',
  };

  const tempDir = getTempDir();
  const main = fs.mkdtempSync(path.join(tempDir, 'context-router-'));
  execFileSync('git', ['init', '-q', main], { env: gitEnv });
  execFileSync('git', ['-C', main, 'commit', '-q', '--allow-empty', '-m', 'x'], { env: gitEnv });
  const wt = path.join(main, '.claude', 'worktrees', 'session-a');
  execFileSync('git', ['-C', main, 'worktree', 'add', '-q', '-b', 'branch-a', wt], { env: gitEnv });
  return {
    main: fs.realpathSync(main),
    wt: fs.realpathSync(wt),
    cleanup: () => fs.rmSync(main, { recursive: true, force: true }),
  };
}

function run(cwd: string, prompt: string): string {
  const payload = JSON.stringify({ prompt });
  const out = execFileSync('bash', [HOOK], {
    cwd,
    input: payload,
    encoding: 'utf8',
    env: process.env,
  });
  return out;
}

describe('context-router.sh — worktree banner', () => {
  it('emits WORKTREE banner when running in a worktree', () => {
    const roots = makeRepoWithWorktree();
    try {
      const out = run(roots.wt, 'some prompt');
      expect(out).toContain('WORKTREE —');
      expect(out).toContain(roots.wt);
      expect(out).toContain(roots.main);
    } finally {
      roots.cleanup();
    }
  });

  it('does not emit WORKTREE banner when running in main checkout', () => {
    const roots = makeRepoWithWorktree();
    try {
      const out = run(roots.main, 'some prompt');
      expect(out).not.toContain('WORKTREE —');
    } finally {
      roots.cleanup();
    }
  });

  it('returns empty string for empty prompt', () => {
    const roots = makeRepoWithWorktree();
    try {
      const out = run(roots.wt, '');
      expect(out).toBe('');
    } finally {
      roots.cleanup();
    }
  });

  it('includes both paths in the worktree banner', () => {
    const roots = makeRepoWithWorktree();
    try {
      const out = run(roots.wt, 'test prompt');
      expect(out).toMatch(new RegExp(`writable tree is ${roots.wt}`));
      expect(out).toMatch(new RegExp(`under ${roots.main}/`));
    } finally {
      roots.cleanup();
    }
  });
});
