/**
 * Building Details Template Groups
 *
 * Pre-defined property groups (tabs) that can be composed into building templates.
 * Each group corresponds to a Voyager sheet handler (e.g., IndGeneral, BankLoans).
 * RDO property names are matched to the original Delphi source.
 */

import { PropertyGroup, PropertyType } from './property-definitions';

// =============================================================================
// GENERIC FALLBACK GROUP
// =============================================================================

export const GENERIC_GROUP: PropertyGroup = {
  id: 'generic',
  name: 'Details',
  icon: 'D',
  order: 0,
  properties: [
    { rdoName: 'Name', displayName: 'Name', type: PropertyType.TEXT },
    { rdoName: 'Creator', displayName: 'Owner', type: PropertyType.TEXT },
    { rdoName: 'SecurityId', displayName: 'Security ID', type: PropertyType.TEXT },
    { rdoName: 'ObjectId', displayName: 'Object ID', type: PropertyType.TEXT, hideEmpty: true },
    { rdoName: 'CurrBlock', displayName: 'Block ID', type: PropertyType.TEXT, hideEmpty: true },
    { rdoName: 'Cost', displayName: 'Value', type: PropertyType.CURRENCY },
    { rdoName: 'ROI', displayName: 'ROI', type: PropertyType.PERCENTAGE, colorCode: 'auto' },
    { rdoName: 'Years', displayName: 'Age', type: PropertyType.NUMBER, unit: 'years' },
    { rdoName: 'Trouble', displayName: 'Trouble', type: PropertyType.NUMBER, hideEmpty: true },
  ],
};

// =============================================================================
// GROUP A: GENERAL TAB VARIANTS (10 handlers)
// =============================================================================

/**
 * unkGeneral — Unknown/construction facilities (336 classes)
 * Voyager: UnkFacilitySheet.pas — basic facility info
 */
export const UNK_GENERAL_GROUP: PropertyGroup = {
  id: 'unkGeneral',
  name: 'General',
  icon: 'i',
  order: 0,
  properties: [
    { rdoName: 'Name', displayName: 'Name', type: PropertyType.TEXT },
    { rdoName: 'Creator', displayName: 'Owner', type: PropertyType.TEXT },
    { rdoName: 'Cost', displayName: 'Value', type: PropertyType.CURRENCY },
    { rdoName: 'ROI', displayName: 'ROI', type: PropertyType.PERCENTAGE, colorCode: 'auto' },
    { rdoName: 'Years', displayName: 'Age', type: PropertyType.NUMBER, unit: 'years' },
    { rdoName: 'Trouble', displayName: 'Status', type: PropertyType.NUMBER, hideEmpty: true },
  ],
};

/**
 * IndGeneral — Industry/factory facilities (172 classes)
 * Voyager: IndustryGeneralSheet.pas — trade settings
 */
export const IND_GENERAL_GROUP: PropertyGroup = {
  id: 'indGeneral',
  name: 'General',
  icon: 'i',
  order: 0,
  properties: [
    { rdoName: 'Name', displayName: 'Name', type: PropertyType.TEXT },
    { rdoName: 'Creator', displayName: 'Owner', type: PropertyType.TEXT },
    { rdoName: 'Cost', displayName: 'Value', type: PropertyType.CURRENCY },
    { rdoName: 'ROI', displayName: 'ROI', type: PropertyType.PERCENTAGE, colorCode: 'auto' },
    { rdoName: 'Years', displayName: 'Age', type: PropertyType.NUMBER, unit: 'years' },
    { rdoName: 'Trouble', displayName: 'Status', type: PropertyType.NUMBER, hideEmpty: true },
    { rdoName: 'Stopped', displayName: 'Paused', type: PropertyType.BOOLEAN, editable: true },
    { rdoName: 'Role', displayName: 'Role', type: PropertyType.ENUM, enumLabels: { '0': 'Neutral', '1': 'Producer', '2': 'Distributor', '3': 'Buyer', '4': 'Importer', '5': 'Export', '6': 'Import' } },
    { rdoName: 'TradeRole', displayName: 'Trade Role', type: PropertyType.ENUM, enumLabels: { '0': 'Neutral', '1': 'Producer', '2': 'Distributor', '3': 'Buyer', '4': 'Importer', '5': 'Export', '6': 'Import' } },
    { rdoName: 'TradeLevel', displayName: 'Trade Level', type: PropertyType.ENUM, editable: true, enumLabels: { '0': 'Same Owner', '1': 'Subsidiaries', '2': 'Allies', '3': 'Anyone' } },
  ],
  rdoCommands: {
    'TradeLevel': { command: 'RDOSetTradeLevel' },
    'Role': { command: 'RDOSetRole' },
    'Stopped': { command: 'property' },
    'RDOConnectToTycoon': { command: 'RDOConnectToTycoon' },
    'RDODisconnectFromTycoon': { command: 'RDODisconnectFromTycoon' },
  },
};

/**
 * SrvGeneral — Service/store facilities (58 classes)
 * Voyager: SrvGeneralSheetForm.pas — overview + indexed service price table
 */
export const SRV_GENERAL_GROUP: PropertyGroup = {
  id: 'srvGeneral',
  name: 'General',
  icon: 'i',
  order: 0,
  properties: [
    { rdoName: 'Name', displayName: 'Name', type: PropertyType.TEXT },
    { rdoName: 'Creator', displayName: 'Owner', type: PropertyType.TEXT },
    { rdoName: 'Cost', displayName: 'Value', type: PropertyType.CURRENCY },
    { rdoName: 'ROI', displayName: 'ROI', type: PropertyType.PERCENTAGE, colorCode: 'auto' },
    { rdoName: 'Years', displayName: 'Age', type: PropertyType.NUMBER, unit: 'years' },
    { rdoName: 'Trouble', displayName: 'Status', type: PropertyType.NUMBER, hideEmpty: true },
    {
      rdoName: 'srvNames',
      displayName: 'Services',
      type: PropertyType.TABLE,
      indexed: true,
      countProperty: 'ServiceCount',
      columns: [
        { rdoSuffix: 'srvNames', label: 'Product', type: PropertyType.TEXT, width: '20%' },
        { rdoSuffix: 'srvPrices', label: 'Price', type: PropertyType.SLIDER, width: '15%', editable: true, min: 0, max: 500, step: 10 },
        { rdoSuffix: 'srvSupplies', label: 'Offer', type: PropertyType.NUMBER, width: '15%' },
        { rdoSuffix: 'srvDemands', label: 'Demand', type: PropertyType.NUMBER, width: '15%' },
        { rdoSuffix: 'srvMarketPrices', label: 'Market', type: PropertyType.CURRENCY, width: '15%' },
        { rdoSuffix: 'srvAvgPrices', label: 'Avg Price', type: PropertyType.CURRENCY, width: '15%' },
      ],
    },
  ],
  rdoCommands: {
    'srvPrices': { command: 'RDOSetPrice', indexed: true },
  },
};

/**
 * ResGeneral — Residential facilities (183 classes)
 * Voyager: ResidentialSheet.pas — rent/maintenance sliders
 */
export const RES_GENERAL_GROUP: PropertyGroup = {
  id: 'resGeneral',
  name: 'General',
  icon: 'i',
  order: 0,
  properties: [
    { rdoName: 'Name', displayName: 'Name', type: PropertyType.TEXT },
    { rdoName: 'Creator', displayName: 'Owner', type: PropertyType.TEXT },
    { rdoName: 'Cost', displayName: 'Value', type: PropertyType.CURRENCY },
    { rdoName: 'ROI', displayName: 'ROI', type: PropertyType.PERCENTAGE, colorCode: 'auto' },
    { rdoName: 'Years', displayName: 'Age', type: PropertyType.NUMBER, unit: 'years' },
    { rdoName: 'Trouble', displayName: 'Status', type: PropertyType.NUMBER, hideEmpty: true },
    // Residential-specific stats (PopulatedBlock.StoreToCache)
    { rdoName: 'Occupancy', displayName: 'Occupancy', type: PropertyType.PERCENTAGE },
    { rdoName: 'Inhabitants', displayName: 'Inhabitants', type: PropertyType.NUMBER },
    { rdoName: 'QOL', displayName: 'Quality of Life', type: PropertyType.PERCENTAGE },
    { rdoName: 'Beauty', displayName: 'Beauty', type: PropertyType.PERCENTAGE },
    { rdoName: 'Crime', displayName: 'Crime', type: PropertyType.PERCENTAGE },
    { rdoName: 'Pollution', displayName: 'Pollution', type: PropertyType.PERCENTAGE },
    // Investment sliders (ResidentialSheet.pas xfer_ controls)
    { rdoName: 'invCrimeRes', displayName: 'Crime Resistance', type: PropertyType.SLIDER, editable: true, min: 0, max: 500, unit: '%' },
    { rdoName: 'invPollutionRes', displayName: 'Pollution Resistance', type: PropertyType.SLIDER, editable: true, min: 0, max: 500, unit: '%' },
    { rdoName: 'invPrivacy', displayName: 'Privacy', type: PropertyType.SLIDER, editable: true, min: 0, max: 500, unit: '%' },
    { rdoName: 'InvBeauty', displayName: 'Beauty Investment', type: PropertyType.SLIDER, editable: true, min: 0, max: 500, unit: '%' },
    // Editable sliders
    { rdoName: 'Rent', displayName: 'Rent', type: PropertyType.SLIDER, editable: true, min: 0, max: 500, unit: '%' },
    { rdoName: 'Maintenance', displayName: 'Maintenance', type: PropertyType.SLIDER, editable: true, min: 0, max: 500, unit: '%' },
    // Repair info
    { rdoName: 'Repair', displayName: 'Repair Status', type: PropertyType.TEXT },
    { rdoName: 'RepairPrice', displayName: 'Repair Cost', type: PropertyType.CURRENCY },
    // Repair actions (Voyager: IndustryGeneralSheet.pas — RdoRepair / RdoStopRepair)
    { rdoName: 'startRepair', displayName: 'Start Repair', type: PropertyType.ACTION_BUTTON, actionId: 'startRepair', buttonLabel: 'Start Repair' },
    { rdoName: 'stopRepair', displayName: 'Stop Repair', type: PropertyType.ACTION_BUTTON, actionId: 'stopRepair', buttonLabel: 'Stop Repair' },
  ],
  rdoCommands: {
    'Rent': { command: 'property' },
    'Maintenance': { command: 'property' },
    'invCrimeRes': { command: 'property' },
    'invPollutionRes': { command: 'property' },
    'invPrivacy': { command: 'property' },
    'InvBeauty': { command: 'property' },
  },
};

/**
 * HqGeneral — Headquarters facilities (35 classes)
 * Voyager: HqMainSheet.pas — same as unkGeneral (inventions sub-handler is separate)
 */
export const HQ_GENERAL_GROUP: PropertyGroup = {
  id: 'hqGeneral',
  name: 'General',
  icon: 'i',
  order: 0,
  properties: [
    { rdoName: 'Name', displayName: 'Name', type: PropertyType.TEXT },
    { rdoName: 'Creator', displayName: 'Owner', type: PropertyType.TEXT },
    { rdoName: 'Cost', displayName: 'Value', type: PropertyType.CURRENCY },
    { rdoName: 'ROI', displayName: 'ROI', type: PropertyType.PERCENTAGE, colorCode: 'auto' },
    { rdoName: 'Years', displayName: 'Age', type: PropertyType.NUMBER, unit: 'years' },
    { rdoName: 'Trouble', displayName: 'Status', type: PropertyType.NUMBER, hideEmpty: true },
  ],
};

/**
 * HQ Inventions — Research/technology tab for HQ buildings
 * Voyager: InventionsSheet.pas — 3 sections: developing, completed, available
 * Note: No CLASSES.BIN config references hdqInventions — runtime-injected for HQ buildings
 *
 * RDO methods:
 *   RDOQueueResearch(inventionId: widestring, priority: integer) — void
 *   RDOCancelResearch(inventionId: widestring) — void
 */
export const HQ_INVENTIONS_GROUP: PropertyGroup = {
  id: 'hqInventions',
  name: 'Research',
  icon: 'R',
  order: 15,
  properties: [
    { rdoName: 'RsKind', displayName: 'Research Type', type: PropertyType.NUMBER, hideEmpty: true },
    // Section 1: In Development
    {
      rdoName: 'devName',
      displayName: 'In Development',
      type: PropertyType.TABLE,
      indexed: true,
      countProperty: 'devCount0',
      columns: [
        { rdoSuffix: 'devName', label: 'Name', type: PropertyType.TEXT, width: '45%' },
        { rdoSuffix: 'devCost', label: 'Cost', type: PropertyType.CURRENCY, width: '30%' },
        { rdoSuffix: 'devProgress', label: 'Progress', type: PropertyType.PERCENTAGE, width: '25%' },
      ],
    },
    // Section 2: Completed
    {
      rdoName: 'hasName',
      displayName: 'Completed',
      type: PropertyType.TABLE,
      indexed: true,
      countProperty: 'hasCount0',
      columns: [
        { rdoSuffix: 'hasName', label: 'Name', type: PropertyType.TEXT, width: '55%' },
        { rdoSuffix: 'hasCost', label: 'Value', type: PropertyType.CURRENCY, width: '45%' },
      ],
    },
    // Section 3: Available for Research
    {
      rdoName: 'avlName',
      displayName: 'Available',
      type: PropertyType.TABLE,
      indexed: true,
      countProperty: 'avlCount0',
      columns: [
        { rdoSuffix: 'avlName', label: 'Name', type: PropertyType.TEXT, width: '35%' },
        { rdoSuffix: 'avlCost', label: 'Cost', type: PropertyType.CURRENCY, width: '25%' },
        { rdoSuffix: 'avlDesc', label: 'Description', type: PropertyType.TEXT, width: '40%' },
      ],
    },
    // Action buttons
    { rdoName: 'queueResearch', displayName: 'Queue Research', type: PropertyType.ACTION_BUTTON, actionId: 'queueResearch', buttonLabel: 'Queue Research' },
    { rdoName: 'cancelResearch', displayName: 'Cancel Research', type: PropertyType.ACTION_BUTTON, actionId: 'cancelResearch', buttonLabel: 'Cancel' },
  ],
  rdoCommands: {
    'RDOQueueResearch': { command: 'RDOQueueResearch' },
    'RDOCancelResearch': { command: 'RDOCancelResearch' },
  },
};

/**
 * BankGeneral — Bank facilities (1 class)
 * Voyager: BankGeneralSheet.pas — bank stats + budget slider
 */
export const BANK_GENERAL_GROUP: PropertyGroup = {
  id: 'bankGeneral',
  name: 'General',
  icon: 'i',
  order: 0,
  properties: [
    { rdoName: 'Name', displayName: 'Name', type: PropertyType.TEXT },
    { rdoName: 'Creator', displayName: 'Owner', type: PropertyType.TEXT },
    { rdoName: 'Trouble', displayName: 'Status', type: PropertyType.NUMBER, hideEmpty: true },
    { rdoName: 'EstLoan', displayName: 'Estimated Loan', type: PropertyType.CURRENCY },
    { rdoName: 'Interest', displayName: 'Interest Rate', type: PropertyType.PERCENTAGE },
    { rdoName: 'Term', displayName: 'Loan Term', type: PropertyType.NUMBER, unit: 'years' },
    { rdoName: 'BudgetPerc', displayName: 'Budget', type: PropertyType.SLIDER, editable: true, min: 0, max: 100, unit: '%' },
  ],
  rdoCommands: {
    'BudgetPerc': { command: 'RDOSetLoanPerc' },
  },
};

/**
 * WHGeneral — Warehouse facilities (2 classes)
 * Voyager: WHGeneralSheet.pas — trade settings
 */
export const WH_GENERAL_GROUP: PropertyGroup = {
  id: 'whGeneral',
  name: 'General',
  icon: 'i',
  order: 0,
  properties: [
    { rdoName: 'Name', displayName: 'Name', type: PropertyType.TEXT },
    { rdoName: 'Creator', displayName: 'Owner', type: PropertyType.TEXT },
    { rdoName: 'Cost', displayName: 'Value', type: PropertyType.CURRENCY },
    { rdoName: 'ROI', displayName: 'ROI', type: PropertyType.PERCENTAGE, colorCode: 'auto' },
    { rdoName: 'Trouble', displayName: 'Status', type: PropertyType.NUMBER, hideEmpty: true },
    { rdoName: 'TradeRole', displayName: 'Trade Role', type: PropertyType.ENUM, enumLabels: { '0': 'Neutral', '1': 'Producer', '2': 'Distributor', '3': 'Buyer', '4': 'Importer', '5': 'Export', '6': 'Import' } },
    { rdoName: 'TradeLevel', displayName: 'Trade Level', type: PropertyType.ENUM, editable: true, enumLabels: { '0': 'Same Owner', '1': 'Subsidiaries', '2': 'Allies', '3': 'Anyone' } },
    { rdoName: 'GateMap', displayName: 'Gate Map', type: PropertyType.NUMBER, hideEmpty: true },
  ],
  rdoCommands: {
    'TradeLevel': { command: 'RDOSetTradeLevel' },
  },
};

/**
 * TVGeneral — TV station facilities (4 classes)
 * Voyager: TVGeneralSheet.pas — broadcast settings
 */
export const TV_GENERAL_GROUP: PropertyGroup = {
  id: 'tvGeneral',
  name: 'General',
  icon: 'i',
  order: 0,
  properties: [
    { rdoName: 'Name', displayName: 'Name', type: PropertyType.TEXT },
    { rdoName: 'Creator', displayName: 'Owner', type: PropertyType.TEXT },
    { rdoName: 'Cost', displayName: 'Value', type: PropertyType.CURRENCY },
    { rdoName: 'ROI', displayName: 'ROI', type: PropertyType.PERCENTAGE, colorCode: 'auto' },
    { rdoName: 'Years', displayName: 'Age', type: PropertyType.NUMBER, unit: 'years' },
    { rdoName: 'Trouble', displayName: 'Status', type: PropertyType.NUMBER, hideEmpty: true },
    { rdoName: 'HoursOnAir', displayName: 'Hours On Air', type: PropertyType.SLIDER, editable: true, min: 0, max: 100, unit: '%' },
    { rdoName: 'Comercials', displayName: 'Commercials', type: PropertyType.SLIDER, editable: true, min: 0, max: 100, unit: '%' },
  ],
  rdoCommands: {
    'HoursOnAir': { command: 'property' },
    'Comercials': { command: 'property' },
  },
};

/**
 * capitolGeneral — Capitol building (1 class)
 * Voyager: CapitolSheet.pas — ruler stats + indexed coverage
 */
export const CAPITOL_GENERAL_GROUP: PropertyGroup = {
  id: 'capitolGeneral',
  name: 'General',
  icon: 'i',
  order: 0,
  properties: [
    { rdoName: 'HasRuler', displayName: 'Has Ruler', type: PropertyType.BOOLEAN },
    { rdoName: 'YearsToElections', displayName: 'Years to Elections', type: PropertyType.NUMBER },
    { rdoName: 'RulerActualPrestige', displayName: 'Prestige', type: PropertyType.NUMBER },
    { rdoName: 'RulerRating', displayName: 'Ruler Rating', type: PropertyType.PERCENTAGE },
    { rdoName: 'TycoonsRating', displayName: 'Tycoons Rating', type: PropertyType.PERCENTAGE },
    {
      rdoName: 'covName',
      displayName: 'Coverage',
      type: PropertyType.TABLE,
      indexed: true,
      indexSuffix: '.0',
      countProperty: 'covCount',
      columns: [
        { rdoSuffix: 'covName', label: 'Service', type: PropertyType.TEXT, width: '50%' },
        { rdoSuffix: 'covValue', label: 'Coverage', type: PropertyType.PERCENTAGE, width: '50%' },
      ],
    },
  ],
};

/**
 * townGeneral — Town hall (4 classes)
 * Voyager: TownHallSheet.pas — mayor stats + coverage
 */
export const TOWN_GENERAL_GROUP: PropertyGroup = {
  id: 'townGeneral',
  name: 'General',
  icon: 'i',
  order: 0,
  properties: [
    { rdoName: 'ActualRuler', displayName: 'Mayor', type: PropertyType.TEXT },
    { rdoName: 'Town', displayName: 'Town', type: PropertyType.TEXT },
    { rdoName: 'NewspaperName', displayName: 'Newspaper', type: PropertyType.TEXT },
    { rdoName: 'RulerPrestige', displayName: 'Prestige', type: PropertyType.NUMBER },
    { rdoName: 'RulerRating', displayName: 'Ruler Rating', type: PropertyType.PERCENTAGE },
    { rdoName: 'TycoonsRating', displayName: 'Tycoons Rating', type: PropertyType.PERCENTAGE },
    { rdoName: 'YearsToElections', displayName: 'Years to Elections', type: PropertyType.NUMBER },
    { rdoName: 'HasRuler', displayName: 'Has Ruler', type: PropertyType.BOOLEAN },
    { rdoName: 'RulerPeriods', displayName: 'Ruler Periods', type: PropertyType.NUMBER },
    {
      rdoName: 'covName',
      displayName: 'Coverage',
      type: PropertyType.TABLE,
      indexed: true,
      indexSuffix: '.0',
      countProperty: 'covCount',
      columns: [
        { rdoSuffix: 'covName', label: 'Service', type: PropertyType.TEXT, width: '50%' },
        { rdoSuffix: 'covValue', label: 'Coverage', type: PropertyType.PERCENTAGE, width: '50%' },
      ],
    },
    {
      rdoName: 'visitPolitics',
      displayName: 'Visit Politics Page',
      type: PropertyType.ACTION_BUTTON,
      actionId: 'visitPolitics',
      buttonLabel: 'Visit Politics Page',
    },
  ],
};

// =============================================================================
// GROUP B: CORE HANDLERS (already working — unchanged)
// =============================================================================

export const WORKFORCE_GROUP: PropertyGroup = {
  id: 'workforce',
  name: 'Workforce',
  icon: 'W',
  order: 10,
  special: 'workforce',
  properties: [
    {
      rdoName: 'WorkforceTable',
      displayName: 'Workforce Overview',
      type: PropertyType.WORKFORCE_TABLE,
    },
  ],
};

export const SUPPLIES_GROUP: PropertyGroup = {
  id: 'supplies',
  name: 'Supplies',
  icon: 'S',
  order: 20,
  special: 'supplies',
  properties: [
    { rdoName: 'MetaFluid', displayName: 'Product', type: PropertyType.TEXT },
    { rdoName: 'FluidValue', displayName: 'Last Value', type: PropertyType.TEXT },
    { rdoName: 'LastCostPerc', displayName: 'Cost %', type: PropertyType.PERCENTAGE },
    { rdoName: 'minK', displayName: 'Min Quality', type: PropertyType.NUMBER, hideEmpty: true },
    { rdoName: 'MaxPrice', displayName: 'Max Price', type: PropertyType.SLIDER, editable: true, min: 0, max: 1000 },
    { rdoName: 'QPSorted', displayName: 'Sort by Q/P', type: PropertyType.TEXT, hideEmpty: true },
    { rdoName: 'cnxCount', displayName: 'Connections', type: PropertyType.NUMBER },
  ],
  rdoCommands: {
    'MaxPrice': { command: 'RDOSetInputMaxPrice' },
    'minK': { command: 'RDOSetInputMinK' },
    'RDOConnectInput': { command: 'RDOConnectInput' },
    'RDODisconnectInput': { command: 'RDODisconnectInput' },
    'RDOSetInputOverPrice': { command: 'RDOSetInputOverPrice' },
    'RDOSetInputSortMode': { command: 'RDOSetInputSortMode' },
    'RDOSelSelected': { command: 'RDOSelSelected' },
    'RDOSetBuyingStatus': { command: 'RDOSetBuyingStatus' },
  },
};

export const SERVICES_GROUP: PropertyGroup = {
  id: 'services',
  name: 'Services',
  icon: '$',
  order: 30,
  special: 'services',
  properties: [
    {
      rdoName: 'srvNames',
      displayName: 'Product',
      type: PropertyType.TEXT,
      indexed: true,
      indexSuffix: '.0',
      countProperty: 'ServiceCount',
    },
    {
      rdoName: 'srvPrices',
      displayName: 'Price',
      type: PropertyType.SLIDER,
      editable: true,
      indexed: true,
      min: 0,
      max: 500,
      step: 10,
      unit: '%',
      countProperty: 'ServiceCount',
    },
    {
      rdoName: 'srvSupplies',
      displayName: 'Offer',
      type: PropertyType.NUMBER,
      indexed: true,
      countProperty: 'ServiceCount',
    },
    {
      rdoName: 'srvDemands',
      displayName: 'Demand',
      type: PropertyType.NUMBER,
      indexed: true,
      countProperty: 'ServiceCount',
    },
    {
      rdoName: 'srvMarketPrices',
      displayName: 'Market Price',
      type: PropertyType.CURRENCY,
      indexed: true,
      countProperty: 'ServiceCount',
    },
    {
      rdoName: 'srvAvgPrices',
      displayName: 'Avg Price',
      type: PropertyType.CURRENCY,
      indexed: true,
      countProperty: 'ServiceCount',
    },
  ],
};

/**
 * Products — Output gate handler for industrial buildings (172 classes)
 * Voyager: ProdSheetForm.pas — FingerTabs with per-output gate properties + connections
 *
 * Data fetched via GetOutputNames + SetPath + per-gate property queries,
 * NOT from indexed srvNames/srvPrices properties (those are SrvGeneral inline table).
 *
 * Output gate properties: MetaFluid, LastFluid, FluidQuality, PricePc, AvgPrice, MarketPrice, cnxCount
 * Per-connection: cnxFacilityName, cnxCompanyName, LastValueCnxInfo, ConnectedCnxInfo, tCostCnxInfo, cnxXPos, cnxYPos
 */
export const PRODUCTS_GROUP: PropertyGroup = {
  id: 'products',
  name: 'Products',
  icon: 'P',
  order: 30,
  special: 'products',
  properties: [
    { rdoName: 'MetaFluid', displayName: 'Product', type: PropertyType.TEXT },
    { rdoName: 'LastFluid', displayName: 'Produced', type: PropertyType.NUMBER },
    { rdoName: 'FluidQuality', displayName: 'Quality', type: PropertyType.PERCENTAGE },
    { rdoName: 'PricePc', displayName: 'Price', type: PropertyType.SLIDER, editable: true, min: 0, max: 300, step: 5, unit: '%' },
    { rdoName: 'AvgPrice', displayName: 'Avg Price', type: PropertyType.PERCENTAGE },
    { rdoName: 'MarketPrice', displayName: 'Market Price', type: PropertyType.CURRENCY },
    { rdoName: 'cnxCount', displayName: 'Clients', type: PropertyType.NUMBER },
  ],
  rdoCommands: {
    'PricePc': { command: 'RDOSetOutputPrice' },
    'RDOConnectOutput': { command: 'RDOConnectOutput' },
    'RDODisconnectOutput': { command: 'RDODisconnectOutput' },
  },
};

export const ADVERTISEMENT_GROUP: PropertyGroup = {
  id: 'advertisement',
  name: 'Advertising',
  icon: 'A',
  order: 25,
  properties: [
    { rdoName: 'cInput', displayName: 'Services', type: PropertyType.TEXT, indexed: true, indexSuffix: '.0', countProperty: 'cInputCount' },
    { rdoName: 'cInputSup', displayName: 'Receiving', type: PropertyType.NUMBER, indexed: true, countProperty: 'cInputCount' },
    { rdoName: 'cInputDem', displayName: 'Requesting', type: PropertyType.NUMBER, indexed: true, countProperty: 'cInputCount' },
    { rdoName: 'cInputRatio', displayName: 'Ratio', type: PropertyType.PERCENTAGE, indexed: true, countProperty: 'cInputCount' },
    { rdoName: 'cInputMax', displayName: 'Max', type: PropertyType.NUMBER, indexed: true, countProperty: 'cInputCount' },
    { rdoName: 'cEditable', displayName: 'Editable', type: PropertyType.BOOLEAN, indexed: true, countProperty: 'cInputCount' },
    { rdoName: 'cUnits', displayName: 'Units', type: PropertyType.TEXT, indexed: true, countProperty: 'cInputCount' },
  ],
};

export const UPGRADE_GROUP: PropertyGroup = {
  id: 'upgrade',
  name: 'Upgrade',
  icon: 'U',
  order: 40,
  properties: [
    { rdoName: 'UpgradeLevel', displayName: 'Current Level', type: PropertyType.NUMBER, hideEmpty: true },
    { rdoName: 'MaxUpgrade', displayName: 'Max Level', type: PropertyType.NUMBER, hideEmpty: true },
    { rdoName: 'NextUpgCost', displayName: 'Upgrade Cost', type: PropertyType.CURRENCY, hideEmpty: true },
    { rdoName: 'Upgrading', displayName: 'Upgrading', type: PropertyType.BOOLEAN, hideEmpty: true },
    { rdoName: 'Pending', displayName: 'Pending', type: PropertyType.NUMBER, hideEmpty: true },
    { rdoName: 'UpgradeActions', displayName: 'Actions', type: PropertyType.UPGRADE_ACTIONS },
    { rdoName: 'cloneFacility', displayName: 'Clone Facility', type: PropertyType.ACTION_BUTTON, actionId: 'clone', buttonLabel: 'Clone Facility' },
  ],
  rdoCommands: {
    'RDOAcceptCloning': { command: 'RDOAcceptCloning' },
    'CloneFacility': { command: 'CloneFacility' },
  },
};

export const FINANCES_GROUP: PropertyGroup = {
  id: 'finances',
  name: 'Finances',
  icon: 'F',
  order: 50,
  properties: [
    { rdoName: 'MoneyGraphInfo', displayName: 'Revenue History', type: PropertyType.GRAPH },
    { rdoName: 'MoneyGraph', displayName: 'Has Graph', type: PropertyType.BOOLEAN, hideEmpty: true },
  ],
};

// =============================================================================
// GROUP C: SPECIALIZED HANDLERS (11 handlers — NEW)
// =============================================================================

/**
 * BankLoans — Bank loan table
 * Voyager: BankLoansSheet.pas — indexed loan table
 */
export const BANK_LOANS_GROUP: PropertyGroup = {
  id: 'bankLoans',
  name: 'Loans',
  icon: 'L',
  order: 10,
  properties: [
    {
      rdoName: 'Debtor',
      displayName: 'Loans',
      type: PropertyType.TABLE,
      indexed: true,
      countProperty: 'LoanCount',
      columns: [
        { rdoSuffix: 'Debtor', label: 'Debtor', type: PropertyType.TEXT, width: '30%' },
        { rdoSuffix: 'Amount', label: 'Amount', type: PropertyType.CURRENCY, width: '25%' },
        { rdoSuffix: 'Interest', label: 'Interest', type: PropertyType.PERCENTAGE, width: '20%' },
        { rdoSuffix: 'Term', label: 'Term', type: PropertyType.NUMBER, width: '25%' },
      ],
    },
  ],
};

/**
 * Antennas — TV antenna table
 * Voyager: AntennasSheet.pas — indexed antenna table
 */
export const ANTENNAS_GROUP: PropertyGroup = {
  id: 'antennas',
  name: 'Antennas',
  icon: 'A',
  order: 10,
  properties: [
    {
      rdoName: 'antName',
      displayName: 'Antennas',
      type: PropertyType.TABLE,
      indexed: true,
      countProperty: 'antCount',
      columns: [
        { rdoSuffix: 'antName', label: 'Name', type: PropertyType.TEXT, width: '25%' },
        { rdoSuffix: 'antTown', label: 'Town', type: PropertyType.TEXT, width: '20%' },
        { rdoSuffix: 'antViewers', label: 'Viewers', type: PropertyType.NUMBER, width: '15%' },
        { rdoSuffix: 'antActive', label: 'Active', type: PropertyType.BOOLEAN, width: '15%' },
        { rdoSuffix: 'antX', label: 'X', type: PropertyType.NUMBER, width: '12%' },
        { rdoSuffix: 'antY', label: 'Y', type: PropertyType.NUMBER, width: '13%' },
      ],
    },
  ],
};

/**
 * Films — Film production status
 * Voyager: FilmsSheet.pas
 */
export const FILMS_GROUP: PropertyGroup = {
  id: 'films',
  name: 'Films',
  icon: 'F',
  order: 10,
  properties: [
    // Current film info (FilmsSheet.pas queries)
    { rdoName: 'FilmName', displayName: 'Film Name', type: PropertyType.TEXT },
    { rdoName: 'FilmBudget', displayName: 'Budget', type: PropertyType.CURRENCY },
    { rdoName: 'FilmTime', displayName: 'Duration', type: PropertyType.NUMBER, unit: 'months' },
    { rdoName: 'InProd', displayName: 'In Production', type: PropertyType.TEXT },
    { rdoName: 'FilmDone', displayName: 'Film Done', type: PropertyType.BOOLEAN },
    { rdoName: 'AutoProd', displayName: 'Auto Produce', type: PropertyType.BOOLEAN, editable: true },
    { rdoName: 'AutoRel', displayName: 'Auto Release', type: PropertyType.BOOLEAN, editable: true },
    { rdoName: 'launchMovie', displayName: 'Launch Movie', type: PropertyType.ACTION_BUTTON, actionId: 'launchMovie', buttonLabel: 'Launch Movie' },
    { rdoName: 'cancelMovie', displayName: 'Cancel Movie', type: PropertyType.ACTION_BUTTON, actionId: 'cancelMovie', buttonLabel: 'Cancel Movie' },
    { rdoName: 'releaseMovie', displayName: 'Release Movie', type: PropertyType.ACTION_BUTTON, actionId: 'releaseMovie', buttonLabel: 'Release Movie' },
  ],
  rdoCommands: {
    'AutoProd': { command: 'RDOAutoProduce' },
    'AutoRel': { command: 'RDOAutoRelease' },
  },
};

/**
 * Mausoleum — Memorial building
 * Voyager: MausoleumSheet.pas
 */
export const MAUSOLEUM_GROUP: PropertyGroup = {
  id: 'mausoleum',
  name: 'Memorial',
  icon: 'M',
  order: 10,
  properties: [
    { rdoName: 'WordsOfWisdom', displayName: 'Words of Wisdom', type: PropertyType.TEXT },
    { rdoName: 'OwnerName', displayName: 'Owner', type: PropertyType.TEXT },
    { rdoName: 'Transcended', displayName: 'Transcended', type: PropertyType.BOOLEAN },
  ],
};

/**
 * Votes — Election/voting tab
 * Voyager: VotesSheet.pas — ruler + candidate table
 */
export const VOTES_GROUP: PropertyGroup = {
  id: 'votes',
  name: 'Votes',
  icon: 'V',
  order: 10,
  properties: [
    { rdoName: 'RulerName', displayName: 'Ruler', type: PropertyType.TEXT },
    { rdoName: 'RulerVotes', displayName: 'Ruler Votes', type: PropertyType.NUMBER },
    { rdoName: 'RulerCmpRat', displayName: 'Ruler Campaign Rating', type: PropertyType.PERCENTAGE },
    { rdoName: 'RulerCmpPnts', displayName: 'Ruler Campaign Points', type: PropertyType.NUMBER },
    {
      rdoName: 'Candidate',
      displayName: 'Candidates',
      type: PropertyType.TABLE,
      indexed: true,
      countProperty: 'CampaignCount',
      columns: [
        { rdoSuffix: 'Candidate', label: 'Candidate', type: PropertyType.TEXT, width: '30%' },
        { rdoSuffix: 'Votes', label: 'Votes', type: PropertyType.NUMBER, width: '25%' },
        { rdoSuffix: 'CmpRat', label: 'Rating', type: PropertyType.PERCENTAGE, width: '25%' },
        { rdoSuffix: 'CmpPnts', label: 'Points', type: PropertyType.NUMBER, width: '20%' },
      ],
    },
    { rdoName: 'voteAction', displayName: 'Vote', type: PropertyType.ACTION_BUTTON, actionId: 'vote', buttonLabel: 'Vote for Candidate' },
  ],
};

/**
 * CapitolTowns — Capitol's town table
 * Voyager: CapitolTownsSheet.pas — indexed town table
 */
export const CAPITOL_TOWNS_GROUP: PropertyGroup = {
  id: 'capitolTowns',
  name: 'Towns',
  icon: 'T',
  order: 10,
  properties: [
    { rdoName: 'ActualRuler', displayName: 'Ruler', type: PropertyType.TEXT },
    {
      rdoName: 'Town',
      displayName: 'Towns',
      type: PropertyType.TABLE,
      indexed: true,
      countProperty: 'TownCount',
      columns: [
        { rdoSuffix: 'Town', label: 'Town', type: PropertyType.TEXT, width: '16%' },
        { rdoSuffix: 'TownPopulation', label: 'Population', type: PropertyType.NUMBER, width: '12%' },
        { rdoSuffix: 'TownRating', label: 'Rating', type: PropertyType.PERCENTAGE, width: '12%' },
        { rdoSuffix: 'TownQOL', label: 'QoL', type: PropertyType.PERCENTAGE, width: '12%' },
        { rdoSuffix: 'TownQOS', label: 'QoS', type: PropertyType.PERCENTAGE, width: '12%' },
        { rdoSuffix: 'TownWealth', label: 'Wealth', type: PropertyType.CURRENCY, width: '12%' },
        { rdoSuffix: 'TownTax', label: 'Tax', type: PropertyType.PERCENTAGE, width: '12%' },
        { rdoSuffix: 'HasMayor', label: 'Mayor', type: PropertyType.BOOLEAN, width: '10%' },
      ],
    },
  ],
};

/**
 * Ministeries — Capitol minister table
 * Voyager: MinisteriesSheet.pas — indexed minister table
 */
export const MINISTERIES_GROUP: PropertyGroup = {
  id: 'ministeries',
  name: 'Ministries',
  icon: 'M',
  order: 10,
  properties: [
    { rdoName: 'ActualRuler', displayName: 'Ruler', type: PropertyType.TEXT },
    {
      rdoName: 'Ministry',
      displayName: 'Ministries',
      type: PropertyType.TABLE,
      indexed: true,
      countProperty: 'MinisterCount',
      columns: [
        { rdoSuffix: 'MinistryId', label: 'ID', type: PropertyType.TEXT, width: '0%' },
        { rdoSuffix: 'Ministry', label: 'Ministry', type: PropertyType.TEXT, width: '25%' },
        { rdoSuffix: 'Minister', label: 'Minister', type: PropertyType.TEXT, width: '25%' },
        { rdoSuffix: 'MinisterRating', label: 'Rating', type: PropertyType.PERCENTAGE, width: '25%' },
        { rdoSuffix: 'MinisterBudget', label: 'Budget', type: PropertyType.CURRENCY, width: '25%' },
      ],
    },
    { rdoName: 'banMinister', displayName: 'Depose Minister', type: PropertyType.ACTION_BUTTON, actionId: 'banMinister', buttonLabel: 'Depose Minister' },
    { rdoName: 'sitMinister', displayName: 'Appoint Minister', type: PropertyType.ACTION_BUTTON, actionId: 'sitMinister', buttonLabel: 'Appoint Minister' },
  ],
  rdoCommands: {
    'MinisterBudget': { command: 'RDOSetMinistryBudget' },
  },
};

/**
 * townJobs — Town hall job settings
 * Voyager: TownHallJobsSheet.pas — min salary per worker class
 */
export const TOWN_JOBS_GROUP: PropertyGroup = {
  id: 'townJobs',
  name: 'Jobs',
  icon: 'J',
  order: 10,
  properties: [
    { rdoName: 'hiActualMinSalary', displayName: 'Executive Min Salary', type: PropertyType.SLIDER, editable: true, min: 0, max: 500, step: 5 },
    { rdoName: 'midActualMinSalary', displayName: 'Professional Min Salary', type: PropertyType.SLIDER, editable: true, min: 0, max: 500, step: 5 },
    { rdoName: 'loActualMinSalary', displayName: 'Worker Min Salary', type: PropertyType.SLIDER, editable: true, min: 0, max: 500, step: 5 },
  ],
  rdoCommands: {
    'hiActualMinSalary': { command: 'RDOSetMinSalaryValue', params: { levelIndex: '0' } },
    'midActualMinSalary': { command: 'RDOSetMinSalaryValue', params: { levelIndex: '1' } },
    'loActualMinSalary': { command: 'RDOSetMinSalaryValue', params: { levelIndex: '2' } },
  },
};

/**
 * townRes — Town hall residential statistics
 * Voyager: TownHallResSheet.pas — uses FiveViewUtils (xfer_ prefixed controls)
 * Properties: 3 residential classes × (Demand, Quantity, Rent Price)
 */
export const TOWN_RES_GROUP: PropertyGroup = {
  id: 'townRes',
  name: 'Residential',
  icon: 'R',
  order: 10,
  properties: [
    { rdoName: 'hiResDemand', displayName: 'High Class Demand', type: PropertyType.NUMBER },
    { rdoName: 'hiResQ', displayName: 'High Class Population', type: PropertyType.NUMBER },
    { rdoName: 'hiRentPrice', displayName: 'High Class Rent', type: PropertyType.CURRENCY },
    { rdoName: 'midResDemand', displayName: 'Middle Class Demand', type: PropertyType.NUMBER },
    { rdoName: 'midResQ', displayName: 'Middle Class Population', type: PropertyType.NUMBER },
    { rdoName: 'midRentPrice', displayName: 'Middle Class Rent', type: PropertyType.CURRENCY },
    { rdoName: 'loResDemand', displayName: 'Low Class Demand', type: PropertyType.NUMBER },
    { rdoName: 'loResQ', displayName: 'Low Class Population', type: PropertyType.NUMBER },
    { rdoName: 'loRentPrice', displayName: 'Low Class Rent', type: PropertyType.CURRENCY },
  ],
};

/**
 * townServices — Town products/services table
 * Voyager: TownProdSheet.pas — indexed product table
 */
export const TOWN_SERVICES_GROUP: PropertyGroup = {
  id: 'townServices',
  name: 'Services',
  icon: 'S',
  order: 10,
  properties: [
    {
      rdoName: 'prdName',
      displayName: 'Products',
      type: PropertyType.TABLE,
      indexed: true,
      indexSuffix: '.0',
      countProperty: 'prdCount',
      columns: [
        { rdoSuffix: 'prdName', label: 'Product', type: PropertyType.TEXT, width: '12%' },
        { rdoSuffix: 'prdInputValue', label: 'In Value', type: PropertyType.NUMBER, width: '10%' },
        { rdoSuffix: 'prdInputCapacity', label: 'In Cap', type: PropertyType.NUMBER, width: '10%' },
        { rdoSuffix: 'prdInputQuality', label: 'In Qual', type: PropertyType.PERCENTAGE, width: '10%' },
        { rdoSuffix: 'prdInputPrice', label: 'In Price', type: PropertyType.CURRENCY, width: '9%' },
        { rdoSuffix: 'prdInputMaxPrice', label: 'Max Price', type: PropertyType.CURRENCY, width: '9%' },
        { rdoSuffix: 'prdOutputValue', label: 'Out Value', type: PropertyType.NUMBER, width: '9%' },
        { rdoSuffix: 'prdOutputCapacity', label: 'Out Cap', type: PropertyType.NUMBER, width: '9%' },
        { rdoSuffix: 'prdOutputQuality', label: 'Out Qual', type: PropertyType.PERCENTAGE, width: '9%' },
        { rdoSuffix: 'prdOutputPrice', label: 'Out Price', type: PropertyType.CURRENCY, width: '9%' },
      ],
    },
  ],
};

/**
 * townTaxes — Town tax table (uses columnSuffix for mid-index pattern)
 * Voyager: TownTaxesSheet.pas — Tax{idx}Name, Tax{idx}Percent
 */
export const TOWN_TAXES_GROUP: PropertyGroup = {
  id: 'townTaxes',
  name: 'Taxes',
  icon: 'T',
  order: 10,
  properties: [
    {
      rdoName: 'Tax',
      displayName: 'Taxes',
      type: PropertyType.TABLE,
      indexed: true,
      countProperty: 'TaxCount',
      columns: [
        { rdoSuffix: 'Tax', columnSuffix: 'Name', label: 'Tax', type: PropertyType.TEXT, width: '30%' },
        { rdoSuffix: 'Tax', columnSuffix: 'Kind', label: 'Kind', type: PropertyType.TEXT, width: '20%' },
        { rdoSuffix: 'Tax', columnSuffix: 'Percent', label: 'Rate', type: PropertyType.SLIDER, width: '25%', editable: true, min: 0, max: 100, step: 1 },
        { rdoSuffix: 'Tax', columnSuffix: 'LastYear', label: 'Last Year', type: PropertyType.CURRENCY, width: '25%' },
      ],
    },
  ],
  rdoCommands: {
    'TaxPercent': { command: 'RDOSetTaxPercent', indexed: true },
  },
};

// =============================================================================
// UNUSED GROUPS (kept for potential direct use)
// =============================================================================

export const OVERVIEW_GROUP: PropertyGroup = {
  id: 'overview',
  name: 'Overview',
  icon: 'i',
  order: 0,
  properties: [
    { rdoName: 'Name', displayName: 'Building Name', type: PropertyType.TEXT },
    { rdoName: 'Creator', displayName: 'Owner', type: PropertyType.TEXT },
    { rdoName: 'Years', displayName: 'Age', type: PropertyType.NUMBER, unit: 'years' },
    { rdoName: 'Cost', displayName: 'Value', type: PropertyType.CURRENCY },
    { rdoName: 'ROI', displayName: 'Return on Investment', type: PropertyType.PERCENTAGE, colorCode: 'auto' },
    { rdoName: 'Trouble', displayName: 'Status', type: PropertyType.NUMBER, hideEmpty: true },
  ],
};

export const TOWN_GROUP: PropertyGroup = {
  id: 'town',
  name: 'Location',
  icon: 'L',
  order: 60,
  special: 'town',
  properties: [
    { rdoName: 'Town', displayName: 'Town', type: PropertyType.TEXT },
    { rdoName: 'TownName', displayName: 'Town Name', type: PropertyType.TEXT, hideEmpty: true },
    { rdoName: 'ActualRuler', displayName: 'Mayor', type: PropertyType.TEXT },
    { rdoName: 'TownQOL', displayName: 'Quality of Life', type: PropertyType.PERCENTAGE, hideEmpty: true },
    { rdoName: 'QOL', displayName: 'QoL', type: PropertyType.PERCENTAGE, hideEmpty: true },
  ],
};

export const COVERAGE_GROUP: PropertyGroup = {
  id: 'coverage',
  name: 'Coverage',
  icon: 'C',
  order: 70,
  properties: [
    { rdoName: 'covValue0', displayName: 'Colleges', type: PropertyType.PERCENTAGE, hideEmpty: true },
    { rdoName: 'covValue1', displayName: 'Garbage Disposal', type: PropertyType.PERCENTAGE, hideEmpty: true },
    { rdoName: 'covValue2', displayName: 'Fire Coverage', type: PropertyType.PERCENTAGE, hideEmpty: true },
    { rdoName: 'covValue3', displayName: 'Health Coverage', type: PropertyType.PERCENTAGE, hideEmpty: true },
    { rdoName: 'covValue4', displayName: 'Jails', type: PropertyType.PERCENTAGE, hideEmpty: true },
    { rdoName: 'covValue5', displayName: 'Museums', type: PropertyType.PERCENTAGE, hideEmpty: true },
    { rdoName: 'covValue6', displayName: 'Police Coverage', type: PropertyType.PERCENTAGE, hideEmpty: true },
    { rdoName: 'covValue7', displayName: 'School Coverage', type: PropertyType.PERCENTAGE, hideEmpty: true },
    { rdoName: 'covValue8', displayName: 'Recreation', type: PropertyType.PERCENTAGE, hideEmpty: true },
  ],
};

export const TRADE_GROUP: PropertyGroup = {
  id: 'trade',
  name: 'Trade',
  icon: 'T',
  order: 35,
  properties: [
    { rdoName: 'TradeRole', displayName: 'Trade Role', type: PropertyType.ENUM, enumLabels: { '0': 'Neutral', '1': 'Producer', '2': 'Distributor', '3': 'Buyer', '4': 'Importer', '5': 'Export', '6': 'Import' } },
    { rdoName: 'TradeLevel', displayName: 'Trade Level', type: PropertyType.ENUM, editable: true, enumLabels: { '0': 'Same Owner', '1': 'Subsidiaries', '2': 'Allies', '3': 'Anyone' } },
    { rdoName: 'GateMap', displayName: 'Gate Map', type: PropertyType.NUMBER, hideEmpty: true },
  ],
};

export const LOCAL_SERVICES_GROUP: PropertyGroup = {
  id: 'localServices',
  name: 'Services',
  icon: 'Q',
  order: 45,
  properties: [
    { rdoName: 'srvCount', displayName: 'Service Count', type: PropertyType.NUMBER },
    { rdoName: 'GQOS', displayName: 'Quality of Service', type: PropertyType.PERCENTAGE },
    {
      rdoName: 'svrName',
      displayName: 'Service',
      type: PropertyType.TABLE,
      indexed: true,
      indexSuffix: '.0',
      countProperty: 'srvCount',
      columns: [
        { rdoSuffix: 'svrName', label: 'Service', type: PropertyType.TEXT, width: '25%' },
        { rdoSuffix: 'svrDemand', label: 'Demand', type: PropertyType.NUMBER, width: '12%' },
        { rdoSuffix: 'svrOffer', label: 'Offer', type: PropertyType.NUMBER, width: '12%' },
        { rdoSuffix: 'svrCapacity', label: 'Capacity', type: PropertyType.NUMBER, width: '12%' },
        { rdoSuffix: 'svrRatio', label: 'Ratio', type: PropertyType.PERCENTAGE, width: '12%' },
        { rdoSuffix: 'svrMarketPrice', label: 'Market', type: PropertyType.CURRENCY, width: '12%' },
        { rdoSuffix: 'svrQuality', label: 'Quality', type: PropertyType.PERCENTAGE, width: '12%' },
      ],
    },
  ],
};

// =============================================================================
// GROUP LOOKUP BY ID (for client-side property rendering)
// =============================================================================

export const GROUP_BY_ID: Record<string, PropertyGroup> = {
  'overview': OVERVIEW_GROUP,
  'generic': GENERIC_GROUP,
  'unkGeneral': UNK_GENERAL_GROUP,
  'indGeneral': IND_GENERAL_GROUP,
  'srvGeneral': SRV_GENERAL_GROUP,
  'resGeneral': RES_GENERAL_GROUP,
  'hqGeneral': HQ_GENERAL_GROUP,
  'hqInventions': HQ_INVENTIONS_GROUP,
  'bankGeneral': BANK_GENERAL_GROUP,
  'whGeneral': WH_GENERAL_GROUP,
  'tvGeneral': TV_GENERAL_GROUP,
  'capitolGeneral': CAPITOL_GENERAL_GROUP,
  'townGeneral': TOWN_GENERAL_GROUP,
  'workforce': WORKFORCE_GROUP,
  'supplies': SUPPLIES_GROUP,
  'services': SERVICES_GROUP,
  'products': PRODUCTS_GROUP,
  'upgrade': UPGRADE_GROUP,
  'finances': FINANCES_GROUP,
  'advertisement': ADVERTISEMENT_GROUP,
  'town': TOWN_GROUP,
  'coverage': COVERAGE_GROUP,
  'trade': TRADE_GROUP,
  'localServices': LOCAL_SERVICES_GROUP,
  'bankLoans': BANK_LOANS_GROUP,
  'antennas': ANTENNAS_GROUP,
  'films': FILMS_GROUP,
  'mausoleum': MAUSOLEUM_GROUP,
  'votes': VOTES_GROUP,
  'capitolTowns': CAPITOL_TOWNS_GROUP,
  'ministeries': MINISTERIES_GROUP,
  'townJobs': TOWN_JOBS_GROUP,
  'townRes': TOWN_RES_GROUP,
  'townServices': TOWN_SERVICES_GROUP,
  'townTaxes': TOWN_TAXES_GROUP,
};

/**
 * Look up a PropertyGroup by tab ID, handling handler-suffixed IDs.
 * E.g., "generic_Ministeries" → GENERIC_GROUP, "supplies" → SUPPLIES_GROUP
 */
export function getGroupById(tabId: string): PropertyGroup | undefined {
  if (GROUP_BY_ID[tabId]) return GROUP_BY_ID[tabId];
  const underscoreIdx = tabId.indexOf('_');
  if (underscoreIdx > 0) {
    const baseId = tabId.substring(0, underscoreIdx);
    return GROUP_BY_ID[baseId];
  }
  return undefined;
}

// =============================================================================
// HANDLER → GROUP MAPPING (CLASSES.BIN [InspectorInfo] TabHandler values)
// =============================================================================

/**
 * Maps CLASSES.BIN handler names → PropertyGroup objects.
 * Handler names come from [InspectorInfo] TabHandler{i} values in CLASSES.BIN.
 */
export const HANDLER_TO_GROUP: Record<string, PropertyGroup> = {
  // General tab variants — each has dedicated properties
  'unkGeneral': UNK_GENERAL_GROUP,
  'ResGeneral': RES_GENERAL_GROUP,
  'IndGeneral': IND_GENERAL_GROUP,
  'SrvGeneral': SRV_GENERAL_GROUP,
  'HqGeneral': HQ_GENERAL_GROUP,
  'hdqInventions': HQ_INVENTIONS_GROUP,
  'BankGeneral': BANK_GENERAL_GROUP,
  'WHGeneral': WH_GENERAL_GROUP,
  'TVGeneral': TV_GENERAL_GROUP,
  'capitolGeneral': CAPITOL_GENERAL_GROUP,
  'townGeneral': TOWN_GENERAL_GROUP,

  // Core handlers (existing, working)
  'Supplies': SUPPLIES_GROUP,
  'Products': PRODUCTS_GROUP,
  'compInputs': ADVERTISEMENT_GROUP,
  'Workforce': WORKFORCE_GROUP,
  'facManagement': UPGRADE_GROUP,
  'Chart': FINANCES_GROUP,

  // Specialized handlers (NEW)
  'BankLoans': BANK_LOANS_GROUP,
  'Antennas': ANTENNAS_GROUP,
  'Films': FILMS_GROUP,
  'Mausoleum': MAUSOLEUM_GROUP,
  'Votes': VOTES_GROUP,
  'CapitolTowns': CAPITOL_TOWNS_GROUP,
  'Ministeries': MINISTERIES_GROUP,
  'townJobs': TOWN_JOBS_GROUP,
  'townRes': TOWN_RES_GROUP,
  'townServices': TOWN_SERVICES_GROUP,
  'townTaxes': TOWN_TAXES_GROUP,
};
