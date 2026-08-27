/**
 * The item-list guard decides whether a Bash command would spend the 103-point
 * `gh project item-list` read instead of the 2-point claim read.
 *
 * Why it exists: doc/kanban-workflow.md § GitHub API discipline — every session, workflow
 * and machine shares ONE GitHub account's 5000-point-per-hour GraphQL bucket, and
 * `gh project item-list 1 --limit 100` costs ~103 of them because its generated query nests
 * every field's options inside every field value of every item. On 2026-08-25, five sessions
 * re-reading the board that way emptied the bucket and the board went unreadable for ~5
 * minutes, mid-claim. `npm run board:claim` (the claim read) returns the same decision data
 * plus the ids the claim's writes need, for ~2 points — fifty times cheaper.
 *
 * The suite pins both halves: what must be refused, and — just as important, because a false
 * positive costs a session a turn — what must go straight through.
 */

import { execFileSync } from 'child_process';
import * as path from 'path';

const HOOK = path.join(process.cwd(), '.claude', 'hooks', 'item-list-guard.sh');

interface HookRun {
  code: number;
  stderr: string;
}

function invoke(command: string, env: NodeJS.ProcessEnv = {}): HookRun {
  try {
    execFileSync('bash', [HOOK], {
      input: JSON.stringify({ tool_input: { command } }),
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...env },
    });
    return { code: 0, stderr: '' };
  } catch (err: unknown) {
    const failure = err as { status?: number; stderr?: Buffer };
    return { code: failure.status ?? -1, stderr: failure.stderr?.toString() ?? '' };
  }
}

/** 0 = allowed through, 2 = blocked. */
function guard(command: string): number {
  return invoke(command).code;
}

describe('gh project item-list', () => {
  it.each([
    ['gh project item-list 1 --limit 100'],
    ['gh project item-list 1'],
    ['npm run build && gh project item-list 1 --limit 100'],
    ['gh project item-list 1 --format json | jq .'],
  ])('blocks %s', (command) => {
    expect(guard(command)).toBe(2);
  });

  it('names the claim read as the sanctioned form', () => {
    const run = invoke('gh project item-list 1 --limit 100');
    expect(run.stderr).toMatch(/npm run board:claim/);
    expect(run.stderr).toMatch(/doc\/kanban-workflow\.md § GitHub API discipline/);
  });
});

/**
 * The class of false positive that made the first version of the push-gate hook unusable:
 * a command that merely NAMES the call is not an invocation of it.
 */
describe('mentions are not invocations', () => {
  it.each([
    ['gh pr list'],
    ['gh issue list'],
    ["grep 'gh project item-list' doc/kanban-workflow.md"],
    ['echo "never run gh project item-list"'],
    ['cat > /tmp/note.md <<EOF\ngh project item-list 1 --limit 100\nEOF'],
    ['npm run board:claim'],
  ])('allows %s', (command) => {
    expect(guard(command)).toBe(0);
  });
});

describe('the escape hatch', () => {
  it('lets a human who typed the override through, explicitly', () => {
    expect(guard('SPO_ITEM_LIST_OVERRIDE= gh project item-list 1 --limit 100')).toBe(0);
  });
});
