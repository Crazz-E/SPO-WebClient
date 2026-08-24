/**
 * Tests for the client-side favorites-handler — the three mutations of the
 * Favorites tree.
 *
 * What matters here is not the request shape (the gateway handler pins that)
 * but the reaction to the answer: a refused write must reach the player as a
 * refusal, and must NOT trigger the refetch that would make the panel look as
 * if something had changed. That is the OB-1 defect, in the client half.
 */

import { addFavorite, removeFavorite, renameFavorite } from './favorites-handler';
import { ClientBridge } from '../bridge/client-bridge';
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
