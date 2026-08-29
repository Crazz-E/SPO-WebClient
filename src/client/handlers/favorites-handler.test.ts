/**
 * Tests for the client-side favorites-handler — the three mutations of the
 * Favorites tree.
 *
 * What matters here is not the request shape (the gateway handler pins that)
 * but the reaction to the answer: a refused write must reach the player as a
 * refusal, and must NOT trigger the refetch that would make the panel look as
 * if something had changed. That is the OB-1 defect, in the client half.
 */

import { addFavorite, removeFavorite, renameFavorite, createFolder, moveFavorite, migrateLocalBookmarks } from './favorites-handler';
import { ClientBridge } from '../bridge/client-bridge';
import { useGameStore } from '../store/game-store';
import { useEmpireStore } from '../store/empire-store';
import { BOOKMARKS_KEY_PREFIX } from '../store/legacy-bookmarks';
import { WsMessageType } from '../../shared/types';
import type { ClientHandlerContext } from './client-context';

jest.mock('../bridge/client-bridge', () => ({
  ClientBridge: {
    log: jest.fn(),
    setEmpireLoading: jest.fn(),
  },
}));

type Answer = object | Error;

function makeCtx(answer: Answer) {
  const sendRequest = jest.fn(() =>
    answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer),
  );
  const sendMessage = jest.fn();
  const showNotification = jest.fn();
  const ctx = { sendRequest, sendMessage, showNotification } as unknown as ClientHandlerContext;
  return { ctx, sendRequest, sendMessage, showNotification };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('addFavorite', () => {
  it('sends the name and coordinates, then re-reads the list the server now holds', async () => {
    const { ctx, sendRequest, sendMessage, showNotification } = makeCtx({ success: true, id: 4211 });

    await addFavorite(ctx, 'Farm 1', 118, 226);

    expect(sendRequest).toHaveBeenCalledWith({
      type: WsMessageType.REQ_FAVORITE_ADD, name: 'Farm 1', x: 118, y: 226,
    });
    expect(showNotification).toHaveBeenCalledWith('"Farm 1" added to your list', 'success');
    expect(ClientBridge.setEmpireLoading).toHaveBeenCalledWith(true);
    expect(sendMessage).toHaveBeenCalledWith({ type: WsMessageType.REQ_EMPIRE_FACILITIES });
  });

  it('a refusal is told to the player, in the server\'s own words, and refetches nothing', async () => {
    const { ctx, sendMessage, showNotification } = makeCtx({ success: false, message: 'Nope.' });

    await addFavorite(ctx, 'Farm 1', 118, 226);

    expect(showNotification).toHaveBeenCalledWith('Nope.', 'error');
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('falls back to its own wording when the gateway sent no reason', async () => {
    const { ctx, showNotification } = makeCtx({ success: false });
    await addFavorite(ctx, 'Farm 1', 1, 2);
    expect(showNotification).toHaveBeenCalledWith('Could not add this favourite.', 'error');
  });

  it('a transport failure is an error, never a silent success', async () => {
    const { ctx, sendMessage, showNotification } = makeCtx(new Error('socket closed'));

    await addFavorite(ctx, 'Farm 1', 1, 2);

    expect(showNotification).toHaveBeenCalledWith('Failed to add favourite: socket closed', 'error');
    expect(sendMessage).not.toHaveBeenCalled();
  });
});

describe('removeFavorite', () => {
  it('addresses the item by its Location and refetches on success', async () => {
    const { ctx, sendRequest, sendMessage, showNotification } = makeCtx({ success: true });

    await removeFavorite(ctx, '4210', 'Farm 1');

    expect(sendRequest).toHaveBeenCalledWith({ type: WsMessageType.REQ_FAVORITE_DELETE, path: '4210' });
    expect(showNotification).toHaveBeenCalledWith('"Farm 1" removed from your list', 'success');
    expect(sendMessage).toHaveBeenCalledWith({ type: WsMessageType.REQ_EMPIRE_FACILITIES });
  });

  it('leaves the row on screen when the server refused to remove it', async () => {
    const { ctx, sendMessage, showNotification } = makeCtx({ success: false, message: 'Nope.' });

    await removeFavorite(ctx, '4210', 'Farm 1');

    expect(showNotification).toHaveBeenCalledWith('Nope.', 'error');
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('falls back to its own wording when the gateway sent no reason', async () => {
    const { ctx, showNotification } = makeCtx({ success: false });
    await removeFavorite(ctx, '4210', 'Farm 1');
    expect(showNotification).toHaveBeenCalledWith('Could not remove this favourite.', 'error');
  });

  it('a transport failure is an error, never a silent success', async () => {
    const { ctx, sendMessage, showNotification } = makeCtx(new Error('socket closed'));

    await removeFavorite(ctx, '4210', 'Farm 1');

    expect(showNotification).toHaveBeenCalledWith('Failed to remove favourite: socket closed', 'error');
    expect(sendMessage).not.toHaveBeenCalled();
  });
});

describe('renameFavorite', () => {
  it('sends the Location and the new name, then refetches', async () => {
    const { ctx, sendRequest, sendMessage } = makeCtx({ success: true });

    await renameFavorite(ctx, '4210', 'Moulin');

    expect(sendRequest).toHaveBeenCalledWith({
      type: WsMessageType.REQ_FAVORITE_RENAME, path: '4210', name: 'Moulin',
    });
    expect(sendMessage).toHaveBeenCalledWith({ type: WsMessageType.REQ_EMPIRE_FACILITIES });
  });

  it('keeps the old name on screen when the server refused', async () => {
    const { ctx, sendMessage, showNotification } = makeCtx({ success: false, message: 'Nope.' });

    await renameFavorite(ctx, '4210', 'Moulin');

    expect(showNotification).toHaveBeenCalledWith('Nope.', 'error');
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('falls back to its own wording when the gateway sent no reason', async () => {
    const { ctx, showNotification } = makeCtx({ success: false });
    await renameFavorite(ctx, '4210', 'Moulin');
    expect(showNotification).toHaveBeenCalledWith('Could not rename this favourite.', 'error');
  });

  it('a transport failure is an error, never a silent success', async () => {
    const { ctx, sendMessage, showNotification } = makeCtx(new Error('socket closed'));

    await renameFavorite(ctx, '4210', 'Moulin');

    expect(showNotification).toHaveBeenCalledWith('Failed to rename favourite: socket closed', 'error');
    expect(sendMessage).not.toHaveBeenCalled();
  });
});

describe('createFolder', () => {
  it('sends the name, then re-reads the list the server now holds', async () => {
    const { ctx, sendRequest, sendMessage, showNotification } = makeCtx({ success: true, id: 12 });

    await createFolder(ctx, 'Farms');

    expect(sendRequest).toHaveBeenCalledWith({ type: WsMessageType.REQ_FAVORITE_FOLDER_CREATE, name: 'Farms' });
    expect(showNotification).toHaveBeenCalledWith('"Farms" folder created', 'success');
    expect(sendMessage).toHaveBeenCalledWith({ type: WsMessageType.REQ_EMPIRE_FACILITIES });
  });

  it('a refusal is told to the player and refetches nothing', async () => {
    const { ctx, sendMessage, showNotification } = makeCtx({ success: false, message: 'Nope.' });

    await createFolder(ctx, 'Farms');

    expect(showNotification).toHaveBeenCalledWith('Nope.', 'error');
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('falls back to its own wording when the gateway sent no reason', async () => {
    const { ctx, showNotification } = makeCtx({ success: false });
    await createFolder(ctx, 'Farms');
    expect(showNotification).toHaveBeenCalledWith('Could not create this folder.', 'error');
  });

  it('a transport failure is an error, never a silent success', async () => {
    const { ctx, sendMessage, showNotification } = makeCtx(new Error('socket closed'));

    await createFolder(ctx, 'Farms');

    expect(showNotification).toHaveBeenCalledWith('Failed to create folder: socket closed', 'error');
    expect(sendMessage).not.toHaveBeenCalled();
  });
});

describe('moveFavorite', () => {
  it('sends the item path and destination, then refetches', async () => {
    const { ctx, sendRequest, sendMessage, showNotification } = makeCtx({ success: true });

    await moveFavorite(ctx, '4210', '9', 'Farm 1');

    expect(sendRequest).toHaveBeenCalledWith({ type: WsMessageType.REQ_FAVORITE_MOVE, path: '4210', destPath: '9' });
    expect(showNotification).toHaveBeenCalledWith('"Farm 1" moved', 'success');
    expect(sendMessage).toHaveBeenCalledWith({ type: WsMessageType.REQ_EMPIRE_FACILITIES });
  });

  it('a refusal is told to the player and refetches nothing', async () => {
    const { ctx, sendMessage, showNotification } = makeCtx({ success: false, message: 'Nope.' });

    await moveFavorite(ctx, '9', '9/1', 'Farms');

    expect(showNotification).toHaveBeenCalledWith('Nope.', 'error');
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('falls back to its own wording when the gateway sent no reason', async () => {
    const { ctx, showNotification } = makeCtx({ success: false });
    await moveFavorite(ctx, '4210', '9', 'Farm 1');
    expect(showNotification).toHaveBeenCalledWith('Could not move this favourite.', 'error');
  });

  it('a transport failure is an error, never a silent success', async () => {
    const { ctx, sendMessage, showNotification } = makeCtx(new Error('socket closed'));

    await moveFavorite(ctx, '4210', '9', 'Farm 1');

    expect(showNotification).toHaveBeenCalledWith('Failed to move favourite: socket closed', 'error');
    expect(sendMessage).not.toHaveBeenCalled();
  });
});

describe('migrateLocalBookmarks', () => {
  const store = new Map<string, string>();
  let world = 0;

  /** A fresh world per test: the "once per session" guard is keyed on world/player. */
  function freshWorld(): string {
    const name = `w${++world}`;
    useGameStore.setState({ worldName: name, username: 'SPO_test3' });
    return name;
  }

  function seedLocal(world: string, list: object[]): string {
    const key = `${BOOKMARKS_KEY_PREFIX}${world}.SPO_test3`;
    store.set(key, JSON.stringify(list));
    return key;
  }

  beforeEach(() => {
    store.clear();
    (globalThis as unknown as { localStorage: unknown }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); },
    };
    useEmpireStore.getState().reset();
  });
  afterEach(() => { delete (globalThis as unknown as { localStorage?: unknown }).localStorage; });

  it('pushes only the places the tree does not already hold, then drops the local key', async () => {
    const w = freshWorld();
    const key = seedLocal(w, [
      { id: 'bm-1', name: 'Cotton farms', x: 120, y: 340 },
      { id: 'bm-2', name: 'Mill', x: 10, y: 20 },
    ]);
    useEmpireStore.getState().setFacilities([{ id: 4210, name: 'Mill', x: 10, y: 20, path: '4210' }]);
    const { ctx, sendRequest, sendMessage, showNotification } = makeCtx({ success: true, id: 4211 });

    await migrateLocalBookmarks(ctx);

    expect(sendRequest).toHaveBeenCalledTimes(1);
    expect(sendRequest).toHaveBeenCalledWith({
      type: WsMessageType.REQ_FAVORITE_ADD, name: 'Cotton farms', x: 120, y: 340,
    });
    expect(store.has(key)).toBe(false);
    expect(showNotification).toHaveBeenCalledWith('1 saved place moved to your account', 'success');
    expect(sendMessage).toHaveBeenCalledWith({ type: WsMessageType.REQ_EMPIRE_FACILITIES });
  });

  it('says how many when there are several, and asks nothing twice for the same player', async () => {
    const w = freshWorld();
    seedLocal(w, [{ name: 'a', x: 1, y: 1 }, { name: 'b', x: 2, y: 2 }]);
    const { ctx, sendRequest, showNotification } = makeCtx({ success: true, id: 1 });

    await migrateLocalBookmarks(ctx);
    expect(sendRequest).toHaveBeenCalledTimes(2);
    expect(showNotification).toHaveBeenCalledWith('2 saved places moved to your account', 'success');

    // A second facilities response must not replay the migration.
    seedLocal(w, [{ name: 'a', x: 1, y: 1 }]);
    await migrateLocalBookmarks(ctx);
    expect(sendRequest).toHaveBeenCalledTimes(2);
  });

  it('does nothing at all when this browser kept no places', async () => {
    freshWorld();
    const { ctx, sendRequest, showNotification } = makeCtx({ success: true });
    await migrateLocalBookmarks(ctx);
    expect(sendRequest).not.toHaveBeenCalled();
    expect(showNotification).not.toHaveBeenCalled();
  });

  it('drops the local key without a single write when the tree already holds every place', async () => {
    const w = freshWorld();
    const key = seedLocal(w, [{ name: 'Mill', x: 10, y: 20 }]);
    useEmpireStore.getState().setFacilities([{ id: 4210, name: 'Mill', x: 10, y: 20, path: '4210' }]);
    const { ctx, sendRequest, showNotification } = makeCtx({ success: true });

    await migrateLocalBookmarks(ctx);

    expect(sendRequest).not.toHaveBeenCalled();
    expect(showNotification).not.toHaveBeenCalled();
    expect(store.has(key)).toBe(false);
  });

  it('a refusal keeps the local list, tells the player, and lets a later read try again', async () => {
    const w = freshWorld();
    const key = seedLocal(w, [{ name: 'a', x: 1, y: 1 }]);
    const refused = makeCtx({ success: false, message: 'Nope.' });

    await migrateLocalBookmarks(refused.ctx);

    expect(store.has(key)).toBe(true);
    expect(refused.showNotification).toHaveBeenCalledWith(
      'Could not move your saved places to your account: Nope.', 'error',
    );
    expect(refused.sendMessage).not.toHaveBeenCalled();

    const retried = makeCtx({ success: true, id: 9 });
    await migrateLocalBookmarks(retried.ctx);
    expect(retried.sendRequest).toHaveBeenCalledTimes(1);
    expect(store.has(key)).toBe(false);
  });

  it('a refusal with no reason, and a transport failure, both keep the list', async () => {
    const w1 = freshWorld();
    const k1 = seedLocal(w1, [{ name: 'a', x: 1, y: 1 }]);
    const silent = makeCtx({ success: false });
    await migrateLocalBookmarks(silent.ctx);
    expect(silent.showNotification).toHaveBeenCalledWith(
      'Could not move your saved places to your account: the server refused one of them', 'error',
    );
    expect(store.has(k1)).toBe(true);

    const w2 = freshWorld();
    const k2 = seedLocal(w2, [{ name: 'a', x: 1, y: 1 }]);
    const dead = makeCtx(new Error('socket closed'));
    await migrateLocalBookmarks(dead.ctx);
    expect(dead.showNotification).toHaveBeenCalledWith(
      'Could not move your saved places to your account: socket closed', 'error',
    );
    expect(store.has(k2)).toBe(true);
  });
});
