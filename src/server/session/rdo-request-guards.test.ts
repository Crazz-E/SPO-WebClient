import {
  VOID_MEMBERS,
  CONNECTION_BOUND_MEMBERS,
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
// (live probe, 2026-08-15). See report/rdo-audit-2026-08-14.md §3.
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
  // `call GetTycoonCookie "^" "#22","%LastY.0";` -> `A36 res="%395";` [capture :982-983]
  it('allows "^" on a member that is not void', () => {
    expect(() => assertNotVariantOnVoidMember({ separator: '"^"', member: 'GetTycoonCookie' })).not.toThrow();
  });

  it('ignores packets with no separator or no member', () => {
    expect(() => assertNotVariantOnVoidMember({ member: 'SayThis' })).not.toThrow();
    expect(() => assertNotVariantOnVoidMember({ separator: '"^"' })).not.toThrow();
  });
});

// =============================================================================
// assertNotVoidPush — project convention, with the VOID_MEMBERS exemption
// =============================================================================
describe('assertNotVoidPush', () => {
  it('still rejects "*" for ordinary members (one form per intent)', () => {
    expect(() => assertNotVoidPush({ separator: '"*"', member: 'SetViewedArea' })).toThrow(
      /project convention/
    );
  });

  it.each([...VOID_MEMBERS.keys()])('exempts the void member %s', member => {
    expect(() => assertNotVoidPush({ separator: '"*"', member })).not.toThrow();
  });

  it('leaves "^" alone — that is the other guard\'s job', () => {
    expect(() => assertNotVoidPush({ separator: '"^"', member: 'SayThis' })).not.toThrow();
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
      'RDOConnectInput',
      'RDOConnectOutput',
      'SayThis',
    ]);
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
