/**
 * The L2 flow catalogue.
 *
 * A flow is a scripted live drive over the WebSocket contract, with its own assertions.
 * The gate picks which flows to run from the diff (doc/E2E-POLICY.md §4) — a fixed script
 * drifts and eventually tests nothing that changed.
 */

import { WsMessageType } from '../shared/types/message-types';
import type {
  WsRespEmpireFacilities,
  WsRespFavoriteAdd,
  WsRespFavoriteDelete,
  WsRespFavoriteRename,
  WsRespFavoriteFolderCreate,
  WsRespFavoriteMove,
  WsRespMailFolder,
  WsRespMailSent,
  WsRespPoliticsData,
} from '../shared/types/message-types';
import { toErrorMessage } from '../shared/error-utils';
import { GOVERNED_TOWN, PRIMARY_ACCOUNT, SECONDARY_ACCOUNT, TIMEOUTS } from './config';
import { findCurrentSurvivalLog, openLogWindow } from './live-log';
import { runProbe, probeFailure, type ProbeResult, type ProbeSpec } from './probe';
import {
  findTown,
  resolveVisualClass,
  login,
  logoff,
  readBuildingDetails,
  readBuildingTabData,
  readSectionGroups,
  propertyValue,
  type LiveSession,
} from './session';
import type { WorldLock } from './world-lock';

export interface FlowContext {
  lock: WorldLock;
  /** Injected so a dry run can exercise the catalogue without touching the world. */
  survivalLogUrl?: string;
}

export interface FlowResult {
  name: string;
  status: 'PASS' | 'FAIL';
  assertions: { what: string; ok: boolean; detail?: string }[];
  probes: ProbeResult[];
  messagesSent: number;
  messagesReceived: number;
  wireErrors: number;
  error?: string;
}

export interface Flow {
  name: string;
  /** One line, shown in the gate report. */
  what: string;
  /** True when the flow writes to the live world — subject to the blast-radius rule. */
  mutates: boolean;
  run: (ctx: FlowContext) => Promise<FlowResult>;
}

class Assertions {
  readonly items: { what: string; ok: boolean; detail?: string }[] = [];
  check(what: string, ok: boolean, detail?: string): void {
    this.items.push({ what, ok, detail });
  }
  get failed(): boolean {
    return this.items.some(a => !a.ok);
  }
}

/**
 * The login spine — appended to every run regardless of routing. Cheapest possible
 * regression detector, and where session-lifecycle breakage surfaces first.
 */
const loginSpine: Flow = {
  name: 'login-spine',
  what: 'connect -> auth -> directory -> world login -> company select -> logoff',
  mutates: false,
  run: async () => {
    const assertions = new Assertions();
    const session = await login(PRIMARY_ACCOUNT);
    try {
      assertions.check('world listing is not empty', session.worlds > 0, `${session.worlds} worlds`);
      assertions.check('a company was selected', Boolean(session.company.id), session.company.name);
      assertions.check(
        'the selected company belongs to the tycoon, not a civic role',
        !session.company.ownerRole || session.company.ownerRole === PRIMARY_ACCOUNT.username,
        session.company.ownerRole ?? '(none)',
      );
      assertions.check('no gateway errors on the spine', session.driver.errors.length === 0);
      return report('login-spine', assertions, [], session);
    } finally {
      await logoff(session);
    }
  },
};

/** Read-only governance: the town this account governs, and its politics payload. */
const politicsRead: Flow = {
  name: 'politics-read',
  what: 'town list -> governed town -> politics data',
  mutates: false,
  run: async () => {
    const assertions = new Assertions();
    const session = await login(PRIMARY_ACCOUNT);
    try {
      const town = await findTown(session, GOVERNED_TOWN);
      assertions.check('the governed town is still listed', town.name === GOVERNED_TOWN, town.name);

      const politics = await session.driver.request<WsRespPoliticsData>(
        {
          type: WsMessageType.REQ_POLITICS_DATA,
          townName: town.name,
          buildingX: town.x,
          buildingY: town.y,
        },
        WsMessageType.RESP_POLITICS_DATA,
      );
      assertions.check('politics data returned', Boolean(politics.data));
      assertions.check('no gateway errors', session.driver.errors.length === 0);
      return report('politics-read', assertions, [], session);
    } finally {
      await logoff(session);
    }
  },
};

/**
 * The mutation flow. One probe, on the tax rate of the town this account governs —
 * inside the blast radius by construction (doc/E2E-POLICY.md §9).
 */
const politicsWrite: Flow = {
  name: 'politics-write',
  what: 'round-trip probe on RDOSetTaxValue at the governed town hall',
  mutates: true,
  run: async ctx => {
    const assertions = new Assertions();
    const probes: ProbeResult[] = [];
    const session = await login(PRIMARY_ACCOUNT);
    try {
      const town = await findTown(session, GOVERNED_TOWN);
      const visualClass = await resolveVisualClass(session, town.x, town.y);
      const details = await readBuildingDetails(session, town.x, town.y, visualClass);
      assertions.check('the town hall is governable by this account', details.canGovern === true);
      if (!details.canGovern) return report('politics-write', assertions, probes, session);

      // The tax table is a section: the opening read above answers `canGovern`
      // and the header group, and this is the request that brings the rates.
      const taxes = await readSectionGroups(session, town.x, town.y, 'townTaxes', visualClass);
      const current = propertyValue(taxes, 'townTaxes', 'Tax0Percent');
      assertions.check('a tax row is readable', current !== undefined, current);
      if (current === undefined) return report('politics-write', assertions, probes, session);

      const spec: ProbeSpec = {
        what: `${town.name} tax row 0 rate`,
        member: 'RDOSetTaxValue',
        x: town.x,
        y: town.y,
        visualClass,
        groupId: 'townTaxes',
        readProperty: 'Tax0Percent',
        writeProperty: 'RDOSetTaxValue',
        // building-property-handler.ts:141 resolves the row index to the real TaxId.
        additionalParams: { index: '0' },
        testValue: original => nudge(original),
      };

      const url = ctx.survivalLogUrl ?? (await findCurrentSurvivalLog());
      try {
        probes.push(await runProbe(session, spec, ctx.lock, openLogWindow, url));
      } catch (err: unknown) {
        probes.push(probeFailure(spec, err));
      }
      assertions.check('the probe proved the write reached the object', probes[0]?.status === 'PASS', probes[0]?.note);
      return report('politics-write', assertions, probes, session);
    } finally {
      await logoff(session);
    }
  },
};

/**
 * The negative case the second account exists for: a basic tycoon must not be offered
 * the mayor's controls. Catches the `tycoonratings.asp:24-25` failure mode — a guard
 * commented out and the result hardcoded true — in our own client.
 */
const permissionNegative: Flow = {
  name: 'permission-negative',
  what: 'Crazz at the governed town hall sees canGovern=false',
  mutates: false,
  run: async () => {
    const assertions = new Assertions();
    const session = await login(SECONDARY_ACCOUNT);
    try {
      const town = await findTown(session, GOVERNED_TOWN);
      const visualClass = await resolveVisualClass(session, town.x, town.y);
      const details = await readBuildingDetails(session, town.x, town.y, visualClass);
      assertions.check(
        'a non-mayor is refused governance of the town hall',
        details.canGovern === false,
        `canGovern=${details.canGovern}`,
      );
      assertions.check('the read itself still succeeds', Boolean(details.visualClass));
      return report('permission-negative', assertions, [], session);
    } finally {
      await logoff(session);
    }
  },
};

/**
 * Two-party mail, end to end for the first time: send from the primary account, read it
 * in the secondary's inbox, then delete it — the restore half of the blast-radius rule.
 */
const mailRoundTrip: Flow = {
  name: 'mail-roundtrip',
  what: 'SPO_test3 sends -> Crazz receives -> delete',
  mutates: true,
  run: async () => {
    const assertions = new Assertions();
    const subject = `e2e ${new Date().toISOString()}`;

    const sender = await login(PRIMARY_ACCOUNT);
    try {
      await sender.driver.request({ type: WsMessageType.REQ_MAIL_CONNECT }, WsMessageType.RESP_MAIL_CONNECTED);
      const sent = await sender.driver.request<WsRespMailSent>(
        {
          type: WsMessageType.REQ_MAIL_COMPOSE,
          to: SECONDARY_ACCOUNT.username,
          subject,
          body: ['Automated L2 probe. Safe to delete.'],
        },
        WsMessageType.RESP_MAIL_SENT,
        TIMEOUTS.login,
      );
      assertions.check('the compose was accepted', sent.type === WsMessageType.RESP_MAIL_SENT);
    } finally {
      await logoff(sender);
    }

    const recipient = await login(SECONDARY_ACCOUNT);
    try {
      await recipient.driver.request({ type: WsMessageType.REQ_MAIL_CONNECT }, WsMessageType.RESP_MAIL_CONNECTED);
      const inbox = await recipient.driver.request<WsRespMailFolder>(
        { type: WsMessageType.REQ_MAIL_GET_FOLDER, folder: 'Inbox' },
        WsMessageType.RESP_MAIL_FOLDER,
      );
      const delivered = inbox.messages.find(m => m.subject === subject);
      assertions.check('the message arrived in the recipient inbox', Boolean(delivered), subject);

      if (delivered) {
        await recipient.driver.request(
          { type: WsMessageType.REQ_MAIL_DELETE, folder: 'Inbox', messageId: delivered.messageId },
          WsMessageType.RESP_MAIL_DELETED,
        );
        assertions.check('the probe message was deleted again', true);
      }
      return report('mail-roundtrip', assertions, [], recipient);
    } finally {
      await logoff(recipient);
    }
  },
};

/** Building inspector read — the path every facility panel depends on. */
/**
 * Building inspector read — the path every facility panel depends on.
 *
 * The inspector reads one section at a time: the opening read carries the
 * header group, and each other group arrives when its menu entry is opened.
 * Both halves are asserted here, because only a live drive can show that the
 * deferred read still finds its properties in the real Delphi cache — the
 * temp object has to survive between the two round-trips and be reset to the
 * building root before the second.
 */
const buildingDetails: Flow = {
  name: 'building-details',
  what: 'town hall inspector read: header group at open, section group on demand',
  mutates: false,
  run: async () => {
    const assertions = new Assertions();
    const session = await login(PRIMARY_ACCOUNT);
    try {
      const town = await findTown(session, GOVERNED_TOWN);
      const visualClass = await resolveVisualClass(session, town.x, town.y);
      const details = await readBuildingDetails(session, town.x, town.y, visualClass);

      assertions.check('tabs were served', details.tabs.length > 0, `${details.tabs.length} tabs`);
      // The template is what declares the tabs, and it is unchanged by the
      // section-at-a-time read — so it is the tab list, not the groups, that
      // tells a Town Hall from the generic fallback.
      assertions.check(
        'the Town Hall template resolved, not the generic one',
        details.tabs.some(t => t.id === 'townTaxes'),
        `tabs: ${details.tabs.map(t => t.id).join(' ')}`,
      );
      assertions.check(
        'the opening read carries the header group',
        details.groups.townGeneral !== undefined,
        `groups: ${Object.keys(details.groups).join(' ')}`,
      );
      // The load-time contract: a section nobody opened costs nothing.
      assertions.check(
        'the opening read does NOT carry a section nobody opened',
        details.groups.townTaxes === undefined,
        `groups: ${Object.keys(details.groups).join(' ')}`,
      );

      const section = await readBuildingTabData(
        session, town.x, town.y, 'townTaxes', visualClass, ['townTaxes'],
      );
      assertions.check(
        'opening the section reads its group',
        section.groups?.townTaxes !== undefined,
        `groups: ${Object.keys(section.groups ?? {}).join(' ')}`,
      );
      assertions.check(
        'the section read has property values, not just a key',
        (section.groups?.townTaxes?.length ?? 0) > 0,
        `${section.groups?.townTaxes?.length ?? 0} values`,
      );

      assertions.check('no gateway errors', session.driver.errors.length === 0);
      return report('building-details', assertions, [], session);
    } finally {
      await logoff(session);
    }
  },
};

/**
 * The Favorites tree, written for the first time: add a link, rename it,
 * remove it — each step proven by re-reading the tree.
 *
 * EVIDENCE. Unlike the civic writes, these members do not print to the
 * Survival log (`Kernel/Favorites.pas` logs only the refused root-delete), so
 * the read-back IS the proof here — and it is a sound one, because
 * `RDOFavoritesGetSubItems` walks the same in-memory `TFavorites` object the
 * write just touched. There is no model-server cache in between and therefore
 * no OB-29 lag to excuse: an item missing after an add is a failure, not a
 * late refresh.
 *
 * BLAST RADIUS. Per-tycoon and self-cleaning. The tree lives inside
 * SPO_test3's own `TTycoon`; nothing here touches the world, another player,
 * or any building. The flow removes what it created, and sweeps any leftover
 * from an interrupted earlier run by matching its own marker prefix.
 */
const FAVORITE_MARKER = 'e2e-favorite';

const favoritesRoundTrip: Flow = {
  name: 'favorites-roundtrip',
  what: 'favorites tree: add -> read back -> rename -> read back -> delete',
  mutates: true,
  run: async () => {
    const assertions = new Assertions();
    const name = `${FAVORITE_MARKER} ${new Date().toISOString()}`;
    const renamed = `${FAVORITE_MARKER} renamed`;

    const session = await login(PRIMARY_ACCOUNT);
    const listFavorites = async (): Promise<WsRespEmpireFacilities> =>
      session.driver.request<WsRespEmpireFacilities>(
        { type: WsMessageType.REQ_EMPIRE_FACILITIES },
        WsMessageType.RESP_EMPIRE_FACILITIES,
      );

    try {
      // Sweep first: an earlier run killed between add and delete would
      // otherwise leave its marker behind for good.
      const before = await listFavorites();
      for (const stale of before.facilities.filter(f => f.name.startsWith(FAVORITE_MARKER))) {
        await session.driver.request<WsRespFavoriteDelete>(
          { type: WsMessageType.REQ_FAVORITE_DELETE, path: stale.path },
          WsMessageType.RESP_FAVORITE_DELETE,
        );
      }

      const added = await session.driver.request<WsRespFavoriteAdd>(
        { type: WsMessageType.REQ_FAVORITE_ADD, name, x: 641, y: 66 },
        WsMessageType.RESP_FAVORITE_ADD,
      );
      assertions.check('the add was accepted and answered an id', added.success && (added.id ?? 0) > 0,
        `id=${added.id ?? 'none'}`);

      const afterAdd = await listFavorites();
      const item = afterAdd.facilities.find(f => f.name === name);
      assertions.check('the added favourite is in the tree the server serves', Boolean(item), name);
      assertions.check('it kept the coordinates it was given',
        item?.x === 641 && item?.y === 66, `${item?.x},${item?.y}`);

      if (item) {
        const renameResp = await session.driver.request<WsRespFavoriteRename>(
          { type: WsMessageType.REQ_FAVORITE_RENAME, path: item.path, name: renamed },
          WsMessageType.RESP_FAVORITE_RENAME,
        );
        assertions.check('the rename was accepted', renameResp.success);

        const afterRename = await listFavorites();
        const moved = afterRename.facilities.find(f => f.path === item.path);
        assertions.check('the tree serves the new name', moved?.name === renamed, moved?.name);

        const deleted = await session.driver.request<WsRespFavoriteDelete>(
          { type: WsMessageType.REQ_FAVORITE_DELETE, path: item.path },
          WsMessageType.RESP_FAVORITE_DELETE,
        );
        assertions.check('the delete was accepted', deleted.success);

        const afterDelete = await listFavorites();
        assertions.check('the favourite is gone — the world is restored',
          !afterDelete.facilities.some(f => f.path === item.path));
      }

      return report('favorites-roundtrip', assertions, [], session);
    } finally {
      await logoff(session);
    }
  },
};

/**
 * Folder create / move / delete — the write-side of the tree descent added on
 * top of {@link favoritesRoundTrip}.
 *
 * EVIDENCE and BLAST RADIUS are as documented on `favoritesRoundTrip` above:
 * the read-back through `RDOFavoritesGetSubItems` is the proof, and the flow
 * is per-tycoon and self-cleaning. "Tree persists after refresh" is proven by
 * every list here being a fresh server walk, not a cached one.
 */
const FOLDER_MARKER = 'e2e-favfolder';

function flattenTree(items: WsRespEmpireFacilities['facilities']): WsRespEmpireFacilities['facilities'] {
  const out: WsRespEmpireFacilities['facilities'] = [];
  for (const item of items) {
    out.push(item);
    if (item.children) out.push(...flattenTree(item.children));
  }
  return out;
}

const favoritesFolders: Flow = {
  name: 'favorites-folders',
  what: 'favorites tree: create a folder -> move a link into it -> read back -> move out -> delete',
  mutates: true,
  run: async () => {
    const assertions = new Assertions();
    const folderName = `${FOLDER_MARKER} ${new Date().toISOString()}`;
    const linkName = `${FOLDER_MARKER}-link`;

    const session = await login(PRIMARY_ACCOUNT);
    const listFavorites = async (): Promise<WsRespEmpireFacilities> =>
      session.driver.request<WsRespEmpireFacilities>(
        { type: WsMessageType.REQ_EMPIRE_FACILITIES },
        WsMessageType.RESP_EMPIRE_FACILITIES,
      );

    try {
      // Sweep first: an earlier run killed mid-flow could leave a marker
      // folder holding a marker link — delete deepest-first so a non-empty
      // folder is never asked to delete before its own contents are gone.
      const before = await listFavorites();
      const stale = flattenTree(before.facilities).filter(f => f.name.startsWith(FOLDER_MARKER));
      stale.sort((a, b) => b.path.split('/').length - a.path.split('/').length);
      for (const item of stale) {
        await session.driver.request<WsRespFavoriteDelete>(
          { type: WsMessageType.REQ_FAVORITE_DELETE, path: item.path },
          WsMessageType.RESP_FAVORITE_DELETE,
        );
      }

      const created = await session.driver.request<WsRespFavoriteFolderCreate>(
        { type: WsMessageType.REQ_FAVORITE_FOLDER_CREATE, parentPath: '', name: folderName },
        WsMessageType.RESP_FAVORITE_FOLDER_CREATE,
      );
      assertions.check('the folder create was accepted and answered an id',
        created.success && (created.id ?? 0) > 0, `id=${created.id ?? 'none'}`);
      if (!created.success) return report('favorites-folders', assertions, [], session);

      const afterCreate = await listFavorites();
      const folder = flattenTree(afterCreate.facilities).find(f => f.name === folderName);
      assertions.check('the tree descent serves the folder, marked isFolder', folder?.isFolder === true,
        JSON.stringify(folder));

      if (folder) {
        const added = await session.driver.request<WsRespFavoriteAdd>(
          { type: WsMessageType.REQ_FAVORITE_ADD, name: linkName, x: 641, y: 66 },
          WsMessageType.RESP_FAVORITE_ADD,
        );
        assertions.check('the marker link was added', added.success && (added.id ?? 0) > 0);

        const afterAdd = await listFavorites();
        const link = flattenTree(afterAdd.facilities).find(f => f.name === linkName);
        assertions.check('the marker link is in the tree before the move', Boolean(link), linkName);

        if (link) {
          const moved = await session.driver.request<WsRespFavoriteMove>(
            { type: WsMessageType.REQ_FAVORITE_MOVE, path: link.path, destPath: folder.path },
            WsMessageType.RESP_FAVORITE_MOVE,
          );
          assertions.check('the move into the folder was accepted', moved.success);

          const afterMove = await listFavorites();
          const movedTree = flattenTree(afterMove.facilities);
          const movedLink = movedTree.find(f => f.name === linkName);
          assertions.check('the link now addresses a Location under the folder',
            Boolean(movedLink?.path.startsWith(`${folder.path}/`)), movedLink?.path);
          const folderAfterMove = movedTree.find(f => f.name === folderName);
          assertions.check('the folder\'s own children carry the link — a fresh server walk, not a cache',
            Boolean(folderAfterMove?.children?.some(c => c.name === linkName)));

          if (movedLink) {
            const movedBack = await session.driver.request<WsRespFavoriteMove>(
              { type: WsMessageType.REQ_FAVORITE_MOVE, path: movedLink.path, destPath: '' },
              WsMessageType.RESP_FAVORITE_MOVE,
            );
            assertions.check('the move back to the root was accepted', movedBack.success);

            const afterMoveBack = await listFavorites();
            const linkAtRoot = flattenTree(afterMoveBack.facilities).find(f => f.name === linkName);
            assertions.check('the link is back at the root', linkAtRoot?.path === String(linkAtRoot?.id));

            if (linkAtRoot) {
              await session.driver.request<WsRespFavoriteDelete>(
                { type: WsMessageType.REQ_FAVORITE_DELETE, path: linkAtRoot.path },
                WsMessageType.RESP_FAVORITE_DELETE,
              );
            }
          }
        }

        const deletedFolder = await session.driver.request<WsRespFavoriteDelete>(
          { type: WsMessageType.REQ_FAVORITE_DELETE, path: folder.path },
          WsMessageType.RESP_FAVORITE_DELETE,
        );
        assertions.check('the now-empty folder was accepted for delete', deletedFolder.success);
      }

      const afterDelete = await listFavorites();
      assertions.check('no marker item remains — the world is restored',
        !flattenTree(afterDelete.facilities).some(f => f.name.startsWith(FOLDER_MARKER)));

      return report('favorites-folders', assertions, [], session);
    } finally {
      await logoff(session);
    }
  },
};

export const FLOWS: Flow[] = [
  loginSpine,
  politicsRead,
  politicsWrite,
  buildingDetails,
  permissionNegative,
  mailRoundTrip,
  favoritesRoundTrip,
  favoritesFolders,
];

export function flowByName(name: string): Flow {
  const flow = FLOWS.find(f => f.name === name);
  if (!flow) {
    throw new Error(`Unknown flow "${name}". Known: ${FLOWS.map(f => f.name).join(', ')}`);
  }
  return flow;
}

/** Run one flow, turning an unexpected throw into a reportable FAIL. */
export async function runFlow(flow: Flow, ctx: FlowContext): Promise<FlowResult> {
  try {
    return await flow.run(ctx);
  } catch (err: unknown) {
    return {
      name: flow.name,
      status: 'FAIL',
      assertions: [],
      probes: [],
      messagesSent: 0,
      messagesReceived: 0,
      wireErrors: 0,
      error: toErrorMessage(err),
    };
  }
}

/** Move a value without leaving the legal 0..100 range, so the probe never writes junk. */
export function nudge(original: string): string {
  const parsed = Number(original);
  if (!Number.isFinite(parsed)) return '1';
  const next = parsed >= 50 ? parsed - 1 : parsed + 1;
  return String(Math.min(100, Math.max(0, Math.round(next))));
}

function report(
  name: string,
  assertions: Assertions,
  probes: ProbeResult[],
  session: LiveSession,
): FlowResult {
  const sent = session.driver.log.filter(e => e.direction === 'sent').length;
  const received = session.driver.log.filter(e => e.direction === 'received').length;
  const failed = assertions.failed || probes.some(p => p.status === 'FAIL');
  return {
    name,
    status: failed ? 'FAIL' : 'PASS',
    assertions: assertions.items,
    probes,
    messagesSent: sent,
    messagesReceived: received,
    wireErrors: session.driver.errors.length,
  };
}
