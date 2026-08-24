/**
 * Favorites Handler — the three mutations of the player's bookmark tree.
 *
 * Each one waits for the gateway's answer and acts on what the server actually
 * said. On success the list is re-read from the server rather than patched
 * locally, so the panel can only ever show what the server confirmed; on a
 * refusal nothing is re-read and the player is told (OB-1: a detected failure
 * reported as an OK is the defect this avoids).
 */

import {
  WsMessageType,
  type WsReqFavoriteAdd,
  type WsRespFavoriteAdd,
  type WsReqFavoriteDelete,
  type WsRespFavoriteDelete,
  type WsReqFavoriteRename,
  type WsRespFavoriteRename,
} from '../../shared/types';
import { toErrorMessage } from '../../shared/error-utils';
import { ClientBridge } from '../bridge/client-bridge';
import type { ClientHandlerContext } from './client-context';

/** Re-read the root of the tree. Shared by the three mutations. */
function refreshFacilities(ctx: ClientHandlerContext): void {
  ClientBridge.setEmpireLoading(true);
  ctx.sendMessage({ type: WsMessageType.REQ_EMPIRE_FACILITIES });
}

export async function addFavorite(
  ctx: ClientHandlerContext, name: string, x: number, y: number,
): Promise<void> {
  const req: WsReqFavoriteAdd = { type: WsMessageType.REQ_FAVORITE_ADD, name, x, y };
  try {
    const response = await ctx.sendRequest(req) as WsRespFavoriteAdd;
    if (!response.success) {
      ctx.showNotification(response.message || 'Could not add this favourite.', 'error');
      return;
    }
    ctx.showNotification(`"${name}" added to your list`, 'success');
    refreshFacilities(ctx);
  } catch (err: unknown) {
    ctx.showNotification(`Failed to add favourite: ${toErrorMessage(err)}`, 'error');
  }
}

export async function removeFavorite(
  ctx: ClientHandlerContext, path: string, name: string,
): Promise<void> {
  const req: WsReqFavoriteDelete = { type: WsMessageType.REQ_FAVORITE_DELETE, path };
  try {
    const response = await ctx.sendRequest(req) as WsRespFavoriteDelete;
    if (!response.success) {
      ctx.showNotification(response.message || 'Could not remove this favourite.', 'error');
      return;
    }
    ctx.showNotification(`"${name}" removed from your list`, 'success');
    refreshFacilities(ctx);
  } catch (err: unknown) {
    ctx.showNotification(`Failed to remove favourite: ${toErrorMessage(err)}`, 'error');
  }
}

export async function renameFavorite(
  ctx: ClientHandlerContext, path: string, name: string,
): Promise<void> {
  const req: WsReqFavoriteRename = { type: WsMessageType.REQ_FAVORITE_RENAME, path, name };
  try {
    const response = await ctx.sendRequest(req) as WsRespFavoriteRename;
    if (!response.success) {
      ctx.showNotification(response.message || 'Could not rename this favourite.', 'error');
      return;
    }
    refreshFacilities(ctx);
  } catch (err: unknown) {
    ctx.showNotification(`Failed to rename favourite: ${toErrorMessage(err)}`, 'error');
  }
}
