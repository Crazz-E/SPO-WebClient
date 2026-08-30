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
import {
  handleFavoriteAdd, handleFavoriteDelete, handleFavoriteRename,
  handleFavoritesFolder, handleFavoriteAddFolder,
} from '../misc-handlers';
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

describe('handleFavoriteAdd', () => {
  it('forwards the name and coordinates and echoes the assigned id', async () => {
    const r = createCtx('addFavorite', { success: true, id: 4211 });

    await handleFavoriteAdd(r.ctx, msg(WsMessageType.REQ_FAVORITE_ADD, { name: 'Farm 1', x: 118, y: 226 }));

    expect(r.fn).toHaveBeenCalledWith('Farm 1', 118, 226, '');
    expect(r.sent).toEqual([{
      type: WsMessageType.RESP_FAVORITE_ADD, wsRequestId: 'req-1', success: true, id: 4211,
    }]);
  });

  it('forwards a given parent path, for a link added inside a folder', async () => {
    const r = createCtx('addFavorite', { success: true, id: 10 });

    await handleFavoriteAdd(r.ctx, msg(WsMessageType.REQ_FAVORITE_ADD, { name: 'Farm 1', x: 118, y: 226, parentPath: '9' }));

    expect(r.fn).toHaveBeenCalledWith('Farm 1', 118, 226, '9');
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

describe('handleFavoritesFolder', () => {
  it('forwards the path and echoes it back with the items', async () => {
    const items = [
      { id: 9, name: 'Folder', path: '9', kind: 0 },
      { id: 10, name: 'Farm 1', path: '9/10', kind: 1, x: 118, y: 226 },
    ];
    const r = createCtx('fetchFolderContents', items);

    await handleFavoritesFolder(r.ctx, msg(WsMessageType.REQ_FAVORITES_FOLDER, { path: '9' }));

    expect(r.fn).toHaveBeenCalledWith('9');
    expect(r.sent).toEqual([{
      type: WsMessageType.RESP_FAVORITES_FOLDER, wsRequestId: 'req-1', path: '9', items,
    }]);
  });

  it('reads the root when the path is empty', async () => {
    const r = createCtx('fetchFolderContents', []);

    await handleFavoritesFolder(r.ctx, msg(WsMessageType.REQ_FAVORITES_FOLDER, { path: '' }));

    expect(r.fn).toHaveBeenCalledWith('');
    expect(r.sent[0].items).toEqual([]);
  });

  it('turns a thrown failure into an error frame', async () => {
    const r = createCtx('fetchFolderContents', new Error('Request timeout: RDOFavoritesGetSubItems'));

    await handleFavoritesFolder(r.ctx, msg(WsMessageType.REQ_FAVORITES_FOLDER, { path: '9' }));

    expect(r.sent[0].type).toBe(WsMessageType.RESP_ERROR);
    expect(r.sent[0].wsRequestId).toBe('req-1');
  });
});

describe('handleFavoriteAddFolder', () => {
  it('forwards the parent path and name, and echoes the assigned id', async () => {
    const r = createCtx('addFavoriteFolder', { success: true, id: 12 });

    await handleFavoriteAddFolder(r.ctx, msg(WsMessageType.REQ_FAVORITE_ADD_FOLDER, { parentPath: '', name: 'New Folder' }));

    expect(r.fn).toHaveBeenCalledWith('', 'New Folder');
    expect(r.sent).toEqual([{
      type: WsMessageType.RESP_FAVORITE_ADD_FOLDER, wsRequestId: 'req-1', success: true, id: 12,
    }]);
  });

  it('copies a refusal through verbatim — it never becomes an OK', async () => {
    const r = createCtx('addFavoriteFolder', { success: false, message: 'The server refused to add this folder.' });

    await handleFavoriteAddFolder(r.ctx, msg(WsMessageType.REQ_FAVORITE_ADD_FOLDER, { parentPath: '9', name: 'Nested' }));

    expect(r.sent[0].success).toBe(false);
    expect(r.sent[0].message).toBe('The server refused to add this folder.');
    expect(r.sent[0].id).toBeUndefined();
  });

  it('turns a thrown failure into an error frame carrying the request id', async () => {
    const r = createCtx('addFavoriteFolder', new Error('Request timeout: RDOFavoritesNewItem'));

    await handleFavoriteAddFolder(r.ctx, msg(WsMessageType.REQ_FAVORITE_ADD_FOLDER, { parentPath: '', name: 'New Folder' }));

    expect(r.sent[0].type).toBe(WsMessageType.RESP_ERROR);
    expect(r.sent[0].wsRequestId).toBe('req-1');
  });
});
