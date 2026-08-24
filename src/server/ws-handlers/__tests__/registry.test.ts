/**
 * The registry itself — the last link between a message type and the code that
 * serves it.
 *
 * A handler that exists, compiles and is tested is still dead if nothing routes
 * to it: the browser's message would fall through as unknown. Nothing checked
 * that until the Favorites mutations were added, which is exactly the kind of
 * gap OB-8 catalogued elsewhere in this wiring.
 */

import { describe, it, expect } from '@jest/globals';
import { WsMessageType } from '../../../shared/types';
import { wsHandlerRegistry } from '../index';
import { handleFavoriteAdd, handleFavoriteDelete, handleFavoriteRename, handleEmpireFacilities } from '../misc-handlers';

describe('wsHandlerRegistry', () => {
  it('routes the Favorites tree — its read and its three mutations', () => {
    expect(wsHandlerRegistry[WsMessageType.REQ_EMPIRE_FACILITIES]).toBe(handleEmpireFacilities);
    expect(wsHandlerRegistry[WsMessageType.REQ_FAVORITE_ADD]).toBe(handleFavoriteAdd);
    expect(wsHandlerRegistry[WsMessageType.REQ_FAVORITE_DELETE]).toBe(handleFavoriteDelete);
    expect(wsHandlerRegistry[WsMessageType.REQ_FAVORITE_RENAME]).toBe(handleFavoriteRename);
  });

  it('registers a function under every key it declares, and only REQ_ keys', () => {
    for (const [type, handler] of Object.entries(wsHandlerRegistry)) {
      expect(typeof handler).toBe('function');
      expect(type.startsWith('REQ_')).toBe(true);
    }
  });
});
