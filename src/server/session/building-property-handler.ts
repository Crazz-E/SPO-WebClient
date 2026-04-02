/**
 * Building property handler — extracted from StarpeaceSession.
 *
 * Public functions: setBuildingProperty
 * Module-private helpers: buildRdoCommandArgs, mapRdoCommandToPropertyName
 */

import type { SessionContext } from './session-context';
import { RdoValue, RdoCommand } from '../../shared/rdo-types';
import { toErrorMessage } from '../../shared/error-utils';

// =========================================================================
// Serialisation — prevent concurrent cacher operations on the same session
// =========================================================================
const sessionLocks = new WeakMap<SessionContext, Promise<unknown>>();

function serialise(ctx: SessionContext, fn: () => Promise<{ success: boolean; newValue: string }>): Promise<{ success: boolean; newValue: string }> {
  const prev = sessionLocks.get(ctx) ?? Promise.resolve();
  const next = prev.then(fn, fn); // run fn after previous settles (success or failure)
  sessionLocks.set(ctx, next);
  return next;
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
): Promise<{ success: boolean; newValue: string }> {
  return serialise(ctx, () => setBuildingPropertyImpl(ctx, x, y, propertyName, value, additionalParams));
}

async function setBuildingPropertyImpl(
  ctx: SessionContext,
  x: number,
  y: number,
  propertyName: string,
  value: string,
  additionalParams?: Record<string, string>
): Promise<{ success: boolean; newValue: string }> {
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
    // Ref: voyager-handler-reference.md:1198, building_details_rdo.txt:9-10
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

    // Send SetProperty command via construction service — ALL fire-and-forget.
    // No RID is assigned: the Delphi parser sees "C sel ..." and executes silently
    // (no queryId = no response sent back). This is correct for rapid-fire property
    // changes — adding RIDs causes 12+ responses to flood back and ECONNRESET.
    let setCmd: string;

    // RDO functions (olevariant return) use "^" separator.
    // RDO procedures (void) use "*" separator.
    const RDO_FUNCTIONS: ReadonlySet<string> = new Set([
      'RDOSetOutputPrice', 'RDOSetInputOverPrice', 'RDOSetInputMaxPrice', 'RDOSetInputMinK',
      'RDOConnectInput', 'RDODisconnectInput', 'RDOConnectOutput', 'RDODisconnectOutput',
      'RDOConnectToTycoon', 'RDODisconnectFromTycoon',
    ]);

    // Output/input gate commands bind to ObjectId, not CurrBlock.
    // For warehouses these differ; for other buildings they are equal.
    // Ref: voyager-handler-reference.md:1198 — RDOSetOutputPrice BindTo: objectId (direct)
    const RDO_OBJECTID_COMMANDS: ReadonlySet<string> = new Set([
      'RDOSetOutputPrice', 'RDOSetInputOverPrice', 'RDOSetInputMaxPrice', 'RDOSetInputMinK',
      'RDOConnectInput', 'RDODisconnectInput', 'RDOConnectOutput', 'RDODisconnectOutput',
      'RDOConnectToTycoon', 'RDODisconnectFromTycoon',
    ]);

    if (propertyName === 'property' && additionalParams?.propertyName) {
      // Direct property set: use SET verb
      const actualPropName = additionalParams.propertyName;
      setCmd = RdoCommand.sel(currBlock)
        .set(actualPropName)
        .args(...rdoArgs)
        .build();
    } else if (RDO_SET_PROPERTIES.has(propertyName)) {
      // Published property: use SET verb (not CALL)
      // e.g., RDOAcceptCloning is a boolean property on TBlock — Kernel.pas:1304
      setCmd = RdoCommand.sel(currBlock)
        .set(propertyName)
        .args(...rdoArgs)
        .build();
    } else {
      // RDO method call — fire-and-forget, no RID.
      const target = RDO_OBJECTID_COMMANDS.has(propertyName) ? objectId : currBlock;
      const builder = RdoCommand.sel(target).call(propertyName);
      if (RDO_FUNCTIONS.has(propertyName)) {
        builder.method(); // "^" — function returning olevariant
      } else {
        builder.push();   // "*" — void procedure
      }
      setCmd = builder.args(...rdoArgs).build();
    }
    const socket = ctx.getSocket('construction');
    if (!socket) throw new Error('Construction socket unavailable');
    socket.write(setCmd);
    ctx.log.debug(`[BuildingDetails] Sent: ${setCmd}`);

    // Wait for server to process the command
    await new Promise(resolve => setTimeout(resolve, 200));

    // Read back the new value via map service to confirm the change
    const verifyObjectId = await ctx.cacherCreateObject();
    try {
      await ctx.cacherSetObject(verifyObjectId, x, y);

      // Extract property name from RDO command for verification
      const propertyToRead = mapRdoCommandToPropertyName(ctx, propertyName, additionalParams);
      const readValues = await ctx.cacherGetPropertyList(verifyObjectId, [propertyToRead]);
      const newValue = readValues[0] || value;

      ctx.log.debug(`[BuildingDetails] Property ${propertyName} updated successfully to ${newValue}`);
      return { success: true, newValue };
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
      // Args: Salaries0, Salaries1, Salaries2 (all 3 values required)
      const sal0 = parseInt(params.salary0 || value, 10);
      const sal1 = parseInt(params.salary1 || value, 10);
      const sal2 = parseInt(params.salary2 || value, 10);
      args.push(RdoValue.int(sal0), RdoValue.int(sal1), RdoValue.int(sal2));
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

    case 'RDOSetBuyingStatus': {
      // Args: fingerIndex (integer), boolean as WordBool
      // Voyager: SupplySheetForm.pas line 741
      const fingerIndex = params.fingerIndex;
      if (fingerIndex === undefined) {
        throw new Error('RDOSetBuyingStatus requires fingerIndex parameter');
      }
      const boolVal = parseInt(value, 10) !== 0 ? -1 : 0;
      args.push(RdoValue.int(parseInt(fingerIndex, 10)), RdoValue.int(boolVal));
      break;
    }

    case 'RDOConnectToTycoon':
    case 'RDODisconnectFromTycoon': {
      // Args: tycoonId (integer), kind (integer), flag (wordbool = true)
      // Voyager: IndustryGeneralSheet.pas line 345/357
      // tycoonId auto-injected from session if not provided by client
      const tycoonId = params.tycoonId || ctx.tycoonId;
      const kind = params.kind;
      if (!tycoonId || !kind) {
        throw new Error(`${rdoCommand} requires kind parameter (and tycoonId must be available)`);
      }
      args.push(RdoValue.int(parseInt(tycoonId, 10)), RdoValue.int(parseInt(kind, 10)), RdoValue.int(-1));
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

    case 'RDOVoteOf': {
      // Args: voterName (widestring)
      // Voyager: VotesSheet.pas — Proxy.RDOVoteOf(voterName)
      args.push(RdoValue.string(value));
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
): string {
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

    case 'RDOSetBuyingStatus':
      return 'Selected';

    case 'RDOConnectToTycoon':
    case 'RDODisconnectFromTycoon':
      return 'TradeRole';

    case 'RDOAcceptCloning':
      return 'AcceptCloning';

    // CloneFacility removed — now uses dedicated cloneFacility() method

    case 'RDOSetMinSalaryValue': {
      const level = params.levelIndex || '0';
      const prefix = level === '0' ? 'hi' : level === '1' ? 'mid' : 'lo';
      return `${prefix}ActualMinSalary`;
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
    case 'RDOVoteOf':
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
