/**
 * scripts/orphan-cards.js — the orphan watch.
 *
 * Three things are pinned here, and they fail for different reasons.
 *
 * The **selection rule** decides whether a human is told a card is stuck. Too loose and every
 * healthy claim in the pool gets reported, the reminder becomes noise and stops being read;
 * too tight and the failure #124 describes stays invisible. The tests below fix both edges:
 * a working column is required, a `Session` is required, and the quiet clock is the card's
 * own `updatedAt` — never the absence of a branch or a PR, which is the ordinary state of a
 * card in Implementing.
 *
 * The **once-per-owner rule** is what keeps the job from becoming a daily alarm on a card the
 * human has decided to leave alone. It keys on the `Session` text rather than a timestamp
 * because posting the comment can itself bump the card's `updatedAt`; a timestamp key would
 * make every run re-fire on the trace of the previous one.
 *
 * The **posture** is the last one. This job reports and frees nothing — the ownership law says
 * only a human may clear a `Session`. Nothing in the Jest suite executes a workflow file, so
 * the properties that keep it read-only against the board are pinned as text.
 */

import * as fs from 'fs';
import * as path from 'path';

interface Item {
  number: number | null;
  title: string;
  url: string;
  state: string;
  status: string;
  session: string;
  updatedAt: string | null;
}

interface Evidence {
  branchExists: boolean | null;
  pr: { number: number; state: string } | null;
}

interface Orphan extends Item {
  quietHours: number;
  evidence?: Evidence | null;
  reminded?: boolean;
}

interface OrphanModule {
  WORKING_STATUSES: string[];
  DEFAULT_STALE_HOURS: number;
  parseSession(raw: unknown): { branch: string; date: string | null } | null;
  readItem(node: unknown): Item;
  hoursBetween(iso: string | null, now: number): number;
  isSuspect(item: Partial<Item> | null, now: number, staleHours: number): boolean;
  selectOrphans(items: Partial<Item>[], opts: { now: number; staleHours: number }): Orphan[];
  formatQuiet(hours: number): string;
  formatEvidence(evidence: unknown): string;
  escapeCell(value: unknown): string;
  marker(session: unknown): string;
  firedOwners(comments: { body?: unknown }[] | null): Set<string>;
  needsReminder(orphan: { session?: string }, comments: { body?: unknown }[]): boolean;
  renderReminder(orphan: Orphan, opts: { staleHours: number }): string;
  renderDigest(orphans: Orphan[], opts: { now: number; staleHours: number }): string;
  resolveStaleHours(env: Record<string, string | undefined>): number;
  main(opts: {
    env?: Record<string, string | undefined>;
    argv?: string[];
    out?: { write(s: string): void };
  }): Promise<number>;
}

const watch: OrphanModule = require('../../scripts/orphan-cards.js');

const NOW = Date.parse('2026-08-24T12:00:00Z');
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();
const SESSION = 'claude-crazz/mail-refresh-79cc73 @ 2026-08-24';

function card(over: Partial<Item> = {}): Item {
  return {
    number: 124,
    title: 'Nothing detects an orphan card',
    url: 'https://github.com/Crazz-Org/SPO-WebClient/issues/124',
    state: 'OPEN',
    status: 'Implementing',
    session: SESSION,
    updatedAt: hoursAgo(30),
    ...over,
  };
}

const orphan = (over: Partial<Item> = {}): Orphan =>
  watch.selectOrphans([card(over)], { now: NOW, staleHours: 24 })[0];

describe('parseSession', () => {
  it('splits the documented `<branch> @ <date>` form', () => {
    expect(watch.parseSession(SESSION)).toEqual({
      branch: 'claude-crazz/mail-refresh-79cc73',
      date: '2026-08-24',
    });
  });

  it('treats a bare value as a branch with no date — it is still an ownership marker', () => {
    expect(watch.parseSession('fix/mail-refresh')).toEqual({ branch: 'fix/mail-refresh', date: null });
  });

  it('splits on the LAST separator, so a branch containing " @ " survives', () => {
    expect(watch.parseSession('feature/a @ b @ 2026-08-24')).toEqual({
      branch: 'feature/a @ b',
      date: '2026-08-24',
    });
  });

  it('is null for every shape of empty — that is what "claimable" means', () => {
    expect(watch.parseSession('')).toBeNull();
    expect(watch.parseSession('   ')).toBeNull();
    expect(watch.parseSession(null)).toBeNull();
    expect(watch.parseSession(undefined)).toBeNull();
  });

  it('trims before splitting, so a padded value is not read as a nameless branch', () => {
    expect(watch.parseSession('  claude-crazz/x @ 2026-08-24  ')).toEqual({
      branch: 'claude-crazz/x',
      date: '2026-08-24',
    });
  });
});

describe('readItem', () => {
  const node = {
    updatedAt: '2026-08-24T09:00:00Z',
    fieldValues: {
      nodes: [
        null,
        { text: 'ignored, no field' },
        { name: 'Gate', field: { name: 'Status' } },
        { text: 'claude-crazz/x @ 2026-08-24', field: { name: 'Session' } },
        { name: 'M', field: { name: 'Size' } },
      ],
    },
    content: { number: 7, title: 'A card', url: 'https://example.invalid/7', state: 'OPEN' },
  };

  it('flattens the single-select and text field values by name', () => {
    expect(watch.readItem(node)).toEqual({
      number: 7,
      title: 'A card',
      url: 'https://example.invalid/7',
      state: 'OPEN',
      status: 'Gate',
      session: 'claude-crazz/x @ 2026-08-24',
      updatedAt: '2026-08-24T09:00:00Z',
    });
  });

  it('yields empty strings rather than throwing on a draft item with no content', () => {
    expect(watch.readItem({ updatedAt: null })).toEqual({
      number: null,
      title: '',
      url: '',
      state: '',
      status: '',
      session: '',
      updatedAt: null,
    });
    expect(watch.readItem(undefined).number).toBeNull();
  });
});

describe('hoursBetween', () => {
  it('measures backwards from now, in hours', () => {
    expect(watch.hoursBetween(hoursAgo(6), NOW)).toBeCloseTo(6);
  });

  it('is Infinity for a missing or unparseable stamp — never silently "fresh"', () => {
    expect(watch.hoursBetween(null, NOW)).toBe(Infinity);
    expect(watch.hoursBetween('not a date', NOW)).toBe(Infinity);
  });
});

describe('isSuspect', () => {
  it('reports a claimed card in a working column that has been quiet past the threshold', () => {
    expect(watch.isSuspect(card(), NOW, 24)).toBe(true);
  });

  it.each(watch.WORKING_STATUSES)('watches the %s column', status => {
    expect(watch.isSuspect(card({ status }), NOW, 24)).toBe(true);
  });

  // The it.each above iterates the constant under test, so it stays green if that constant
  // drifts. This is the assertion that actually binds it: orphan-cards.js and claim-read.sh
  // ask the same question ("who holds ground right now") in two different jobs, and they
  // disagreed for weeks — the watch listed `In progress` and `PR`, columns this board does
  // not have, so it could never fire on the columns orphans actually sit in.
  it('watches exactly the busy-status set scripts/claim-read.sh queries', () => {
    const claimRead = fs.readFileSync(path.join(process.cwd(), 'scripts', 'claim-read.sh'), 'utf8');
    // Every `.Status == "X"` in the busy-set jq filters, deduped and ordered.
    const queried = [...new Set(Array.from(claimRead.matchAll(/\.Status == "([^"]+)"/g), m => m[1]))]
      .filter(name => name !== 'Todo' && name !== 'Done' && name !== 'Parked')
      .sort();
    expect(queried.length).toBeGreaterThan(0);
    expect([...watch.WORKING_STATUSES].sort()).toEqual(queried);
  });

  it.each(['Todo', 'Done', 'Parked', 'Intake', ''])('never watches %s', status => {
    expect(watch.isSuspect(card({ status }), NOW, 24)).toBe(false);
  });

  it('never reports an unclaimed card — an empty Session is the pool, not an orphan', () => {
    expect(watch.isSuspect(card({ session: '' }), NOW, 24)).toBe(false);
  });

  it('leaves a card that moved inside the window alone', () => {
    expect(watch.isSuspect(card({ updatedAt: hoursAgo(4) }), NOW, 24)).toBe(false);
  });

  it('fires exactly at the threshold, not one hour later', () => {
    expect(watch.isSuspect(card({ updatedAt: hoursAgo(24) }), NOW, 24)).toBe(true);
    expect(watch.isSuspect(card({ updatedAt: hoursAgo(23.9) }), NOW, 24)).toBe(false);
  });

  it('skips a draft item — there is no issue to comment on', () => {
    expect(watch.isSuspect(card({ number: null }), NOW, 24)).toBe(false);
    expect(watch.isSuspect(null, NOW, 24)).toBe(false);
  });
});

describe('selectOrphans', () => {
  it('returns the suspects quietest first, each carrying its own age', () => {
    const items = [
      card({ number: 1, updatedAt: hoursAgo(26) }),
      card({ number: 2, status: 'Todo', session: '' }),
      card({ number: 3, updatedAt: hoursAgo(90), status: 'Merging' }),
      card({ number: 4, updatedAt: hoursAgo(2) }),
    ];
    const orphans = watch.selectOrphans(items, { now: NOW, staleHours: 24 });
    expect(orphans.map(o => o.number)).toEqual([3, 1]);
    expect(orphans[0].quietHours).toBeCloseTo(90);
  });

  it('is empty on a healthy board', () => {
    expect(watch.selectOrphans([card({ updatedAt: hoursAgo(1) })], { now: NOW, staleHours: 24 })).toEqual([]);
  });
});

describe('formatQuiet', () => {
  it('reads in hours below two days and in days above', () => {
    expect(watch.formatQuiet(26.7)).toBe('26 h');
    expect(watch.formatQuiet(47.9)).toBe('47 h');
    expect(watch.formatQuiet(50)).toBe('2 days');
  });

  it('names the no-timestamp case instead of printing Infinity', () => {
    expect(watch.formatQuiet(Infinity)).toBe('never moved');
  });
});

describe('formatEvidence', () => {
  it('reads the branch and the pull request together', () => {
    expect(watch.formatEvidence({ branchExists: true, pr: { number: 9, state: 'open' } })).toBe(
      'branch alive on origin · PR #9 open'
    );
    expect(watch.formatEvidence({ branchExists: false, pr: null })).toBe('branch gone from origin · no PR');
  });

  it('says so when the branch was never looked up', () => {
    expect(watch.formatEvidence({ branchExists: null, pr: null })).toBe('no PR');
    expect(watch.formatEvidence(null)).toBe('branch and PR not checked');
  });
});

describe('firedOwners / needsReminder', () => {
  const reminder = (session: string) => ({ body: watch.marker(session) + '\nquiet' });

  it('reads back the owner a previous run reported', () => {
    expect(watch.firedOwners([reminder(SESSION)])).toEqual(new Set([SESSION]));
  });

  it('ignores human comments and a truncated marker', () => {
    expect(watch.firedOwners([{ body: 'I am still working on this' }])).toEqual(new Set());
    expect(watch.firedOwners([{ body: '<!-- orphan-watch:x' }])).toEqual(new Set());
    expect(watch.firedOwners([{}, { body: null }])).toEqual(new Set());
    expect(watch.firedOwners(null)).toEqual(new Set());
  });

  it('collects several markers even from one comment', () => {
    expect(watch.firedOwners([{ body: `${watch.marker('a')} and ${watch.marker('b')}` }])).toEqual(
      new Set(['a', 'b'])
    );
  });

  it('reminds once and then never again for the same owner', () => {
    expect(watch.needsReminder(orphan(), [])).toBe(true);
    expect(watch.needsReminder(orphan(), [reminder(SESSION)])).toBe(false);
  });

  it('re-arms when the card is freed and claimed by someone else', () => {
    expect(watch.needsReminder(orphan({ session: 'claude-crazz/other @ 2026-09-01' }), [reminder(SESSION)])).toBe(
      true
    );
  });
});

describe('renderReminder', () => {
  const body = watch.renderReminder(
    { ...orphan({ updatedAt: hoursAgo(40) }), evidence: { branchExists: false, pr: null } },
    { staleHours: 24 }
  );

  it('leads with the fact that decides it — how long the card has been still', () => {
    expect(body).toContain('**This card has not moved for 40 h**');
  });

  it('carries the column, the owner and the branch evidence', () => {
    expect(body).toContain('column: **Implementing**');
    expect(body).toContain(SESSION);
    expect(body).toContain('branch gone from origin · no PR');
  });

  it('states the ownership law rather than acting on it', () => {
    expect(body).toContain('only you can free it');
    expect(body).toContain('This watch never does that itself');
    expect(body).toContain('will not repeat this reminder for this owner');
  });

  it('opens with the hidden owner marker, so the next run reads it back', () => {
    expect(body.startsWith(watch.marker(SESSION))).toBe(true);
    expect(watch.firedOwners([{ body }]).has(SESSION)).toBe(true);
  });
});

describe('renderDigest', () => {
  it('says so plainly when every claimed card is moving', () => {
    const digest = watch.renderDigest([], { now: NOW, staleHours: 24 });
    expect(digest).toContain('0 cards claimed and quiet for 24 h or more.');
    expect(digest).toContain('Every claimed card is moving.');
    expect(digest).not.toContain('| Card |');
  });

  it('tables the suspects with their link, age and evidence', () => {
    const digest = watch.renderDigest(
      [{ ...orphan({ updatedAt: hoursAgo(40) }), evidence: { branchExists: true, pr: null }, reminded: true }],
      { now: NOW, staleHours: 24 }
    );
    expect(digest).toContain('Orphan watch — 2026-08-24 12:00 UTC');
    expect(digest).toContain('1 card claimed and quiet');
    expect(digest).toContain('[#124](https://github.com/Crazz-Org/SPO-WebClient/issues/124)');
    expect(digest).toContain('`claude-crazz/mail-refresh-79cc73`');
    expect(digest).toContain('40 h');
    expect(digest).toContain('| posted |');
  });

  it('marks a card whose owner was already reported', () => {
    expect(watch.renderDigest([{ ...orphan(), reminded: false }], { now: NOW, staleHours: 24 })).toContain(
      '| already sent |'
    );
  });

  it('escapes a pipe in a title so the table survives it', () => {
    expect(
      watch.renderDigest([orphan({ title: 'Pipes | in | the title' })], { now: NOW, staleHours: 24 })
    ).toContain('Pipes \\| in \\| the title');
  });

  it('escapes a pipe in the branch too — `Session` is free text', () => {
    expect(
      watch.renderDigest([orphan({ session: 'fix/a|b @ 2026-08-24' })], { now: NOW, staleHours: 24 })
    ).toContain('`fix/a\\|b`');
  });
});

describe('escapeCell', () => {
  it('escapes the pipe that would end the cell early', () => {
    expect(watch.escapeCell('a | b')).toBe('a \\| b');
  });

  it('escapes the backslash FIRST, so an already-escaped pipe is not un-escaped', () => {
    // The bug CodeQL named: escaping only the pipe turns `a\|b` into `a\\|b`, which renders
    // as a literal backslash and then breaks the row on the very pipe it meant to protect.
    expect(watch.escapeCell('a\\|b')).toBe('a\\\\\\|b');
    expect(watch.escapeCell('trailing\\')).toBe('trailing\\\\');
  });

  it('renders an absent value as an empty cell rather than "undefined"', () => {
    expect(watch.escapeCell(null)).toBe('');
    expect(watch.escapeCell(undefined)).toBe('');
  });
});

describe('resolveStaleHours', () => {
  it('defaults to 24 h and takes a positive override', () => {
    expect(watch.resolveStaleHours({})).toBe(watch.DEFAULT_STALE_HOURS);
    expect(watch.DEFAULT_STALE_HOURS).toBe(24);
    expect(watch.resolveStaleHours({ ORPHAN_STALE_HOURS: '12' })).toBe(12);
  });

  it('ignores a value that is not a usable number rather than reporting the whole board', () => {
    expect(watch.resolveStaleHours({ ORPHAN_STALE_HOURS: 'soon' })).toBe(24);
    expect(watch.resolveStaleHours({ ORPHAN_STALE_HOURS: '0' })).toBe(24);
    expect(watch.resolveStaleHours({ ORPHAN_STALE_HOURS: '-5' })).toBe(24);
  });
});

/**
 * The API side, driven against a fake `fetch`. Worth wiring because the failure shapes a live
 * run meets — a 404 branch, a GraphQL error, a paginated board — are invisible in the pure
 * logic, and because "posts exactly one comment, on the card" is the whole contract.
 */
describe('main', () => {
  interface FakeResponse {
    ok: boolean;
    status: number;
    json(): Promise<unknown>;
    text(): Promise<string>;
  }

  const out = {
    written: '',
    write(s: string) {
      this.written += s;
    },
  };
  let calls: { method: string; url: string; body: unknown }[];

  function graphqlPage(items: unknown[]) {
    return { data: { organization: { projectV2: { items: { pageInfo: { hasNextPage: false }, nodes: items } } } } };
  }

  function node(over: Record<string, unknown> = {}) {
    return {
      updatedAt: new Date(Date.now() - 40 * 3_600_000).toISOString(),
      fieldValues: {
        nodes: [
          { name: 'Implementing', field: { name: 'Status' } },
          { text: 'claude-crazz/dead @ 2026-08-20', field: { name: 'Session' } },
        ],
      },
      content: { number: 124, title: 'A stuck card', url: 'https://example.invalid/124', state: 'OPEN' },
      ...over,
    };
  }

  function fakeFetch(routes: Record<string, unknown>) {
    return jest.fn(
      async (url: string, init: { method?: string; body?: string } = {}): Promise<FakeResponse> => {
        const method = init.method ?? 'GET';
        calls.push({ method, url, body: init.body ? JSON.parse(init.body) : undefined });
        const key = Object.keys(routes).find(r => url.includes(r));
        const value = key === undefined ? null : routes[key];
        if (value === null) return { ok: false, status: 404, json: async () => null, text: async () => '' };
        return { ok: true, status: 200, json: async () => value, text: async () => '' };
      }
    );
  }

  const commentsPosted = () => calls.filter(c => c.method === 'POST' && c.url.includes('/comments'));

  beforeEach(() => {
    out.written = '';
    calls = [];
  });

  afterEach(() => {
    delete (globalThis as { fetch?: unknown }).fetch;
  });

  it('refuses to run without PROJECTS_TOKEN, and says why', async () => {
    await expect(watch.main({ env: {}, argv: [], out })).resolves.toBe(1);
    expect(out.written).toContain('PROJECTS_TOKEN is not set');
  });

  it('posts one reminder on the quiet card, with the branch and PR read as evidence', async () => {
    (globalThis as { fetch?: unknown }).fetch = fakeFetch({
      '/graphql': graphqlPage([node()]),
      '/branches/': null,
      '/pulls?': [{ number: 42, state: 'closed', merged_at: null }],
      '/issues/124/comments': [],
    });
    await expect(
      watch.main({ env: { PROJECTS_TOKEN: 'p', GITHUB_TOKEN: 'g' }, argv: [], out })
    ).resolves.toBe(0);
    expect(out.written).toContain('1 cards on the board, 1 quiet for 24 h+, 1 reminder(s) posted');
    expect(commentsPosted()).toHaveLength(1);
    expect(commentsPosted()[0].url).toContain('/issues/124/comments');
    expect((commentsPosted()[0].body as { body: string }).body).toContain(
      'branch gone from origin · PR #42 closed'
    );
  });

  /**
   * Both halves address the organization since the board moved there too, and the board read
   * is an `organization(login:)` query — a `user(login:)` one returns `data.user = null` for
   * an org login, which this script reports as "board not readable" rather than as an error
   * naming the wrong query. Pinning the login and the REST paths together is what makes that
   * silent shape a test failure instead of a quiet empty run.
   */
  it('reads the board and the repository from the organization', async () => {
    (globalThis as { fetch?: unknown }).fetch = fakeFetch({
      '/graphql': graphqlPage([node()]),
      '/branches/': null,
      '/pulls?': [],
      '/issues/124/comments': [],
    });
    await expect(
      watch.main({ env: { PROJECTS_TOKEN: 'p', GITHUB_TOKEN: 'g' }, argv: [], out })
    ).resolves.toBe(0);

    const graphqlCall = calls.find(c => c.url.includes('/graphql'));
    const body = graphqlCall?.body as { query: string; variables: { login: string } };
    expect(body.variables.login).toBe('Crazz-Org');
    expect(body.query).toContain('organization(login: $login)');

    const restCalls = calls.filter(c => !c.url.includes('/graphql'));
    expect(restCalls.length).toBeGreaterThan(0);
    for (const c of restCalls) expect(c.url).toContain('/repos/Crazz-Org/SPO-WebClient/');
  });

  it('reads a merged PR as merged, not as closed', async () => {
    (globalThis as { fetch?: unknown }).fetch = fakeFetch({
      '/graphql': graphqlPage([node()]),
      '/branches/': { name: 'claude-crazz/dead' },
      '/pulls?': [{ number: 42, state: 'closed', merged_at: '2026-08-22T10:00:00Z' }],
      '/issues/124/comments': [],
    });
    await watch.main({ env: { PROJECTS_TOKEN: 'p' }, argv: [], out });
    expect((commentsPosted()[0].body as { body: string }).body).toContain('PR #42 merged');
  });

  it('stays silent on a card whose owner was already reported', async () => {
    (globalThis as { fetch?: unknown }).fetch = fakeFetch({
      '/graphql': graphqlPage([node()]),
      '/branches/': null,
      '/pulls?': [],
      '/issues/124/comments': [{ body: watch.marker('claude-crazz/dead @ 2026-08-20') }],
    });
    await watch.main({ env: { PROJECTS_TOKEN: 'p' }, argv: [], out });
    expect(out.written).toContain('0 reminder(s) posted');
    expect(commentsPosted()).toHaveLength(0);
    expect(out.written).toContain('| already sent |');
  });

  it('--dry-run reports what it would say and posts nothing', async () => {
    (globalThis as { fetch?: unknown }).fetch = fakeFetch({
      '/graphql': graphqlPage([node()]),
      '/branches/': { name: 'claude-crazz/dead' },
      '/pulls?': [],
      '/issues/124/comments': [],
    });
    await expect(watch.main({ env: { PROJECTS_TOKEN: 'p' }, argv: ['--dry-run'], out })).resolves.toBe(0);
    expect(out.written).toContain('1 reminder(s) withheld (--dry-run)');
    expect(out.written).toContain('branch alive on origin · no PR');
    expect(commentsPosted()).toHaveLength(0);
  });

  it('touches nothing at all when every claimed card is moving', async () => {
    (globalThis as { fetch?: unknown }).fetch = fakeFetch({
      '/graphql': graphqlPage([node({ updatedAt: new Date().toISOString() })]),
    });
    await expect(watch.main({ env: { PROJECTS_TOKEN: 'p' }, argv: [], out })).resolves.toBe(0);
    expect(out.written).toContain('Every claimed card is moving.');
    expect(calls).toHaveLength(1);
  });

  it('appends the digest to the job summary when Actions provides one', async () => {
    const summary = path.join(process.cwd(), 'coverage', `orphan-summary-${process.pid}.md`);
    fs.mkdirSync(path.dirname(summary), { recursive: true });
    fs.writeFileSync(summary, '');
    (globalThis as { fetch?: unknown }).fetch = fakeFetch({
      '/graphql': graphqlPage([node({ updatedAt: new Date().toISOString() })]),
    });
    await watch.main({ env: { PROJECTS_TOKEN: 'p', GITHUB_STEP_SUMMARY: summary }, argv: [], out });
    expect(fs.readFileSync(summary, 'utf8')).toContain('Orphan watch');
    fs.unlinkSync(summary);
  });

  it('surfaces a GraphQL error instead of reporting an empty board', async () => {
    (globalThis as { fetch?: unknown }).fetch = fakeFetch({
      '/graphql': { errors: [{ message: 'Resource not accessible by personal access token' }] },
    });
    await expect(watch.main({ env: { PROJECTS_TOKEN: 'p' }, argv: [], out })).rejects.toThrow(
      /Resource not accessible/
    );
  });

  it('surfaces an unreadable project rather than treating it as zero cards', async () => {
    (globalThis as { fetch?: unknown }).fetch = fakeFetch({ '/graphql': { data: { organization: null } } });
    await expect(watch.main({ env: { PROJECTS_TOKEN: 'p' }, argv: [], out })).rejects.toThrow(/not readable/);
  });

  it('walks every page of the board', async () => {
    let page = 0;
    (globalThis as { fetch?: unknown }).fetch = jest.fn(
      async (url: string, init: { body?: string } = {}): Promise<FakeResponse> => {
        calls.push({ method: 'POST', url, body: init.body ? JSON.parse(init.body) : undefined });
        if (url.includes('/graphql')) {
          page += 1;
          return {
            ok: true,
            status: 200,
            text: async () => '',
            json: async () => ({
              data: {
                organization: {
                  projectV2: {
                    items: {
                      pageInfo: { hasNextPage: page === 1, endCursor: 'c1' },
                      nodes: [node({ content: { number: page, title: 't', url: 'u', state: 'OPEN' } })],
                    },
                  },
                },
              },
            }),
          };
        }
        return { ok: true, status: 200, json: async () => [], text: async () => '' };
      }
    );
    await watch.main({ env: { PROJECTS_TOKEN: 'p' }, argv: ['--dry-run'], out });
    expect(out.written).toContain('2 cards on the board');
    expect(calls.filter(c => c.url.includes('/graphql'))[1].body).toMatchObject({ variables: { cursor: 'c1' } });
  });

  it('raises a non-404 REST failure rather than swallowing it', async () => {
    (globalThis as { fetch?: unknown }).fetch = jest.fn(async (url: string): Promise<FakeResponse> => {
      if (url.includes('/graphql')) {
        return { ok: true, status: 200, json: async () => graphqlPage([node()]), text: async () => '' };
      }
      return { ok: false, status: 500, json: async () => null, text: async () => 'boom' };
    });
    await expect(watch.main({ env: { PROJECTS_TOKEN: 'p' }, argv: [], out })).rejects.toThrow(/→ 500 boom/);
  });
});

describe('the workflow file', () => {
  const workflowPath = path.join(process.cwd(), '.github', 'workflows', 'orphan-cards.yml');
  let yaml: string;
  let script: string;

  beforeAll(() => {
    yaml = fs.readFileSync(workflowPath, 'utf8');
    script = fs.readFileSync(path.join(process.cwd(), 'scripts', 'orphan-cards.js'), 'utf8');
  });

  it('runs on a schedule and by hand', () => {
    expect(yaml).toMatch(/^name: Orphan cards$/m);
    expect(yaml).toMatch(/cron: '10 7 \* \* \*'/);
    expect(yaml).toMatch(/workflow_dispatch:/);
  });

  it('can comment on issues and nothing else — the board is never mutated', () => {
    expect(yaml).toMatch(/issues: write/);
    expect(yaml).not.toMatch(/repository-projects: write/);
    expect(yaml).not.toMatch(/contents: write/);
    // The one call that could free a card. Its absence is the ownership law, in code.
    expect(script).not.toMatch(/updateProjectV2ItemFieldValue|item-edit/);
  });

  it('never opens an issue — a digest card would land in the Todo pool', () => {
    expect(script).not.toMatch(/'POST', `\/repos\/\$\{OWNER\}\/\$\{REPO\}\/issues`/);
  });

  it('stays inert — green and skipped — until PROJECTS_TOKEN is provisioned', () => {
    expect(yaml).toMatch(/steps\.guard\.outputs\.ready == 'true'/);
    expect(yaml).toMatch(/::notice::PROJECTS_TOKEN is not provisioned/);
  });

  it('pins every third-party action to a commit sha', () => {
    const uses = yaml.match(/uses: \S+/g) ?? [];
    expect(uses.length).toBeGreaterThan(0);
    for (const line of uses) expect(line).toMatch(/@[0-9a-f]{40}$/);
  });
});
