/**
 * Favorites Handler — the mutations of the player's bookmark tree, and the
 * one-off migration of the places that used to live in this browser.
 *
 * Each mutation waits for the gateway's answer and acts on what the server
 * actually said. On success the list is re-read from the server rather than
 * patched locally, so the panel can only ever show what the server confirmed;
 * on a refusal nothing is re-read and the player is told (OB-1: a detected
 * failure reported as an OK is the defect this avoids).
 */

import {
  WsMessageType,
  type WsReqFavoriteAdd,
  type WsRespFavoriteAdd,
  type WsReqFavoriteDelete,
  type WsRespFavoriteDelete,
  type WsReqFavoriteRename,
  type WsRespFavoriteRename,
  type WsReqFavoritesFolder,
  type WsRespFavoritesFolder,
  type WsReqFavoriteAddFolder,
  type WsRespFavoriteAddFolder,
  type FavoritesItem,
} from '../../shared/types';
import { toErrorMessage } from '../../shared/error-utils';
import { ClientBridge } from '../bridge/client-bridge';
import { useGameStore } from '../store/game-store';
import { useEmpireStore } from '../store/empire-store';
import { bookmarksKey, readLegacyBookmarks, clearLegacyBookmarks } from '../store/legacy-bookmarks';
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

/**
 * Read one level of the tree — folders and links alike — for the Favorites
 * tree UI. `path` is the Location to descend into, `''` for the root.
 *
 * Unlike the three mutations above, a failure here does not surface through
 * `ctx.showNotification` — the tree component owns the request and decides
 * how to show a folder that could not be read (collapsed, or with its own
 * inline error), so the caller gets the thrown error back, not swallowed.
 */
export async function fetchFolderContents(
  ctx: ClientHandlerContext, path: string,
): Promise<FavoritesItem[]> {
  const req: WsReqFavoritesFolder = { type: WsMessageType.REQ_FAVORITES_FOLDER, path };
  const response = await ctx.sendRequest(req) as WsRespFavoritesFolder;
  return response.items;
}

/** The result of the folder-creation mutation, as the server answered it. */
export interface AddFolderResult {
  success: boolean;
  id?: number;
  message?: string;
}

/**
 * Create a folder under `parentPath` (`''` for the root). Unlike the other
 * mutations, this does not re-read the flat root list — folders never appear
 * there — the caller re-reads the tree branch it is showing instead.
 */
export async function addFolder(
  ctx: ClientHandlerContext, parentPath: string, name: string,
): Promise<AddFolderResult> {
  const req: WsReqFavoriteAddFolder = { type: WsMessageType.REQ_FAVORITE_ADD_FOLDER, parentPath, name };
  try {
    const response = await ctx.sendRequest(req) as WsRespFavoriteAddFolder;
    if (!response.success) {
      ctx.showNotification(response.message || 'Could not add this folder.', 'error');
    }
    return { success: response.success, id: response.id, message: response.message };
  } catch (err: unknown) {
    const message = `Failed to add folder: ${toErrorMessage(err)}`;
    ctx.showNotification(message, 'error');
    return { success: false, message };
  }
}

/**
 * Keys already handled this session. Clearing the storage key is not enough on
 * its own: a second facilities response can arrive while the first migration is
 * still pushing, and would read the same list again and duplicate it.
 */
const migrationDone = new Set<string>();

/**
 * Move the places this browser kept (N4) into the server's Favorites tree, once.
 *
 * Merge, never overwrite: what the tree already holds at the same coordinates is
 * left alone, and the local key is only dropped once every missing place has been
 * accepted by the server. A refusal keeps the local list and lets a later
 * facilities read try again — losing a player's places to a failed write would be
 * the worst possible outcome of a migration.
 */
export async function migrateLocalBookmarks(ctx: ClientHandlerContext): Promise<void> {
  const { worldName, username } = useGameStore.getState();
  const key = bookmarksKey(worldName, username);
  if (migrationDone.has(key)) return;
  migrationDone.add(key);

  const local = readLegacyBookmarks(worldName, username);
  if (local.length === 0) return;

  const known = useEmpireStore.getState().facilities;
  const missing = local.filter((b) => !known.some((f) => f.x === b.x && f.y === b.y));
  if (missing.length === 0) {
    clearLegacyBookmarks(worldName, username);
    return;
  }

  try {
    for (const b of missing) {
      const req: WsReqFavoriteAdd = { type: WsMessageType.REQ_FAVORITE_ADD, name: b.name, x: b.x, y: b.y };
      const response = await ctx.sendRequest(req) as WsRespFavoriteAdd;
      if (!response.success) {
        throw new Error(response.message || 'the server refused one of them');
      }
    }
  } catch (err: unknown) {
    migrationDone.delete(key);
    ctx.showNotification(
      `Could not move your saved places to your account: ${toErrorMessage(err)}`, 'error',
    );
    return;
  }

  clearLegacyBookmarks(worldName, username);
  ctx.showNotification(
    `${missing.length} saved place${missing.length > 1 ? 's' : ''} moved to your account`, 'success',
  );
  refreshFacilities(ctx);
}
