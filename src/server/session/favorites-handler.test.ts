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

  it('parses folders and links at the root', async () => {
    const fake = makeSessionCtx();
    // id \x01 kind \x01 name \x01 info \x01 subCount \x01 '' — kind 1 = link, 0 = folder
    const link = ['4210', '1', 'Farm 1', 'Farm 1,118,226,0', '0', ''].join('\x01');
    const folder = ['9', '0', 'Folder', '', '2', ''].join('\x01');
    fake.respond(() => `res="%${[folder, link].join('\x02')}"`);

    const items = await fetchOwnedFacilities(fake.ctx);

    // Should include both folder (kind=0) and link (kind=1) at the root
    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({ id: 9, kind: 0, name: 'Folder', x: 0, y: 0, path: '9', children: [] });
    expect(items[1]).toEqual({ id: 4210, kind: 1, name: 'Farm 1', x: 118, y: 226, path: '4210' });
  });

  it('recursively fetches folder children', async () => {
    const fake = makeSessionCtx();
    // Root: one folder
    const rootFolder = ['9', '0', 'Folder', '', '1', ''].join('\x01');
    fake.respond()
      .once(() => `res="%${rootFolder}"`)
      // When fetching folder 9's children
      .once(() => {
        const childLink = ['100', '1', 'Child Link', 'Child Link,50,60,0', '0', ''].join('\x01');
        return `res="%${childLink}"`;
      });

    const items = await fetchOwnedFacilities(fake.ctx);

    expect(items).toHaveLength(1);
    expect(items[0]).toEqual({
      id: 9,
      kind: 0,
      name: 'Folder',
      x: 0,
      y: 0,
      path: '9',
      children: [
        { id: 100, kind: 1, name: 'Child Link', x: 50, y: 60, path: '9/100' },
      ],
    });
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
// moveFavorite — RDOFavoritesMoveItem(itemPath, destPath)
// =============================================================================
describe('moveFavorite', () => {
  it('addresses the item and destination by their Locations and reads `#-1` as true', async () => {
    const fake = makeSessionCtx();
    fake.respond(() => 'res="#-1"');

    const result = await moveFavorite(fake.ctx, '4210', '9');

    expect(result).toEqual({ success: true });
    expect(fake.sent[0].socketName).toBe('world');
    expect(fake.sent[0].category).toBe(TimeoutCategory.NORMAL);
    expect(fake.sent[0].packet).toEqual({
      verb: RdoVerb.SEL,
      targetId: FAKE_CONTEXT_IDS.worldContextId,
      action: RdoAction.CALL,
      member: 'RDOFavoritesMoveItem',
      separator: '"^"',
      args: [
        RdoValue.widestring('4210').format(),
        RdoValue.widestring('9').format(),
      ],
    });
  });

  it('handles moving to root by passing empty string as destination', async () => {
    const fake = makeSessionCtx();
    fake.respond(() => 'res="#-1"');

    await moveFavorite(fake.ctx, '9/100', '');

    const args = fake.sent[0].packet.args as string[];
    expect(args[1]).toBe(RdoValue.widestring('').format());
  });

  it('accepts any non-zero ordinal as true', async () => {
    const fake = makeSessionCtx();
    fake.respond(() => 'res="#1"');
    expect((await moveFavorite(fake.ctx, '4210', '9')).success).toBe(true);
  });

  it('reads `#0` — an unresolvable Location — as a refusal', async () => {
    const fake = makeSessionCtx();
    fake.respond(() => 'res="#0"');

    const result = await moveFavorite(fake.ctx, '999', '9');

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
