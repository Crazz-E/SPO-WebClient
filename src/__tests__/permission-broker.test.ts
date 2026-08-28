/**
 * The permission broker (.claude/hooks/permission-broker.js, permission-broker-emit.js).
 *
 * WHY THIS FILE EXISTS. doc/permission-policy.md is the single source of the decision ladder
 * this repo uses to answer PreToolUse calls without stopping a session for a human 43 times a
 * day (haiku-permission-analysis.md). The ladder has real teeth — a settings `deny` beats
 * everything, a settings `allow` normally silences the broker but a credential path never does,
 * a cached `allow` is safe to replay for an in-worktree effect and unsafe to replay for an
 * external one — and every one of those teeth is a place a future edit can quietly reverse the
 * safety direction (turn a narrowing into a widening) without any type error catching it. This
 * suite pins each rung of the ladder down by driving the two Node programs exactly as the
 * `.sh` wrapper does: JSON on stdin, JSON verdict out, real subprocess boundaries, no mocks.
 *
 * permission-broker.js owns classification and lookup only — no model, no network, no writes —
 * so every case here is deterministic and needs no fixture beyond a temp `SPO_TOP`, a temp
 * `SPO_PERM_RULES` catalogue and a temp `SPO_PERM_DIR` for the provisional cache. Real
 * ~/.spo-perm state and the repository's own settings.json are never read: every env var the
 * core consults is overridden in every call.
 */

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const ROOT = process.cwd();
const CORE = path.join(ROOT, '.claude', 'hooks', 'permission-broker.js');
const EMIT = path.join(ROOT, '.claude', 'hooks', 'permission-broker-emit.js');
const WRAPPER = path.join(ROOT, '.claude', 'hooks', 'permission-broker.sh');

// ---------------------------------------------------------------------------
// Fixture plumbing
// ---------------------------------------------------------------------------

function getTempDir(): string {
  const scratchpad = process.env.SCRATCHPAD_DIR || os.tmpdir();
  fs.mkdirSync(scratchpad, { recursive: true });
  return scratchpad;
}

interface RulesFixtureEntry {
  id: string;
  signature: string;
  decision: 'allow' | 'deny' | 'ask';
  reason?: string;
  corrected_form?: string;
  guidance?: string;
}

interface SettingsFixture {
  allow?: string[];
  deny?: string[];
}

interface Env {
  top: string;
  rulesFile: string;
  settingsFile: string;
  permDir: string;
}

/** A throwaway worktree root, catalogue file and state dir, isolated from the real ones. */
function makeEnv(opts: { rules?: RulesFixtureEntry[]; settings?: SettingsFixture } = {}): Env {
  const base = fs.mkdtempSync(path.join(getTempDir(), 'perm-broker-'));
  const top = path.join(base, 'worktree');
  fs.mkdirSync(top, { recursive: true });

  const rulesFile = path.join(base, 'rules.json');
  fs.writeFileSync(rulesFile, JSON.stringify({ version: 1, rules: opts.rules || [] }));

  const settingsFile = path.join(base, 'settings.json');
  fs.writeFileSync(settingsFile, JSON.stringify({ permissions: opts.settings || {} }));

  const permDir = path.join(base, 'spo-perm');
  fs.mkdirSync(permDir, { recursive: true });

  return { top, rulesFile, settingsFile, permDir };
}

interface Payload {
  hook_event_name?: string;
  permission_mode?: string;
  cwd?: string;
  tool_name: string;
  tool_input: Record<string, unknown>;
}

interface Verdict {
  outcome?: string;
  domain?: string;
  tool?: string;
  signature?: string;
  reason?: string;
  why?: string;
  corrected_form?: string;
  guidance?: string;
  source?: string;
}

/** Drive permission-broker.js exactly as the wrapper does: JSON payload in, one verdict line out. */
function decide(
  payload: Partial<Payload>,
  env: Env,
  envOverride: Partial<Record<string, string>> = {}
): Verdict {
  const body: Payload = { tool_name: 'Bash', tool_input: {}, cwd: env.top, ...payload } as Payload;
  const out = execFileSync('node', [CORE], {
    input: JSON.stringify(body),
    encoding: 'utf8',
    env: {
      ...process.env,
      SPO_TOP: env.top,
      SPO_PERM_RULES: env.rulesFile,
      SPO_PERM_SETTINGS: env.settingsFile,
      SPO_PERM_DIR: env.permDir,
      SPO_PERM_ARBITER: '',
      ...envOverride,
    },
  }).trim();
  return JSON.parse(out) as Verdict;
}

const bash = (command: string, env: Env, extra: Partial<Payload> = {}): Verdict =>
  decide({ tool_name: 'Bash', tool_input: { command }, ...extra }, env);

interface EmitResult {
  code: number;
  stdout: string;
  stderr: string;
}

/** Drive permission-broker-emit.js: verdict JSON on stdin, exit code + stdout + stderr back. */
function emit(verdict: Record<string, unknown>, permDir: string): EmitResult {
  try {
    const stdout = execFileSync('node', [EMIT], {
      input: JSON.stringify(verdict),
      encoding: 'utf8',
      env: { ...process.env, SPO_PERM_DIR: permDir },
    });
    return { code: 0, stdout, stderr: '' };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { code: err.status ?? -1, stdout: err.stdout ?? '', stderr: err.stderr ?? '' };
  }
}

function readAuditLines(permDir: string): Array<Record<string, unknown>> {
  const file = path.join(permDir, 'audit.jsonl');
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .filter(l => l.trim() !== '')
    .map(l => JSON.parse(l) as Record<string, unknown>);
}

function writeProvisional(
  permDir: string,
  signature: string,
  data: Record<string, unknown>
): void {
  const dir = path.join(permDir, 'provisional');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, signature.replace(/[^A-Za-z0-9._+:-]/g, '_') + '.json');
  fs.writeFileSync(file, JSON.stringify(data));
}

// ---------------------------------------------------------------------------
// 1 · Domain classification — policy §1
// ---------------------------------------------------------------------------

describe('permission-broker — domain classification (policy §1)', () => {
  it('a plain read inside the worktree is read-only', () => {
    const env = makeEnv();
    const v = bash('cat README.md', env);
    expect(v.domain).toBe('read-only');
  });

  it('a local mutation confined to the worktree is in-worktree', () => {
    const env = makeEnv();
    const v = bash('rm -rf ./dist', env);
    expect(v.domain).toBe('in-worktree');
  });

  it('a local mutation naming a path outside the worktree is external-effect', () => {
    const env = makeEnv();
    const v = bash('rm -rf /home/crazz/SPO-Original/Rdo', env);
    expect(v.domain).toBe('external-effect');
  });

  it('Write inside SPO_TOP is in-worktree, outside it is external-effect', () => {
    const env = makeEnv();
    const inside = decide(
      { tool_name: 'Write', tool_input: { file_path: path.join(env.top, 'note.txt') } },
      env
    );
    expect(inside.domain).toBe('in-worktree');

    // Deliberately outside SPO_TOP, os.tmpdir() AND SCRATCHPAD_DIR — classifyDomain's
    // localRoots include the scratchpad, so a path merely outside `env.top` is not enough; it
    // has to be outside the whole family of local roots the same way ~/SPO-Original is.
    const outsidePath = '/home/crazz/SPO-Original/leaked-note.txt';
    const outside = decide({ tool_name: 'Write', tool_input: { file_path: outsidePath } }, env);
    expect(outside.domain).toBe('external-effect');
  });

  it('a redirection to a path outside the worktree makes an otherwise read-only command external-effect', () => {
    const env = makeEnv();
    // Built by concatenation on purpose: a literal "> /home/..." in this file's source would be
    // caught by another PreToolUse guard in this repo that blocks writes it can see in a command
    // string, and it would block the creation of this very test file.
    // Same reasoning as the Write case above: outside SPO_TOP, os.tmpdir() AND SCRATCHPAD_DIR.
    const outsideFile = '/home/crazz/SPO-Original/leaked.txt';
    const redirect = '>' + ' ' + outsideFile;
    const v = bash('grep -rn foo src/ ' + redirect, env);
    expect(v.domain).toBe('external-effect');
  });

  it('an unknown tool name and WebFetch get no benefit of the doubt', () => {
    const env = makeEnv();
    expect(decide({ tool_name: 'WebFetch', tool_input: { url: 'https://example.com' } }, env).domain).toBe(
      'external-effect'
    );
    expect(decide({ tool_name: 'SomeToolNobodyHeardOf', tool_input: {} }, env).domain).toBe(
      'external-effect'
    );
  });

  it('a credential path outranks the verb, for Bash and for Read', () => {
    const env = makeEnv();
    expect(bash('cat ~/.aws/credentials', env).domain).toBe('external-effect');
    expect(
      decide({ tool_name: 'Read', tool_input: { file_path: '~/.ssh/id_rsa' } }, env).domain
    ).toBe('external-effect');
  });
});

// ---------------------------------------------------------------------------
// 2 · Ladder order — policy §2
// ---------------------------------------------------------------------------

describe('permission-broker — the ladder (policy §2)', () => {
  it('a settings deny entry produces outcome silent — Claude Code enforces it', () => {
    const env = makeEnv({ settings: { deny: ['Bash(curl *)'] } });
    const v = bash('curl http://example.com', env);
    expect(v.outcome).toBe('silent');
  });

  it('a settings allow entry produces outcome silent', () => {
    const env = makeEnv({ settings: { allow: ['Bash(ls -la)'] } });
    const v = bash('ls -la', env);
    expect(v.outcome).toBe('silent');
  });

  it('a credential path stays non-silent even under a bare Read/Write allow entry', () => {
    const env = makeEnv({ settings: { allow: ['Read', 'Write'] } });
    const v = decide({ tool_name: 'Read', tool_input: { file_path: '~/.aws/credentials' } }, env);
    expect(v.outcome).not.toBe('silent');
    expect(v.domain).toBe('external-effect');
  });

  it('a compound command covered by two DIFFERENT allow entries is silent', () => {
    const env = makeEnv({
      settings: { allow: ['Bash(npm run lint)', 'Bash(gh pr list)'] },
    });
    const v = bash('npm run lint && gh pr list', env);
    expect(v.outcome).toBe('silent');
  });

  it('a compound command where one segment matches a deny entry is silent with the deny reason', () => {
    const env = makeEnv({
      settings: {
        allow: ['Bash(npm run lint)'],
        deny: ['Bash(rm -rf /tmp/evil*)'],
      },
    });
    const v = bash('npm run lint && rm -rf /tmp/evil', env);
    expect(v.outcome).toBe('silent');
    expect(String(v.why)).toMatch(/deny/i);
  });

  it('a signature present in rules.json returns that rule’s decision, reason, guidance and source', () => {
    const env = makeEnv({
      rules: [
        {
          id: 'no-force-push',
          signature: 'v1:bash:external-effect:git-push',
          decision: 'deny',
          reason: 'A force push to a shared branch cannot be undone.',
          corrected_form: 'git push',
          guidance: 'Never force-push a shared branch.',
        },
      ],
    });
    const v = bash('git push --force origin main', env);
    expect(v.outcome).toBe('deny');
    expect(v.reason).toBe('A force push to a shared branch cannot be undone.');
    expect(v.corrected_form).toBe('git push');
    expect(v.guidance).toBe('Never force-push a shared branch.');
    expect(v.source).toBe('rules.json#no-force-push');
  });

  it('nothing matches anywhere -> outcome arbitrate', () => {
    const env = makeEnv();
    const v = bash('some-bespoke-tool --do-a-thing', env);
    expect(v.outcome).toBe('arbitrate');
  });
});

// ---------------------------------------------------------------------------
// 3 · The provisional cache — policy §3 and §5
// ---------------------------------------------------------------------------

describe('permission-broker — the provisional cache (policy §3, §5)', () => {
  it('a cached allow is returned for an in-worktree signature, source provisional', () => {
    const env = makeEnv();
    const probe = bash('rm -rf ./dist', env);
    expect(probe.domain).toBe('in-worktree');
    writeProvisional(env.permDir, probe.signature as string, {
      decision: 'allow',
      reason: 'Confined to the worktree, the pipeline catches a mistake.',
    });
    const v = bash('rm -rf ./dist', env);
    expect(v.outcome).toBe('allow');
    expect(v.source).toBe('provisional');
  });

  it('a cached allow is NEVER read back for an external-effect signature — re-judged every capture', () => {
    const env = makeEnv();
    const probe = bash('rm -rf /home/crazz/SPO-Original/Rdo', env);
    expect(probe.domain).toBe('external-effect');
    writeProvisional(env.permDir, probe.signature as string, {
      decision: 'allow',
      reason: 'This looked safe once.',
    });
    const v = bash('rm -rf /home/crazz/SPO-Original/Rdo', env);
    expect(v.outcome).not.toBe('allow');
    expect(v.outcome).toBe('arbitrate');
  });

  it('a cached deny for an external-effect signature IS read back — a deny only narrows', () => {
    const env = makeEnv();
    const probe = bash('rm -rf /home/crazz/SPO-Original/Rdo', env);
    writeProvisional(env.permDir, probe.signature as string, {
      decision: 'deny',
      reason: 'Never delete outside the worktree.',
    });
    const v = bash('rm -rf /home/crazz/SPO-Original/Rdo', env);
    expect(v.outcome).toBe('deny');
    expect(v.source).toBe('provisional');
  });

  it('an expired provisional entry is ignored', () => {
    const env = makeEnv();
    const probe = bash('rm -rf ./dist', env);
    writeProvisional(env.permDir, probe.signature as string, {
      decision: 'allow',
      reason: 'Stale.',
      expires_at: new Date(Date.now() - 60_000).toISOString(),
    });
    const v = bash('rm -rf ./dist', env);
    expect(v.outcome).toBe('arbitrate');
  });
});

// ---------------------------------------------------------------------------
// 4 · Permission modes
// ---------------------------------------------------------------------------

describe('permission-broker — permission modes', () => {
  it('bypassPermissions and dontAsk are silent for any tool', () => {
    const env = makeEnv();
    expect(bash('rm -rf ./dist', env, { permission_mode: 'bypassPermissions' }).outcome).toBe(
      'silent'
    );
    expect(bash('rm -rf ./dist', env, { permission_mode: 'dontAsk' }).outcome).toBe('silent');
  });

  it('acceptEdits is silent for Write/Edit but NOT for Bash', () => {
    const env = makeEnv();
    const write = decide(
      {
        tool_name: 'Write',
        tool_input: { file_path: path.join(env.top, 'note.txt') },
        permission_mode: 'acceptEdits',
      },
      env
    );
    expect(write.outcome).toBe('silent');

    const bashCall = bash('rm -rf ./dist', env, { permission_mode: 'acceptEdits' });
    expect(bashCall.outcome).not.toBe('silent');
  });

  it('SPO_PERM_ARBITER=1 is a re-entrancy guard — always silent', () => {
    const env = makeEnv();
    const v = decide({ tool_name: 'Bash', tool_input: { command: 'rm -rf ./dist' } }, env, {
      SPO_PERM_ARBITER: '1',
    });
    expect(v.outcome).toBe('silent');
  });

  it('a non-PreToolUse hook_event_name is silent', () => {
    const env = makeEnv();
    const v = bash('rm -rf ./dist', env, { hook_event_name: 'PostToolUse' });
    expect(v.outcome).toBe('silent');
  });

  it('malformed JSON on stdin and a payload with no tool_name still exit 0 with a verdict', () => {
    const env = makeEnv();
    const out = execFileSync('node', [CORE], {
      input: 'not json at all {{{',
      encoding: 'utf8',
      env: {
        ...process.env,
        SPO_TOP: env.top,
        SPO_PERM_RULES: env.rulesFile,
        SPO_PERM_SETTINGS: env.settingsFile,
        SPO_PERM_DIR: env.permDir,
        SPO_PERM_ARBITER: '',
      },
    }).trim();
    expect(() => JSON.parse(out)).not.toThrow();

    const noToolName = decide({ tool_input: {} } as Partial<Payload>, env);
    expect(typeof noToolName.outcome).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// 5 · Signature stability — policy §4ter
// ---------------------------------------------------------------------------

describe('permission-broker — signature stability (policy §4ter)', () => {
  it('two different cat commands share one signature; cat and rm differ', () => {
    const env = makeEnv();
    const a = bash('cat README.md', env);
    const b = bash('cat package.json', env);
    expect(a.signature).toBe(b.signature);

    const c = bash('rm -rf ./dist', env);
    expect(c.signature).not.toBe(a.signature);
  });

  it('the same verb in two different domains produces different signatures — the domain is in the signature', () => {
    const env = makeEnv();
    const inside = bash('rm -rf ./dist', env);
    const outside = bash('rm -rf /home/crazz/SPO-Original/Rdo', env);
    expect(inside.signature).not.toBe(outside.signature);
    expect(String(inside.signature)).toContain('in-worktree');
    expect(String(outside.signature)).toContain('external-effect');
  });
});

// ---------------------------------------------------------------------------
// 6 · The emitter
// ---------------------------------------------------------------------------

describe('permission-broker-emit — deny', () => {
  it('exits 2, and stderr carries the reason and the corrected form', () => {
    const env = makeEnv();
    const result = emit(
      {
        decision: 'deny',
        reason: 'This deletes state outside the worktree.',
        corrected_form: 'rm -rf ./dist',
        signature: 'v1:bash:external-effect:rm',
        domain: 'external-effect',
        tool: 'Bash',
        source: 'rules.json#no-external-rm',
      },
      env.permDir
    );
    expect(result.code).toBe(2);
    expect(result.stderr).toContain('This deletes state outside the worktree.');
    expect(result.stderr).toContain('rm -rf ./dist');
  });
});

describe('permission-broker-emit — allow', () => {
  it('with guidance: exit 0, hookSpecificOutput.permissionDecision allow, additionalContext carries the guidance', () => {
    const env = makeEnv();
    const result = emit(
      {
        decision: 'allow',
        reason: 'Read-only.',
        guidance: 'Prefer the Read tool.',
        signature: 'v1:bash:read-only:cat',
        domain: 'read-only',
        tool: 'Bash',
        source: 'rules.json#read-only-cat',
      },
      env.permDir
    );
    expect(result.code).toBe(0);
    const parsed = JSON.parse(result.stdout) as {
      hookSpecificOutput: { permissionDecision: string; additionalContext?: string };
    };
    expect(parsed.hookSpecificOutput.permissionDecision).toBe('allow');
    expect(parsed.hookSpecificOutput.additionalContext).toContain('Prefer the Read tool.');
  });

  it('without guidance: no additionalContext key at all', () => {
    const env = makeEnv();
    const result = emit(
      {
        decision: 'allow',
        reason: 'Read-only.',
        signature: 'v1:bash:read-only:wc',
        domain: 'read-only',
        tool: 'Bash',
        source: 'rules.json#read-only-wc',
      },
      env.permDir
    );
    const parsed = JSON.parse(result.stdout) as { hookSpecificOutput: Record<string, unknown> };
    expect('additionalContext' in parsed.hookSpecificOutput).toBe(false);
  });
});

describe('permission-broker-emit — ask', () => {
  it('exits 0 with permissionDecision ask', () => {
    const env = makeEnv();
    const result = emit(
      {
        decision: 'ask',
        reason: 'Genuinely undecided by policy.',
        signature: 'v1:bash:external-effect:curl',
        domain: 'external-effect',
        tool: 'Bash',
        source: 'arbiter',
      },
      env.permDir
    );
    expect(result.code).toBe(0);
    const parsed = JSON.parse(result.stdout) as { hookSpecificOutput: { permissionDecision: string } };
    expect(parsed.hookSpecificOutput.permissionDecision).toBe('ask');
  });
});

describe('permission-broker-emit — audit log', () => {
  it('every non-silent decision appends exactly one parseable audit line', () => {
    const env = makeEnv();
    emit(
      {
        decision: 'deny',
        reason: 'no',
        corrected_form: 'do this instead',
        signature: 'v1:bash:external-effect:rm',
        domain: 'external-effect',
        tool: 'Bash',
        source: 'rules.json#x',
      },
      env.permDir
    );
    const lines = readAuditLines(env.permDir);
    expect(lines.length).toBe(1);
    const line = lines[0];
    expect(line.signature).toBe('v1:bash:external-effect:rm');
    expect(line.domain).toBe('external-effect');
    expect(line.decision).toBe('deny');
    expect(line.source).toBe('rules.json#x');
  });

  it('a silent verdict appends nothing', () => {
    const env = makeEnv();
    emit({ outcome: 'silent', why: 'settings allow' }, env.permDir);
    expect(readAuditLines(env.permDir).length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 7 · The .sh wrapper's deterministic fallback — policy §6
// ---------------------------------------------------------------------------
//
// Only the fallback branch is exercised here, never the arbiter itself: the arbiter is a real
// model call and must never run in CI. The fallback fires because `claude` is made unreachable
// on PATH — a restricted PATH built from the system directories only, verified ahead of time to
// contain node/git/cat/printf/dirname/timeout but not the `claude` CLI (which normally lives
// under a user-local bin directory well outside those system dirs).

describe('permission-broker.sh — deterministic fallback when the arbiter cannot answer (policy §6)', () => {
  const restrictedPath = [
    '/usr/local/sbin',
    '/usr/local/bin',
    '/usr/sbin',
    '/usr/bin',
    '/sbin',
    '/bin',
  ].join(path.delimiter);

  function runWrapper(command: string, permDir: string): { code: number; stdout: string } {
    const payload = { cwd: ROOT, tool_name: 'Bash', tool_input: { command } };
    try {
      const stdout = execFileSync('bash', [WRAPPER], {
        cwd: ROOT,
        input: JSON.stringify(payload),
        encoding: 'utf8',
        env: {
          PATH: restrictedPath,
          HOME: process.env.HOME,
          SPO_PERM_DIR: permDir,
          // Nonexistent settings/rules files: nothing short-circuits the ladder before it
          // reaches "arbitrate", so the fallback branch is what actually decides.
          SPO_PERM_SETTINGS: path.join(permDir, 'no-such-settings.json'),
          SPO_PERM_RULES: path.join(permDir, 'no-such-rules.json'),
        },
      });
      return { code: 0, stdout };
    } catch (e) {
      const err = e as { status?: number; stdout?: string };
      return { code: err.status ?? -1, stdout: err.stdout ?? '' };
    }
  }

  it('claude is unreachable on the restricted PATH', () => {
    expect(() => execFileSync('which', ['claude'], { env: { PATH: restrictedPath } })).toThrow();
  });

  it('a read-only call falls back to allow', () => {
    const permDir = fs.mkdtempSync(path.join(getTempDir(), 'perm-broker-fallback-'));
    const result = runWrapper('cat README.md', permDir);
    expect(result.code).toBe(0);
    const parsed = JSON.parse(result.stdout) as { hookSpecificOutput: { permissionDecision: string } };
    expect(parsed.hookSpecificOutput.permissionDecision).toBe('allow');
  });

  it('a non-read-only call falls back to ask', () => {
    const permDir = fs.mkdtempSync(path.join(getTempDir(), 'perm-broker-fallback-'));
    const result = runWrapper('curl http://example.com', permDir);
    expect(result.code).toBe(0);
    const parsed = JSON.parse(result.stdout) as { hookSpecificOutput: { permissionDecision: string } };
    expect(parsed.hookSpecificOutput.permissionDecision).toBe('ask');
  });
});
