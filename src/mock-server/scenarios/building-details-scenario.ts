/**
 * Scenario 15: Building Details / Inspector Tabs
 * WS: REQ_BUILDING_DETAILS → RESP_BUILDING_DETAILS for multiple building types
 * RDO: GetPropertyList calls for each handler's property set
 *
 * Provides mock data for all 27 handler types, covering:
 * - Group A: General tab variants (unkGeneral, IndGeneral, SrvGeneral, etc.)
 * - Group B: Core handlers (Supplies, Products, Workforce, etc.)
 * - Group C: Specialized handlers (BankLoans, Antennas, Films, Votes, etc.)
 */

import { WsMessageType } from '@/shared/types/message-types';
import type { WsMessage } from '@/shared/types/message-types';
import type {
  BuildingDetailsResponse,
  BuildingDetailsTab,
  BuildingPropertyValue,
} from '@/shared/types/domain-types';
import type { WsCaptureScenario } from '../types/mock-types';
import type { RdoScenario } from '../types/rdo-exchange-types';
import type { ScenarioVariables } from './scenario-variables';
import { mergeVariables } from './scenario-variables';

// =============================================================================
// MOCK BUILDING DEFINITIONS
// =============================================================================

interface MockBuilding {
  id: string;
  name: string;
  visualClass: string;
  x: number;
  y: number;
  tabs: BuildingDetailsTab[];
  groups: Record<string, BuildingPropertyValue[]>;
  supplies?: BuildingDetailsResponse['supplies'];
  products?: BuildingDetailsResponse['products'];
  warehouseWares?: BuildingDetailsResponse['warehouseWares'];
  moneyGraph?: number[];
}

// -----------------------------------------------------------------------------
// Factory (IndGeneral + Products + Supplies + Workforce + facManagement + Chart)
// -----------------------------------------------------------------------------

const MOCK_FACTORY: MockBuilding = {
  id: '127706280',
  name: 'Chemical Plant 3',
  visualClass: 'PGIChemicalPlantA',
  x: 472,
  y: 392,
  tabs: [
    { id: 'indGeneral', name: 'GENERAL', icon: 'i', order: 0, handlerName: 'IndGeneral' },
    { id: 'products', name: 'PRODUCTS', icon: 'P', order: 15, handlerName: 'Products', special: 'products' },
    { id: 'supplies', name: 'SUPPLIES', icon: 'S', order: 20, handlerName: 'Supplies', special: 'supplies' },
    { id: 'workforce', name: 'WORKFORCE', icon: 'W', order: 10, handlerName: 'Workforce', special: 'workforce' },
    { id: 'upgrade', name: 'MANAGEMENT', icon: 'U', order: 40, handlerName: 'facManagement' },
    { id: 'finances', name: 'FINANCES', icon: 'F', order: 50, handlerName: 'Chart', special: 'finances' },
  ],
  groups: {
    'indGeneral': [
      { name: 'Name', value: 'Chemical Plant 3' },
      { name: 'Creator', value: 'Yellow Inc.' },
      { name: 'Cost', value: '2500000' },
      { name: 'ROI', value: '12' },
      { name: 'Years', value: '3' },
      { name: 'Trouble', value: '0' },
      { name: 'Role', value: '1' },
      { name: 'TradeRole', value: '1' },
      { name: 'TradeLevel', value: '3' },
    ],
    'workforce': [
      { name: 'Workers0', value: '27', index: 0 },
      { name: 'WorkersMax0', value: '27', index: 0 },
      { name: 'WorkersK0', value: '85', index: 0 },
      { name: 'Salaries0', value: '100', index: 0 },
      { name: 'WorkForcePrice0', value: '45000', index: 0 },
      { name: 'WorkersCap0', value: '30', index: 0 },
      { name: 'MinSalaries0', value: '80', index: 0 },
      { name: 'SalaryValues0', value: '45000', index: 0 },
      { name: 'Workers1', value: '1', index: 1 },
      { name: 'WorkersMax1', value: '1', index: 1 },
      { name: 'WorkersK1', value: '90', index: 1 },
      { name: 'Salaries1', value: '100', index: 1 },
      { name: 'WorkForcePrice1', value: '65000', index: 1 },
      { name: 'WorkersCap1', value: '2', index: 1 },
      { name: 'MinSalaries1', value: '90', index: 1 },
      { name: 'SalaryValues1', value: '65000', index: 1 },
      { name: 'Workers2', value: '0', index: 2 },
      { name: 'WorkersMax2', value: '0', index: 2 },
      { name: 'WorkersK2', value: '0', index: 2 },
      { name: 'Salaries2', value: '100', index: 2 },
      { name: 'WorkForcePrice2', value: '0', index: 2 },
      { name: 'WorkersCap2', value: '0', index: 2 },
      { name: 'MinSalaries2', value: '0', index: 2 },
      { name: 'SalaryValues2', value: '0', index: 2 },
    ],
    'upgrade': [
      { name: 'UpgradeLevel', value: '1' },
      { name: 'MaxUpgrade', value: '5' },
      { name: 'NextUpgCost', value: '5000000' },
      { name: 'Upgrading', value: '0' },
      { name: 'Pending', value: '0' },
    ],
    'finances': [
      { name: 'MoneyGraph', value: '1' },
    ],
  },
  products: [
    {
      path: 'Outputs/Chemicals',
      name: 'Chemicals',
      metaFluid: 'CHEMICALS',
      lastFluid: '485',
      quality: '82',
      pricePc: '110',
      avgPrice: '105',
      marketPrice: '320.50',
      connectionCount: 2,
      connections: [
        {
          facilityName: 'Drug Store 10',
          companyName: 'Yellow Inc.',
          createdBy: '',
          price: '',
          overprice: '',
          lastValue: '120',
          cost: '$15',
          quality: '',
          connected: true,
          x: 477,
          y: 392,
        },
        {
          facilityName: 'Warehouse 5',
          companyName: 'Yellow Inc.',
          createdBy: '',
          price: '',
          overprice: '',
          lastValue: '365',
          cost: '$8',
          quality: '',
          connected: true,
          x: 480,
          y: 395,
        },
      ],
    },
    {
      path: 'Outputs/Plastics',
      name: 'Plastics',
      metaFluid: 'PLASTICS',
      lastFluid: '210',
      quality: '78',
      pricePc: '100',
      avgPrice: '98',
      marketPrice: '180.00',
      connectionCount: 0,
      connections: [],
    },
  ],
  moneyGraph: [-29, -25, -18, -10, 5, 15, 22, 30, 28, 35, 42, 38],
};

// -----------------------------------------------------------------------------
// Drug Store (SrvGeneral + Products + Workforce + facManagement + Chart)
// -----------------------------------------------------------------------------

const MOCK_STORE: MockBuilding = {
  id: '127839460',
  name: 'Drug Store 10',
  visualClass: 'PGIDrugStore',
  x: 477,
  y: 392,
  tabs: [
    { id: 'srvGeneral', name: 'GENERAL', icon: 'i', order: 0, handlerName: 'SrvGeneral' },
    { id: 'products', name: 'PRODUCTS', icon: 'P', order: 30, handlerName: 'Products', special: 'products' },
    { id: 'workforce', name: 'WORKFORCE', icon: 'W', order: 10, handlerName: 'Workforce', special: 'workforce' },
    { id: 'upgrade', name: 'MANAGEMENT', icon: 'U', order: 40, handlerName: 'facManagement' },
    { id: 'finances', name: 'FINANCES', icon: 'F', order: 50, handlerName: 'Chart', special: 'finances' },
  ],
  groups: {
    'srvGeneral': [
      { name: 'Name', value: 'Drug Store 10' },
      { name: 'Creator', value: 'Yellow Inc.' },
      { name: 'Cost', value: '180000' },
      { name: 'ROI', value: '-20' },
      { name: 'Years', value: '1' },
      { name: 'Trouble', value: '0' },
      { name: 'ServiceCount', value: '2' },
      { name: 'srvNames0', value: 'Pharmaceutics', index: 0 },
      { name: 'srvPrices0', value: '120', index: 0 },
      { name: 'srvSupplies0', value: '5', index: 0 },
      { name: 'srvDemands0', value: '12', index: 0 },
      { name: 'srvMarketPrices0', value: '95', index: 0 },
      { name: 'srvAvgPrices0', value: '110', index: 0 },
      { name: 'srvNames1', value: 'Organic Food', index: 1 },
      { name: 'srvPrices1', value: '100', index: 1 },
      { name: 'srvSupplies1', value: '8', index: 1 },
      { name: 'srvDemands1', value: '15', index: 1 },
      { name: 'srvMarketPrices1', value: '85', index: 1 },
      { name: 'srvAvgPrices1', value: '92', index: 1 },
    ],
    'workforce': [
      { name: 'Workers0', value: '3', index: 0 },
      { name: 'WorkersMax0', value: '5', index: 0 },
      { name: 'WorkersK0', value: '78', index: 0 },
      { name: 'Salaries0', value: '100', index: 0 },
      { name: 'WorkForcePrice0', value: '32000', index: 0 },
      { name: 'WorkersCap0', value: '5', index: 0 },
      { name: 'MinSalaries0', value: '70', index: 0 },
      { name: 'SalaryValues0', value: '32000', index: 0 },
      { name: 'Workers1', value: '0', index: 1 },
      { name: 'WorkersMax1', value: '0', index: 1 },
      { name: 'WorkersK1', value: '0', index: 1 },
      { name: 'Salaries1', value: '100', index: 1 },
      { name: 'WorkForcePrice1', value: '0', index: 1 },
      { name: 'WorkersCap1', value: '0', index: 1 },
      { name: 'MinSalaries1', value: '0', index: 1 },
      { name: 'SalaryValues1', value: '0', index: 1 },
      { name: 'Workers2', value: '0', index: 2 },
      { name: 'WorkersMax2', value: '0', index: 2 },
      { name: 'WorkersK2', value: '0', index: 2 },
      { name: 'Salaries2', value: '100', index: 2 },
      { name: 'WorkForcePrice2', value: '0', index: 2 },
      { name: 'WorkersCap2', value: '0', index: 2 },
      { name: 'MinSalaries2', value: '0', index: 2 },
      { name: 'SalaryValues2', value: '0', index: 2 },
    ],
    'upgrade': [
      { name: 'UpgradeLevel', value: '1' },
      { name: 'MaxUpgrade', value: '3' },
      { name: 'NextUpgCost', value: '360000' },
      { name: 'Upgrading', value: '0' },
      { name: 'Pending', value: '0' },
    ],
    'finances': [
      { name: 'MoneyGraph', value: '1' },
    ],
  },
  moneyGraph: [-36, -32, -28, -20, -15, -8, 2, 10, 18, 25, 20, 22],
};

// -----------------------------------------------------------------------------
// Bank (BankGeneral + BankLoans)
// -----------------------------------------------------------------------------

const MOCK_BANK: MockBuilding = {
  id: '130200100',
  name: 'Central Bank',
  visualClass: 'PGIBankA',
  x: 490,
  y: 400,
  tabs: [
    { id: 'bankGeneral', name: 'GENERAL', icon: 'i', order: 0, handlerName: 'BankGeneral' },
    { id: 'bankLoans', name: 'LOANS', icon: 'L', order: 10, handlerName: 'BankLoans' },
  ],
  groups: {
    'bankGeneral': [
      { name: 'Name', value: 'Central Bank' },
      { name: 'Creator', value: 'Yellow Inc.' },
      { name: 'Trouble', value: '0' },
      { name: 'EstLoan', value: '5000000' },
      { name: 'Interest', value: '12' },
      { name: 'Term', value: '5' },
      { name: 'BudgetPerc', value: '75' },
    ],
    'bankLoans': [
      { name: 'LoanCount', value: '3' },
      { name: 'Debtor0', value: 'Yellow Inc.', index: 0 },
      { name: 'Amount0', value: '1500000', index: 0 },
      { name: 'Interest0', value: '12', index: 0 },
      { name: 'Term0', value: '5', index: 0 },
      { name: 'Debtor1', value: 'Blue Corp.', index: 1 },
      { name: 'Amount1', value: '800000', index: 1 },
      { name: 'Interest1', value: '15', index: 1 },
      { name: 'Term1', value: '3', index: 1 },
      { name: 'Debtor2', value: 'Green Ltd.', index: 2 },
      { name: 'Amount2', value: '2000000', index: 2 },
      { name: 'Interest2', value: '10', index: 2 },
      { name: 'Term2', value: '7', index: 2 },
    ],
  },
};

// -----------------------------------------------------------------------------
// TV Station (TVGeneral + Antennas + Films)
// -----------------------------------------------------------------------------

const MOCK_TV_STATION: MockBuilding = {
  id: '130300200',
  name: 'Channel 5 News',
  visualClass: 'PGITVStationA',
  x: 500,
  y: 410,
  tabs: [
    { id: 'tvGeneral', name: 'GENERAL', icon: 'i', order: 0, handlerName: 'TVGeneral' },
    { id: 'antennas', name: 'ANTENNAS', icon: 'A', order: 10, handlerName: 'Antennas' },
    { id: 'films', name: 'FILMS', icon: 'F', order: 20, handlerName: 'Films' },
    { id: 'workforce', name: 'WORKFORCE', icon: 'W', order: 30, handlerName: 'Workforce', special: 'workforce' },
  ],
  groups: {
    'tvGeneral': [
      { name: 'Name', value: 'Channel 5 News' },
      { name: 'Creator', value: 'Yellow Inc.' },
      { name: 'Cost', value: '8000000' },
      { name: 'ROI', value: '5' },
      { name: 'Years', value: '2' },
      { name: 'Trouble', value: '0' },
      { name: 'HoursOnAir', value: '80' },
      { name: 'Comercials', value: '30' },
    ],
    'antennas': [
      { name: 'antCount', value: '3' },
      { name: 'antName0', value: 'Tower Alpha', index: 0 },
      { name: 'antTown0', value: 'Shamba', index: 0 },
      { name: 'antViewers0', value: '45000', index: 0 },
      { name: 'antActive0', value: '1', index: 0 },
      { name: 'antName1', value: 'Tower Beta', index: 1 },
      { name: 'antTown1', value: 'Moanda', index: 1 },
      { name: 'antViewers1', value: '32000', index: 1 },
      { name: 'antActive1', value: '1', index: 1 },
      { name: 'antName2', value: 'Tower Gamma', index: 2 },
      { name: 'antTown2', value: 'Likasi', index: 2 },
      { name: 'antViewers2', value: '0', index: 2 },
      { name: 'antActive2', value: '0', index: 2 },
    ],
    'films': [
      { name: 'FilmName', value: 'Shamba Night Live' },
      { name: 'FilmBudget', value: '2500000' },
      { name: 'FilmTime', value: '18' },
      { name: 'InProd', value: 'Shamba Night Live' },
      { name: 'FilmDone', value: '0' },
      { name: 'AutoProd', value: '1' },
      { name: 'AutoRel', value: '0' },
    ],
    'workforce': [
      { name: 'Workers0', value: '10', index: 0 },
      { name: 'WorkersMax0', value: '12', index: 0 },
      { name: 'WorkersK0', value: '92', index: 0 },
      { name: 'Salaries0', value: '100', index: 0 },
      { name: 'WorkForcePrice0', value: '55000', index: 0 },
      { name: 'WorkersCap0', value: '15', index: 0 },
      { name: 'MinSalaries0', value: '85', index: 0 },
      { name: 'SalaryValues0', value: '55000', index: 0 },
      { name: 'Workers1', value: '5', index: 1 },
      { name: 'WorkersMax1', value: '5', index: 1 },
      { name: 'WorkersK1', value: '88', index: 1 },
      { name: 'Salaries1', value: '120', index: 1 },
      { name: 'WorkForcePrice1', value: '78000', index: 1 },
      { name: 'WorkersCap1', value: '8', index: 1 },
      { name: 'MinSalaries1', value: '95', index: 1 },
      { name: 'SalaryValues1', value: '78000', index: 1 },
      { name: 'Workers2', value: '2', index: 2 },
      { name: 'WorkersMax2', value: '2', index: 2 },
      { name: 'WorkersK2', value: '75', index: 2 },
      { name: 'Salaries2', value: '150', index: 2 },
      { name: 'WorkForcePrice2', value: '28000', index: 2 },
      { name: 'WorkersCap2', value: '4', index: 2 },
      { name: 'MinSalaries2', value: '60', index: 2 },
      { name: 'SalaryValues2', value: '28000', index: 2 },
    ],
  },
};

// -----------------------------------------------------------------------------
// Capitol (capitolGeneral + CapitolTowns + Ministeries + Votes)
// -----------------------------------------------------------------------------

const MOCK_CAPITOL: MockBuilding = {
  id: '130400300',
  name: 'National Capitol',
  visualClass: 'PGICapitolA',
  x: 510,
  y: 420,
  tabs: [
    { id: 'capitolGeneral', name: 'GENERAL', icon: 'i', order: 0, handlerName: 'capitolGeneral' },
    { id: 'capitolTowns', name: 'TOWNS', icon: 'T', order: 10, handlerName: 'CapitolTowns' },
    { id: 'ministeries', name: 'MINISTRIES', icon: 'M', order: 20, handlerName: 'Ministeries' },
    { id: 'votes', name: 'VOTES', icon: 'V', order: 30, handlerName: 'Votes' },
  ],
  groups: {
    'capitolGeneral': [
      { name: 'HasRuler', value: '1' },
      { name: 'YearsToElections', value: '2' },
      { name: 'RulerActualPrestige', value: '850' },
      { name: 'RulerRating', value: '72' },
      { name: 'TycoonsRating', value: '65' },
      { name: 'covCount', value: '4' },
      { name: 'covName0.0', value: 'Health', index: 0 },
      { name: 'covValue0', value: '85', index: 0 },
      { name: 'covName1.0', value: 'Education', index: 1 },
      { name: 'covValue1', value: '72', index: 1 },
      { name: 'covName2.0', value: 'Police', index: 2 },
      { name: 'covValue2', value: '90', index: 2 },
      { name: 'covName3.0', value: 'Fire Dept', index: 3 },
      { name: 'covValue3', value: '68', index: 3 },
    ],
    'capitolTowns': [
      { name: 'ActualRuler', value: 'President Crazz' },
      { name: 'TownCount', value: '3' },
      { name: 'Town0', value: 'Shamba', index: 0 },
      { name: 'TownPopulation0', value: '125000', index: 0 },
      { name: 'TownRating0', value: '75', index: 0 },
      { name: 'TownQOL0', value: '68', index: 0 },
      { name: 'TownQOS0', value: '72', index: 0 },
      { name: 'TownWealth0', value: '15000000', index: 0 },
      { name: 'TownTax0', value: '15', index: 0 },
      { name: 'HasMayor0', value: '1', index: 0 },
      { name: 'Town1', value: 'Moanda', index: 1 },
      { name: 'TownPopulation1', value: '85000', index: 1 },
      { name: 'TownRating1', value: '62', index: 1 },
      { name: 'TownQOL1', value: '55', index: 1 },
      { name: 'TownQOS1', value: '60', index: 1 },
      { name: 'TownWealth1', value: '8000000', index: 1 },
      { name: 'TownTax1', value: '12', index: 1 },
      { name: 'HasMayor1', value: '0', index: 1 },
      { name: 'Town2', value: 'Likasi', index: 2 },
      { name: 'TownPopulation2', value: '45000', index: 2 },
      { name: 'TownRating2', value: '50', index: 2 },
      { name: 'TownQOL2', value: '42', index: 2 },
      { name: 'TownQOS2', value: '48', index: 2 },
      { name: 'TownWealth2', value: '3500000', index: 2 },
      { name: 'TownTax2', value: '10', index: 2 },
      { name: 'HasMayor2', value: '0', index: 2 },
    ],
    'ministeries': [
      { name: 'ActualRuler', value: 'President Crazz' },
      { name: 'MinisterCount', value: '3' },
      { name: 'MinistryId0', value: '0', index: 0 },
      { name: 'Ministry0.0', value: 'Health', index: 0 },
      { name: 'Minister0', value: 'Dr. Smith', index: 0 },
      { name: 'MinisterRating0', value: '78', index: 0 },
      { name: 'MinisterBudget0', value: '2000000', index: 0 },
      { name: 'MinistryId1', value: '1', index: 1 },
      { name: 'Ministry1.0', value: 'Education', index: 1 },
      { name: 'Minister1', value: '', index: 1 },
      { name: 'MinisterRating1', value: '0', index: 1 },
      { name: 'MinisterBudget1', value: '1500000', index: 1 },
      { name: 'MinistryId2', value: '2', index: 2 },
      { name: 'Ministry2.0', value: 'Defense', index: 2 },
      { name: 'Minister2', value: 'Gen. Brown', index: 2 },
      { name: 'MinisterRating2', value: '82', index: 2 },
      { name: 'MinisterBudget2', value: '3000000', index: 2 },
    ],
    'votes': [
      { name: 'RulerName', value: 'President Crazz' },
      { name: 'RulerVotes', value: '15200' },
      { name: 'RulerCmpRat', value: '72' },
      { name: 'RulerCmpPnts', value: '8500' },
      { name: 'VoteOf', value: 'Senator Adams' },
      { name: 'CampaignCount', value: '2' },
      { name: 'Candidate0', value: 'Senator Adams', index: 0 },
      { name: 'Votes0', value: '8900', index: 0 },
      { name: 'CmpRat0', value: '45', index: 0 },
      { name: 'CmpPnts0', value: '4200', index: 0 },
      { name: 'Candidate1', value: 'Mayor Wilson', index: 1 },
      { name: 'Votes1', value: '6300', index: 1 },
      { name: 'CmpRat1', value: '38', index: 1 },
      { name: 'CmpPnts1', value: '3100', index: 1 },
    ],
  },
};

// -----------------------------------------------------------------------------
// Town Hall (townGeneral + townJobs + townRes + townServices + townTaxes)
// -----------------------------------------------------------------------------

const MOCK_TOWN_HALL: MockBuilding = {
  id: '130500400',
  name: 'Shamba Town Hall',
  visualClass: 'PGITownHallA',
  x: 520,
  y: 430,
  tabs: [
    { id: 'townGeneral', name: 'GENERAL', icon: 'i', order: 0, handlerName: 'townGeneral' },
    { id: 'townJobs', name: 'JOBS', icon: 'J', order: 10, handlerName: 'townJobs' },
    { id: 'townRes', name: 'RESIDENTIAL', icon: 'R', order: 20, handlerName: 'townRes' },
    { id: 'townServices', name: 'SERVICES', icon: 'S', order: 30, handlerName: 'townServices' },
    { id: 'townTaxes', name: 'TAXES', icon: 'T', order: 40, handlerName: 'townTaxes' },
  ],
  groups: {
    'townGeneral': [
      { name: 'ActualRuler', value: 'Mayor Chen' },
      { name: 'Town', value: 'Shamba' },
      { name: 'NewspaperName', value: 'Shamba Daily' },
      { name: 'RulerPrestige', value: '620' },
      { name: 'RulerRating', value: '68' },
      { name: 'TycoonsRating', value: '55' },
      { name: 'YearsToElections', value: '3' },
      { name: 'HasRuler', value: '1' },
      { name: 'RulerPeriods', value: '2' },
      { name: 'covCount', value: '3' },
      { name: 'covName0.0', value: 'Health', index: 0 },
      { name: 'covValue0', value: '78', index: 0 },
      { name: 'covName1.0', value: 'Education', index: 1 },
      { name: 'covValue1', value: '65', index: 1 },
      { name: 'covName2.0', value: 'Police', index: 2 },
      { name: 'covValue2', value: '82', index: 2 },
    ],
    'townJobs': [
      { name: 'hiWorkDemand', value: '125' },
      { name: 'hiPrivateWorkDemand', value: '45' },
      { name: 'hiSalary', value: '72' },
      { name: 'hiSalaryValue', value: '65' },
      { name: 'hiActualMinSalary', value: '150' },
      { name: 'midWorkDemand', value: '340' },
      { name: 'midPrivateWorkDemand', value: '120' },
      { name: 'midSalary', value: '58' },
      { name: 'midSalaryValue', value: '50' },
      { name: 'midActualMinSalary', value: '100' },
      { name: 'loWorkDemand', value: '890' },
      { name: 'loPrivateWorkDemand', value: '350' },
      { name: 'loSalary', value: '45' },
      { name: 'loSalaryValue', value: '38' },
      { name: 'loActualMinSalary', value: '60' },
    ],
    'townRes': [
      { name: 'hiResDemand', value: '250' },
      { name: 'hiResQ', value: '1200' },
      { name: 'hiRentPrice', value: '350' },
      { name: 'midResDemand', value: '800' },
      { name: 'midResQ', value: '5400' },
      { name: 'midRentPrice', value: '120' },
      { name: 'loResDemand', value: '1500' },
      { name: 'loResQ', value: '12000' },
      { name: 'loRentPrice', value: '45' },
    ],
    'townServices': [
      { name: 'prdCount', value: '3' },
      { name: 'prdName0.0', value: 'Fresh Food', index: 0 },
      { name: 'prdInputValue0', value: '500', index: 0 },
      { name: 'prdInputCapacity0', value: '800', index: 0 },
      { name: 'prdInputQuality0', value: '72', index: 0 },
      { name: 'prdInputPrice0', value: '25', index: 0 },
      { name: 'prdOutputValue0', value: '450', index: 0 },
      { name: 'prdOutputCapacity0', value: '600', index: 0 },
      { name: 'prdOutputQuality0', value: '68', index: 0 },
      { name: 'prdOutputPrice0', value: '35', index: 0 },
      { name: 'prdName1.0', value: 'Clothes', index: 1 },
      { name: 'prdInputValue1', value: '300', index: 1 },
      { name: 'prdInputCapacity1', value: '500', index: 1 },
      { name: 'prdInputQuality1', value: '65', index: 1 },
      { name: 'prdInputPrice1', value: '40', index: 1 },
      { name: 'prdOutputValue1', value: '280', index: 1 },
      { name: 'prdOutputCapacity1', value: '450', index: 1 },
      { name: 'prdOutputQuality1', value: '60', index: 1 },
      { name: 'prdOutputPrice1', value: '55', index: 1 },
      { name: 'prdName2.0', value: 'Electronics', index: 2 },
      { name: 'prdInputValue2', value: '100', index: 2 },
      { name: 'prdInputCapacity2', value: '200', index: 2 },
      { name: 'prdInputQuality2', value: '80', index: 2 },
      { name: 'prdInputPrice2', value: '120', index: 2 },
      { name: 'prdOutputValue2', value: '90', index: 2 },
      { name: 'prdOutputCapacity2', value: '180', index: 2 },
      { name: 'prdOutputQuality2', value: '75', index: 2 },
      { name: 'prdOutputPrice2', value: '150', index: 2 },
    ],
    'townTaxes': [
      { name: 'TaxCount', value: '3' },
      { name: 'Tax0Name.0', value: 'Income Tax', index: 0 },
      { name: 'Tax0Kind', value: 'Progressive', index: 0 },
      { name: 'Tax0Percent', value: '15', index: 0 },
      { name: 'Tax0LastYear', value: '2500000', index: 0 },
      { name: 'Tax1Name.0', value: 'Sales Tax', index: 1 },
      { name: 'Tax1Kind', value: 'Flat', index: 1 },
      { name: 'Tax1Percent', value: '8', index: 1 },
      { name: 'Tax1LastYear', value: '1800000', index: 1 },
      { name: 'Tax2Name.0', value: 'Property Tax', index: 2 },
      { name: 'Tax2Kind', value: 'Proportional', index: 2 },
      { name: 'Tax2Percent', value: '12', index: 2 },
      { name: 'Tax2LastYear', value: '3200000', index: 2 },
    ],
  },
};

// -----------------------------------------------------------------------------
// Residential (ResGeneral + Workforce)
// -----------------------------------------------------------------------------

const MOCK_RESIDENTIAL: MockBuilding = {
  id: '130600500',
  name: 'Luxury Apartments',
  visualClass: 'PGIHiResA',
  x: 530,
  y: 440,
  tabs: [
    { id: 'resGeneral', name: 'GENERAL', icon: 'i', order: 0, handlerName: 'ResGeneral' },
  ],
  groups: {
    'resGeneral': [
      { name: 'Name', value: 'Luxury Apartments' },
      { name: 'Creator', value: 'Yellow Inc.' },
      { name: 'Cost', value: '500000' },
      { name: 'ROI', value: '8' },
      { name: 'Years', value: '5' },
      { name: 'Trouble', value: '0' },
      { name: 'Occupancy', value: '85' },
      { name: 'Inhabitants', value: '240' },
      { name: 'QOL', value: '72' },
      { name: 'Beauty', value: '65' },
      { name: 'Crime', value: '12' },
      { name: 'Pollution', value: '8' },
      { name: 'invCrimeRes', value: '100' },
      { name: 'invPollutionRes', value: '100' },
      { name: 'invPrivacy', value: '100' },
      { name: 'InvBeauty', value: '100' },
      { name: 'Rent', value: '120' },
      { name: 'Maintenance', value: '80' },
      { name: 'Repair', value: '' },
      { name: 'RepairPrice', value: '0' },
    ],
  },
};

// -----------------------------------------------------------------------------
// Warehouse (WHGeneral)
// -----------------------------------------------------------------------------

const MOCK_WAREHOUSE: MockBuilding = {
  id: '130700600',
  name: 'Central Warehouse',
  visualClass: 'PGIWarehouseA',
  x: 540,
  y: 450,
  tabs: [
    { id: 'whGeneral', name: 'GENERAL', icon: 'i', order: 0, handlerName: 'WHGeneral' },
  ],
  groups: {
    'whGeneral': [
      { name: 'Name', value: 'Central Warehouse' },
      { name: 'Creator', value: 'Yellow Inc.' },
      { name: 'Cost', value: '350000' },
      { name: 'ROI', value: '3' },
      { name: 'Years', value: '5' },
      { name: 'Trouble', value: '0' },
      { name: 'TradeRole', value: '2' },
      { name: 'TradeLevel', value: '3' },
      { name: 'GateMap', value: '101' },
    ],
  },
  warehouseWares: [
    { name: 'Pharmaceutics', enabled: true, index: 0 },
    { name: 'Processed Food', enabled: false, index: 1 },
    { name: 'Fresh Food', enabled: true, index: 2 },
  ],
};

// -----------------------------------------------------------------------------
// Mausoleum
// -----------------------------------------------------------------------------

const MOCK_MAUSOLEUM: MockBuilding = {
  id: '130800700',
  name: 'Memorial Park',
  visualClass: 'PGIMausoleumA',
  x: 550,
  y: 460,
  tabs: [
    { id: 'mausoleum', name: 'MEMORIAL', icon: 'M', order: 0, handlerName: 'Mausoleum' },
  ],
  groups: {
    'mausoleum': [
      { name: 'WordsOfWisdom', value: 'Build wisely, prosper greatly.' },
      { name: 'OwnerName', value: 'Founder Crazz' },
      { name: 'Transcended', value: '0' },
    ],
  },
};

// =============================================================================
// ALL MOCK BUILDINGS
// =============================================================================

const ALL_MOCK_BUILDINGS: MockBuilding[] = [
  MOCK_FACTORY,
  MOCK_STORE,
  MOCK_BANK,
  MOCK_TV_STATION,
  MOCK_CAPITOL,
  MOCK_TOWN_HALL,
  MOCK_RESIDENTIAL,
  MOCK_WAREHOUSE,
  MOCK_MAUSOLEUM,
];

// =============================================================================
// SCENARIO FACTORY
// =============================================================================

function buildDetailsResponse(
  building: MockBuilding,
  vars: ScenarioVariables
): BuildingDetailsResponse {
  return {
    buildingId: building.id,
    x: building.x,
    y: building.y,
    visualClass: building.visualClass,
    templateName: building.visualClass,
    buildingName: building.name,
    ownerName: vars.companyName,
    securityId: vars.securityId,
    tabs: building.tabs,
    groups: building.groups,
    supplies: building.supplies,
    products: building.products,
    warehouseWares: building.warehouseWares,
    moneyGraph: building.moneyGraph,
    timestamp: Date.now(),
  };
}

export function createBuildingDetailsScenario(
  overrides?: Partial<ScenarioVariables>
): { ws: WsCaptureScenario; rdo: RdoScenario } {
  const vars = mergeVariables(overrides);

  // Build WS exchanges: one per mock building
  const wsExchanges = ALL_MOCK_BUILDINGS.map((building, idx) => ({
    id: `bd-ws-${String(idx + 1).padStart(3, '0')}`,
    timestamp: `2026-02-22T21:30:${String(idx * 5).padStart(2, '0')}.000Z`,
    request: {
      type: WsMessageType.REQ_BUILDING_DETAILS,
      wsRequestId: `bd-${String(idx + 1).padStart(3, '0')}`,
      x: building.x,
      y: building.y,
      visualClass: building.visualClass,
    } as WsMessage,
    responses: [
      {
        type: WsMessageType.RESP_BUILDING_DETAILS,
        wsRequestId: `bd-${String(idx + 1).padStart(3, '0')}`,
        details: buildDetailsResponse(building, vars),
      } as WsMessage,
    ],
    tags: ['building-details'],
  }));

  // Build RDO exchanges: GetPropertyList for each group's properties
  const rdoExchanges = ALL_MOCK_BUILDINGS.flatMap((building, bIdx) => {
    return Object.entries(building.groups).map(([_groupId, props], gIdx) => {
      // Build tab-delimited property names query
      const propNames = props.map(p => p.name).join('\t') + '\t';
      // Build tab-delimited values response
      const propValues = props.map(p => p.value).join('\t');

      return {
        id: `bd-rdo-${String(bIdx + 1).padStart(2, '0')}${String(gIdx + 1).padStart(2, '0')}`,
        request: `C 200 sel * call GetPropertyList "^" "%${propNames}"`,
        response: `A200 res="%${propValues}"`,
        matchKeys: {
          verb: 'sel',
          action: 'call',
          member: 'GetPropertyList',
          argsPattern: [`"%${propNames}"`],
        },
      };
    });
  });

  const ws: WsCaptureScenario = {
    name: 'building-details',
    description: 'Building inspector details for all handler types',
    capturedAt: '2026-02-22',
    serverInfo: { world: vars.worldName, zone: 'BETA', date: '2026-02-22' },
    exchanges: wsExchanges,
  };

  const rdo: RdoScenario = {
    name: 'building-details',
    description: 'GetPropertyList RDO calls for building details tabs',
    exchanges: rdoExchanges,
    variables: vars as unknown as Record<string, string>,
  };

  return { ws, rdo };
}

// Export for testing
export {
  ALL_MOCK_BUILDINGS,
  MOCK_FACTORY,
  MOCK_STORE,
  MOCK_BANK,
  MOCK_TV_STATION,
  MOCK_CAPITOL,
  MOCK_TOWN_HALL,
  MOCK_RESIDENTIAL,
  MOCK_WAREHOUSE,
  MOCK_MAUSOLEUM,
};
export type { MockBuilding };
