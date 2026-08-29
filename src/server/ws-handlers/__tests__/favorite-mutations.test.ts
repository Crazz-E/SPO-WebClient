/**
 * REQ_FAVORITE_ADD / _DELETE / _RENAME — the write half of the Favorites tree,
 * at the WebSocket frontier.
 *
 * The frontier's whole job here is to be a truthful conduit: forward the
 * arguments unchanged, and copy the session's verdict — `success`, the reason,
 * the assigned id — without improving on it. The one thing it must never do is
 * answer OK for a write the server refused (OB-1). A thrown transport failure
 * leaves as an error frame carrying the request id, not as a hung request.
 */

import { describe, it, expect, jest } from '@jest/globals';
import type { WebSocket } from 'ws';
import { WsMessageType, type WsMessage } from '../../../shared/types';
import { handleFavoriteAdd, handleFavoriteDelete, handleFavoriteRename, handleFavoriteFolderCreate, handleFavoriteMove, handleEmpireFacilities } from '../misc-handlers';
import type { WsHandlerContext } from '../types';

function createCtx(method: string, result: unknown) {
  const sent: Array<Record<string, unknown>> = [];
  const ws = {
    send(payload: string): void {
      sent.push(JSON.parse(payload) as Record<string, unknown>);
    },
  } as unknown as WebSocket;

  const fn = jest.fn(async (...args: unknown[]): Promise<unknown> => {
    void args;
    if (result instanceof Error) throw result;
    return result;
  });

  const ctx = { ws, session: { [method]: fn } } as unknown as WsHandlerContext;
  return { ctx, sent, fn };
}

const msg = (type: WsMessageType, over: Record<string, unknown>): WsMessage =>
  ({ type, wsRequestId: 'req-1', ...over }) as unknown as WsMessage;

describe('handleEmpireFacilities', () => {
  it('splits the session tree read into facilities and folders', async () => {
    const r = createCtx('fetchFavoritesTree', {
      links: [{ id: 1, name: 'Mill', x: 1, y: 2, path: '1' }],
      folders: [{ id: 9, name: 'Farms', path: '9' }],
    });

    await handleEmpireFacilities(r.ctx, msg(WsMessageType.REQ_EMPIRE_FACILITIES, {}));

    expect(r.sent).toEqual([{
      type: WsMessageType.RESP_EMPIRE_FACILITIES,
      wsRequestId: 'req-1',
      facilities: [{ id: 1, name: 'Mill', x: 1, y: 2, path: '1' }],
      folders: [{ id: 9, name: 'Farms', path: '9' }],
    }]);
  });
});

describe('handleFavoriteAdd', () => {
  it('forwards the name and coordinates and echoes the assigned id', async () => {
    const r = createCtx('addFavorite', { success: true, id: 4211 });

    await handleFavoriteAdd(r.ctx, msg(WsMessageType.REQ_FAVORITE_ADD, { name: 'Farm 1', x: 118, y: 226 }));

    expect(r.fn).toHaveBeenCalledWith('Farm 1', 118, 226);
    expect(r.sent).toEqual([{
      type: WsMessageType.RESP_FAVORITE_ADD, wsRequestId: 'req-1', success: true, id: 4211,
    }]);
  });

  it('copies a refusal through verbatim — it never becomes an OK', async () => {
    const r = createCtx('addFavorite', { success: false, message: 'The server refused to add this favourite.' });

    await handleFavoriteAdd(r.ctx, msg(WsMessageType.REQ_FAVORITE_ADD, { name: 'Farm 1', x: 1, y: 2 }));

    expect(r.sent[0].success).toBe(false);
    expect(r.sent[0].message).toBe('The server refused to add this favourite.');
    expect(r.sent[0].id).toBeUndefined();
  });

  it('turns a thrown failure into an error frame carrying the request id', async () => {
    const r = createCtx('addFavorite', new Error('Request timeout: RDOFavoritesNewItem'));

    await handleFavoriteAdd(r.ctx, msg(WsMessageType.REQ_FAVORITE_ADD, { name: 'Farm 1', x: 1, y: 2 }));

    expect(r.sent[0].type).toBe(WsMessageType.RESP_ERROR);
    expect(r.sent[0].wsRequestId).toBe('req-1');
    expect(r.sent[0].errorMessage).toBe('Request timeout: RDOFavoritesNewItem');
  });
});

describe('handleFavoriteDelete', () => {
  it('forwards the Location unchanged', async () => {
    const r = createCtx('deleteFavorite', { success: true });

    await handleFavoriteDelete(r.ctx, msg(WsMessageType.REQ_FAVORITE_DELETE, { path: '4210' }));

    expect(r.fn).toHaveBeenCalledWith('4210');
    expect(r.sent).toEqual([{
      type: WsMessageType.RESP_FAVORITE_DELETE, wsRequestId: 'req-1', success: true,
    }]);
  });

  it('copies a refusal through verbatim', async () => {
    const r = createCtx('deleteFavorite', { success: false, message: 'Nope.' });

    await handleFavoriteDelete(r.ctx, msg(WsMessageType.REQ_FAVORITE_DELETE, { path: '' }));

    expect(r.sent[0].success).toBe(false);
    expect(r.sent[0].message).toBe('Nope.');
  });

  it('turns a thrown failure into an error frame', async () => {
    const r = createCtx('deleteFavorite', new Error('socket closed'));

    await handleFavoriteDelete(r.ctx, msg(WsMessageType.REQ_FAVORITE_DELETE, { path: '4210' }));

    expect(r.sent[0].type).toBe(WsMessageType.RESP_ERROR);
  });
});

describe('handleFavoriteRename', () => {
  it('forwards the Location and the new name, in that order', async () => {
    const r = createCtx('renameFavorite', { success: true });

    await handleFavoriteRename(r.ctx, msg(WsMessageType.REQ_FAVORITE_RENAME, { path: '4210', name: 'Moulin' }));

    expect(r.fn).toHaveBeenCalledWith('4210', 'Moulin');
    expect(r.sent).toEqual([{
      type: WsMessageType.RESP_FAVORITE_RENAME, wsRequestId: 'req-1', success: true,
    }]);
  });

  it('copies a refusal through verbatim', async () => {
    const r = createCtx('renameFavorite', { success: false, message: 'Nope.' });

    await handleFavoriteRename(r.ctx, msg(WsMessageType.REQ_FAVORITE_RENAME, { path: '999', name: 'Moulin' }));

    expect(r.sent[0].success).toBe(false);
    expect(r.sent[0].message).toBe('Nope.');
  });

  it('turns a thrown failure into an error frame', async () => {
    const r = createCtx('renameFavorite', new Error('socket closed'));

    await handleFavoriteRename(r.ctx, msg(WsMessageType.REQ_FAVORITE_RENAME, { path: '4210', name: 'Moulin' }));

    expect(r.sent[0].type).toBe(WsMessageType.RESP_ERROR);
  });
});

describe('handleFavoriteFolderCreate', () => {
  it('forwards the name and echoes the assigned id', async () => {
    const r = createCtx('createFavoriteFolder', { success: true, id: 12 });

    await handleFavoriteFolderCreate(r.ctx, msg(WsMessageType.REQ_FAVORITE_FOLDER_CREATE, { name: 'Farms' }));

    expect(r.fn).toHaveBeenCalledWith('Farms');
    expect(r.sent).toEqual([{
      type: WsMessageType.RESP_FAVORITE_FOLDER_CREATE, wsRequestId: 'req-1', success: true, id: 12,
    }]);
  });

  it('copies a refusal through verbatim — it never becomes an OK', async () => {
    const r = createCtx('createFavoriteFolder', { success: false, message: 'The server refused to create this folder.' });

    await handleFavoriteFolderCreate(r.ctx, msg(WsMessageType.REQ_FAVORITE_FOLDER_CREATE, { name: 'Farms' }));

    expect(r.sent[0].success).toBe(false);
    expect(r.sent[0].id).toBeUndefined();
  });

  it('turns a thrown failure into an error frame', async () => {
    const r = createCtx('createFavoriteFolder', new Error('socket closed'));

    await handleFavoriteFolderCreate(r.ctx, msg(WsMessageType.REQ_FAVORITE_FOLDER_CREATE, { name: 'Farms' }));

    expect(r.sent[0].type).toBe(WsMessageType.RESP_ERROR);
  });
});

describe('handleFavoriteMove', () => {
  it('forwards the item path and the destination path, in that order', async () => {
    const r = createCtx('moveFavorite', { success: true });

    await handleFavoriteMove(r.ctx, msg(WsMessageType.REQ_FAVORITE_MOVE, { path: '4210', destPath: '9' }));

    expect(r.fn).toHaveBeenCalledWith('4210', '9');
    expect(r.sent).toEqual([{
      type: WsMessageType.RESP_FAVORITE_MOVE, wsRequestId: 'req-1', success: true,
    }]);
  });

  it('copies a refusal through verbatim', async () => {
    const r = createCtx('moveFavorite', { success: false, message: 'Nope.' });

    await handleFavoriteMove(r.ctx, msg(WsMessageType.REQ_FAVORITE_MOVE, { path: '9', destPath: '9/1' }));

    expect(r.sent[0].success).toBe(false);
    expect(r.sent[0].message).toBe('Nope.');
  });

  it('turns a thrown failure into an error frame', async () => {
    const r = createCtx('moveFavorite', new Error('socket closed'));

    await handleFavoriteMove(r.ctx, msg(WsMessageType.REQ_FAVORITE_MOVE, { path: '4210', destPath: '9' }));

    expect(r.sent[0].type).toBe(WsMessageType.RESP_ERROR);
  });
});
