/**
 * Capability inventory — the ratchet laid over the RDO coverage mission (lot 6).
 *
 * This file produces no coverage: it executes no handler path. It is a net.
 * Every assertion is DERIVED from the sources at test time — there is no
 * hand-maintained `REQ_* → member → separator` table here, because a second
 * source of truth would rot. What is hand-written is the EXEMPTION lists, one
 * reason per entry: the test forbids NEW gaps, it does not demand that the
 * old ones be closed. Removing an exemption whose gap is still open must fail;
 * that is what makes it a ratchet rather than a comment.
 *
 * Form follows `src/server/__tests__/no-raw-rdo-writes.test.ts`: `fs` reads,
 * paths relative to `__dirname`, no dynamic import of production modules for
 * the scanning half. Control 5 does import production modules, because the
 * template collection it checks IS a production function.
 *
 * Controls:
 *   1. No orphan capability      — every REQ_* is routed and emitted, or exempt.
 *   2. No untested RDO member    — every emitted member is named by an assertion.
 *   3. Separator / socket rules  — VOID_MEMBERS never take `"^"`;
 *                                  CONNECTION_BOUND_MEMBERS never leave the primary socket.
 *   4. Pushes accounted for      — links to the TISEvents inventory, does not copy it.
 *   5. Template demand vs supply — a tab may only read what some template collects.
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

import { VOID_MEMBERS, CONNECTION_BOUND_MEMBERS } from '../../session/rdo-request-guards';
import { HANDLER_TO_GROUP } from '../../../shared/building-details/template-groups';
import {
  registerInspectorTabs,
  getTemplateForVisualClass,
  clearInspectorTabsCache,
  collectTemplatePropertyNamesStructured,
} from '../../../shared/building-details/property-templates';
import type { BuildingTemplate } from '../../../shared/building-details/property-definitions';

const SRC = path.resolve(__dirname, '../../..');
const SERVER = path.join(SRC, 'server');
const SESSION = path.join(SERVER, 'session');
const CLIENT = path.join(SRC, 'client');

const SKIP_DIRS = new Set(['node_modules', '__tests__', '__mocks__']);

/** Production `.ts` under `dir` — no tests, no mocks, no test harnesses. */
function productionFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...productionFiles(full));
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
      out.push(full);
    }
  }
  return out;
}

/** Every `*.test.ts` / `*.test.tsx` under `dir`, `__mocks__` excluded. */
function testFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '__mocks__') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...testFiles(full));
    } else if (/\.test\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const rel = (file: string): string => path.relative(SRC, file).replace(/\\/g, '/');

// ═══════════════════════════════════════════════════════════════════════════
// 1. No orphan capability
// ═══════════════════════════════════════════════════════════════════════════

/**
 * `REQ_*` types with no entry in `wsHandlerRegistry`. A type here is declared
 * vocabulary the gateway cannot answer.
 * Gap family F-1.
 */
const UNROUTED: ReadonlyArray<{ type: string; reason: string }> = [
  {
    type: 'REQ_TRANSPORT_DATA',
    reason: 'No handler and no emitter. Feeding it requires the ActorPoolModified push ' +
      '(family B), which is not implemented — TransportPanel is dead. Analysis §7 F-1.',
  },
  {
    type: 'REQ_SEARCH_MENU_PEOPLE',
    reason: 'Vestige. REQ_SEARCH_MENU_PEOPLE_SEARCH — a distinct type — is routed and ' +
      'emitted; this one never was. Analysis §7 F-1.',
  },
];

/**
 * `REQ_*` types no `src/client/` source ever emits. Each has a working server
 * handler: a feature paid for on the server side and one call short.
 * Gap family F-2.
 */
const UNWIRED: ReadonlyArray<{ type: string; reason: string }> = [
  {
    type: 'REQ_TRANSPORT_DATA',
    reason: 'Same gap as UNROUTED: neither side exists. Analysis §7 F-1.',
  },
  {
    type: 'REQ_SEARCH_MENU_PEOPLE',
    reason: 'Same gap as UNROUTED: vestigial type. Analysis §7 F-1.',
  },
  {
    type: 'REQ_CHAT_GET_CHANNEL_INFO',
    reason: 'handleChatGetChannelInfo exists; channel info is never requested by the UI.',
  },
  {
    type: 'REQ_CHAT_TYPING_STATUS',
    reason: 'handleChatTypingStatus exists. ChatStrip DISPLAYS incoming "is typing" but ' +
      'never sends its own — the asymmetry of analysis §7 F-2.',
  },
  {
    type: 'REQ_GET_ROAD_COST',
    reason: 'handleGetRoadCost exists; no cost estimate is shown before building a road ' +
      '(Voyager shows one).',
  },
  {
    type: 'REQ_MAIL_GET_UNREAD_COUNT',
    reason: 'handleMailGetUnreadCount exists; the unread badge is fed only by the NewMail ' +
      'push, so it is wrong on first load.',
  },
  {
    type: 'REQ_MAIL_SAVE_DRAFT',
    reason: 'handleMailSaveDraft exists; MailPanel shows a Drafts tab with no way to write ' +
      'into it.',
  },
  {
    type: 'REQ_MANAGE_CONSTRUCTION',
    reason: 'handleManageConstruction exists; not exposed in the UI.',
  },
];

function declaredRequestTypes(): string[] {
  const source = fs.readFileSync(path.join(SRC, 'shared/types/message-types.ts'), 'utf8');
  return [...source.matchAll(/^\s+(REQ_[A-Z0-9_]+)\s*=/gm)].map(m => m[1]);
}

function routedRequestTypes(): Set<string> {
  const source = fs.readFileSync(path.join(SERVER, 'ws-handlers/index.ts'), 'utf8');
  return new Set([...source.matchAll(/\[WsMessageType\.(REQ_[A-Z0-9_]+)\]/g)].map(m => m[1]));
}

function clientEmittedRequestTypes(): Set<string> {
  const emitted = new Set<string>();
  for (const file of productionFiles(CLIENT)) {
    const source = fs.readFileSync(file, 'utf8');
    for (const m of source.matchAll(/WsMessageType\.(REQ_[A-Z0-9_]+)/g)) emitted.add(m[1]);
    for (const m of source.matchAll(/'(REQ_[A-Z0-9_]+)'/g)) emitted.add(m[1]);
  }
  return emitted;
}

describe('capability inventory — no orphan REQ_* type', () => {
  it('routes every declared request type to a handler, or exempts it', () => {
    const exempt = new Set(UNROUTED.map(e => e.type));
    const routed = routedRequestTypes();

    const orphans = declaredRequestTypes().filter(t => !routed.has(t) && !exempt.has(t));

    expect(orphans).toEqual([]);
  });

  it('has some client emitter for every declared request type, or exempts it', () => {
    const exempt = new Set(UNWIRED.map(e => e.type));
    const emitted = clientEmittedRequestTypes();

    const orphans = declaredRequestTypes().filter(t => !emitted.has(t) && !exempt.has(t));

    expect(orphans).toEqual([]);
  });

  it('has no stale exemption — a gap that got closed must leave the list', () => {
    const routed = routedRequestTypes();
    const emitted = clientEmittedRequestTypes();

    expect(UNROUTED.filter(e => routed.has(e.type)).map(e => e.type)).toEqual([]);
    expect(UNWIRED.filter(e => emitted.has(e.type)).map(e => e.type)).toEqual([]);
  });

  it('exempts only types that are actually declared', () => {
    const declared = new Set(declaredRequestTypes());

    const unknown = [...UNROUTED, ...UNWIRED].filter(e => !declared.has(e.type)).map(e => e.type);

    expect(unknown).toEqual([]);
  });

  it('registers no handler for a type the vocabulary does not declare', () => {
    const declared = new Set(declaredRequestTypes());

    expect([...routedRequestTypes()].filter(t => !declared.has(t))).toEqual([]);
  });

  it('reads a plausible vocabulary out of the sources — the ratchet must have teeth', () => {
    // Guards the three regexes: a refactor of the enum shape, of the registry
    // literal, or of the client's import style would silently empty a set and
    // make every assertion above vacuous.
    expect(declaredRequestTypes().length).toBeGreaterThanOrEqual(77);
    expect(routedRequestTypes().size).toBeGreaterThanOrEqual(75);
    expect(clientEmittedRequestTypes().size).toBeGreaterThanOrEqual(69);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. No RDO member without a test
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The four literal shapes by which `src/server/session/` and `spo_session.ts`
 * put a member name on the wire. A member emitted through none of them is
 * invisible to this control — the teeth test below is what keeps that honest.
 *
 *   S1  `member: 'X'`                     — sendRdoRequest packet literal
 *   S2  `RdoCommand….call/set/get/idof('X')` — writeRdoFrame chain
 *   S3  `…FireAndForget(ctx, id, 'X', …)` — mail-handler's named indirection
 *   S4  `KNOWN_RDO_COMMANDS`              — building-property-handler's dynamic
 *                                           dispatch allowlist; the member is a
 *                                           runtime string, so the allowlist is
 *                                           the only place it appears literally.
 */
function emittedRdoMembers(): Map<string, Set<string>> {
  const files = [
    ...fs.readdirSync(SESSION)
      .filter(f => f.endsWith('.ts') && !f.endsWith('.test.ts'))
      .map(f => path.join(SESSION, f)),
    path.join(SERVER, 'spo_session.ts'),
  ];

  const members = new Map<string, Set<string>>();
  const add = (member: string, file: string): void => {
    if (!members.has(member)) members.set(member, new Set());
    members.get(member)!.add(rel(file));
  };

  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');

    // S1
    for (const m of source.matchAll(/member:\s*'([A-Za-z_]\w*)'/g)) add(m[1], file);

    // S2 — `RdoCommand` may be followed by a newline before `.sel(…)`.
    for (const chain of source.matchAll(/RdoCommand\s*\.[\s\S]{0,800}?\.build\(\)/g)) {
      for (const m of chain[0].matchAll(/\.(?:call|set|get|idof)\('([A-Za-z_]\w*)'\)/g)) {
        add(m[1], file);
      }
    }

    // S3
    for (const call of source.matchAll(/\b\w*FireAndForget\(([\s\S]{0,300}?)\)/g)) {
      for (const m of call[1].matchAll(/'([A-Z]\w*)'/g)) add(m[1], file);
    }
  }

  // S4
  const bp = fs.readFileSync(path.join(SESSION, 'building-property-handler.ts'), 'utf8');
  const known = /KNOWN_RDO_COMMANDS[^=]*=\s*new Set\(\[([\s\S]*?)\]\)/.exec(bp);
  if (known) {
    for (const m of known[1].matchAll(/'([A-Za-z_]\w*)'/g)) {
      add(m[1], 'server/session/building-property-handler.ts');
    }
  }

  return members;
}

const ASSERTION_LINE = /expect|toContainRdoCommand|toMatchRdoCallFormat|toMatchRdoSetFormat|toMatchRdoFormat|toHaveRdoTypePrefix|toMatchRdoResponse|toPassStrictRdoValidation/;

/**
 * Member names a `src/server/` test drives. Two heuristics, deliberately
 * complementary — one alone produces false alarms:
 *   (a) the name appears as a bare word within three lines of an assertion —
 *       assertions wrap, and `CloneFacility` lives on the continuation line of
 *       a `.toContain(\`sel … call CloneFacility …\`)`;
 *   (b) the name appears as a quoted literal on a non-comment line of a test
 *       file that asserts somewhere (`packet.member === 'RDOSearchKey'` sits a
 *       line above its `expect`).
 * Neither proves the assertion is about the member. This control catches a
 * member nobody named at all — the mission's own §6 is what catches an
 * assertion that checks nothing.
 */
const ASSERTION_WINDOW = 3;

function memberNamesUnderTest(): Set<string> {
  const named = new Set<string>();
  for (const file of testFiles(SERVER)) {
    const source = fs.readFileSync(file, 'utf8');
    if (!source.includes('expect(')) continue;
    const lines = source.split('\n');

    lines.forEach((line, i) => {
      if (!/^\s*(\/\/|\*|\/\*)/.test(line)) {
        for (const m of line.matchAll(/'([A-Za-z_]\w*)'/g)) named.add(m[1]);
      }
      if (!ASSERTION_LINE.test(line)) return;
      const from = Math.max(0, i - ASSERTION_WINDOW);
      const to = Math.min(lines.length - 1, i + ASSERTION_WINDOW);
      for (let j = from; j <= to; j++) {
        if (/^\s*(\/\/|\*|\/\*)/.test(lines[j])) continue;
        for (const m of lines[j].matchAll(/\b([A-Za-z_]\w*)\b/g)) named.add(m[1]);
      }
    });
  }
  return named;
}

/**
 * Emitted members no `src/server/` test names. Empty as of 2026-08-17 — lots 1
 * to 5 closed every one. It stays here because an empty exemption list is the
 * strongest possible statement of this control, and the next member added
 * without a test is what must fill it.
 */
const UNTESTED_MEMBERS: ReadonlyArray<{ member: string; reason: string }> = [];

describe('capability inventory — no emitted RDO member without a test', () => {
  it('names every emitted member in at least one server test, or exempts it', () => {
    const exempt = new Set(UNTESTED_MEMBERS.map(e => e.member));
    const named = memberNamesUnderTest();

    const orphans = [...emittedRdoMembers().entries()]
      .filter(([member]) => !named.has(member) && !exempt.has(member))
      .map(([member, files]) => `${member} (emitted by ${[...files].join(', ')})`)
      .sort();

    expect(orphans).toEqual([]);
  });

  it('has no stale exemption — a member that got tested must leave the list', () => {
    const named = memberNamesUnderTest();

    expect(UNTESTED_MEMBERS.filter(e => named.has(e.member)).map(e => e.member)).toEqual([]);
  });

  it('exempts only members that are actually emitted', () => {
    const emitted = emittedRdoMembers();

    expect(UNTESTED_MEMBERS.filter(e => !emitted.has(e.member)).map(e => e.member)).toEqual([]);
  });

  it('extracts members through all four literal shapes — the ratchet must have teeth', () => {
    const emitted = emittedRdoMembers();

    // One anchor per source: a regex that stops matching drops its anchor.
    expect([...emitted.keys()]).toEqual(expect.arrayContaining([
      'RDOCnntId',      // S1 — packet literal (login-handler.ts)
      'CreateCircuitSeg', // S2 — RdoCommand chain (road-handler.ts)
      'DeleteMessage',  // S3 — mailFireAndForget (mail-handler.ts)
      'RDOSetPrice',    // S4 — KNOWN_RDO_COMMANDS (building-property-handler.ts)
    ]));
    expect(emitted.size).toBeGreaterThanOrEqual(110);
  });

  it('does not report a member nobody emits — the heuristic must discriminate', () => {
    // Without this, "every member is tested" could be true because the emitted
    // set is polluted with words that are not members at all.
    expect(emittedRdoMembers().has('RDOThisMemberDoesNotExist')).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. Separator and socket rules on the two guard maps
// ═══════════════════════════════════════════════════════════════════════════

interface EmissionSite {
  file: string;
  member: string;
  /** `"^"`, `"*"`, `^`, `*`, or `(default)` when the literal omits it. */
  separator: string;
  /** Socket name when the site is an inline `sendRdoRequest('<name>', {…})`. */
  socket?: string;
}

/**
 * Literal emission sites across `src/server/`. A site is either an inline
 * `sendRdoRequest` packet or an `RdoCommand` chain; `.variant()` is `^` and
 * `.push()` is `*` on a chain.
 */
function emissionSites(): EmissionSite[] {
  const sites: EmissionSite[] = [];

  for (const file of productionFiles(SERVER)) {
    const source = fs.readFileSync(file, 'utf8');

    for (const m of source.matchAll(/sendRdoRequest\(\s*'(\w+)'\s*,\s*\{([\s\S]{0,900}?)\}/g)) {
      const member = /member:\s*'(\w+)'/.exec(m[2]);
      if (!member) continue;
      const sep = /separator:\s*'([^']*)'/.exec(m[2]);
      sites.push({ file: rel(file), member: member[1], separator: sep ? sep[1] : '(default)', socket: m[1] });
    }

    // Packets built outside an inline sendRdoRequest call.
    for (const m of source.matchAll(/\{[^{}]*member:\s*'(\w+)'[^{}]*\}/g)) {
      const sep = /separator:\s*'([^']*)'/.exec(m[0]);
      sites.push({ file: rel(file), member: m[1], separator: sep ? sep[1] : '(default)' });
    }

    for (const chain of source.matchAll(/RdoCommand\s*\.[\s\S]{0,800}?\.build\(\)/g)) {
      const m = /\.(?:call|set|get|idof)\('(\w+)'\)/.exec(chain[0]);
      if (!m) continue;
      const separator = /\.variant\(\)/.test(chain[0]) ? '^'
        : /\.push\(\)/.test(chain[0]) ? '*'
        : '(default)';
      sites.push({ file: rel(file), member: m[1], separator });
    }
  }

  return sites;
}

/**
 * Files that dispatch a member drawn from `KNOWN_RDO_COMMANDS`. There the
 * member is a runtime string, so no static scan can attribute a separator to
 * it — and the allowlist contains RDOConnectInput and RDOConnectOutput, both
 * VOID_MEMBERS. The rule is therefore applied to the whole file: it may not
 * contain a VariantId separator at all.
 *
 * Scoped to that allowlist on purpose. "Any file with a non-literal member"
 * would sweep in `spo_session.ts` and `login-handler.ts`, which carry the
 * generic request path and must be able to emit `"^"` — the rule would then be
 * unsatisfiable rather than protective.
 */
function allowlistDispatchFiles(): string[] {
  return productionFiles(SERVER)
    .filter(file => {
      const source = fs.readFileSync(file, 'utf8');
      // The declaration site itself is not a dispatch site.
      return /KNOWN_RDO_COMMANDS\.has\(/.test(source);
    })
    .map(rel);
}

/** `…FireAndForget` helper definitions — bodies that call a runtime member. */
function fireAndForgetHelperBodies(): Array<{ file: string; body: string }> {
  const out: Array<{ file: string; body: string }> = [];
  for (const file of productionFiles(SERVER)) {
    const source = fs.readFileSync(file, 'utf8');
    for (const m of source.matchAll(/(?:function\s+\w*FireAndForget|const\s+\w*[Ff]ireAndForget\s*=)[\s\S]{0,600}?\n\s*\};?/g)) {
      out.push({ file: rel(file), body: m[0] });
    }
  }
  return out;
}

/** `"^"` in any of the shapes the codebase uses, quoted or not. */
const VARIANT_SEPARATOR = /^"?\^"?$/;

describe('capability inventory — separator and socket rules', () => {
  it('never puts the VariantId separator on a void member', () => {
    // The one rule in this repo whose violation is proven to freeze the shared
    // production server (2026-08-15; RDOQueryServer.pas:422-424 →
    // RDOObjectServer.pas:292). VOID_MEMBERS is imported, not copied.
    const offenders = emissionSites()
      .filter(s => VOID_MEMBERS.has(s.member) && VARIANT_SEPARATOR.test(s.separator))
      .map(s => `${s.file}: ${s.member} separator=${s.separator}`);

    expect(offenders).toEqual([]);
  });

  it('keeps the VariantId separator out of the allowlist dispatch path', () => {
    const offenders: string[] = [];
    for (const file of allowlistDispatchFiles()) {
      const lines = fs.readFileSync(path.join(SRC, file), 'utf8').split('\n');
      lines.forEach((line, i) => {
        if (/^\s*(\/\/|\*)/.test(line)) return;              // prose, not code
        if (/separator:\s*'"?\^"?'/.test(line) || /\.variant\(\)/.test(line)) {
          offenders.push(`${file}:${i + 1}: ${line.trim()}`);
        }
      });
    }

    expect(offenders).toEqual([]);
  });

  it('builds every fire-and-forget helper frame with the VoidId separator', () => {
    // `mailFireAndForget(ctx, id, method, …)` takes the member as a parameter,
    // and two of the members it is called with (AddLine, CloseMessage) are
    // VOID_MEMBERS. The helper body is the only place the separator is decided.
    const offenders = fireAndForgetHelperBodies()
      .filter(h => /RdoCommand/.test(h.body))
      .filter(h => !/\.push\(\)/.test(h.body) || /\.variant\(\)/.test(h.body))
      .map(h => h.file);

    expect(offenders).toEqual([]);
  });

  it('drives every void member from at least one test', () => {
    // Crossed with control 2: a void member nobody exercises is a separator
    // decision nothing protects.
    const named = memberNamesUnderTest();

    expect([...VOID_MEMBERS.keys()].filter(m => !named.has(m))).toEqual([]);
  });

  it('reads connection-bound members only off the primary world socket', () => {
    // NOT a separator rule. `RDOCnntId` is answered before object lookup and is
    // a read, so `"^"` is its correct — and required — form; the invariant is
    // the SOCKET. The id is the address of the carrying connection
    // (RDOQueryServer.pas:269-274, WinSockRDOConnectionsServer.pas:664-668), so
    // reading it on a pooled connection binds the server-side ClientView to a
    // socket the pool may destroy.
    const offenders = emissionSites()
      .filter(s => CONNECTION_BOUND_MEMBERS.has(s.member))
      .filter(s => s.socket !== undefined && s.socket !== 'world')
      .map(s => `${s.file}: ${s.member} on socket '${s.socket}'`);

    expect(offenders).toEqual([]);
  });

  it('keeps the pool-bypass guard wired into the request path', () => {
    // The static rule above only covers literal call sites. What actually
    // enforces it at runtime is isConnectionBoundMember() in sendRdoRequest.
    const session = fs.readFileSync(path.join(SERVER, 'spo_session.ts'), 'utf8');

    expect(session).toMatch(/isConnectionBoundMember\(packetData\)/);
  });

  it('finds emission sites at all — the ratchet must have teeth', () => {
    const sites = emissionSites();

    expect(sites.length).toBeGreaterThanOrEqual(90);
    // Every void member that has a literal site must be seen with `"*"`.
    const voidSites = sites.filter(s => VOID_MEMBERS.has(s.member));
    expect(voidSites.length).toBeGreaterThanOrEqual(5);
    expect(voidSites.every(s => /^"?\*"?$/.test(s.separator))).toBe(true);
    expect(allowlistDispatchFiles()).toEqual(
      expect.arrayContaining(['server/session/building-property-handler.ts']),
    );
    expect(fireAndForgetHelperBodies().map(h => h.file)).toEqual(
      expect.arrayContaining(['server/session/mail-handler.ts']),
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. Pushes accounted for — a link, not a copy
// ═══════════════════════════════════════════════════════════════════════════

describe('capability inventory — push coverage lives next to the dispatcher', () => {
  /**
   * Lot 2 already wrote the TISEvents inventory in `push-dispatcher.test.ts`,
   * co-located with the module it guards, as `module.ts → module.test.ts`
   * requires. Copying it here would create the second source of truth this file
   * exists to avoid. What is added instead is a guard against its silent
   * removal: without this, deleting that inventory would leave the umbrella
   * green while the ratchet is gone.
   */
  it('still carries the 24 published TISEvents methods with their exemptions', () => {
    const source = fs.readFileSync(path.join(SESSION, 'push-dispatcher.test.ts'), 'utf8');

    expect(source).toContain('ServerCnxHandler.pas:469-505');
    expect(source).toMatch(/const TIS_EVENTS:/);
    expect(source).toMatch(/const PUSH_EXEMPTIONS:/);
    expect(source).toMatch(/const NON_TIS_MEMBERS:/);

    const published = source.match(/\{ member: '\w+', line: \d+ \}/g) || [];
    expect(published).toHaveLength(24);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. Template demand vs supply (A-8)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The control that would have caught `enrichVotesTab`. A tab enrichment reads
 * properties out of `allValues` — the map filled from what
 * `collectTemplatePropertyNames*` asked the cache for. If no reachable template
 * carrying that tab collects the property, the enrichment is dead code and the
 * RDO call it guards is never emitted.
 *
 * Reachable templates are derived, not listed: the fallback returned by
 * `getTemplateForVisualClass` for an unregistered class, and the maximal
 * data-driven template obtained by registering every handler of
 * `HANDLER_TO_GROUP` at once. Nothing else can be built — `registerInspectorTabs`
 * draws from that map alone (plus its two runtime injections).
 */
const PROBE_VISUAL_CLASS = '__capability_inventory_probe__';

let reachableTemplates: BuildingTemplate[] = [];

beforeAll(() => {
  const fallback = getTemplateForVisualClass('__unregistered_visual_class__');
  registerInspectorTabs(
    PROBE_VISUAL_CLASS,
    Object.keys(HANDLER_TO_GROUP).map(handler => ({ tabName: handler, tabHandler: handler })),
    'Inventory probe',
  );
  reachableTemplates = [fallback, getTemplateForVisualClass(PROBE_VISUAL_CLASS)];
});

afterAll(() => {
  clearInspectorTabsCache();
});

function collectedNames(template: BuildingTemplate): Set<string> {
  const collected = collectTemplatePropertyNamesStructured(template);
  const names = new Set<string>([...collected.regularProperties, ...collected.countProperties]);
  for (const infos of collected.indexedByCount.values()) {
    for (const info of infos) {
      names.add(info.rdoName);
      if (info.maxProperty) names.add(info.maxProperty);
    }
  }
  return names;
}

interface TabDemand {
  fn: string;
  tab: string;
  properties: string[];
}

/** `enrich…Tab` functions, their gate tab, and the properties they read. */
function tabDemands(): TabDemand[] {
  const source = fs.readFileSync(path.join(SESSION, 'building-details-handler.ts'), 'utf8');
  const demands: TabDemand[] = [];

  for (const m of source.matchAll(/(?:async\s+)?function\s+(enrich\w*Tab)\s*\(/g)) {
    const start = m.index!;
    const end = source.indexOf('\n}', start);
    const body = source.slice(start, end === -1 ? source.length : end);

    const gate = /groups\['(\w+)'\]/.exec(body);
    if (!gate) continue;

    const properties = [...body.matchAll(/allValues\.get\('(\w+)'\)/g)].map(p => p[1]);
    demands.push({ fn: m[1], tab: gate[1], properties: [...new Set(properties)] });
  }

  return demands;
}

/** Properties read outside any tab gate — they need only one reachable template. */
function ungatedDemands(): string[] {
  const source = fs.readFileSync(path.join(SESSION, 'building-details-handler.ts'), 'utf8');
  return [...new Set([...source.matchAll(/allValues\.get\('(\w+)'\)/g)].map(m => m[1]))];
}

/**
 * Tab-scoped reads that no template can satisfy.
 * Gap A-8.
 */
const UNSATISFIABLE_TAB_DEMANDS: ReadonlyArray<{ fn: string; tab: string; property: string; reason: string }> = [
  {
    fn: 'enrichVotesTab',
    tab: 'votes',
    property: 'CurrBlock',
    reason: 'A-8. CurrBlock is declared only by GENERIC_GROUP (template-groups.ts:25), which ' +
      'is reachable solely through the fallback template — and that template has no votes ' +
      'tab. No CLASSES.BIN registration can produce both, so RDOVoteOf is never emitted and ' +
      'the Votes tab never shows who the player voted for.',
  },
];

describe('capability inventory — a tab may only read what a template collects', () => {
  it('satisfies every ungated property read from at least one reachable template', () => {
    const supplied = new Set(reachableTemplates.flatMap(t => [...collectedNames(t)]));

    expect(ungatedDemands().filter(p => !supplied.has(p))).toEqual([]);
  });

  it('satisfies every tab-scoped read from a template that carries that tab, or exempts it', () => {
    const exempt = new Set(UNSATISFIABLE_TAB_DEMANDS.map(e => `${e.fn}:${e.property}`));
    const offenders: string[] = [];

    for (const demand of tabDemands()) {
      const carriers = reachableTemplates.filter(t => t.groups.some(g => g.id === demand.tab));
      for (const property of demand.properties) {
        if (exempt.has(`${demand.fn}:${property}`)) continue;
        if (!carriers.some(t => collectedNames(t).has(property))) {
          offenders.push(`${demand.fn} reads ${property} but no template with a '${demand.tab}' tab collects it`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it('has no stale exemption — a read that became satisfiable must leave the list', () => {
    const stale: string[] = [];

    for (const e of UNSATISFIABLE_TAB_DEMANDS) {
      const carriers = reachableTemplates.filter(t => t.groups.some(g => g.id === e.tab));
      if (carriers.some(t => collectedNames(t).has(e.property))) {
        stale.push(`${e.fn}:${e.property}`);
      }
    }

    expect(stale).toEqual([]);
  });

  it('exempts only reads the handler actually performs', () => {
    const actual = new Set(tabDemands().flatMap(d => d.properties.map(p => `${d.fn}:${p}`)));

    const unknown = UNSATISFIABLE_TAB_DEMANDS
      .filter(e => !actual.has(`${e.fn}:${e.property}`))
      .map(e => `${e.fn}:${e.property}`);

    expect(unknown).toEqual([]);
  });

  it('derives real templates and real demands — the ratchet must have teeth', () => {
    // A renamed collector, an emptied HANDLER_TO_GROUP or a rewritten enrichment
    // would make the assertions above vacuous rather than red.
    expect(reachableTemplates).toHaveLength(2);
    expect(reachableTemplates[1].groups.length).toBeGreaterThanOrEqual(Object.keys(HANDLER_TO_GROUP).length);
    expect(reachableTemplates[1].groups.some(g => g.id === 'votes')).toBe(true);
    expect(collectedNames(reachableTemplates[0]).size).toBeGreaterThanOrEqual(8);
    expect(tabDemands().length).toBeGreaterThanOrEqual(1);
    expect(ungatedDemands().length).toBeGreaterThanOrEqual(5);
  });
});
