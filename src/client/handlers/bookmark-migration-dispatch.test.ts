/**
 * The places kept in this browser move to the account by themselves.
 *
 * The migration has no button: it rides on the facilities response, because that
 * is the first moment the client knows what the server's Favorites tree already
 * holds — and merging without knowing that would duplicate every place.
 */

jest.mock('../bridge/client-bridge', () => ({
  ClientBridge: {
    log: jest.fn(),
    handleEmpireResponse: jest.fn(),
    setEmpireLoading: jest.fn(),
  },
}));

import { WsMessageType, type WsMessage } from '@/shared/types';
import { dispatchEvent } from './event-handler';
import { useGameStore } from '../store/game-store';
import { useEmpireStore } from '../store/empire-store';
import { BOOKMARKS_KEY_PREFIX } from '../store/legacy-bookmarks';
import type { ClientHandlerContext } from './client-context';

const store = new Map<string, string>();

function makeCtx() {
  const sendRequest = jest.fn(() => Promise.resolve({ success: true, id: 4211 }));
  const sendMessage = jest.fn();
  const showNotification = jest.fn();
  const ctx = {
    sendRequest, sendMessage, showNotification,
    soundManager: { play: jest.fn() },
  } as unknown as ClientHandlerContext;
  return { ctx, sendRequest, showNotification };
}

/** Let the `void`-ed migration run to the end. */
const flush = () => new Promise((r) => setImmediate(r));

beforeEach(() => {
  jest.clearAllMocks();
  store.clear();
  (globalThis as unknown as { localStorage: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
  };
  useEmpireStore.getState().reset();
});
afterEach(() => { delete (globalThis as unknown as { localStorage?: unknown }).localStorage; });

it('the facilities response carries the old browser list into the server tree', async () => {
  useGameStore.setState({ worldName: 'dispatch-world', username: 'SPO_test3' });
  const key = `${BOOKMARKS_KEY_PREFIX}dispatch-world.SPO_test3`;
  store.set(key, JSON.stringify([{ id: 'bm-1', name: 'Cotton farms', x: 120, y: 340 }]));
  const { ctx, sendRequest } = makeCtx();

  dispatchEvent(ctx, { type: WsMessageType.RESP_EMPIRE_FACILITIES, facilities: [] } as unknown as WsMessage);
  await flush();

  expect(sendRequest).toHaveBeenCalledWith({
    type: WsMessageType.REQ_FAVORITE_ADD, name: 'Cotton farms', x: 120, y: 340,
  });
  expect(store.has(key)).toBe(false);
});
