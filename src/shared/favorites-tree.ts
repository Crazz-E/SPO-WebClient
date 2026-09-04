/**
 * Favorites-tree helpers — pure functions shared by the server, the client
 * and the L2 flow. The server hands back a tree (root items, folders with
 * `children`); these two walk it depth-first for the two things every
 * consumer actually needs: the links alone, and the folders alone.
 */

import type { FavoritesItem } from './types';

/** Every link in the tree, depth-first, folders descended and omitted. */
export function flattenFavoriteLinks(items: readonly FavoritesItem[]): FavoritesItem[] {
  const out: FavoritesItem[] = [];
  for (const item of items) {
    if (item.isFolder) {
      out.push(...flattenFavoriteLinks(item.children ?? []));
    } else {
      out.push(item);
    }
  }
  return out;
}

export interface FolderEntry {
  folder: FavoritesItem;
  depth: number;
}

/** Every folder in the tree, depth-first, parent before children. */
export function flattenFolders(items: readonly FavoritesItem[], depth = 0): FolderEntry[] {
  const out: FolderEntry[] = [];
  for (const item of items) {
    if (!item.isFolder) continue;
    out.push({ folder: item, depth });
    out.push(...flattenFolders(item.children ?? [], depth + 1));
  }
  return out;
}
