/**
 * Favorites handler — the player's bookmark tree on the Interface Server.
 *
 * Every public function takes `ctx: SessionContext` as its first argument.
 *
 * The tree lives inside the player's own `TTycoon` (`Kernel/Kernel.pas:11858-11910`,
 * delegating to `TFavorites`, `Kernel/Favorites.pas:190-305`) and is reached
 * through `TClientView` on the world socket
 * (`Interface Server/InterfaceServer.pas:200-204`). All four members are Delphi
 * `function`s, so every call is a `rdoCall` — the catalogue in
 * `src/shared/rdo-members.ts` carries the kinds and arities.
 *
 * An item is addressed by its **Location**: the '/'-separated path of ids that
 * `TFavorites.LocateItem` walks (`Favorites.pas:312-334`). The empty string is
 * the root, which is why the read passes `''`.
 */

import type { SessionContext } from './session-context';
import type { FavoritesItem } from '../../shared/types';
import { TimeoutCategory } from '../../shared/timeout-categories';
import { RdoValue } from '../../shared/rdo-types';
import { rdoCall } from '../../shared/rdo-frame';
import { parsePropertyResponse, isTrueOrdinal } from '../rdo-helpers';
import { parseFavoritesResponse } from './session-utils';

/** `fvkLink` — a bookmark with coordinates (`Kernel/FavProtocol.pas:7`). */
const FAV_KIND_LINK = 1;
/** `fvkFolder` (`Kernel/FavProtocol.pas:6`). */
const FAV_KIND_FOLDER = 0;

/**
 * Bounds on the recursive folder walk in `fetchOwnedFacilities` — a folder
 * past either cap keeps `children: []` rather than spinning the session on a
 * pathological tree.
 */
const FAV_FOLDER_DEPTH_CAP = 8;
const FAV_FOLDER_COUNT_CAP = 50;

/**
 * `TFavorites.RDORenameItem` truncates past 50 characters (`Favorites.pas:283`).
 * We truncate before sending so the name the player is shown after the refetch
 * is the name we asked for, not a silently shortened one.
 */
const FAV_NAME_MAX = 50;

/**
 * Read the `res` value out of a CALL response, type prefix stripped.
 *
 * `parseResultCode` is deliberately NOT used here: it answers `-1` when the
 * payload carries no result at all, and `-1` is the wire's *true* for a Delphi
 * boolean. A silent server would therefore read as a successful delete — the
 * OB-1 defect, where a failure is detected and then reported as success.
 * An absent result is the empty string, which every check below rejects.
 */
function readResult(payload: string | undefined | null): string {
  return payload ? parsePropertyResponse(payload, 'res') : '';
}

/** The result of one favourites mutation, as the server answered it. */
export interface FavoriteMutationResult {
  success: boolean;
  /** The id the server assigned — add only, and only on success. */
  id?: number;
  message?: string;
}

function requireWorldContext(ctx: SessionContext): string {
  if (!ctx.worldContextId) {
    throw new Error('Not logged in — no worldContextId');
  }
  return ctx.worldContextId;
}

/**
 * The `Info` cookie of a link: `displayName,x,y,select`
 * (`Protocol/Protocol.pas:447-450`). `select` is the flag Voyager set to focus
 * the facility on arrival; 1 is what its own bookmarks carried.
 */
function composeLinkCookie(name: string, x: number, y: number): string {
  return `${name},${x},${y},1`;
}

// =========================================================================
// PUBLIC FUNCTIONS
// =========================================================================

async function fetchSubItems(
  ctx: SessionContext, targetId: string, path: string,
): Promise<FavoritesItem[]> {
  const packet = await ctx.sendRdoRequest('world', rdoCall(
    'RDOFavoritesGetSubItems', targetId,
    RdoValue.string(path),
  ).packet, undefined, TimeoutCategory.NORMAL);

  const raw = parsePropertyResponse(packet.payload!, 'res');
  return parseFavoritesResponse(raw, path);
}

/**
 * List the whole tree — the facilities the Empire panel shows. Folders are
 * fetched breadth-first, each with its own `RDOFavoritesGetSubItems` call
 * passing the folder's Location; a folder past `FAV_FOLDER_DEPTH_CAP` or
 * `FAV_FOLDER_COUNT_CAP` keeps `children: []` rather than let a pathological
 * tree spin the session. The wire's `subFolderCount` field is deliberately
 * not used to skip a fetch — it counts sub-folders, not links.
 */
export async function fetchOwnedFacilities(ctx: SessionContext): Promise<FavoritesItem[]> {
  const targetId = requireWorldContext(ctx);

  const root = await fetchSubItems(ctx, targetId, '');

  let folderCount = 0;
  const queue: Array<{ item: FavoritesItem; depth: number }> = [];
  for (const item of root) {
    if (item.isFolder) queue.push({ item, depth: 1 });
  }

  while (queue.length > 0) {
    const next = queue.shift();
    if (!next) break;
    const { item, depth } = next;
    if (folderCount >= FAV_FOLDER_COUNT_CAP || depth > FAV_FOLDER_DEPTH_CAP) continue;
    folderCount++;

    const children = await fetchSubItems(ctx, targetId, item.path);
    item.children = children;
    for (const child of children) {
      if (child.isFolder) queue.push({ item: child, depth: depth + 1 });
    }
  }

  return root;
}

/**
 * Add a link at the root of the tree.
 *
 * `RDOFavoritesNewItem` answers the id it assigned, `-1` when the parent
 * Location does not resolve (`Favorites.pas:205`), and `0` when the view holds
 * no tycoon proxy (`InterfaceServer.pas:1743-1747` leaves the result unset).
 * So success is `id > 0` here — and NOT `isTrueOrdinal`, which would read the
 * `-1` failure as true.
 */
export async function addFavorite(
  ctx: SessionContext, name: string, x: number, y: number,
): Promise<FavoriteMutationResult> {
  const targetId = requireWorldContext(ctx);
  const trimmed = name.slice(0, FAV_NAME_MAX);

  const packet = await ctx.sendRdoRequest('world', rdoCall(
    'RDOFavoritesNewItem', targetId,
    RdoValue.string(''),
    RdoValue.int(FAV_KIND_LINK),
    RdoValue.string(trimmed),
    RdoValue.string(composeLinkCookie(trimmed, x, y)),
  ).packet, undefined, TimeoutCategory.NORMAL);

  const res = readResult(packet.payload);
  const id = parseInt(res, 10);
  if (Number.isFinite(id) && id > 0) {
    return { success: true, id };
  }
  ctx.log.warn(`[Favorites] RDOFavoritesNewItem refused "${trimmed}" (res="${res}")`);
  return { success: false, message: 'The server refused to add this favourite.' };
}

/**
 * Create a folder under `parentPath` ('' for the root). Same call and the same
 * `-1`/`0`/absent failure semantics as {@link addFavorite} — see its JSDoc —
 * with `Kind = fvkFolder` and an empty Info cookie, which folders do not carry.
 */
export async function createFavoriteFolder(
  ctx: SessionContext, parentPath: string, name: string,
): Promise<FavoriteMutationResult> {
  const targetId = requireWorldContext(ctx);
  const trimmed = name.slice(0, FAV_NAME_MAX);

  const packet = await ctx.sendRdoRequest('world', rdoCall(
    'RDOFavoritesNewItem', targetId,
    RdoValue.string(parentPath),
    RdoValue.int(FAV_KIND_FOLDER),
    RdoValue.string(trimmed),
    RdoValue.string(''),
  ).packet, undefined, TimeoutCategory.NORMAL);

  const res = readResult(packet.payload);
  const id = parseInt(res, 10);
  if (Number.isFinite(id) && id > 0) {
    return { success: true, id };
  }
  ctx.log.warn(`[Favorites] RDOFavoritesNewItem (folder) refused "${trimmed}" (res="${res}")`);
  return { success: false, message: 'The server refused to create this folder.' };
}

/**
 * Move an item to another folder. `RDOFavoritesMoveItem` answers a boolean —
 * the server itself refuses moving a folder into its own subtree
 * (`Favorites.pas:247`), so the gateway adds no duplicate guard here.
 */
export async function moveFavorite(
  ctx: SessionContext, itemPath: string, destPath: string,
): Promise<FavoriteMutationResult> {
  const targetId = requireWorldContext(ctx);

  const packet = await ctx.sendRdoRequest('world', rdoCall(
    'RDOFavoritesMoveItem', targetId,
    RdoValue.string(itemPath),
    RdoValue.string(destPath),
  ).packet, undefined, TimeoutCategory.NORMAL);

  if (isTrueOrdinal(readResult(packet.payload))) {
    return { success: true };
  }
  ctx.log.warn(`[Favorites] RDOFavoritesMoveItem refused "${itemPath}" -> "${destPath}"`);
  return { success: false, message: 'The server refused to move this favourite.' };
}

/**
 * Remove one item by its Location.
 *
 * `RDOFavoritesDelItem` answers a boolean — false when the Location does not
 * resolve, and false for the root, which the server protects
 * (`Favorites.pas:229-235`). Any non-zero ordinal is true on the wire.
 */
export async function deleteFavorite(
  ctx: SessionContext, path: string,
): Promise<FavoriteMutationResult> {
  const targetId = requireWorldContext(ctx);

  const packet = await ctx.sendRdoRequest('world', rdoCall(
    'RDOFavoritesDelItem', targetId,
    RdoValue.string(path),
  ).packet, undefined, TimeoutCategory.NORMAL);

  if (isTrueOrdinal(readResult(packet.payload))) {
    return { success: true };
  }
  ctx.log.warn(`[Favorites] RDOFavoritesDelItem refused "${path}"`);
  return { success: false, message: 'The server refused to remove this favourite.' };
}

/**
 * Rename one item by its Location. Same boolean answer as the delete
 * (`Favorites.pas:275-289`).
 */
export async function renameFavorite(
  ctx: SessionContext, path: string, name: string,
): Promise<FavoriteMutationResult> {
  const targetId = requireWorldContext(ctx);
  const trimmed = name.slice(0, FAV_NAME_MAX);

  const packet = await ctx.sendRdoRequest('world', rdoCall(
    'RDOFavoritesRenameItem', targetId,
    RdoValue.string(path),
    RdoValue.string(trimmed),
  ).packet, undefined, TimeoutCategory.NORMAL);

  if (isTrueOrdinal(readResult(packet.payload))) {
    return { success: true };
  }
  ctx.log.warn(`[Favorites] RDOFavoritesRenameItem refused "${path}"`);
  return { success: false, message: 'The server refused to rename this favourite.' };
}
