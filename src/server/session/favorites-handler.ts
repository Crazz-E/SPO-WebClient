/**
 * Favorites handler — the player's bookmark tree on the Interface Server.
 *
 * Every public function takes `ctx: SessionContext` as its first argument.
 *
 * The tree lives inside the player's own `TTycoon` (`Kernel/Kernel.pas:11858-11910`,
 * delegating to `TFavorites`, `Kernel/Favorites.pas:190-305`) and is reached
 * through `TClientView` on the world socket
 * (`Interface Server/InterfaceServer.pas:200-204`). Five members now — all
 * Delphi `function`s, so every call is a `rdoCall` — the catalogue in
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

/** `fvkFolder` — a container (`Kernel/FavProtocol.pas:6`). */
const FAV_KIND_FOLDER = 0;
/** `fvkLink` — a bookmark with coordinates (`Kernel/FavProtocol.pas:7`). */
const FAV_KIND_LINK = 1;

/**
 * Bounds on the recursive tree walk. The wire's sub-folder count
 * deliberately is NOT used to skip a fetch — it counts sub-folders, not
 * links (`Favorites.pas:95-104`) — so these are the only limits.
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

/** One `RDOFavoritesGetSubItems` read, at the given Location. */
async function fetchSubItems(ctx: SessionContext, targetId: string, path: string): Promise<FavoritesItem[]> {
  const packet = await ctx.sendRdoRequest('world', rdoCall(
    'RDOFavoritesGetSubItems', targetId,
    RdoValue.string(path),
  ).packet, undefined, TimeoutCategory.NORMAL);

  const raw = parsePropertyResponse(packet.payload!, 'res');
  return parseFavoritesResponse(raw, path);
}

/**
 * List the root of the tree — the facilities the Empire panel shows — and
 * walk every folder found to fill its `children`, breadth-first, one socket,
 * serial awaits. A folder beyond either cap keeps `children: []` rather than
 * being fetched further.
 */
export async function fetchOwnedFacilities(ctx: SessionContext): Promise<FavoritesItem[]> {
  const targetId = requireWorldContext(ctx);

  const root = await fetchSubItems(ctx, targetId, '');

  let frontier = root.filter((item) => item.isFolder);
  let depth = 0;
  let fetched = 0;
  while (frontier.length > 0 && depth < FAV_FOLDER_DEPTH_CAP) {
    const next: FavoritesItem[] = [];
    for (const folder of frontier) {
      if (fetched >= FAV_FOLDER_COUNT_CAP) break;
      fetched++;
      folder.children = await fetchSubItems(ctx, targetId, folder.path);
      for (const child of folder.children) {
        if (child.isFolder) next.push(child);
      }
    }
    frontier = next;
    depth++;
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
 * Create a folder at a given Location.
 *
 * Same call and the same result reading as `addFavorite` — `RDOFavoritesNewItem`
 * with `Kind = fvkFolder` and an empty `Info` cookie, since a folder carries
 * none (`Favorites.pas:190-206`).
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
 * Move one item by its Location to another.
 *
 * `RDOFavoritesMoveItem` answers a boolean, refusing the root and any move
 * into a Location that starts with the item's own path
 * (`Favorites.pas:239-273`, guard at `:247`) — no client-side cycle guard is
 * needed on top of it.
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
