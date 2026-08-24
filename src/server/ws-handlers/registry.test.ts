/**
 * The handler registry, imported rather than read as text.
 *
 * `capability-inventory.test.ts` audits this table by parsing the file, which
 * proves what is written but never runs it. This one loads the module, so a
 * broken import or a name that no longer exists fails here instead of at the
 * first client message in production.
 */

import { WsMessageType } from '../../shared/types';
import { wsHandlerRegistry } from './index';

describe('wsHandlerRegistry', () => {
  it('resolves every entry to a callable handler', () => {
    const entries = Object.entries(wsHandlerRegistry);
    expect(entries.length).toBeGreaterThan(50);
    for (const [type, handler] of entries) {
      expect(typeof handler).toBe('function');
      // Every key is a declared request type, not a stray string.
      expect(Object.values(WsMessageType)).toContain(type);
    }
  });

  it('routes the building lifecycle to the upgrade handler alone', () => {
    // REQ_MANAGE_CONSTRUCTION was a second door onto session.manageConstruction
    // that nothing knocked on; REQ_BUILDING_UPGRADE is the one the client uses.
    expect(wsHandlerRegistry[WsMessageType.REQ_BUILDING_UPGRADE]).toBeDefined();
    expect(Object.keys(wsHandlerRegistry)).not.toContain('REQ_MANAGE_CONSTRUCTION');
  });

  it('still answers the chat composition notice the client now sends', () => {
    expect(wsHandlerRegistry[WsMessageType.REQ_CHAT_TYPING_STATUS]).toBeDefined();
    expect(wsHandlerRegistry[WsMessageType.REQ_MAIL_GET_UNREAD_COUNT]).toBeDefined();
  });
});
