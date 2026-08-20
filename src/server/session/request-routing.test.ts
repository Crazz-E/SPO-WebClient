import {
  CONNECTION_BOUND_MEMBERS,
  canBufferRequest,
  isConnectionBoundMember,
} from './request-routing';

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
