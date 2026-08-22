import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { fingerprintTree } from './fingerprint';

/** A real scratch repo — the fingerprint's whole job is to read real git state. */
function scratchRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spo-bench-fp-'));
  const git = (...args: string[]) =>
    execFileSync('git', ['-C', dir, ...args], { stdio: ['pipe', 'pipe', 'pipe'] });
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'test');
  fs.writeFileSync(path.join(dir, 'a.txt'), 'one\n', 'utf8');
  git('add', '.');
  git('commit', '-q', '-m', 'init');
  return dir;
}

function commit(dir: string, message: string): void {
  execFileSync('git', ['-C', dir, 'add', '.'], { stdio: 'ignore' });
  execFileSync('git', ['-C', dir, 'commit', '-q', '-m', message], { stdio: 'ignore' });
}

describe('fingerprintTree', () => {
  it('is stable while nothing changes', () => {
    const dir = scratchRepo();
    expect(fingerprintTree(dir)).toEqual(fingerprintTree(dir));
  });

  it('carries HEAD, and changes when a commit lands', () => {
    const dir = scratchRepo();
    const before = fingerprintTree(dir);
    fs.writeFileSync(path.join(dir, 'a.txt'), 'two\n', 'utf8');
    commit(dir, 'edit');
    const after = fingerprintTree(dir);
    expect(after.head).not.toBe(before.head);
    expect(after.hash).not.toBe(before.hash);
  });

  it('changes on an uncommitted edit to a tracked file', () => {
    const dir = scratchRepo();
    const before = fingerprintTree(dir);
    fs.writeFileSync(path.join(dir, 'a.txt'), 'dirty\n', 'utf8');
    const after = fingerprintTree(dir);
    expect(after.head).toBe(before.head);
    expect(after.hash).not.toBe(before.hash);
  });

  it('changes when an untracked file appears, and again when its CONTENT changes', () => {
    // `git status` alone would miss the second case — same filename, different bytes.
    const dir = scratchRepo();
    const clean = fingerprintTree(dir);
    fs.writeFileSync(path.join(dir, 'new.ts'), 'v1\n', 'utf8');
    const v1 = fingerprintTree(dir);
    fs.writeFileSync(path.join(dir, 'new.ts'), 'v2\n', 'utf8');
    const v2 = fingerprintTree(dir);
    expect(v1.hash).not.toBe(clean.hash);
    expect(v2.hash).not.toBe(v1.hash);
  });

  it('ignores ignored files — the worker building dist/ must not read as the target moving', () => {
    const dir = scratchRepo();
    fs.writeFileSync(path.join(dir, '.gitignore'), 'dist/\n', 'utf8');
    commit(dir, 'ignore dist');
    const before = fingerprintTree(dir);
    fs.mkdirSync(path.join(dir, 'dist'));
    fs.writeFileSync(path.join(dir, 'dist', 'out.js'), 'built\n', 'utf8');
    expect(fingerprintTree(dir).hash).toBe(before.hash);
  });

  it('throws on a directory that is not a worktree', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spo-bench-nogit-'));
    expect(() => fingerprintTree(dir)).toThrow();
  });
});
