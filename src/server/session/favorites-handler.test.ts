/// <reference path="../__tests__/matchers/rdo-matchers.d.ts" />

/**
 * favorites-handler — the four Favorites members of `TClientView`
 * (`Interface Server/InterfaceServer.pas:200-204`), all Delphi `function`s.
 *
 * The read (`RDOFavoritesGetSubItems`) moved here from politics-handler, where
 * it never belonged; its cases came along unchanged apart from the `path` the
 * parser now carries.
 *
 * What the write tests are really pinning is the honesty of the result
 * read-out. `RDOFavoritesNewItem` answers an id and uses `-1` for failure, so
 * the boolean reading (`isTrueOrdinal`) would call that refusal a success; the
 * two boolean members answer `#-1` for true, so the id reading would call that
 * a failure. And an ABSENT result must be a failure for all three — that is
 * OB-1, where a detected failure was reported to the UI as an OK.
 */

import {
  fetchOwnedFacilities,
  addFavorite,
  deleteFavorite,
  renameFavorite,
  createFavoriteFolder,
  moveFavorite,
} from './favorites-handler';
import { makeSessionCtx, FAKE_CONTEXT_IDS } from '../__tests__/session/fake-session-context';
import { RdoValue } from '../../shared/rdo-types';
import { RdoVerb, RdoAction } from '../../shared/types';
import { TimeoutCategory } from '../../shared/timeout-categories';

// =============================================================================
// fetchOwnedFacilities — RDOFavoritesGetSubItems("")
// =============================================================================
describe('fetchOwnedFacilities', () => {
  it('calls RDOFavoritesGetSubItems on the world context with an empty OLEString', async () => {
    const fake = makeSessionCtx();
    fake.respond(() => 'res="%"');

    await fetchOwnedFacilities(fake.ctx);

    expect(fake.sent).toHaveLength(1);
    expect(fake.sent[0].socketName).toBe('world');
    expect(fake.sent[0].category).toBe(TimeoutCategory.NORMAL);
    expect(fake.sent[0].packet).toEqual({
      verb: RdoVerb.SEL,
      targetId: FAKE_CONTEXT_IDS.worldContextId,
      action: RdoAction.CALL,
      member: 'RDOFavoritesGetSubItems',
      separator: '"^"',
      args: [RdoValue.string('').format()],
    });
  });

  it('parses the \\x01/\\x02-separated favorites through the real parseFavoritesResponse, and descends a folder found at the root', async () => {
    const fake = makeSessionCtx();
    // id \x01 kind \x01 name \x01 info \x01 subCount \x01 '' — kind 1 = link, 0 = folder
    const link = ['4210', '1', 'Farm 1', 'Farm 1,118,226,0', '0', ''].join('\x01');
    const folder = ['9', '0', 'Folder', 'Folder,0,0,0', '2', ''].join('\x01');
    const nested = ['11', '1', 'Nested Farm', 'Nested Farm,50,60,0', '0', ''].join('\x01');
    fake.respond((_packet, callIndex) =>
      callIndex === 0 ? `res="%${[folder, link].join('\x02')}"` : `res="%${nested}"`,
    );

    const items = await fetchOwnedFacilities(fake.ctx);

    // At the root the Location IS the id — that is what delete and rename take.
    expect(items).toEqual([
      { id: 9, name: 'Folder', x: 0, y: 0, path: '9', isFolder: true, children: [
        { id: 11, name: 'Nested Farm', x: 50, y: 60, path: '9/11' },
      ] },
      { id: 4210, name: 'Farm 1', x: 118, y: 226, path: '4210' },
    ]);
    expect(fake.sent).toHaveLength(2);
    expect(fake.sent[1].packet.args).toEqual([RdoValue.string('9').format()]);
  });

  it('returns [] for an empty payload', async () => {
    const fake = makeSessionCtx();
    expect(await fetchOwnedFacilities(fake.ctx)).toEqual([]);
  });

  it('refuses without a world context and sends nothing', async () => {
    const fake = makeSessionCtx({ worldContextId: null });
    await expect(fetchOwnedFacilities(fake.ctx)).rejects.toThrow('Not logged in — no worldContextId');
    expect(fake.sent).toHaveLength(0);
  });

  it('propagates a timeout', async () => {
    const fake = makeSessionCtx();
    fake.respond(() => new Error('Request timeout: RDOFavoritesGetSubItems'));
    await expect(fetchOwnedFacilities(fake.ctx)).rejects.toThrow('Request timeout: RDOFavoritesGetSubItems');
  });
});

// =============================================================================
// addFavorite — RDOFavoritesNewItem("", 1, name, "name,x,y,1")
// =============================================================================
describe('addFavorite', () => {
  it('emits the four arguments in declaration order, at the root, as a link', async () => {
    const fake = makeSessionCtx();
    fake.respond(() => 'res="#4211"');

    const result = await addFavorite(fake.ctx, 'Farm 1', 118, 226);

    expect(result).toEqual({ success: true, id: 4211 });
    expect(fake.sent).toHaveLength(1);
    expect(fake.sent[0].socketName).toBe('world');
    expect(fake.sent[0].category).toBe(TimeoutCategory.NORMAL);
    expect(fake.sent[0].packet).toEqual({
      verb: RdoVerb.SEL,
      targetId: FAKE_CONTEXT_IDS.worldContextId,
      action: RdoAction.CALL,
      member: 'RDOFavoritesNewItem',
      separator: '"^"',
      args: [
        RdoValue.string('').format(),      // Location — the root
        RdoValue.int(1).format(),          // Kind — fvkLink
        RdoValue.string('Farm 1').format(),
        RdoValue.string('Farm 1,118,226,1').format(), // Info cookie
      ],
    });
  });

  it('types Kind as an integer and the two strings as OLEStrings', async () => {
    // The catalogue makes a wrong arity a compile error; the type prefixes are
    // what a silent swap of Kind and Name would break instead.
    const fake = makeSessionCtx();
    fake.respond(() => 'res="#7"');

    await addFavorite(fake.ctx, 'Farm 1', 118, 226);

    const unquote = (arg: string) => arg.replace(/^"|"$/g, '');
    const args = (fake.sent[0].packet.args as string[]).map(unquote);
    expect(args[0]).toHaveRdoTypePrefix('%');
    expect(args[1]).toHaveRdoTypePrefix('#');
    expect(args[2]).toHaveRdoTypePrefix('%');
    expect(args[3]).toHaveRdoTypePrefix('%');
  });

  it('reads `-1` as the refusal it is, not as the wire boolean true', async () => {
    const fake = makeSessionCtx();
    fake.respond(() => 'res="#-1"');

    const result = await addFavorite(fake.ctx, 'Farm 1', 118, 226);

    expect(result.success).toBe(false);
    expect(result.id).toBeUndefined();
    expect(result.message).toBe('The server refused to add this favourite.');
    expect(fake.log.warn).toHaveBeenCalledWith(expect.stringContaining('RDOFavoritesNewItem refused'));
  });

  it('reads `0` — the view with no tycoon proxy — as a refusal', async () => {
    const fake = makeSessionCtx();
    fake.respond(() => 'res="#0"');
    expect((await addFavorite(fake.ctx, 'Farm 1', 118, 226)).success).toBe(false);
  });

  it('reads a SILENT server as a refusal (OB-1: a missing result is not an OK)', async () => {
    const fake = makeSessionCtx();
    fake.respond(() => '');
    expect((await addFavorite(fake.ctx, 'Farm 1', 118, 226)).success).toBe(false);
  });

  it('truncates the name to the 50 characters the server would keep, in BOTH the name and the cookie', async () => {
    const fake = makeSessionCtx();
    fake.respond(() => 'res="#12"');
    const long = 'x'.repeat(60);

    await addFavorite(fake.ctx, long, 1, 2);

    const args = fake.sent[0].packet.args as string[];
    expect(args[2]).toBe(RdoValue.string('x'.repeat(50)).format());
    expect(args[3]).toBe(RdoValue.string(`${'x'.repeat(50)},1,2,1`).format());
  });

  it('refuses without a world context and sends nothing', async () => {
    const fake = makeSessionCtx({ worldContextId: null });
    await expect(addFavorite(fake.ctx, 'Farm 1', 1, 2)).rejects.toThrow('Not logged in — no worldContextId');
    expect(fake.sent).toHaveLength(0);
  });

  it('propagates a timeout instead of answering success', async () => {
    const fake = makeSessionCtx();
    fake.respond(() => new Error('Request timeout: RDOFavoritesNewItem'));
    await expect(addFavorite(fake.ctx, 'Farm 1', 1, 2)).rejects.toThrow('Request timeout: RDOFavoritesNewItem');
  });
});

// =============================================================================
// deleteFavorite — RDOFavoritesDelItem(location)
// =============================================================================
describe('deleteFavorite', () => {
  it('addresses the item by its Location and reads `#-1` as true', async () => {
    const fake = makeSessionCtx();
    fake.respond(() => 'res="#-1"');

    const result = await deleteFavorite(fake.ctx, '4210');

    expect(result).toEqual({ success: true });
    expect(fake.sent[0].socketName).toBe('world');
    expect(fake.sent[0].category).toBe(TimeoutCategory.NORMAL);
    expect(fake.sent[0].packet).toEqual({
      verb: RdoVerb.SEL,
      targetId: FAKE_CONTEXT_IDS.worldContextId,
      action: RdoAction.CALL,
      member: 'RDOFavoritesDelItem',
      separator: '"^"',
      args: [RdoValue.string('4210').format()],
    });
  });

  it('accepts any non-zero ordinal as true', async () => {
    const fake = makeSessionCtx();
    fake.respond(() => 'res="#1"');
    expect((await deleteFavorite(fake.ctx, '4210')).success).toBe(true);
  });

  it('reads `#0` — an unresolvable Location, or the protected root — as a refusal', async () => {
    const fake = makeSessionCtx();
    fake.respond(() => 'res="#0"');

    const result = await deleteFavorite(fake.ctx, '');

    expect(result.success).toBe(false);
    expect(result.message).toBe('The server refused to remove this favourite.');
    expect(fake.log.warn).toHaveBeenCalledWith(expect.stringContaining('RDOFavoritesDelItem refused'));
  });

  it('reads a SILENT server as a refusal (OB-1)', async () => {
    const fake = makeSessionCtx();
    fake.respond(() => '');
    expect((await deleteFavorite(fake.ctx, '4210')).success).toBe(false);
  });

  it('refuses without a world context and sends nothing', async () => {
    const fake = makeSessionCtx({ worldContextId: null });
    await expect(deleteFavorite(fake.ctx, '4210')).rejects.toThrow('Not logged in — no worldContextId');
    expect(fake.sent).toHaveLength(0);
  });

  it('propagates a timeout instead of answering success', async () => {
    const fake = makeSessionCtx();
    fake.respond(() => new Error('Request timeout: RDOFavoritesDelItem'));
    await expect(deleteFavorite(fake.ctx, '4210')).rejects.toThrow('Request timeout: RDOFavoritesDelItem');
  });
});

// =============================================================================
// renameFavorite — RDOFavoritesRenameItem(location, name)
// =============================================================================
describe('renameFavorite', () => {
  it('emits the Location then the new name, and reads `#-1` as true', async () => {
    const fake = makeSessionCtx();
    fake.respond(() => 'res="#-1"');

    const result = await renameFavorite(fake.ctx, '4210', 'Ferme du Nord');

    expect(result).toEqual({ success: true });
    expect(fake.sent[0].socketName).toBe('world');
    expect(fake.sent[0].category).toBe(TimeoutCategory.NORMAL);
    expect(fake.sent[0].packet).toEqual({
      verb: RdoVerb.SEL,
      targetId: FAKE_CONTEXT_IDS.worldContextId,
      action: RdoAction.CALL,
      member: 'RDOFavoritesRenameItem',
      separator: '"^"',
      args: [
        RdoValue.string('4210').format(),
        RdoValue.string('Ferme du Nord').format(),
      ],
    });
  });

  it('truncates to the 50 characters the server keeps, so the refetch shows what was asked', async () => {
    const fake = makeSessionCtx();
    fake.respond(() => 'res="#-1"');

    await renameFavorite(fake.ctx, '4210', 'y'.repeat(60));

    const args = fake.sent[0].packet.args as string[];
    expect(args[1]).toBe(RdoValue.string('y'.repeat(50)).format());
  });

  it('reads `#0` as a refusal', async () => {
    const fake = makeSessionCtx();
    fake.respond(() => 'res="#0"');

    const result = await renameFavorite(fake.ctx, '999', 'Nope');

    expect(result.success).toBe(false);
    expect(result.message).toBe('The server refused to rename this favourite.');
    expect(fake.log.warn).toHaveBeenCalledWith(expect.stringContaining('RDOFavoritesRenameItem refused'));
  });

  it('reads a SILENT server as a refusal (OB-1)', async () => {
    const fake = makeSessionCtx();
    fake.respond(() => '');
    expect((await renameFavorite(fake.ctx, '4210', 'Nope')).success).toBe(false);
  });

  it('refuses without a world context and sends nothing', async () => {
    const fake = makeSessionCtx({ worldContextId: null });
    await expect(renameFavorite(fake.ctx, '4210', 'Nope')).rejects.toThrow('Not logged in — no worldContextId');
    expect(fake.sent).toHaveLength(0);
  });

  it('propagates a timeout instead of answering success', async () => {
    const fake = makeSessionCtx();
    fake.respond(() => new Error('Request timeout: RDOFavoritesRenameItem'));
    await expect(renameFavorite(fake.ctx, '4210', 'Nope')).rejects.toThrow('Request timeout: RDOFavoritesRenameItem');
  });
});

// =============================================================================
// createFavoriteFolder — RDOFavoritesNewItem(parent, 0, name, "")
// =============================================================================
describe('createFavoriteFolder', () => {
  it('emits the four arguments in order, Kind = fvkFolder, empty Info', async () => {
    const fake = makeSessionCtx();
    fake.respond(() => 'res="#12"');

    const result = await createFavoriteFolder(fake.ctx, '', 'Farms');

    expect(result).toEqual({ success: true, id: 12 });
    expect(fake.sent[0].packet).toEqual({
      verb: RdoVerb.SEL,
      targetId: FAKE_CONTEXT_IDS.worldContextId,
      action: RdoAction.CALL,
      member: 'RDOFavoritesNewItem',
      separator: '"^"',
      args: [
        RdoValue.string('').format(),
        RdoValue.int(0).format(),
        RdoValue.string('Farms').format(),
        RdoValue.string('').format(),
      ],
    });
  });

  it('reads `-1` as a refusal, not as the wire boolean true', async () => {
    const fake = makeSessionCtx();
    fake.respond(() => 'res="#-1"');

    const result = await createFavoriteFolder(fake.ctx, '', 'Farms');

    expect(result.success).toBe(false);
    expect(result.message).toBe('The server refused to create this folder.');
    expect(fake.log.warn).toHaveBeenCalledWith(expect.stringContaining('RDOFavoritesNewItem (folder) refused'));
  });

  it('reads a SILENT server as a refusal (OB-1)', async () => {
    const fake = makeSessionCtx();
    fake.respond(() => '');
    expect((await createFavoriteFolder(fake.ctx, '', 'Farms')).success).toBe(false);
  });

  it('truncates the name to 50 characters', async () => {
    const fake = makeSessionCtx();
    fake.respond(() => 'res="#12"');
    await createFavoriteFolder(fake.ctx, '', 'x'.repeat(60));
    const args = fake.sent[0].packet.args as string[];
    expect(args[2]).toBe(RdoValue.string('x'.repeat(50)).format());
  });

  it('refuses without a world context and sends nothing', async () => {
    const fake = makeSessionCtx({ worldContextId: null });
    await expect(createFavoriteFolder(fake.ctx, '', 'Farms')).rejects.toThrow('Not logged in — no worldContextId');
    expect(fake.sent).toHaveLength(0);
  });
});

// =============================================================================
// moveFavorite — RDOFavoritesMoveItem(itemPath, destPath)
// =============================================================================
describe('moveFavorite', () => {
  it('emits the item path then the destination, and reads `#-1` as true', async () => {
    const fake = makeSessionCtx();
    fake.respond(() => 'res="#-1"');

    const result = await moveFavorite(fake.ctx, '4210', '9');

    expect(result).toEqual({ success: true });
    expect(fake.sent[0].packet).toEqual({
      verb: RdoVerb.SEL,
      targetId: FAKE_CONTEXT_IDS.worldContextId,
      action: RdoAction.CALL,
      member: 'RDOFavoritesMoveItem',
      separator: '"^"',
      args: [RdoValue.string('4210').format(), RdoValue.string('9').format()],
    });
  });

  it('reads `#0` as a refusal', async () => {
    const fake = makeSessionCtx();
    fake.respond(() => 'res="#0"');

    const result = await moveFavorite(fake.ctx, '4210', '9');

    expect(result.success).toBe(false);
    expect(result.message).toBe('The server refused to move this favourite.');
    expect(fake.log.warn).toHaveBeenCalledWith(expect.stringContaining('RDOFavoritesMoveItem refused'));
  });

  it('reads a SILENT server as a refusal (OB-1)', async () => {
    const fake = makeSessionCtx();
    fake.respond(() => '');
    expect((await moveFavorite(fake.ctx, '4210', '9')).success).toBe(false);
  });

  it('refuses without a world context and sends nothing', async () => {
    const fake = makeSessionCtx({ worldContextId: null });
    await expect(moveFavorite(fake.ctx, '4210', '9')).rejects.toThrow('Not logged in — no worldContextId');
    expect(fake.sent).toHaveLength(0);
  });

  it('propagates a timeout instead of answering success', async () => {
    const fake = makeSessionCtx();
    fake.respond(() => new Error('Request timeout: RDOFavoritesMoveItem'));
    await expect(moveFavorite(fake.ctx, '4210', '9')).rejects.toThrow('Request timeout: RDOFavoritesMoveItem');
  });
});

// =============================================================================
// fetchOwnedFacilities — recursive walk caps
// =============================================================================
describe('fetchOwnedFacilities — recursive folder walk', () => {
  it('stops descending at the depth cap, leaving the deepest folder unfetched', async () => {
    const fake = makeSessionCtx();
    // Every read answers one folder, one level deeper than the Location it was asked for.
    fake.respond((packet) => {
      const arg = (packet.args as string[])[0];
      const parentPath = arg.replace(/^"%|"$/g, '');
      const nextId = (parentPath ? parentPath.split('/').length : 0) + 1;
      const folder = [String(nextId), '0', `F${nextId}`, '', '0', ''].join('\x01');
      return `res="%${folder}"`;
    });

    const items = await fetchOwnedFacilities(fake.ctx);

    // root + 8 depth levels = 9 reads total (depth cap is on how many more
    // levels are walked after the root, not on the root read itself).
    expect(fake.sent).toHaveLength(9);
    // Walk to the deepest fetched folder and confirm its own children were never read.
    let node = items[0];
    let depth = 0;
    while (node.isFolder && node.children && node.children.length > 0) {
      node = node.children[0];
      depth++;
    }
    expect(depth).toBe(8);
    expect(node.children).toEqual([]);
  });

  it('stops fetching once the folder-count cap is reached', async () => {
    const fake = makeSessionCtx();
    // Root holds 60 sibling folders — more than FAV_FOLDER_COUNT_CAP (50).
    const rootFolders = Array.from({ length: 60 }, (_, i) =>
      [String(i + 1), '0', `F${i + 1}`, '', '0', ''].join('\x01'),
    ).join('\x02');
    fake.respond((_packet, callIndex) => (callIndex === 0 ? `res="%${rootFolders}"` : 'res="%"'));

    await fetchOwnedFacilities(fake.ctx);

    // 1 root read + at most 50 child reads.
    expect(fake.sent.length).toBeLessThanOrEqual(51);
  });
});
