import { readFileSync } from 'fs';
import { join } from 'path';
import {
  VOID_MEMBERS,
  CONNECTION_BOUND_MEMBERS,
  FORBIDDEN_MEMBERS,
  SESSION_LIFECYCLE_MEMBERS,
  assertMemberNotForbidden,
  assertNotSessionLifecycleMember,
  assertNotVariantOnVoidMember,
  assertNotVoidPush,
  canBufferRequest,
  isConnectionBoundMember,
} from './rdo-request-guards';

// =============================================================================
// assertNotVariantOnVoidMember — P-H1
//
// The guard that encodes a proven crash rather than a style rule: a single
// `call SayThis "^"` frame froze the shared production Interface Server
// (live probe, 2026-08-15).
// =============================================================================
describe('assertNotVariantOnVoidMember', () => {
  it.each([...VOID_MEMBERS.keys()])('rejects "^" on the void member %s', member => {
    expect(() => assertNotVariantOnVoidMember({ separator: '"^"', member })).toThrow(
      /freezes the shared Delphi Interface Server/
    );
  });

  it('names the Pascal declaration so the reader can verify the claim', () => {
    expect(() => assertNotVariantOnVoidMember({ separator: '"^"', member: 'SayThis' })).toThrow(
      /InterfaceServer\.pas:179/
    );
  });

  it('allows "*" on a void member — that is the reference client form', () => {
    expect(() => assertNotVariantOnVoidMember({ separator: '"*"', member: 'SayThis' })).not.toThrow();
  });

  // "^" on a function is correct and capture-proven:
  // `call GetTycoonCookie "^" "#22","%LastY.0";` -> `A36 res="%395";` (live capture)
  it('allows "^" on a member that is not void', () => {
    expect(() => assertNotVariantOnVoidMember({ separator: '"^"', member: 'GetTycoonCookie' })).not.toThrow();
  });

  it('ignores packets with no separator or no member', () => {
    expect(() => assertNotVariantOnVoidMember({ member: 'SayThis' })).not.toThrow();
    expect(() => assertNotVariantOnVoidMember({ separator: '"^"' })).not.toThrow();
  });
});

// =============================================================================
// assertNotVoidPush — a SAFETY guard since 2026-08-18, not a convention
//
// It was documented as "one wire form per intent" with the note that `"*"` +
// QueryId is harmless. That is true of a `procedure` and false of a `function`:
// under VoidId the dispatcher passes no hidden result pointer, so the function
// writes its OleVariant through a register nobody set. One such frame —
// `call GetUserList "*"` — left the shared Interface Server answering
// errMalformedQuery to every query, on every connection.
// =============================================================================
describe('assertNotVoidPush', () => {
  it('rejects "*" on any member not proven to be a procedure', () => {
    expect(() => assertNotVoidPush({ separator: '"*"', member: 'SetViewedArea' }))
      .toThrow(/not a proven Delphi procedure/);
  });

  it.each([...VOID_MEMBERS.keys()])('exempts the void member %s', member => {
    expect(() => assertNotVoidPush({ separator: '"*"', member })).not.toThrow();
  });

  it('leaves "^" alone — that is the other guard\'s job', () => {
    expect(() => assertNotVoidPush({ separator: '"^"', member: 'SayThis' })).not.toThrow();
  });

  // The message has to carry the mechanism and the incident, because the next
  // person to hit this guard will be someone who wants a sweep and will
  // otherwise read the refusal as style.
  it('explains the mechanism and names the frame that proved it', () => {
    const call = () => assertNotVoidPush({ separator: '"*"', member: 'GetUserList' });
    expect(call).toThrow(/no hidden result pointer \(RDOObjectServer\.pas:281-283\)/);
    expect(call).toThrow(/arbitrary write inside the/);
    expect(call).toThrow(/call GetUserList "\*"/);
    expect(call).toThrow(/2026-08-18/);
  });

  // There WAS an opt-in, between the morning of 2026-08-18 and the incident:
  // `StepPacket.probe`, added so the certification sweep could emit wave 1. It
  // is what let the frame out. Neither guard takes an opt-in now, and this test
  // is here so that reintroducing one is a deliberate act with a failing test.
  it('takes no opt-in — an unknown field changes nothing', () => {
    const withProbe = { separator: '"*"', member: 'SetViewedArea', probe: true } as { separator: string; member: string };
    expect(() => assertNotVoidPush(withProbe)).toThrow(/not a proven Delphi procedure/);
  });
});

// =============================================================================
// The two guards are symmetric, and neither is a matter of style:
//
//   "^" on a procedure → a result pointer nobody pops        → freeze
//   "*" on a function  → a result written through an unset register → arbitrary write
//
// Both are live-proven on the shared production server, four days apart.
// =============================================================================
describe('the two separator guards are symmetric', () => {
  it.each([...VOID_MEMBERS.keys()])('refuses "^" on the procedure %s', member => {
    expect(() => assertNotVariantOnVoidMember({ separator: '"^"', member }))
      .toThrow(/freezes the shared Delphi Interface Server/);
  });

  it('refuses "*" on everything the other guard lets through', () => {
    for (const member of ['GetUserList', 'GetCompanyCount', 'RDOFavoritesGetSubItems']) {
      expect(() => assertNotVariantOnVoidMember({ separator: '"^"', member })).not.toThrow();
      expect(() => assertNotVoidPush({ separator: '"*"', member })).toThrow(/not a proven Delphi procedure/);
    }
  });
});

// =============================================================================
// VOID_MEMBERS — every entry must carry its evidence
// =============================================================================
describe('VOID_MEMBERS', () => {
  // Three came from the audit; RDOConnectInput/Output came from the exhaustive
  // sweep of every "^" call-site against the Delphi declarations — the audit had
  // missed them, and doc/spo-original-reference.md actively mislabelled them as
  // `function`. Growing this list is expected; shrinking it is a regression.
  it('covers every procedure known to be emitted with a separator', () => {
    expect([...VOID_MEMBERS.keys()].sort()).toEqual([
      'AddLine',
      'CloseMessage',
      'KeepAlive',
      'RDOConnectInput',
      'RDOConnectOutput',
      'RDODestroy',
      'Refresh',
      'SayThis',
    ]);
  });

  // The Cache Server wrapper publishes 18 functions and exactly 3 procedures in
  // one `published` block, so the separator flips mid-block. These three were
  // added for the live campaign (2026-08-17); each was read off the declaration.
  it.each([
    ['RDODestroy', /CachedObjectWrap\.pas:35/],
    ['KeepAlive', /CachedObjectWrap\.pas:36/],
    ['Refresh', /CachedObjectWrap\.pas:37/],
  ])('%s cites its CachedObjectWrap declaration', (member, citation) => {
    expect(VOID_MEMBERS.get(member)).toMatch(citation);
  });

  // An entry without a citation is an entry nobody can re-verify. This table
  // decides whether a frame is safe to put on a shared production server, so
  // "trust me" is not an acceptable justification for a row.
  it.each([...VOID_MEMBERS.entries()])('%s cites a Pascal declaration', (_member, declaration) => {
    expect(declaration).toMatch(/procedure/);
    expect(declaration).toMatch(/\.pas:\d+/);
  });
});

// =============================================================================
// CONNECTION_BOUND_MEMBERS — values that belong to the carrying TCP connection
//
// `get RDOCnntId` never reaches the object server: the query parser answers it
// with ConnId, the id of the connection the frame arrived on
// (Rdo/Server/RDOQueryServer.pas:269-274). That id is fed to RegisterEventsById,
// which binds the TClientView to that connection as push channel AND teardown
// trigger (Interface Server/InterfaceServer.pas:1919-1923) — so letting it
// travel a pool connection binds the session to a socket the pool may destroy.
// =============================================================================
describe('CONNECTION_BOUND_MEMBERS', () => {
  it('lists the members answered from the connection rather than the object', () => {
    expect([...CONNECTION_BOUND_MEMBERS.keys()].sort()).toEqual(['RDOCnntId']);
  });

  it.each([...CONNECTION_BOUND_MEMBERS.entries()])(
    '%s cites the server-side interception',
    (_member, citation) => {
      expect(citation).toMatch(/\.pas:\d+/);
    },
  );
});

describe('isConnectionBoundMember', () => {
  it('flags RDOCnntId so it bypasses the world pool', () => {
    expect(isConnectionBoundMember({ member: 'RDOCnntId' })).toBe(true);
  });

  it('leaves ordinary object reads poolable', () => {
    expect(isConnectionBoundMember({ member: 'TycoonId' })).toBe(false);
    expect(isConnectionBoundMember({ member: 'ObjectsInArea' })).toBe(false);
  });

  it('tolerates a packet with no member', () => {
    expect(isConnectionBoundMember({})).toBe(false);
  });
});

describe('canBufferRequest', () => {
  it('accepts below the cap and refuses at it', () => {
    expect(canBufferRequest(0, 20)).toBe(true);
    expect(canBufferRequest(19, 20)).toBe(true);
    expect(canBufferRequest(20, 20)).toBe(false);
  });
});

// =============================================================================
// FORBIDDEN_MEMBERS / assertMemberNotForbidden — lot S4, edition 1
//
// The developer's three exclusions of 2026-08-18, compiled. Their motive is
// operational, not prudential: they "would destroy all the content of the test
// account and prevent further tests". The certification sweep is blind by
// construction, so it cannot be the thing that decides not to go there.
// =============================================================================

describe('FORBIDDEN_MEMBERS', () => {
  it('holds exactly the seven members of the exclusion list', () => {
    expect([...FORBIDDEN_MEMBERS.keys()]).toEqual([
      'RDODelTycoon', 'RDOResetTycoon', 'RDOResetTycoonEx',
      'RDODelCompany', 'RDOGetRidOfCompany',
      'RDOAssignLevel', 'RDOResetTournament',
    ]);
  });

  it.each([...FORBIDDEN_MEMBERS.entries()])(
    '%s cites its exclusion and its Pascal declaration at File.pas:Line',
    (_member, why) => {
      expect(why).toMatch(/^exclusion [123]/);
      expect(why).toMatch(/(function|procedure) RDO\w+\(/);
      expect(why).toMatch(/Kernel\/World\.pas:\d+$/);
    },
  );

  it('covers the three exclusions the developer named', () => {
    const reasons = [...FORBIDDEN_MEMBERS.values()].join('\n');
    expect(reasons).toMatch(/exclusion 1 \(account deletion\)/);
    expect(reasons).toMatch(/exclusion 1 \(account reset\)/);
    expect(reasons).toMatch(/exclusion 2 \(company deletion\)/);
    expect(reasons).toMatch(/exclusion 3 \(level regression\)/);
  });

  // The mis-attribution the campaign pilot caught once and must not repeat:
  // RDODowngrade drops a BUILDING's technology level and RDOStartUpgrade puts
  // it back. It is not the level regression of exclusion 3.
  it('does not swallow the reversible building downgrades', () => {
    expect(FORBIDDEN_MEMBERS.has('RDODowngrade')).toBe(false);
    expect(FORBIDDEN_MEMBERS.has('RDODowngradeMany')).toBe(false);
    expect(FORBIDDEN_MEMBERS.has('RDODelFacility')).toBe(false);
  });
});

describe('assertMemberNotForbidden', () => {
  it.each([...FORBIDDEN_MEMBERS.keys()])('refuses %s', member => {
    expect(() => assertMemberNotForbidden({ member })).toThrow(/refused unconditionally/);
  });

  // The lot-A inventory carries `rdoResetTycoon` with a lower-case first
  // letter (row 59), and Pascal is case-insensitive. A guard a change of case
  // walks past is not a guard.
  it('matches whatever the case', () => {
    expect(() => assertMemberNotForbidden({ member: 'rdoResetTycoon' })).toThrow(/refused unconditionally/);
    expect(() => assertMemberNotForbidden({ member: 'RDODELCOMPANY' })).toThrow(/refused unconditionally/);
    expect(() => assertMemberNotForbidden({ member: 'rdoassignlevel' })).toThrow(/refused unconditionally/);
  });

  it('says that no flag lifts it, and why', () => {
    expect(() => assertMemberNotForbidden({ member: 'RDODelCompany' }))
      .toThrow(/No flag lifts this refusal .*--allow-mutations.*--target dedicated.*--allow-variant-on-procedure/s);
    expect(() => assertMemberNotForbidden({ member: 'RDODelCompany' }))
      .toThrow(/destroy the content of the test account/);
  });

  it('lets every other member through, and tolerates a packet with no member', () => {
    expect(() => assertMemberNotForbidden({ member: 'RDODelFacility' })).not.toThrow();
    expect(() => assertMemberNotForbidden({ member: 'NewFacility' })).not.toThrow();
    expect(() => assertMemberNotForbidden({ member: 'SayThis' })).not.toThrow();
    expect(() => assertMemberNotForbidden({})).not.toThrow();
  });
});

// =============================================================================
// SESSION_LIFECYCLE_MEMBERS / assertNotSessionLifecycleMember — R2 §3.5
//
// Nothing used to stop a suite from re-emitting the members that establish a
// session AFTER the session was established. The certification sweep of
// 2026-08-18 did exactly that: `call Logon "*"` at rid 1089, on a session whose
// legitimate Logon was rid 1019, seventy frames earlier.
//
// The guard is about the PHASE, not the member — every name here is something
// the client legitimately emits during login. The caller owns the phase; in the
// harness that caller is the runner, whose every frame is post-floor by
// construction.
// =============================================================================
describe('assertNotSessionLifecycleMember', () => {
  it.each([...SESSION_LIFECYCLE_MEMBERS.keys()])('refuses %s once the session is established', member => {
    expect(() => assertNotSessionLifecycleMember({ member }, 'suite/step'))
      .toThrow(/establishes, rebinds or ends an RDO session/);
  });

  it('carries the twelve members the plan names, and each one says what it does', () => {
    expect(SESSION_LIFECYCLE_MEMBERS.size).toBe(12);
    for (const [, why] of SESSION_LIFECYCLE_MEMBERS) expect(why.length).toBeGreaterThan(20);
    // The three whose re-emission is not merely untidy but destructive.
    expect(SESSION_LIFECYCLE_MEMBERS.get('Logon')).toMatch(/second session/);
    expect(SESSION_LIFECYCLE_MEMBERS.get('RegisterEventsById')).toMatch(/InterfaceServer\.pas:1919-1923/);
    expect(SESSION_LIFECYCLE_MEMBERS.get('Logoff')).toMatch(/ends the session/);
  });

  it('names the step, so the report says where the frame came from', () => {
    expect(() => assertNotSessionLifecycleMember({ member: 'Logon' }, 'sweep-variant/Logon'))
      .toThrow(/^sweep-variant\/Logon: "Logon"/);
  });

  it('cites the incident, so nobody removes it as tidy-up', () => {
    expect(() => assertNotSessionLifecycleMember({ member: 'Logon' }, 't'))
      .toThrow(/rid 1089.*rid 1019/);
  });

  it('matches whatever the case — the Pascal is case-insensitive', () => {
    expect(() => assertNotSessionLifecycleMember({ member: 'logon' }, 't')).toThrow(/establishes, rebinds or ends/);
    expect(() => assertNotSessionLifecycleMember({ member: 'CLIENTAWARE' }, 't')).toThrow(/establishes, rebinds or ends/);
  });

  it('lets every ordinary member through, and tolerates a packet with no member', () => {
    expect(() => assertNotSessionLifecycleMember({ member: 'GetTycoonCookie' }, 't')).not.toThrow();
    expect(() => assertNotSessionLifecycleMember({ member: 'SwitchFocusEx' }, 't')).not.toThrow();
    expect(() => assertNotSessionLifecycleMember({ member: 'SayThis' }, 't')).not.toThrow();
    expect(() => assertNotSessionLifecycleMember({}, 't')).not.toThrow();
  });

  // The reason it is not wired into `spo_session.ts`: the gateway is the code
  // that legitimately emits all of these, from the login handlers, in exactly
  // the phase this guard refuses.
  it('is not imported by the production session — the gateway is the legitimate emitter', () => {
    const session = readFileSync(join(__dirname, '..', 'spo_session.ts'), 'utf-8');
    expect(session).not.toMatch(/assertNotSessionLifecycleMember/);
    expect(session).toMatch(/assertMemberNotForbidden/);
  });
});
