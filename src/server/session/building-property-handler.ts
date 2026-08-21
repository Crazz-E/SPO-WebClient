/**
 * Building property handler — extracted from StarpeaceSession.
 *
 * Public functions: setBuildingProperty
 * Module-private helpers: buildRdoCommandArgs, mapRdoCommandToPropertyName
 */

import type { SessionContext } from './session-context';
import { RdoValue } from '../../shared/rdo-types';
import { rdoCall, rdoSet } from '../../shared/rdo-frame';
import { isCataloguedRdoMember } from '../../shared/rdo-members';
import type { RdoMemberName } from '../../shared/rdo-members';
import { TimeoutCategory } from '../../shared/timeout-categories';
import { toErrorMessage } from '../../shared/error-utils';
import { writeRdoFrame } from '../rdo-helpers';
import { serialiseConstruction } from './construction-lock';

/**
 * Every command `buildRdoCommandArgs` knows how to build arguments for.
 *
 * Kept in lockstep with that switch: a name here with no `case` produces a
 * command with no arguments, and a `case` missing here is rejected before it
 * ever reaches the switch. Adding a command means touching both.
 *
 * This exists because the fallback branch used to forward anything at all
 * (M-D), which turned a mapping bug into a silent no-op on the wire.
 */
export const KNOWN_RDO_COMMANDS: ReadonlySet<string> = new Set([
  'RDOAcceptCloning', 'RDOAutoProduce', 'RDOAutoRelease', 'RDOBanMinister',
  'RDOCacncelTransc', 'RDOCancelMovie', 'RDOCancelResearch', 'RDOConnectInput',
  'RDOConnectOutput', 'RDOConnectToTycoon', 'RDODisconnectFromTycoon',
  'RDODisconnectInput', 'RDODisconnectOutput', 'RDOLaunchMovie',
  'RDOQueueResearch', 'RDOReleaseMovie', 'RDOSelSelected', 'RDOSelectWare',
  'RDOSetCompanyInputDemand', 'RDOSetInputFluidPerc',
  'RDOSetInputMaxPrice', 'RDOSetInputMinK', 'RDOSetInputOverPrice',
  'RDOSetInputSortMode', 'RDOSetLoanPerc', 'RDOSetMinSalaryValue',
  'RDOSetMinistryBudget', 'RDOSetOutputPrice', 'RDOSetPrice', 'RDOSetRole',
  'RDOSetSalaries', 'RDOSetTaxValue', 'RDOSetTownTaxes', 'RDOSetTradeLevel',
  'RDOSetWordsOfWisdom', 'RDOSitMayor', 'RDOSitMinister', 'RDOVote',
  'RdoRepair', 'RdoStopRepair',
]);
// `RDOVoteOf` is deliberately NOT here: it is a `function`
// (Kernel/TownPolitics.pas:47), and every command on this list is emitted with
// the `"*"` separator, which on a function is the arbitrary-write form. Its one
// legitimate use is the `"^"` read in building-details-handler.ts:938.

/**
 * Narrow a runtime-chosen name to a catalogued member.
 *
 * `isCataloguedRdoMember` is a type guard, so this is what lets the emitter keep
 * an `RdoMemberName` parameter without a cast at the two sites that choose their
 * member at run time. The name still comes from the browser; nothing here
 * assumes otherwise.
 */
function assertCallable(name: string): asserts name is RdoMemberName {
  if (!isCataloguedRdoMember(name)) {
    throw new Error(`Unknown building property command "${name}" — not in RDO_MEMBERS.`);
  }
}

function assertSettable(name: string): asserts name is RdoMemberName {
  if (!isCataloguedRdoMember(name)) {
    throw new Error(`Unknown settable building property "${name}" — not in RDO_MEMBERS.`);
  }
}

/**
 * A property assignment takes exactly one value.
 *
 * `RdoCommand.set().args(a, b)` used to throw for the same reason (rdo-types.ts,
 * P-L5); `rdoSet` takes a single `RdoValue`, so the check moves here rather than
 * disappearing.
 */
function onlyArg(member: string, args: RdoValue[]): RdoValue {
  if (args.length !== 1) {
    throw new Error(
      `RDO set ${member} needs exactly one value, got ${args.length}; the grammar ` +
      `has room for one and the rest would be dropped silently.`
    );
  }
  return args[0];
}

// =========================================================================
// PUBLIC — setBuildingProperty
// =========================================================================

export function setBuildingProperty(
  ctx: SessionContext,
  x: number,
  y: number,
  propertyName: string,
  value: string,
  additionalParams?: Record<string, string>
): Promise<{ success: boolean; newValue: string; confirmed?: boolean }> {
  return serialiseConstruction(ctx, () => setBuildingPropertyImpl(ctx, x, y, propertyName, value, additionalParams));
}

async function setBuildingPropertyImpl(
  ctx: SessionContext,
  x: number,
  y: number,
  propertyName: string,
  value: string,
  additionalParams?: Record<string, string>
): Promise<{ success: boolean; newValue: string; confirmed?: boolean }> {
  ctx.log.debug(`[BuildingDetails] Setting ${propertyName}=${value} at (${x}, ${y})`);

  try {
    // Connect to construction service (establishes worldId and RDOLogonClient)
    await ctx.connectConstructionService();
    if (!ctx.worldId) {
      throw new Error('Construction service not initialized - worldId is null');
    }

    // Get the building's CurrBlock and ObjectId via map service.
    // For most buildings ObjectId === CurrBlock, but warehouses differ:
    // output/input gate commands (RDOSetOutputPrice, etc.) must target ObjectId.
    await ctx.connectMapService();
    const tempObjectId = await ctx.cacherCreateObject();
    let currBlock: string;
    let objectId: string;

    try {
      await ctx.cacherSetObject(tempObjectId, x, y);
      const values = await ctx.cacherGetPropertyList(tempObjectId, ['CurrBlock', 'ObjectId']);
      currBlock = values[0];
      objectId = values[1] || currBlock; // fallback for buildings where ObjectId is absent

      if (!currBlock) {
        throw new Error(`No CurrBlock found for building at (${x}, ${y})`);
      }

      ctx.log.debug(`[BuildingDetails] Found CurrBlock: ${currBlock}, ObjectId: ${objectId} for building at (${x}, ${y})`);
    } finally {
      await ctx.cacherCloseObject(tempObjectId);
    }

    // For RDOSetTaxValue, resolve row index -> actual TaxId from building properties
    // Voyager: TownTaxesSheet.pas — TaxId comes from Tax[idx].Id, not the row index
    if (propertyName === 'RDOSetTaxValue' && additionalParams?.index && !additionalParams.taxId) {
      const lookupObjectId = await ctx.cacherCreateObject();
      try {
        await ctx.cacherSetObject(lookupObjectId, x, y);
        const taxIdProp = `Tax${additionalParams.index}Id`;
        const [taxId] = await ctx.cacherGetPropertyList(lookupObjectId, [taxIdProp]);
        if (taxId) {
          additionalParams.taxId = taxId;
          ctx.log.debug(`[BuildingDetails] Resolved ${taxIdProp}=${taxId} for RDOSetTaxValue`);
        }
      } finally {
        await ctx.cacherCloseObject(lookupObjectId);
      }
    }

    // For RDOSetMinistryBudget, resolve row index -> actual MinistryId from building properties
    // Voyager: MinisteriesSheet.pas — MinistryId comes from MinistryId[idx], not the row index
    if (propertyName === 'RDOSetMinistryBudget' && additionalParams?.index && !additionalParams.ministryId) {
      const lookupObjectId = await ctx.cacherCreateObject();
      try {
        await ctx.cacherSetObject(lookupObjectId, x, y);
        const ministryIdProp = `MinistryId${additionalParams.index}`;
        const [ministryId] = await ctx.cacherGetPropertyList(lookupObjectId, [ministryIdProp]);
        if (ministryId) {
          additionalParams.ministryId = ministryId;
          ctx.log.debug(`[BuildingDetails] Resolved ${ministryIdProp}=${ministryId} for RDOSetMinistryBudget`);
        }
      } finally {
        await ctx.cacherCloseObject(lookupObjectId);
      }
    }

    // Build the RDO command arguments based on the command type
    const rdoArgs = buildRdoCommandArgs(ctx, propertyName, value, additionalParams);

    // Published properties that use SET verb (not CALL) on CurrBlock.
    // These are Delphi published properties accessed via RTTI, not methods.
    const RDO_SET_PROPERTIES: ReadonlySet<string> = new Set([
      'RDOAcceptCloning', // TBlock.RDOAcceptCloning — boolean, Kernel.pas:1304
    ]);

    // Fire-and-forget commands always use "*" (VoidId) separator — matching Delphi
    // Send() with timeout=0. The "^" (VariantId) separator is forbidden without a RID:
    // it tells the server to route a response, but with no RID the server crashes.
    // "^" is only valid in the synchronous path (sendRdoRequest with RID).
    // Ref: RDOQueryServer.pas:419-454 — server parses params identically for both separators.
    // Ref: Live capture: RDODisconnectInput "*" "%Plastics","%706,436,"

    // Output/input gate commands bind to ObjectId, not CurrBlock.
    // For warehouses these differ; for other buildings they are equal.
    // RDOSetOutputPrice BindTo: objectId (direct)
    const RDO_OBJECTID_COMMANDS: ReadonlySet<string> = new Set([
      'RDOSetOutputPrice', 'RDOSetInputOverPrice', 'RDOSetInputMaxPrice', 'RDOSetInputMinK',
      'RDOConnectInput', 'RDODisconnectInput', 'RDOConnectOutput', 'RDODisconnectOutput',
      'RDOConnectToTycoon', 'RDODisconnectFromTycoon',
    ]);

    // Connection commands: synchronous — we wait for the ack, because Delphi
    // recalculates trade routes on connect and that takes 5-30s.
    //
    // Waiting is NOT what picks the separator, and conflating the two is what
    // put "^" here. In the legacy client the separator depends only on whether
    // the call site consumes a return value (RDOObjectProxy.pas:438-440), while
    // WaitForAnswer only sets fTimeOut (:441-443). `MSProxy.RDOConnectInput(...)`
    // is a statement, so RetValue stays varEmpty and RDOMarshalers.pas:213-217
    // emits VoidId. Both members are `procedure` (Kernel/Kernel.pas:1077-1078),
    // so "^" made the server push a result pointer they never pop — the SayThis
    // freeze, on every supply-chain connect. Keep the wait, use "*".
    //
    // Disconnect commands remain fire-and-forget (Delphi: WaitForAnswer:=false).
    // RDOConnectToTycoon: fire-and-forget (Delphi WHGeneralSheet.pas:386 — no WaitForAnswer)
    const SYNCHRONOUS_RDO_COMMANDS: ReadonlySet<string> = new Set([
      'RDOConnectOutput', 'RDOConnectInput',
    ]);

    // --- Helper: send fire-and-forget command via construction socket ---
    const fireAndForget = (cmd: string): void => {
      const socket = ctx.getSocket('construction');
      if (!socket) throw new Error('Construction socket unavailable');
      writeRdoFrame(socket, cmd);
      ctx.log.debug(`[BuildingDetails] Sent: ${cmd}`);
    };

    if (propertyName === 'property' && additionalParams?.propertyName) {
      // Direct property set: use SET verb.
      //
      // The member name is chosen at runtime, but the set of names it can take
      // is closed: `resolveRdoCommand` (property-utils.ts:32) is its only
      // producer, and it draws from the hand-written `rdoCommands` tables of
      // template-groups.ts. CLASSES.BIN picks WHICH of those groups a building
      // shows (property-templates.ts:55-121); it never adds a name. The eight
      // reachable names are catalogued in shared/rdo-members.ts, which carries
      // the full reasoning.
      //
      // The guard is what narrows `string` to `RdoMemberName`, so the runtime
      // check and the compiler's check are the same check — no cast.
      const actualPropName = additionalParams.propertyName;
      assertSettable(actualPropName);
      fireAndForget(rdoSet(actualPropName, currBlock, onlyArg(actualPropName, rdoArgs)).toFrame());
      await new Promise(resolve => setTimeout(resolve, 200));
    } else if (RDO_SET_PROPERTIES.has(propertyName)) {
      // Published property: use SET verb (not CALL)
      assertSettable(propertyName);
      fireAndForget(rdoSet(propertyName, currBlock, onlyArg(propertyName, rdoArgs)).toFrame());
      await new Promise(resolve => setTimeout(resolve, 200));
    } else if (SYNCHRONOUS_RDO_COMMANDS.has(propertyName)) {
      // Synchronous — wait for server response (matches Delphi WaitForAnswer:=true)
      const target = RDO_OBJECTID_COMMANDS.has(propertyName) ? objectId : currBlock;
      assertCallable(propertyName);
      await ctx.sendRdoRequest('construction', rdoCall(
        propertyName, target, ...rdoArgs,
      ).packet, undefined, TimeoutCategory.SLOW);
      ctx.log.debug(`[BuildingDetails] Synchronous ${propertyName} completed`);
    } else {
      // M-D: this branch used to accept ANY propertyName and put it on the wire
      // verbatim. That silent fallback did two things: it masked M-C (the
      // workforce editor emits `Salaries0`, which resolveRdoCommand cannot map
      // because the mapping is flagged `allSalaries`, not `indexed` — so it
      // arrived here and was sent as `call Salaries0`, a member the server does
      // not publish), and it handed a browser-controlled string straight to the
      // frame builder, which is the reachable half of P-H3.
      //
      // An unmapped name is a bug on our side, not a command. Say so.
      if (!KNOWN_RDO_COMMANDS.has(propertyName)) {
        throw new Error(
          `Unknown building property command "${propertyName}" — not in KNOWN_RDO_COMMANDS. ` +
          `It was previously sent to the server verbatim, which silently did nothing.`
        );
      }

      // Fire-and-forget RDO method call — no RID, no response expected.
      // Always use "*" (VoidId) — "^" without RID crashes the Delphi server.
      const target = RDO_OBJECTID_COMMANDS.has(propertyName) ? objectId : currBlock;
      assertCallable(propertyName);
      fireAndForget(rdoCall(propertyName, target, ...rdoArgs).toFrame());
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    // Extract property name from RDO command for verification. `null` means the
    // command has no witness property — reading one anyway would invent a
    // verdict, so skip the round-trip entirely and report `confirmed:
    // undefined`, which the client reads as "nothing contradicts the write".
    const propertyToRead = mapRdoCommandToPropertyName(ctx, propertyName, additionalParams);
    if (propertyToRead === null) {
      ctx.log.debug(`[BuildingDetails] ${propertyName} has no read-back property — reporting unconfirmed`);
      return { success: true, newValue: '', confirmed: undefined };
    }

    // Read back the new value via map service to confirm the change
    const verifyObjectId = await ctx.cacherCreateObject();
    try {
      await ctx.cacherSetObject(verifyObjectId, x, y);

      const readValues = await ctx.cacherGetPropertyList(verifyObjectId, [propertyToRead]);

      // M-E: this used to be `readValues[0] || value` — when the read-back came
      // back empty, it echoed the value we had just ASKED for. A mutation the
      // server threw away then looked exactly like one it applied, which is the
      // single worst property a confirmation step can have. Report the value the
      // server actually holds, or nothing.
      //
      // `success` still reflects "the command was issued and the round-trip did
      // not throw" — several legitimate commands (the disconnect family) have no
      // read-back property at all, and the client uses `success` to drive its
      // notifications. `confirmed` is the honest signal.
      const readBack = readValues[0];
      const confirmed = readBack !== undefined && readBack !== '';

      if (!confirmed) {
        ctx.log.warn(
          `[BuildingDetails] ${propertyName} was issued but could not be confirmed — ` +
          `read-back of "${propertyToRead}" came back empty`
        );
      } else {
        ctx.log.debug(`[BuildingDetails] Property ${propertyName} confirmed at ${readBack}`);
      }

      return { success: true, newValue: confirmed ? readBack : '', confirmed };
    } finally {
      await ctx.cacherCloseObject(verifyObjectId);
    }

  } catch (e: unknown) {
    ctx.log.error(`[BuildingDetails] Failed to set property: ${toErrorMessage(e)}`);
    return { success: false, newValue: '' };
  }
}

// =========================================================================
// MODULE-PRIVATE — buildRdoCommandArgs
// =========================================================================

/**
 * Build RDO command arguments based on command type
 * Uses RdoValue for type-safe argument formatting
 *
 * Examples:
 * - RDOSetPrice(index=0, value=220) -> "#0","#220"
 * - RDOSetSalaries(sal0=100, sal1=120, sal2=150) -> "#100","#120","#150"
 * - RDOSetCompanyInputDemand(index=0, ratio=75) -> "#0","#75"
 * - RDOSetInputMaxPrice(metaFluid=5, maxPrice=500) -> "#5","#500"
 * - RDOSetInputMinK(metaFluid=5, minK=10) -> "#5","#10"
 */
function buildRdoCommandArgs(
  ctx: SessionContext,
  rdoCommand: string,
  value: string,
  additionalParams?: Record<string, string>
): RdoValue[] {
  const params = additionalParams || {};
  const args: RdoValue[] = [];

  switch (rdoCommand) {
    case 'RDOSetPrice': {
      // Args: index of srvPrices (e.g., #0), new value
      const index = parseInt(params.index || '0', 10);
      const price = parseInt(value, 10);
      args.push(RdoValue.int(index), RdoValue.int(price));
      break;
    }

    case 'RDOSetSalaries': {
      // Args: Salaries0, Salaries1, Salaries2 — the server takes all three at
      // once, so editing one salary means resending the other two unchanged.
      //
      // M-C: the fallback used to be `params.salaryN || value`, which silently
      // set ALL THREE salaries to the one the user had just typed. That is worse
      // than failing: the two untouched salaries were overwritten without any
      // indication. If the caller has not supplied the full triplet, refuse.
      const missing = ['salary0', 'salary1', 'salary2'].filter(k => params[k] === undefined);
      if (missing.length > 0) {
        throw new Error(
          `RDOSetSalaries needs all three salaries (missing: ${missing.join(', ')}). ` +
          `The server writes the whole triplet; defaulting the absent ones to the ` +
          `edited value would silently overwrite the other two.`
        );
      }
      args.push(
        RdoValue.int(parseInt(params.salary0, 10)),
        RdoValue.int(parseInt(params.salary1, 10)),
        RdoValue.int(parseInt(params.salary2, 10)),
      );
      break;
    }

    case 'RDOSetCompanyInputDemand': {
      // Args: index of cInput, new ratio (cInputDem * 100 / cInputMax) without %
      const index = parseInt(params.index || '0', 10);
      const ratio = parseInt(value, 10);
      args.push(RdoValue.int(index), RdoValue.int(ratio));
      break;
    }

    case 'RDOSetInputMaxPrice': {
      // Args: MetaFluid (WideString), new MaxPrice value (integer)
      // Voyager: SupplySheetForm.pas — Proxy.RDOSetInputMaxPrice(fCurrFluidId, maxPrice)
      const fluidId = params.fluidId || params.metaFluid;
      if (!fluidId) {
        throw new Error('RDOSetInputMaxPrice requires fluidId parameter');
      }
      args.push(RdoValue.string(fluidId), RdoValue.int(parseInt(value, 10)));
      break;
    }

    case 'RDOSetInputMinK': {
      // Args: MetaFluid (WideString), new minK value (integer)
      // Voyager: SupplySheetForm.pas — Proxy.RDOSetInputMinK(fCurrFluidId, minK)
      const fluidId = params.fluidId || params.metaFluid;
      if (!fluidId) {
        throw new Error('RDOSetInputMinK requires fluidId parameter');
      }
      args.push(RdoValue.string(fluidId), RdoValue.int(parseInt(value, 10)));
      break;
    }

    case 'RDOSetTradeLevel':
    case 'RDOSetRole':
    case 'RDOSetLoanPerc': {
      // Single integer argument
      args.push(RdoValue.int(parseInt(value, 10)));
      break;
    }

    case 'RDOSetTaxValue': {
      // Args: TaxId (integer), percentage (widestring)
      // Voyager: TownTaxesSheet.pas — MSProxy.RDOSetTaxValue(TaxId, valueString)
      // TaxId is the actual tax identifier (100, 110, 120...), resolved from Tax{idx}Id
      const taxId = parseInt(params.taxId || params.index || '0', 10);
      args.push(RdoValue.int(taxId), RdoValue.string(value));
      break;
    }

    case 'RDOAutoProduce':
    case 'RDOAutoRelease': {
      // Boolean as WordBool (#-1 = true, #0 = false)
      const boolVal = parseInt(value, 10) !== 0 ? -1 : 0;
      args.push(RdoValue.int(boolVal));
      break;
    }

    case 'RDOSetOutputPrice': {
      // Args: fluidId (widestring), price (integer)
      // Voyager: ProdSheetForm.pas line 567 — Proxy.RDOSetOutputPrice(fCurrFluidId, price)
      const fluidId = params.fluidId;
      if (!fluidId) {
        throw new Error('RDOSetOutputPrice requires fluidId parameter');
      }
      args.push(RdoValue.string(fluidId), RdoValue.int(parseInt(value, 10)));
      break;
    }

    case 'RDOConnectInput':
    case 'RDODisconnectInput': {
      // Args: fluidId (widestring), connectionList (widestring "x1,y1,x2,y2,...")
      // Voyager: SupplySheetForm.pas line 295/418
      const fluidId = params.fluidId;
      const connectionList = params.connectionList;
      if (!fluidId || !connectionList) {
        throw new Error(`${rdoCommand} requires fluidId and connectionList parameters`);
      }
      args.push(RdoValue.string(fluidId), RdoValue.string(connectionList));
      break;
    }

    case 'RDOConnectOutput':
    case 'RDODisconnectOutput': {
      // Args: fluidId (widestring), connectionList (widestring "x1,y1,x2,y2,...")
      // Voyager: ProdSheetForm.pas line 265/363
      const fluidId = params.fluidId;
      const connectionList = params.connectionList;
      if (!fluidId || !connectionList) {
        throw new Error(`${rdoCommand} requires fluidId and connectionList parameters`);
      }
      args.push(RdoValue.string(fluidId), RdoValue.string(connectionList));
      break;
    }

    case 'RDOSetInputOverPrice': {
      // Args: fluidId (widestring), index (integer), overprice (integer)
      // Voyager: SupplySheetForm.pas line 435
      const fluidId = params.fluidId;
      const index = params.index;
      if (!fluidId || index === undefined) {
        throw new Error('RDOSetInputOverPrice requires fluidId and index parameters');
      }
      args.push(RdoValue.string(fluidId), RdoValue.int(parseInt(index, 10)), RdoValue.int(parseInt(value, 10)));
      break;
    }

    case 'RDOSetInputSortMode': {
      // Args: fluidId (widestring), mode (integer: 0=cost, 1=quality)
      // Voyager: SupplySheetForm.pas line 722
      const fluidId = params.fluidId;
      if (!fluidId) {
        throw new Error('RDOSetInputSortMode requires fluidId parameter');
      }
      args.push(RdoValue.string(fluidId), RdoValue.int(parseInt(value, 10)));
      break;
    }

    case 'RDOSelSelected': {
      // Args: boolean as WordBool (#-1 = true, #0 = false)
      // Voyager: SupplySheetForm.pas line 699
      const boolVal = parseInt(value, 10) !== 0 ? -1 : 0;
      args.push(RdoValue.int(boolVal));
      break;
    }

    case 'RDOConnectToTycoon':
    case 'RDODisconnectFromTycoon': {
      // Args: tycoonId (integer), kind (integer), flag (wordbool = true)
      // Voyager: WHGeneralSheet.pas:393 / IndustryGeneralSheet.pas:345,357
      //
      // The first argument is the MODEL SERVER POINTER to the TTycoon, not the
      // persistent tycoon id. The handler dereferences it on the spot —
      // `Tycoon := TTycoon(pointer(TycoonId))` (Kernel/Kernel.pas:4534) — so the
      // two ids are NOT interchangeable, and the wrong one is not an error the
      // server reports. It raises an access violation that the handler's own
      // `try..except` swallows (Kernel.pas:4576-4578): the call becomes a silent
      // no-op, the client is told nothing, and the button appears dead.
      //
      // Which id the reference client sends, end to end:
      //   Voyager passes `GetClientView.getTycoonId` (WHGeneralSheet.pas:393)
      //   -> returns fTycoonId (ServerCnxHandler.pas:2419-2421)
      //   -> set from the InitClient push (ServerCnxHandler.pas:516), whose 4th
      //      argument is fTycoonProxyId (InterfaceServer.pas:1835,1910,2310)
      //   -> assigned from RDOGetTycoon (InterfaceServer.pas:3196,3225)
      //   -> which returns `integer(Tycoon)` (Kernel/World.pas:3827). A pointer.
      //
      // `ctx.tycoonId` is the OTHER id and must not be used here: it is
      // ClientView.TycoonId (InterfaceServer.pas:128) = `fTycoonProxy.Id`
      // (:3237), i.e. the persistent TTycoon.Id. It is the right id for the
      // Interface Server calls that take one (GetTycoonCookie, SetTycoonCookie,
      // CloneFacility, PickEvent), and the wrong one for every model-server
      // member that dereferences. Compare road-handler.ts:164,323,384, which
      // already sends fTycoonProxyId for the same reason.
      //
      // No browser-supplied override here: nothing produces one today, and the
      // whole point of this argument is that only the session knows it.
      const tycoonProxyId = ctx.fTycoonProxyId;
      const kind = params.kind;
      if (tycoonProxyId === null) {
        throw new Error(
          `${rdoCommand} requires the tycoon proxy id from the InitClient push, ` +
          `which has not arrived on this session yet`
        );
      }
      if (!kind) {
        throw new Error(`${rdoCommand} requires kind parameter`);
      }
      args.push(RdoValue.int(tycoonProxyId), RdoValue.int(parseInt(kind, 10)), RdoValue.int(-1));
      break;
    }

    case 'RDOAcceptCloning': {
      // Args: boolean as WordBool (#-1 = true, #0 = false)
      // Voyager: ManagementSheet.pas — toggle cloning acceptance
      const boolVal = parseInt(value, 10) !== 0 ? -1 : 0;
      args.push(RdoValue.int(boolVal));
      break;
    }

    // CloneFacility removed — now uses dedicated cloneFacility() method on ClientView

    case 'RDOSetMinSalaryValue': {
      // Args: levelIndex (integer: 0=hi, 1=mid, 2=lo), value (integer)
      // Voyager: TownHallJobsSheet.pas — Proxy.RDOSetMinSalaryValue(Sender.Tag, Value)
      const levelIndex = params.levelIndex || '0';
      args.push(RdoValue.int(parseInt(levelIndex, 10)), RdoValue.int(parseInt(value, 10)));
      break;
    }

    case 'RDOLaunchMovie': {
      // Args: name (widestring), budget (double), months (integer), autoInfo (word bitmask)
      // MovieStudios.pas — flgAutoRelease=$01 (bit0), flgAutoProduce=$02 (bit1)
      const filmName = params.filmName || '';
      const budget = params.budget || '1000000';
      const months = params.months || '12';
      const autoRelBit = parseInt(params.autoRel || '0', 10) !== 0 ? 1 : 0;
      const autoProdBit = parseInt(params.autoProd || '0', 10) !== 0 ? 1 : 0;
      const autoInfo = autoRelBit | (autoProdBit << 1);
      args.push(
        RdoValue.string(filmName),
        RdoValue.double(parseFloat(budget)),
        RdoValue.int(parseInt(months, 10)),
        RdoValue.int(autoInfo)
      );
      break;
    }

    case 'RDOCancelMovie':
    case 'RDOReleaseMovie': {
      // Args: dummy integer (always 0)
      // Voyager: FilmsSheet.pas lines 330/350 — Proxy.RDOCancelMovie(0) / RDOReleaseMovie(0)
      args.push(RdoValue.int(0));
      break;
    }

    case 'RDOSetMinistryBudget': {
      // Args: MinId (integer), Budget (widestring)
      // Voyager: MinisteriesSheet.pas line 251 — Proxy.RDOSetMinistryBudget(MinId, Budget)
      const minId = parseInt(params.ministryId || '0', 10);
      args.push(RdoValue.int(minId), RdoValue.string(value));
      break;
    }

    case 'RDOBanMinister': {
      // Args: MinId (integer)
      // Voyager: MinisteriesSheet.pas line 271 — Proxy.RDOBanMinister(MinId)
      const minId = parseInt(params.ministryId || '0', 10);
      args.push(RdoValue.int(minId));
      break;
    }

    case 'RDOSitMinister': {
      // Args: MinId (integer), MinName (widestring)
      // Voyager: MinisteriesSheet.pas line 293 — Proxy.RDOSitMinister(MinId, MinName)
      const minId = parseInt(params.ministryId || '0', 10);
      const minName = params.ministerName || '';
      args.push(RdoValue.int(minId), RdoValue.string(minName));
      break;
    }

    case 'RDOQueueResearch': {
      // Args: inventionId (widestring), priority (integer, default=10)
      // Delphi: procedure RDOQueueResearch(InventionId: widestring; Priority: integer)
      const inventionId = params.inventionId || '';
      const priority = parseInt(params.priority || '10', 10);
      args.push(RdoValue.string(inventionId), RdoValue.int(priority));
      break;
    }

    case 'RDOCancelResearch': {
      // Args: inventionId (widestring)
      // Delphi: procedure RDOCancelResearch(InventionId: widestring)
      const cancelId = params.inventionId || '';
      args.push(RdoValue.string(cancelId));
      break;
    }

    case 'RdoRepair': {
      // Args: dummy integer (0)
      // Voyager: IndustryGeneralSheet.pas — Proxy.RdoRepair(0)
      args.push(RdoValue.int(0));
      break;
    }

    case 'RdoStopRepair': {
      // Args: dummy integer (0)
      // Voyager: IndustryGeneralSheet.pas — Proxy.RdoStopRepair(0)
      args.push(RdoValue.int(0));
      break;
    }

    case 'RDOSelectWare': {
      // Args: index (integer), value (integer)
      // Voyager: WHGeneralSheet.pas — Proxy.RDOSelectWare(index, value)
      const index = parseInt(params.index || '0', 10);
      args.push(RdoValue.int(index), RdoValue.int(parseInt(value, 10)));
      break;
    }

    case 'RDOSetWordsOfWisdom': {
      // Args: words (widestring)
      // Voyager: MausoleumSheet.pas — Proxy.RDOSetWordsOfWisdom(words)
      args.push(RdoValue.string(value));
      break;
    }

    case 'RDOCacncelTransc': {
      // No args (void)
      // Voyager: MausoleumSheet.pas — Proxy.RDOCacncelTransc (note: original Delphi typo)
      break;
    }

    case 'RDOVote': {
      // Args: voterName (widestring), voteeName (widestring)
      // Voyager: VotesSheet.pas — Proxy.RDOVote(voterName, voteeName)
      const voterName = params.voterName || '';
      args.push(RdoValue.string(voterName), RdoValue.string(value));
      break;
    }

    case 'RDOSetTownTaxes': {
      // Args: index (integer), value (integer)
      // Voyager: CapitolTownsSheet.pas — Proxy.RDOSetTownTaxes(index, value)
      const index = parseInt(params.index || '0', 10);
      args.push(RdoValue.int(index), RdoValue.int(parseInt(value, 10)));
      break;
    }

    case 'RDOSitMayor': {
      // Args: townName (widestring), tycoonName (widestring)
      // Voyager: CapitolTownsSheet.pas — Proxy.RDOSitMayor(townName, tycoonName)
      const townName = params.townName || '';
      args.push(RdoValue.string(townName), RdoValue.string(value));
      break;
    }

    case 'RDOSetInputFluidPerc': {
      // Args: perc (integer: 0-100)
      // Voyager: AdvSheetForm.pas — Proxy.RDOSetInputFluidPerc(perc)
      args.push(RdoValue.int(parseInt(value, 10)));
      break;
    }

    case 'property': {
      // Direct property set — widestring properties use string prefix, others use integer
      const WIDESTRING_PROPERTIES = new Set(['Name']);
      const actualPropName = params.propertyName || '';
      if (WIDESTRING_PROPERTIES.has(actualPropName)) {
        args.push(RdoValue.string(value));
      } else {
        args.push(RdoValue.int(parseInt(value, 10)));
      }
      break;
    }

    default:
      // Fallback: single value parameter
      args.push(RdoValue.int(parseInt(value, 10)));
      break;
  }

  return args;
}

// =========================================================================
// MODULE-PRIVATE — mapRdoCommandToPropertyName
// =========================================================================

/**
 * Map RDO command name to property name for reading back values
 *
 * Examples:
 * - RDOSetPrice(index=0) -> "srvPrices0"
 * - RDOSetSalaries(salary0=100, salary1=120, salary2=150) -> "Salaries0" (returns first salary for verification)
 * - RDOSetInputMaxPrice(metaFluid=5) -> "MaxPrice" (needs sub-object access)
 */
function mapRdoCommandToPropertyName(
  ctx: SessionContext,
  rdoCommand: string,
  additionalParams?: Record<string, string>
): string | null {
  const params = additionalParams || {};

  switch (rdoCommand) {
    case 'RDOSetPrice': {
      const index = params.index || '0';
      return `srvPrices${index}`;
    }

    case 'RDOSetSalaries':
      // Return first salary for verification (all 3 are updated together)
      return 'Salaries0';

    case 'RDOSetCompanyInputDemand': {
      const index = params.index || '0';
      return `cInputDem${index}`;
    }

    case 'RDOSetInputMaxPrice':
      return 'MaxPrice';

    case 'RDOSetInputMinK':
      return 'minK';

    case 'RDOSetTradeLevel':
      return 'TradeLevel';

    case 'RDOSetRole':
      return 'Role';

    case 'RDOSetLoanPerc':
      return 'BudgetPerc';

    case 'RDOSetTaxValue':
      return `Tax${params.index || '0'}Percent`;

    case 'RDOAutoProduce':
      return 'AutoProd';

    case 'RDOAutoRelease':
      return 'AutoRel';

    case 'RDOSetOutputPrice': {
      // Output price is per-fluid; read back via PricePc (single-product) or indexed
      const fluidId = params.fluidId;
      if (fluidId) {
        // Multi-product: read back the output PricePc for the specific fluid
        // The cacher stores output properties per-fluid under the output sub-object
        return 'PricePc';
      }
      return 'PricePc';
    }

    case 'RDOConnectInput':
    case 'RDODisconnectInput':
      return 'cnxCount';

    case 'RDOConnectOutput':
    case 'RDODisconnectOutput':
      return 'cnxCount';

    case 'RDOSetInputOverPrice':
      return 'OverPriceCnxInfo';

    case 'RDOSetInputSortMode':
      return 'SortMode';

    case 'RDOSelSelected':
      return 'Selected';

    case 'RDOConnectToTycoon':
    case 'RDODisconnectFromTycoon':
      // No witness exists for these two. `TradeRole` used to be read back here,
      // and it is not a witness: it describes what the facility IS, so it reads
      // non-empty whether or not a single trade route was created. That turned
      // every call into `confirmed: true` — the manufactured success the user
      // reported seeing on a button that had done nothing.
      //
      // There is no property that answers "did this connect anything": the
      // handler walks the tycoon's facilities and connects the ones that match
      // (Kernel/Kernel.pas:4537-4554), and connecting zero of them is a
      // legitimate outcome. `null` means "no read-back", which the caller turns
      // into `confirmed: undefined` — the honest value.
      return null;

    case 'RDOAcceptCloning':
      return 'AcceptCloning';

    // CloneFacility removed — now uses dedicated cloneFacility() method

    case 'RDOSetMinSalaryValue': {
      const level = params.levelIndex || '0';
      const prefix = level === '0' ? 'hi' : level === '1' ? 'mid' : 'lo';
      // `MinSalary`, not `ActualMinSalary`. The write sets this facility's own
      // floor; `ActualMinSalary` is the blended figure the town enforces, which
      // is max(town, world) — Kernel/Kernel.pas:9342-9345 — and Voyager shows it
      // as a separate marker (`TownHallJobsSheet.pas:149-151`). Reading the
      // blend back reports every correct write as unconfirmed whenever the
      // world's floor is the higher of the two.
      return `${prefix}MinSalary`;
    }

    case 'RDOLaunchMovie':
    case 'RDOCancelMovie':
    case 'RDOReleaseMovie':
      return 'InProd';

    case 'RDOSetMinistryBudget':
      return `MinisterBudget${params.ministryId || '0'}`;

    case 'RDOBanMinister':
    case 'RDOSitMinister':
      return `Minister${params.ministryId || '0'}`;

    case 'RDOSelectWare':
      return 'GateMap';

    case 'RDOSetWordsOfWisdom':
      return 'WordsOfWisdom';

    case 'RDOCacncelTransc':
      return 'Transcended';

    case 'RDOVote':
      return 'RulerVotes';

    case 'RDOSetTownTaxes': {
      const index = params.index || '0';
      return `TownTax${index}`;
    }

    case 'RDOSitMayor':
      return `HasMayor${params.index || '0'}`;

    case 'RDOSetInputFluidPerc':
      return 'nfActualMaxFluidValue';

    case 'property':
      return params.propertyName || rdoCommand;

    default:
      // Fallback: skip read-back for unknown commands — return the command name as-is
      // so the caller gets a likely-stale value rather than querying a wrong property
      ctx.log.warn(`[BuildingDetails] mapRdoCommandToPropertyName: unknown command "${rdoCommand}", read-back may be inaccurate`);
      return rdoCommand;
  }
}
