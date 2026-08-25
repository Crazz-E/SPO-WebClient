/**
 * The ground reservation (#156) is a rule, not a program. No process enforces it: a session
 * reads the board, computes a busy set and decides. So the same reasoning as #123 applies —
 * a rule that lives only in prose is protected by nothing — and the same shape as
 * `card-reviewer-agent.test.ts`: pin the properties that make the mechanism the thing #156
 * asked for, each of them one edit away from being lost and none visible in a diff review
 * of a single file.
 *
 * Three invariants matter more than the rest:
 *
 *   - **The areas are a partition, in order.** They overlap on purpose in
 *     `.github/labeler.yml` — a PR can be both `client` and `renderer`. An *area* must not,
 *     or two sessions holding `client` and `renderer` each believe they are on separate
 *     ground while editing the same tree. Reorder the rows and `src/client/renderer/x.ts`
 *     silently changes area.
 *   - **`Session` is never touched.** What expires on inactivity is the ground reservation.
 *     Ownership law 1 has no timeout, and a rule that let a session clear someone else's
 *     `Session` field would repeal it by accident.
 *   - **One idle window, not two.** The reservation and `scripts/finish.sh` read the same
 *     `SPO_WORKTREE_IDLE_MIN` with the same 120-minute default. That claim is asserted here
 *     against the script itself, so the doc cannot drift away from the code it cites.
 */

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = process.cwd();
const RULEBOOK = path.join(ROOT, 'doc', 'kanban-workflow.md');
const COMMAND = path.join(ROOT, '.claude', 'commands', 'next-task.md');
const CLAUDE_MD = path.join(ROOT, 'CLAUDE.md');
const HEARTBEAT = path.join(ROOT, '.claude', 'hooks', 'session-heartbeat.sh');
const FINISH = path.join(ROOT, 'scripts', 'finish.sh');
const HEARTBEAT_SCAN = path.join(ROOT, 'scripts', 'heartbeat-scan.sh');
const CLAIM_READ = path.join(ROOT, 'scripts', 'claim-read.sh');

let rulebook: string;
let command: string;
let claudeMd: string;
let heartbeat: string;
let finish: string;
let heartbeatScan: string;
let claimRead: string;

/**
 * Prose in these files is hard-wrapped at ~95 columns, so an assertion written against the
 * reading order breaks the day a word crosses the margin. Sentence assertions run against
 * the collapsed copy; assertions about structure (table rows, numbered steps) keep the
 * newlines they depend on.
 */
const collapse = (text: string): string => text.replace(/\s+/g, ' ');

beforeAll(() => {
  rulebook = fs.readFileSync(RULEBOOK, 'utf8');
  command = fs.readFileSync(COMMAND, 'utf8');
  claudeMd = fs.readFileSync(CLAUDE_MD, 'utf8');
  heartbeat = fs.readFileSync(HEARTBEAT, 'utf8');
  finish = fs.readFileSync(FINISH, 'utf8');
  heartbeatScan = fs.readFileSync(HEARTBEAT_SCAN, 'utf8');
  claimRead = fs.readFileSync(CLAIM_READ, 'utf8');
});

/** The partition of §2, in the order the first-match rule depends on. */
const AREAS = [
  'docs',
  'rdo',
  'bench',
  'renderer',
  'gateway',
  'client',
  'e2e',
  'shared',
  'ci',
] as const;

/** The slice of the rulebook holding the partition table — between its heading and the next one. */
const partitionSection = (): string => {
  const start = rulebook.indexOf('### The areas —');
  expect(start).toBeGreaterThan(-1);
  const end = rulebook.indexOf('\n## ', start);
  expect(end).toBeGreaterThan(start);
  return rulebook.slice(start, end);
};

describe('the Area field is documented as a card field', () => {
  it('sits in the Fields on each card table, beside Session, Category and Size', () => {
    const start = rulebook.indexOf('## Fields on each card');
    const end = rulebook.indexOf('### The areas —');
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const table = rulebook.slice(start, end);
    expect(table).toMatch(/^\| `Area` \| single select \|/m);
    for (const field of ['Session', 'Category', 'Size']) {
      expect(table).toMatch(new RegExp(`^\\| \`${field}\` \\|`, 'm'));
    }
  });
});

describe('the areas are a partition, first match from the top', () => {
  it('lists exactly the nine areas, in order', () => {
    const rows = [...partitionSection().matchAll(/^\| `([a-z0-9]+)` \| `/gm)].map(m => m[1]);
    expect(rows).toEqual([...AREAS]);
  });

  it('states that the earlier row wins, which is what makes it a partition', () => {
    // Without the ordering rule the table is ambiguous: src/client/renderer/x.ts matches
    // `renderer` and `client`, src/server/rdo.ts matches `rdo` and `gateway`.
    const section = collapse(partitionSection());
    expect(section).toMatch(/belongs to \*\*exactly one\*\* area/);
    expect(section).toMatch(/the earlier row wins/);
  });

  it.each([
    ['docs', 'doc/**'],
    ['rdo', 'src/mock-server/**'],
    ['bench', '.claude/hooks/**'],
    ['renderer', 'src/client/renderer/**'],
    ['gateway', 'src/server/**'],
    ['client', 'src/client/**'],
    ['e2e', 'src/e2e/**'],
    ['shared', 'src/shared/**'],
    ['ci', '.github/**'],
  ])('gives %s at least the path %s', (area, glob) => {
    const row = new RegExp(`^\\| \`${area}\` \\|.*\`${glob.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\``, 'm');
    expect(partitionSection()).toMatch(row);
  });

  it('says the labeler overlaps on purpose and an area must not', () => {
    const section = collapse(partitionSection());
    expect(section).toMatch(/not \[`\.github\/labeler\.yml`\]/);
    expect(section).toMatch(/An area must \*not\* overlap/);
  });

  it('keeps one area per card, with incidental edits named so they cannot tip the choice', () => {
    const section = collapse(partitionSection());
    expect(section).toMatch(/\*\*One area per card\*\* — where the \*majority\* of the change lands/);
    for (const incidental of ['CLAUDE.md', 'package.json', 'package-lock.json', 'README.md']) {
      expect(section).toContain(`\`${incidental}\``);
    }
    expect(section).toMatch(/\*\*split into two cards\*\*/);
    expect(section).toMatch(/never leave `Area` empty to dodge the rule/);
  });

  it('forbids area: labels, unlike Category and Size', () => {
    const section = collapse(partitionSection());
    expect(section).toMatch(/\*\*No `area:` labels\.\*\*/);
    expect(section).toMatch(/`Area` is read only by `\/next-task`/);
  });
});

/**
 * The table's two failure modes, pinned (#160). A partition can break in both directions, and
 * neither break is visible in a diff of the file that caused it:
 *
 *   - a **reachable path no row claims** — the session must write some area, is forbidden from
 *     leaving `Area` empty, and has nothing to read, so it guesses. Two sessions guessing
 *     differently reintroduces the overlap the field exists to remove, silently.
 *   - a **row nothing can match** — `electron` was written 73 minutes after `electron/` was
 *     deleted, and was then offered at every classification until #160.
 */
describe('the partition is total in both directions', () => {
  /** Every path the table cites, in table order, as `[area, glob]`. */
  const citedPaths = (): Array<[string, string]> => {
    const out: Array<[string, string]> = [];
    for (const row of partitionSection().matchAll(/^\| `([a-z0-9]+)` \| (.+) \|$/gm)) {
      for (const cell of row[2].matchAll(/`([^`]+)`/g)) out.push([row[1], cell[1]]);
    }
    return out;
  };

  /**
   * A table glob as a regex over repository-relative paths: `**` crosses directory
   * boundaries, `*` does not, and `** /` also matches zero directories so `**` + `/*.md`
   * reaches a file at the root.
   */
  const globToRegExp = (glob: string): RegExp => {
    let out = '';
    for (let i = 0; i < glob.length; i += 1) {
      const c = glob[i];
      if (c === '*' && glob[i + 1] === '*' && glob[i + 2] === '/') {
        out += '(?:.*/)?';
        i += 2;
      } else if (c === '*' && glob[i + 1] === '*') {
        out += '.*';
        i += 1;
      } else if (c === '*') {
        out += '[^/]*';
      } else if ('.+^${}()|[]\\'.includes(c)) {
        out += `\\${c}`;
      } else {
        out += c;
      }
    }
    return new RegExp(`^${out}$`);
  };

  /** The tracked tree — not the working directory: an untracked leftover must not keep a row alive. */
  const tracked = (): string[] =>
    execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
      .split('\n')
      .filter(Boolean);

  it('names `ci` last and says it is the catch-all, which is what makes the table total', () => {
    const rows = [...partitionSection().matchAll(/^\| `([a-z0-9]+)` \| `/gm)].map(m => m[1]);
    expect(rows[rows.length - 1]).toBe('ci');
    const section = collapse(partitionSection());
    expect(section).toMatch(/\*\*`ci` is the last row and the catch-all\.\*\*/);
    expect(section).toMatch(/Anything reachable that no earlier row claims is `ci`/);
  });

  it('puts `docs` first, so Markdown is documentation wherever it lives', () => {
    const rows = [...partitionSection().matchAll(/^\| `([a-z0-9]+)` \| `/gm)].map(m => m[1]);
    expect(rows[0]).toBe('docs');
    expect(collapse(partitionSection())).toMatch(
      /\*\*`docs` comes first, so a Markdown file is documentation wherever it lives\*\*/
    );
  });

  it('gives `src/shared/` ground of its own, which neither half owns', () => {
    expect(partitionSection()).toMatch(/^\| `shared` \| `src\/shared\/\*\*`/m);
    expect(collapse(partitionSection())).toMatch(/\*\*`shared` is ground of its own\*\*/);
  });

  it('has no row that matches nothing — every cited path exists in the tracked tree', () => {
    const files = tracked();
    const dead = citedPaths().filter(([, glob]) => !files.some(f => globToRegExp(glob).test(f)));
    expect(dead).toEqual([]);
  });

  it('leaves no `electron` row, and nothing tracked under `electron/` to justify one', () => {
    expect(partitionSection()).not.toMatch(/^\| `electron` \|/m);
    expect(tracked().some(f => f.startsWith('electron/'))).toBe(false);
  });

  it.each([
    ['src/shared/logger.ts', 'shared'],
    ['src/shared/rdo-frame.ts', 'rdo'],
    ['src/__tests__/area-reservation.test.ts', 'ci'],
    ['jest.config.js', 'ci'],
    ['.claude/commands/next-task.md', 'docs'],
    ['.github/workflows/ci.yml', 'ci'],
    ['src/client/renderer/chunk-cache.ts', 'renderer'],
    ['src/e2e/bench/worker.ts', 'bench'],
  ])('classifies %s as %s by first match from the top', (file, area) => {
    const hit = citedPaths().find(([, glob]) => globToRegExp(glob).test(file));
    expect(hit).toBeDefined();
    expect((hit as [string, string])[0]).toBe(area);
  });
});

describe('the busy set', () => {
  const section = (): string => {
    const start = rulebook.indexOf('### One session per area');
    expect(start).toBeGreaterThan(-1);
    const end = rulebook.indexOf('\n## ', start);
    expect(end).toBeGreaterThan(start);
    return rulebook.slice(start, end);
  };

  it('lives inside the ownership law, whose numbered rules it joins', () => {
    const law = rulebook.indexOf('## The ownership law');
    const orphan = rulebook.indexOf('## The orphan watch');
    expect(law).toBeGreaterThan(-1);
    expect(rulebook.indexOf('### One session per area')).toBeGreaterThan(law);
    expect(rulebook.indexOf('### One session per area')).toBeLessThan(orphan);
  });

  it('is exactly In progress, Gate and PR', () => {
    expect(collapse(section())).toMatch(
      /busy\*\* when a card holds it in \*\*In progress\*\*, \*\*Gate\*\* or \*\*PR\*\*/
    );
  });

  it('excludes the three columns that hold no branch', () => {
    // Gate and PR do block: the branch exists and is about to land.
    expect(collapse(section())).toMatch(
      /`Todo`, `Done` and `Needs triage` never make an area busy/
    );
  });

  it('lets docs be held by several cards at once, and blocks on every other area', () => {
    const text = collapse(section());
    expect(text).toMatch(/\*\*`docs` never blocks\.\*\*/);
    expect(text).toMatch(/Two or more cards may hold `docs` at the same time/);
    expect(text).toMatch(/\*\*Every other area blocks\.\*\*/);
  });

  it('sends the algorithm to the command, rather than restating it', () => {
    expect(collapse(section())).toMatch(/\.claude\/commands\/next-task\.md.*§ 1/);
  });
});

describe('the reservation expires, the ownership does not', () => {
  const section = (): string => {
    const start = rulebook.indexOf('### One session per area');
    const end = rulebook.indexOf('\n## ', start);
    return rulebook.slice(start, end);
  };

  it('keys liveness to the session heartbeat, not to a board write', () => {
    const text = collapse(section());
    expect(text).toMatch(/\*\*session heartbeat\*\*/);
    expect(text).toMatch(/\.claude\/hooks\/session-heartbeat\.sh/);
    expect(text).toMatch(/board writes happen at state transitions only/);
  });

  it('names the four steps that join a branch to a worktree heartbeat', () => {
    const text = section();
    expect(text).toMatch(/^1\. list `~\/\.spo-bench\/sessions\/\*\.alive`/m);
    expect(text).toMatch(/^2\. each file \*contains\* the absolute worktree path/m);
    expect(text).toMatch(/^3\. `git -C <path> rev-parse --abbrev-ref HEAD`/m);
    expect(text).toMatch(/^4\. a card matches when its `Session` field begins with that branch/m);
  });

  it('falls back to the last origin commit when no heartbeat names the branch', () => {
    const text = collapse(section());
    expect(text).toMatch(/no heartbeat is found for the branch/);
    expect(text).toMatch(/last commit date on `origin`, with the same window/);
    expect(text).toMatch(/A branch with neither signal does not hold its area/);
  });

  it('leaves Session untouched — ownership law 1 keeps its no-timeout guarantee', () => {
    const text = collapse(section());
    expect(text).toMatch(/\*\*`Session` is never touched by any of this\*\*/);
    expect(text).toMatch(/only the human may free it/);
    expect(text).toMatch(/What expires is the \*ground reservation\*/);
  });
});

describe('one idle window, shared with finish.sh', () => {
  it('the rulebook cites SPO_WORKTREE_IDLE_MIN and its 120-minute default', () => {
    const text = collapse(rulebook);
    expect(text).toMatch(/The window is \*\*`SPO_WORKTREE_IDLE_MIN`\*\*/);
    expect(text).toMatch(/the same 120-minute default/);
  });

  it('finish.sh really reads that variable with that default', () => {
    // The claim "one number to tune, not two" is only true while this holds. Change the
    // default in the script and this test — inside the required check — goes red.
    expect(finish).toMatch(/IDLE_MIN="\$\{SPO_WORKTREE_IDLE_MIN:-120\}"/);
  });

  it('the heartbeat hook writes the store the rule reads, keyed by worktree path', () => {
    expect(heartbeat).toMatch(/SPO_SESSION_DIR:-\$HOME\/\.spo-bench\/sessions/);
    expect(heartbeat).toMatch(/printf '%s\\n' "\$dir" > "\$store\/\$key\.alive"/);
  });
});

describe('the /next-task command implements the claim algorithm', () => {
  const pick = (): string => {
    const start = command.indexOf('## 1 · Pick');
    expect(start).toBeGreaterThan(-1);
    const end = command.indexOf('## 2 · Claim');
    expect(end).toBeGreaterThan(start);
    return command.slice(start, end);
  };

  it('reads area alongside status and session from the board', () => {
    expect(collapse(pick())).toMatch(/`status`, `session` and `area` come back on every item/);
  });

  it('computes the busy set first, with docs excluded from it', () => {
    const text = pick();
    expect(text).toMatch(/^1\. \*\*Compute the busy set\*\*/m);
    expect(collapse(text)).toMatch(/`docs` never enters the busy set/);
  });

  it('walks Todo top-down and treats an empty Area as claimable', () => {
    const text = pick();
    expect(text).toMatch(/^2\. \*\*Walk Todo top-down\*\*/m);
    expect(collapse(text)).toMatch(/an \*\*empty\*\* `Area` is claimable and blocks nothing/);
  });

  it('fills a missing Area before the card moves to In progress', () => {
    const text = pick();
    expect(text).toMatch(/^4\. \*\*If `Area` was empty, determine it now\*\*/m);
    expect(collapse(text)).toMatch(/\*\*write it before\*\* moving the card to In progress/);
  });

  it('backs off by clearing its own Session when the area turns out to be busy', () => {
    const text = collapse(pick());
    expect(text).toMatch(/clear `Session`, leave the card in Todo with `Area` now filled/);
    expect(text).toMatch(/go back to step 2/);
    expect(text).toMatch(/ownership law 3 is not violated/);
  });

  it('stops rather than taking a busy card or inventing work', () => {
    const text = pick();
    expect(text).toMatch(/^6\. \*\*If no Todo card is claimable, stop and say so\.\*\*/m);
    expect(collapse(text)).toMatch(/do not invent work outside the board/);
  });

  it('carries a runnable heartbeat probe and the window it is read against', () => {
    const text = pick();
    // The probe is a named script now, not a composed one-liner: the § reaches it by alias,
    // and the alive-file walk it used to inline is asserted against that script instead.
    expect(text).toMatch(/npm run board:sessions/);
    expect(heartbeatScan).toMatch(/\*\.alive/);
    expect(heartbeatScan).toMatch(/rev-parse --abbrev-ref HEAD/);
    expect(collapse(text)).toMatch(/`SPO_WORKTREE_IDLE_MIN` \(default \*\*120\*\* minutes\)/);
    expect(collapse(text)).toMatch(/last commit date on `origin`, same window/);
  });

  it('keeps the ownership distinction at the point of use', () => {
    expect(collapse(pick())).toMatch(
      /what expired is the ground reservation, never the ownership/
    );
  });
});

describe('the rule is reachable from CLAUDE.md, which every session reads', () => {
  it('names the field, the docs exemption and the expiring window', () => {
    const text = collapse(claudeMd);
    expect(text).toMatch(/\*\*One session per area:\*\* a card also carries an `Area`/);
    expect(text).toMatch(/`docs` never blocks; every other area does/);
    expect(text).toMatch(/`SPO_WORKTREE_IDLE_MIN`, 120 min/);
    expect(text).toMatch(/the card's `Session` field never does/);
  });
});

describe('the gh recipes a session copies from', () => {
  // Since the GraphQL-quota incident of 2026-08-25 the pool is read ONCE — the claim read —
  // so the busy set is derived inside that same call instead of by a second listing. It stays
  // an executable filter, not prose: the rule is only as good as the jq a session copies.
  it('carry the area on every item, and compute the busy set inside the one call', () => {
    const start = rulebook.indexOf('## gh CLI recipes');
    expect(start).toBeGreaterThan(-1);
    const recipes = rulebook.slice(start);
    expect(recipes).toMatch(/THE CLAIM READ/);
    expect(recipes).toMatch(/npm run board:claim/);
    // The claim read's jq prints status, area and session for every item. It lives in the
    // script the alias runs, so the invariants are pinned there rather than in the prose.
    expect(claimRead).toMatch(/\[\\\(\.Status \/\/ "-"\)\]/);
    expect(claimRead).toMatch(/area=\\\(\.Area \/\/ "-"\)/);
    expect(claimRead).toMatch(/session=\\\(\.Session \/\/ "-"\)/);
    // The busy set itself — the same three statuses, with docs still exempt.
    expect(claimRead).toMatch(/"busy areas: /);
    expect(claimRead).toMatch(/\.Status == "In progress" or \.Status == "Gate" or \.Status == "PR"/);
    expect(claimRead).toMatch(/\.Area != "docs"/);
    expect(recipes).toMatch(/# Fill Area before the card moves to In progress/);
  });
});
