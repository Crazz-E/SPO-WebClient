/**
 * Tests for capture-cli — argument parsing and end-to-end file conversion.
 */

import { describe, it, expect, afterAll } from '@jest/globals';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { parseCliArgs, runCaptureCli } from './capture-cli';

const tmpDirs: string[] = [];
function makeTmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spo-capture-'));
  tmpDirs.push(dir);
  return dir;
}

afterAll(() => {
  for (const dir of tmpDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('parseCliArgs', () => {
  it('parses input, name, and defaults', () => {
    const args = parseCliArgs(['logs/capture.ndjson', '--name', 'login']);
    expect(args.input).toBe('logs/capture.ndjson');
    expect(args.name).toBe('login');
    expect(args.out).toBe('src/mock-server/scenarios/captured');
    expect(args.vars).toEqual({});
  });

  it('parses all options including repeated --var', () => {
    const args = parseCliArgs([
      'in.ndjson',
      '--name', 'mail',
      '--out', 'somewhere',
      '--sid', 's-abc-1',
      '--description', 'Mail flow',
      '--source', 'planitia 2026-07-03',
      '--var', 'username=SPO_test3',
      '--var', 'companyName=SPO_test3 - Green',
    ]);
    expect(args.out).toBe('somewhere');
    expect(args.sid).toBe('s-abc-1');
    expect(args.description).toBe('Mail flow');
    expect(args.source).toBe('planitia 2026-07-03');
    expect(args.vars).toEqual({
      username: 'SPO_test3',
      companyName: 'SPO_test3 - Green',
    });
  });

  it('ignores malformed --var pairs (no equals sign)', () => {
    const args = parseCliArgs(['in.ndjson', '--name', 'x', '--var', 'nonsense']);
    expect(args.vars).toEqual({});
  });

  it('throws a usage error when input or name is missing', () => {
    expect(() => parseCliArgs(['--name', 'x'])).toThrow(/Usage/);
    expect(() => parseCliArgs(['in.ndjson'])).toThrow(/Usage/);
  });
});

describe('runCaptureCli', () => {
  function writeFixtureLog(dir: string): string {
    const lines = [
      JSON.stringify({
        ts: '2026-07-03T10:00:00.000Z', level: 'DEBUG', ctx: 'Session', sid: 's-cli-1',
        msg: 'RDO>> directory', meta: { rid: 0, raw: 'C 0 idof "DirectoryServer"' },
      }),
      JSON.stringify({
        ts: '2026-07-03T10:00:00.100Z', level: 'DEBUG', ctx: 'Session', sid: 's-cli-1',
        msg: 'RDO<< directory', meta: { rid: 0, raw: 'A0 objid="39751288"' },
      }),
    ];
    const file = path.join(dir, 'capture.ndjson');
    fs.writeFileSync(file, lines.join('\n'), 'utf8');
    return file;
  }

  it('converts a log file into a scenario .ts and reports counts', () => {
    const dir = makeTmpDir();
    const input = writeFixtureLog(dir);
    const out = path.join(dir, 'captured');

    const summary = runCaptureCli([
      input, '--name', 'cli-auth', '--out', out, '--var', 'username=SPO_test3',
    ]);

    const outFile = path.join(out, 'cli-auth-captured.scenario.ts');
    expect(fs.existsSync(outFile)).toBe(true);
    const code = fs.readFileSync(outFile, 'utf8');
    expect(code).toContain('export const cliAuthCapturedScenario: RdoScenario =');
    expect(code).toContain('{{directoryServerId}}');
    expect(summary).toContain('exchanges:          1');
    expect(summary).toContain('directoryServerId');
  });

  it('surfaces orphan answers and warnings in the summary', () => {
    const dir = makeTmpDir();
    const file = path.join(dir, 'orphan.ndjson');
    fs.writeFileSync(
      file,
      JSON.stringify({
        ts: 't', level: 'DEBUG', ctx: 'Session', sid: 's-cli-2',
        msg: 'RDO<< world', meta: { rid: 42, raw: 'A42 res="#1"' },
      }),
      'utf8'
    );
    const summary = runCaptureCli([file, '--name', 'orphans', '--out', path.join(dir, 'o')]);
    expect(summary).toContain('orphan answers');
  });

  it('throws when the input file does not exist', () => {
    expect(() => runCaptureCli(['does-not-exist.ndjson', '--name', 'x'])).toThrow();
  });
});
