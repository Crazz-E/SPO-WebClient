import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as haltModule from './halt';
import {
  HALT_PATH,
  RDO_LIVE_DIR,
  defaultHaltStore,
  formatHaltNotice,
  parseHalt,
  readExistingHalt,
} from './halt';
import type { HaltRecord, HaltStore } from './halt';

/** In-memory store — the brake must be provable without touching the disk. */
function fakeStore(seed: Record<string, string> = {}) {
  const files = new Map<string, string>(Object.entries(seed));
  const store: HaltStore = {
    exists: p => files.has(p),
    read: p => files.get(p) ?? '',
  };
  return { store, files };
}

// =============================================================================
// The brake is MANUAL — see halt.ts. These tests pin the read side only.
// =============================================================================

describe('readExistingHalt — protocol rule R3', () => {
  it('lets the campaign proceed when there is no HALT', () => {
    expect(readExistingHalt(fakeStore().store)).toBeNull();
  });

  it('reports the record a human left behind', () => {
    const record: HaltRecord = {
      at: '2026-08-14T21:29:22.000Z',
      reason: 'IS unresponsive, stopping every agent',
      lastFrame: 'C sel 1 call SayThis "^" "%a","%b";',
      member: 'SayThis', socket: 'world', clientViewId: '7272232', wave: 'w1', where: 'chat/say',
    };
    const { store } = fakeStore({ [HALT_PATH]: JSON.stringify(record) });
    expect(readExistingHalt(store)).toEqual(record);
  });

  // The file is hand-written: demanding a full record would mean refusing to
  // stop because a field was missing, which inverts the point of a brake.
  it('accepts a minimal hand-written file carrying only a timestamp', () => {
    const { store } = fakeStore({ [HALT_PATH]: '{"at":"2026-08-18T09:00:00.000Z"}' });
    expect(readExistingHalt(store)?.at).toBe('2026-08-18T09:00:00.000Z');
  });

  it.each([
    ['free text', 'server is down, do not run'],
    ['truncated JSON', '{oops'],
    ['JSON without a timestamp', '{"nope":1}'],
    ['an empty file', ''],
  ])('treats %s as a stop rather than as absence', (_label, content) => {
    const { store } = fakeStore({ [HALT_PATH]: content });
    expect(readExistingHalt(store)?.reason).toMatch(/not readable JSON/);
  });

  it('reads from the bus root, which is deliberately outside src/', () => {
    expect(HALT_PATH.startsWith(RDO_LIVE_DIR)).toBe(true);
    expect(RDO_LIVE_DIR.startsWith('src')).toBe(false);
  });
});

describe('parseHalt', () => {
  it('rejects JSON that is not a halt record', () => {
    expect(parseHalt('{"nope":1}')).toBeNull();
    expect(parseHalt('[]')).toBeNull();
    expect(parseHalt('null')).toBeNull();
    expect(parseHalt('{oops')).toBeNull();
  });

  it('accepts any object carrying an `at` string', () => {
    expect(parseHalt('{"at":"2026-08-18T00:00:00.000Z"}')?.at).toBe('2026-08-18T00:00:00.000Z');
  });
});

describe('formatHaltNotice', () => {
  it('says the stop was deliberate and names the file to clear', () => {
    const notice = formatHaltNotice({
      at: '2026-08-17T14:54:00.000Z', reason: 'no answer', member: 'X',
      socket: 'world', clientViewId: '1', wave: 'w1', where: 'reads/map',
    });
    expect(notice).toMatch(/manual brake/);
    expect(notice).toMatch(/on purpose/);
    expect(notice).toContain(HALT_PATH);
  });

  it('renders a minimal record without printing undefined', () => {
    const notice = formatHaltNotice({ at: '2026-08-18T09:00:00.000Z' });
    expect(notice).not.toMatch(/undefined/);
    expect(notice).toMatch(/no reason recorded/);
  });
});

describe('defaultHaltStore', () => {
  let dir: string;

  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rdo-halt-')); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  it('reports absence and reads back real content', () => {
    const file = path.join(dir, 'HALT');
    expect(defaultHaltStore.exists(file)).toBe(false);
    fs.writeFileSync(file, 'stopped\n', 'utf-8');
    expect(defaultHaltStore.exists(file)).toBe(true);
    expect(defaultHaltStore.read(file)).toBe('stopped\n');
  });
});

// =============================================================================
// Regression guard — the automatic trigger was WITHDRAWN by the developer on
// 2026-08-18 and must not come back by good intentions. It was blind exactly
// where it mattered (login runs under DIRECTORY/FAST, the phase of both
// observed freezes; transport B arms no deadline at all) and it would have
// stopped the campaign on other people's incidents. Prevention belongs to the
// separator/arity guard, not to a timer. Ref: plan-campagne-live-rdo.md §6.0.
// =============================================================================
describe('no automatic trigger', () => {
  it.each([
    'CircuitBreaker', 'observeStep', 'classifyRdoSilence', 'timedOutMember',
    'lastFrameOf', 'formatHalt', 'CEILING_CATEGORIES', 'CEILING_TOLERANCE_MS',
  ])('does not export %s', name => {
    expect(name in haltModule).toBe(false);
  });

  it('exposes no way to write the file', () => {
    expect(Object.keys(defaultHaltStore).sort()).toEqual(['exists', 'read']);
  });
});
