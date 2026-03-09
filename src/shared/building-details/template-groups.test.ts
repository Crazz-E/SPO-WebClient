/**
 * Unit Tests for Template Groups (Handler Registry)
 *
 * Verifies that all CLASSES.BIN handlers have dedicated PropertyGroup definitions
 * with correct RDO property names matching the Voyager Delphi source.
 */

import { describe, it, expect } from '@jest/globals';
import { PropertyType } from './property-definitions';
import {
  HANDLER_TO_GROUP,
  GROUP_BY_ID,
  getGroupById,
  GENERIC_GROUP,
  UNK_GENERAL_GROUP,
  IND_GENERAL_GROUP,
  SRV_GENERAL_GROUP,
  RES_GENERAL_GROUP,
  HQ_GENERAL_GROUP,
  BANK_GENERAL_GROUP,
  WH_GENERAL_GROUP,
  TV_GENERAL_GROUP,
  CAPITOL_GENERAL_GROUP,
  TOWN_GENERAL_GROUP,
  WORKFORCE_GROUP,
  SUPPLIES_GROUP,
  PRODUCTS_GROUP,
  ADVERTISEMENT_GROUP,
  UPGRADE_GROUP,
  FINANCES_GROUP,
  BANK_LOANS_GROUP,
  ANTENNAS_GROUP,
  FILMS_GROUP,
  MAUSOLEUM_GROUP,
  VOTES_GROUP,
  CAPITOL_TOWNS_GROUP,
  MINISTERIES_GROUP,
  TOWN_JOBS_GROUP,
  TOWN_RES_GROUP,
  TOWN_SERVICES_GROUP,
  TOWN_PRODUCTS_GROUP,
  TOWN_TAXES_GROUP,
  ADS_GROUP,
} from './template-groups';
import {
  collectTemplatePropertyNamesStructured,
  registerInspectorTabs,
  getTemplateForVisualClass,
  clearInspectorTabsCache,
} from './property-templates';

describe('HANDLER_TO_GROUP mapping', () => {
  it('should map all 29 CLASSES.BIN handler names', () => {
    const expectedHandlers = [
      'unkGeneral', 'ResGeneral', 'IndGeneral', 'SrvGeneral',
      'HqGeneral', 'BankGeneral', 'WHGeneral', 'TVGeneral',
      'capitolGeneral', 'townGeneral',
      'Supplies', 'Products', 'compInputs', 'Ads', 'Workforce', 'facManagement', 'Chart',
      'BankLoans', 'Antennas', 'Films', 'Mausoleum',
      'Votes', 'CapitolTowns', 'Ministeries',
      'townJobs', 'townRes', 'townServices', 'townProducts', 'townTaxes',
    ];
    for (const handler of expectedHandlers) {
      expect(HANDLER_TO_GROUP[handler]).toBeDefined();
    }
  });

  it('should map all handlers to non-GENERIC groups', () => {
    const genericHandlers = Object.entries(HANDLER_TO_GROUP)
      .filter(([, group]) => group === GENERIC_GROUP)
      .map(([name]) => name);

    expect(genericHandlers).toEqual([]);
  });

  it('should map each general handler to a unique group', () => {
    expect(HANDLER_TO_GROUP['unkGeneral']).toBe(UNK_GENERAL_GROUP);
    expect(HANDLER_TO_GROUP['ResGeneral']).toBe(RES_GENERAL_GROUP);
    expect(HANDLER_TO_GROUP['IndGeneral']).toBe(IND_GENERAL_GROUP);
    expect(HANDLER_TO_GROUP['SrvGeneral']).toBe(SRV_GENERAL_GROUP);
    expect(HANDLER_TO_GROUP['HqGeneral']).toBe(HQ_GENERAL_GROUP);
    expect(HANDLER_TO_GROUP['BankGeneral']).toBe(BANK_GENERAL_GROUP);
    expect(HANDLER_TO_GROUP['WHGeneral']).toBe(WH_GENERAL_GROUP);
    expect(HANDLER_TO_GROUP['TVGeneral']).toBe(TV_GENERAL_GROUP);
    expect(HANDLER_TO_GROUP['capitolGeneral']).toBe(CAPITOL_GENERAL_GROUP);
    expect(HANDLER_TO_GROUP['townGeneral']).toBe(TOWN_GENERAL_GROUP);
  });

  it('should map core handlers to existing groups', () => {
    expect(HANDLER_TO_GROUP['Supplies']).toBe(SUPPLIES_GROUP);
    expect(HANDLER_TO_GROUP['Products']).toBe(PRODUCTS_GROUP);
    expect(HANDLER_TO_GROUP['compInputs']).toBe(ADVERTISEMENT_GROUP);
    expect(HANDLER_TO_GROUP['Workforce']).toBe(WORKFORCE_GROUP);
    expect(HANDLER_TO_GROUP['facManagement']).toBe(UPGRADE_GROUP);
    expect(HANDLER_TO_GROUP['Chart']).toBe(FINANCES_GROUP);
  });

  it('should map specialized handlers to dedicated groups', () => {
    expect(HANDLER_TO_GROUP['BankLoans']).toBe(BANK_LOANS_GROUP);
    expect(HANDLER_TO_GROUP['Antennas']).toBe(ANTENNAS_GROUP);
    expect(HANDLER_TO_GROUP['Films']).toBe(FILMS_GROUP);
    expect(HANDLER_TO_GROUP['Mausoleum']).toBe(MAUSOLEUM_GROUP);
    expect(HANDLER_TO_GROUP['Votes']).toBe(VOTES_GROUP);
    expect(HANDLER_TO_GROUP['CapitolTowns']).toBe(CAPITOL_TOWNS_GROUP);
    expect(HANDLER_TO_GROUP['Ministeries']).toBe(MINISTERIES_GROUP);
    expect(HANDLER_TO_GROUP['townJobs']).toBe(TOWN_JOBS_GROUP);
    expect(HANDLER_TO_GROUP['townRes']).toBe(TOWN_RES_GROUP);
    expect(HANDLER_TO_GROUP['townServices']).toBe(TOWN_SERVICES_GROUP);
    expect(HANDLER_TO_GROUP['townTaxes']).toBe(TOWN_TAXES_GROUP);
  });
});

describe('GROUP_BY_ID lookup', () => {
  it('should contain all group IDs', () => {
    const expectedIds = [
      'overview', 'generic',
      'unkGeneral', 'indGeneral', 'srvGeneral', 'resGeneral',
      'hqGeneral', 'bankGeneral', 'whGeneral', 'tvGeneral',
      'capitolGeneral', 'townGeneral',
      'workforce', 'supplies', 'upgrade', 'finances',
      'advertisement', 'town', 'coverage', 'trade', 'localServices',
      'bankLoans', 'antennas', 'films', 'mausoleum',
      'votes', 'capitolTowns', 'ministeries',
      'townJobs', 'townRes', 'townServices', 'townTaxes',
    ];
    for (const id of expectedIds) {
      expect(GROUP_BY_ID[id]).toBeDefined();
    }
  });
});

describe('getGroupById()', () => {
  it('should resolve direct IDs', () => {
    expect(getGroupById('workforce')).toBe(WORKFORCE_GROUP);
    expect(getGroupById('bankLoans')).toBe(BANK_LOANS_GROUP);
    expect(getGroupById('townTaxes')).toBe(TOWN_TAXES_GROUP);
  });

  it('should resolve handler-suffixed IDs', () => {
    // When registerInspectorTabs creates duplicate IDs, they get suffixed
    expect(getGroupById('generic_Ministeries')).toBe(GENERIC_GROUP);
    expect(getGroupById('generic_BankLoans')).toBe(GENERIC_GROUP);
  });

  it('should return undefined for unknown IDs', () => {
    expect(getGroupById('nonexistent')).toBeUndefined();
    expect(getGroupById('foo_bar')).toBeUndefined();
  });
});

describe('General handler RDO properties', () => {
  it('IndGeneral should have trade properties', () => {
    const rdoNames = IND_GENERAL_GROUP.properties.map(p => p.rdoName);
    expect(rdoNames).toContain('Name');
    expect(rdoNames).toContain('Creator');
    expect(rdoNames).toContain('Cost');
    expect(rdoNames).toContain('ROI');
    expect(rdoNames).toContain('TradeRole');
    expect(rdoNames).toContain('TradeLevel');
  });

  it('IndGeneral should have rdoCommands for trade settings', () => {
    expect(IND_GENERAL_GROUP.rdoCommands).toBeDefined();
    expect(IND_GENERAL_GROUP.rdoCommands!['TradeLevel']?.command).toBe('RDOSetTradeLevel');
    expect(IND_GENERAL_GROUP.rdoCommands!['TradeRole']?.command).toBe('RDOSetRole');
  });

  it('ResGeneral should have Rent and Maintenance sliders', () => {
    const rentProp = RES_GENERAL_GROUP.properties.find(p => p.rdoName === 'Rent');
    expect(rentProp).toBeDefined();
    expect(rentProp!.type).toBe(PropertyType.SLIDER);
    expect(rentProp!.editable).toBe(true);

    const maintProp = RES_GENERAL_GROUP.properties.find(p => p.rdoName === 'Maintenance');
    expect(maintProp).toBeDefined();
    expect(maintProp!.type).toBe(PropertyType.SLIDER);
    expect(maintProp!.editable).toBe(true);
  });

  it('ResGeneral should have 20 properties (PopulatedBlock stats + investment sliders + repair control + stop toggle + demolish)', () => {
    expect(RES_GENERAL_GROUP.properties).toHaveLength(20);
  });

  it('ResGeneral should have residential stats from PopulatedBlock.StoreToCache', () => {
    const rdoNames = RES_GENERAL_GROUP.properties.map(p => p.rdoName);
    expect(rdoNames).toContain('Occupancy');
    expect(rdoNames).toContain('Inhabitants');
    expect(rdoNames).toContain('QOL');
    expect(rdoNames).toContain('Beauty');
    expect(rdoNames).toContain('Crime');
    expect(rdoNames).toContain('Pollution');
  });

  it('ResGeneral should have investment properties as read-only PERCENTAGE (not editable)', () => {
    const investmentProps = ['invCrimeRes', 'invPollutionRes', 'invPrivacy', 'InvBeauty'];
    for (const propName of investmentProps) {
      const prop = RES_GENERAL_GROUP.properties.find(p => p.rdoName === propName);
      expect(prop).toBeDefined();
      expect(prop!.type).toBe(PropertyType.PERCENTAGE);
      expect(prop!.editable).toBeUndefined();
    }
  });

  it('ResGeneral should have rdoCommands for editable sliders (Rent, Maintenance only)', () => {
    const editableSliders = ['Rent', 'Maintenance'];
    for (const name of editableSliders) {
      expect(RES_GENERAL_GROUP.rdoCommands![name]).toBeDefined();
      expect(RES_GENERAL_GROUP.rdoCommands![name].command).toBe('property');
    }
    // Investment properties are read-only — no rdoCommands
    const readOnlyProps = ['invCrimeRes', 'invPollutionRes', 'invPrivacy', 'InvBeauty'];
    for (const name of readOnlyProps) {
      expect(RES_GENERAL_GROUP.rdoCommands![name]).toBeUndefined();
    }
  });

  it('ResGeneral should have REPAIR_CONTROL with RepairPrice as maxProperty', () => {
    const repair = RES_GENERAL_GROUP.properties.find(p => p.rdoName === 'Repair');
    expect(repair).toBeDefined();
    expect(repair!.type).toBe(PropertyType.REPAIR_CONTROL);
    expect(repair!.maxProperty).toBe('RepairPrice');
  });

  it('BankGeneral should have BudgetPerc slider', () => {
    const budgetProp = BANK_GENERAL_GROUP.properties.find(p => p.rdoName === 'BudgetPerc');
    expect(budgetProp).toBeDefined();
    expect(budgetProp!.type).toBe(PropertyType.SLIDER);
    expect(budgetProp!.editable).toBe(true);
    expect(BANK_GENERAL_GROUP.rdoCommands!['BudgetPerc']?.command).toBe('RDOSetLoanPerc');
  });

  it('TVGeneral should have HoursOnAir and Comercials sliders', () => {
    const hoursOnAir = TV_GENERAL_GROUP.properties.find(p => p.rdoName === 'HoursOnAir');
    expect(hoursOnAir).toBeDefined();
    expect(hoursOnAir!.type).toBe(PropertyType.SLIDER);

    const comercials = TV_GENERAL_GROUP.properties.find(p => p.rdoName === 'Comercials');
    expect(comercials).toBeDefined();
    expect(comercials!.type).toBe(PropertyType.SLIDER);
  });

  it('capitolGeneral should have coverage TABLE', () => {
    const tableProp = CAPITOL_GENERAL_GROUP.properties.find(p => p.type === PropertyType.TABLE);
    expect(tableProp).toBeDefined();
    expect(tableProp!.countProperty).toBe('covCount');
    expect(tableProp!.columns).toHaveLength(2);
    expect(tableProp!.columns![0].rdoSuffix).toBe('covName');
    expect(tableProp!.columns![1].rdoSuffix).toBe('covValue');
  });

  it('townGeneral should have coverage TABLE and mayor properties', () => {
    const rdoNames = TOWN_GENERAL_GROUP.properties.map(p => p.rdoName);
    expect(rdoNames).toContain('ActualRuler');
    expect(rdoNames).toContain('Town');
    expect(rdoNames).toContain('NewspaperName');
    expect(rdoNames).toContain('RulerPrestige');
    expect(rdoNames).toContain('HasRuler');

    const tableProp = TOWN_GENERAL_GROUP.properties.find(p => p.type === PropertyType.TABLE);
    expect(tableProp).toBeDefined();
    expect(tableProp!.countProperty).toBe('covCount');
    // TownHall: covName uses MLS (.0 suffix), covValue is plain integer (no suffix)
    // Population.pas:1090 — StoreMultiStringToCache for covName, WriteInteger for covValue
    expect(tableProp!.indexSuffix).toBe('.0');
    const covNameCol = tableProp!.columns!.find(c => c.rdoSuffix === 'covName');
    expect(covNameCol!.indexSuffix).toBeUndefined(); // inherits table-level '.0'
    const covValueCol = tableProp!.columns!.find(c => c.rdoSuffix === 'covValue');
    expect(covValueCol!.indexSuffix).toBe(''); // overrides to '' — covValue is plain integer
  });

  it('SrvGeneral should have SERVICE_CARDS with editable price column', () => {
    const cardProp = SRV_GENERAL_GROUP.properties.find(p => p.type === PropertyType.SERVICE_CARDS);
    expect(cardProp).toBeDefined();
    expect(cardProp!.countProperty).toBe('ServiceCount');
    expect(cardProp!.columns).toHaveLength(6);

    const priceCol = cardProp!.columns!.find(c => c.rdoSuffix === 'srvPrices');
    expect(priceCol).toBeDefined();
    expect(priceCol!.editable).toBe(true);
    expect(priceCol!.type).toBe(PropertyType.SLIDER);
  });
});

describe('Specialized handler RDO properties', () => {
  it('BankLoans should have loan TABLE', () => {
    const tableProp = BANK_LOANS_GROUP.properties.find(p => p.type === PropertyType.TABLE);
    expect(tableProp).toBeDefined();
    expect(tableProp!.countProperty).toBe('LoanCount');
    expect(tableProp!.columns).toHaveLength(4);
    const colNames = tableProp!.columns!.map(c => c.rdoSuffix);
    expect(colNames).toEqual(['Debtor', 'Amount', 'Interest', 'Term']);
  });

  it('Antennas should have antenna TABLE', () => {
    const tableProp = ANTENNAS_GROUP.properties.find(p => p.type === PropertyType.TABLE);
    expect(tableProp).toBeDefined();
    expect(tableProp!.countProperty).toBe('antCount');
    expect(tableProp!.columns).toHaveLength(6);
    const colNames = tableProp!.columns!.map(c => c.rdoSuffix);
    expect(colNames).toEqual(['antName', 'antTown', 'antViewers', 'antActive', 'antX', 'antY']);
  });

  it('Films should have 10 properties (display + controls + action buttons)', () => {
    expect(FILMS_GROUP.properties).toHaveLength(10);
  });

  it('Films should have display properties from FilmsSheet.pas', () => {
    const rdoNames = FILMS_GROUP.properties.map(p => p.rdoName);
    expect(rdoNames).toContain('FilmName');
    expect(rdoNames).toContain('FilmBudget');
    expect(rdoNames).toContain('FilmTime');

    const filmName = FILMS_GROUP.properties.find(p => p.rdoName === 'FilmName');
    expect(filmName!.type).toBe(PropertyType.TEXT);

    const filmBudget = FILMS_GROUP.properties.find(p => p.rdoName === 'FilmBudget');
    expect(filmBudget!.type).toBe(PropertyType.CURRENCY);

    const filmTime = FILMS_GROUP.properties.find(p => p.rdoName === 'FilmTime');
    expect(filmTime!.type).toBe(PropertyType.NUMBER);
    expect(filmTime!.unit).toBe('months');
  });

  it('Films should have production properties with editable booleans', () => {
    const rdoNames = FILMS_GROUP.properties.map(p => p.rdoName);
    expect(rdoNames).toContain('InProd');
    expect(rdoNames).toContain('FilmDone');
    expect(rdoNames).toContain('AutoProd');
    expect(rdoNames).toContain('AutoRel');

    const autoProd = FILMS_GROUP.properties.find(p => p.rdoName === 'AutoProd');
    expect(autoProd!.type).toBe(PropertyType.BOOLEAN);
    expect(autoProd!.editable).toBe(true);

    const autoRel = FILMS_GROUP.properties.find(p => p.rdoName === 'AutoRel');
    expect(autoRel!.type).toBe(PropertyType.BOOLEAN);
    expect(autoRel!.editable).toBe(true);

    expect(FILMS_GROUP.rdoCommands!['AutoProd']?.command).toBe('RDOAutoProduce');
    expect(FILMS_GROUP.rdoCommands!['AutoRel']?.command).toBe('RDOAutoRelease');
  });

  it('Mausoleum should have memorial properties', () => {
    const rdoNames = MAUSOLEUM_GROUP.properties.map(p => p.rdoName);
    expect(rdoNames).toContain('WordsOfWisdom');
    expect(rdoNames).toContain('OwnerName');
    expect(rdoNames).toContain('Transcended');
  });

  it('Votes should have ruler properties and candidate TABLE', () => {
    const rdoNames = VOTES_GROUP.properties.map(p => p.rdoName);
    expect(rdoNames).toContain('RulerName');
    expect(rdoNames).toContain('RulerVotes');

    const tableProp = VOTES_GROUP.properties.find(p => p.type === PropertyType.TABLE);
    expect(tableProp).toBeDefined();
    expect(tableProp!.countProperty).toBe('CampaignCount');
  });

  it('CapitolTowns should have town TABLE', () => {
    const tableProp = CAPITOL_TOWNS_GROUP.properties.find(p => p.type === PropertyType.TABLE);
    expect(tableProp).toBeDefined();
    expect(tableProp!.countProperty).toBe('TownCount');
    expect(tableProp!.columns!.length).toBeGreaterThanOrEqual(6);
  });

  it('Ministeries should have minister TABLE with MLS indexSuffix on Ministry column', () => {
    const tableProp = MINISTERIES_GROUP.properties.find(p => p.type === PropertyType.TABLE);
    expect(tableProp).toBeDefined();
    expect(tableProp!.countProperty).toBe('MinisterCount');
    // Property-level indexSuffix is undefined; column-level indexSuffix handles MLS
    expect(tableProp!.indexSuffix).toBeUndefined();
    const ministryCol = tableProp!.columns!.find(c => c.rdoSuffix === 'Ministry');
    expect(ministryCol!.indexSuffix).toBe('.0');
  });

  it('townJobs should have salary properties', () => {
    const rdoNames = TOWN_JOBS_GROUP.properties.map(p => p.rdoName);
    expect(rdoNames).toContain('hiActualMinSalary');
    expect(rdoNames).toContain('midActualMinSalary');
    expect(rdoNames).toContain('loActualMinSalary');
  });

  it('townServices should have svr* TABLE with 8 columns (from TownProdxSheet.pas)', () => {
    const tableProp = TOWN_SERVICES_GROUP.properties.find(p => p.type === PropertyType.TABLE);
    expect(tableProp).toBeDefined();
    expect(tableProp!.countProperty).toBe('srvCount');
    expect(tableProp!.columns).toHaveLength(8);
    const colNames = tableProp!.columns!.map(c => c.rdoSuffix);
    expect(colNames).toContain('svrName');
    expect(colNames).toContain('svrDemand');
    expect(colNames).toContain('svrOffer');
    expect(colNames).toContain('svrCapacity');
    expect(colNames).toContain('svrRatio');
    expect(colNames).toContain('svrMarketPrice');
    expect(colNames).toContain('svrPrice');
    expect(colNames).toContain('svrQuality');
    // GQOS should be a standalone property
    const gqos = TOWN_SERVICES_GROUP.properties.find(p => p.rdoName === 'GQOS');
    expect(gqos).toBeDefined();
    expect(gqos!.type).toBe(PropertyType.PERCENTAGE);
  });

  it('townRes should have 9 residential properties (3 classes × 3 metrics)', () => {
    const rdoNames = TOWN_RES_GROUP.properties.map(p => p.rdoName);
    expect(rdoNames).toContain('hiResDemand');
    expect(rdoNames).toContain('hiResQ');
    expect(rdoNames).toContain('hiRentPrice');
    expect(rdoNames).toContain('midResDemand');
    expect(rdoNames).toContain('midResQ');
    expect(rdoNames).toContain('midRentPrice');
    expect(rdoNames).toContain('loResDemand');
    expect(rdoNames).toContain('loResQ');
    expect(rdoNames).toContain('loRentPrice');
    expect(TOWN_RES_GROUP.properties).toHaveLength(9);

    // Rent prices should be PERCENTAGE type (displayed as "200%")
    const hiRent = TOWN_RES_GROUP.properties.find(p => p.rdoName === 'hiRentPrice');
    expect(hiRent!.type).toBe(PropertyType.PERCENTAGE);
  });
});

describe('ENUM type properties', () => {
  it('IndGeneral should use ENUM type for TradeRole and TradeLevel', () => {
    const tradeRole = IND_GENERAL_GROUP.properties.find(p => p.rdoName === 'TradeRole');
    expect(tradeRole!.type).toBe(PropertyType.ENUM);
    expect(tradeRole!.enumLabels).toBeDefined();
    expect(tradeRole!.enumLabels!['0']).toBe('Neutral');
    expect(tradeRole!.enumLabels!['3']).toBe('Buyer');

    const tradeLevel = IND_GENERAL_GROUP.properties.find(p => p.rdoName === 'TradeLevel');
    expect(tradeLevel!.type).toBe(PropertyType.ENUM);
    expect(tradeLevel!.editable).toBe(true);
    expect(tradeLevel!.enumLabels!['0']).toBe('Same Owner');
    expect(tradeLevel!.enumLabels!['3']).toBe('Anyone');
  });

  it('WHGeneral should use ENUM type for Role and TradeLevel', () => {
    const role = WH_GENERAL_GROUP.properties.find(p => p.rdoName === 'Role');
    expect(role!.type).toBe(PropertyType.ENUM);

    const tradeLevel = WH_GENERAL_GROUP.properties.find(p => p.rdoName === 'TradeLevel');
    expect(tradeLevel!.type).toBe(PropertyType.ENUM);
    expect(tradeLevel!.editable).toBe(true);
  });

  it('IndGeneral TradeRole should use ENUM type with facility role labels', () => {
    const tradeRole = IND_GENERAL_GROUP.properties.find(p => p.rdoName === 'TradeRole');
    expect(tradeRole!.type).toBe(PropertyType.ENUM);
    expect(tradeRole!.editable).toBe(true);
    expect(tradeRole!.enumLabels!['1']).toBe('Producer');
    expect(tradeRole!.enumLabels!['6']).toBe('Import');
  });
});

describe('townTaxes columnSuffix pattern', () => {
  it('should have Tax columns with columnSuffix (Name0 includes language code)', () => {
    const tableProp = TOWN_TAXES_GROUP.properties.find(p => p.type === PropertyType.TABLE);
    expect(tableProp).toBeDefined();
    expect(tableProp!.countProperty).toBe('TaxCount');

    // Name column includes language code '0' in suffix: Tax{i}Name0
    const nameSuffixCol = tableProp!.columns!.find(c => c.columnSuffix === 'Name0');
    expect(nameSuffixCol).toBeDefined();
    expect(nameSuffixCol!.rdoSuffix).toBe('Tax');

    // Hidden Id column for RDO command reference
    const idCol = tableProp!.columns!.find(c => c.columnSuffix === 'Id');
    expect(idCol).toBeDefined();
    expect(idCol!.width).toBe('0%');

    const percentCol = tableProp!.columns!.find(c => c.columnSuffix === 'Percent');
    expect(percentCol).toBeDefined();
    expect(percentCol!.editable).toBe(true);
  });

  it('should have rdoCommands for RDOSetTaxValue (not RDOSetTaxPercent)', () => {
    expect(TOWN_TAXES_GROUP.rdoCommands).toBeDefined();
    expect(TOWN_TAXES_GROUP.rdoCommands!['TaxPercent']?.command).toBe('RDOSetTaxValue');
    expect(TOWN_TAXES_GROUP.rdoCommands!['TaxPercent']?.indexed).toBe(true);
  });
});

describe('collectTemplatePropertyNamesStructured with TABLE columns', () => {
  beforeEach(() => {
    clearInspectorTabsCache();
  });

  it('should collect count property and indexed column defs for TABLE properties', () => {
    registerInspectorTabs('testBank', [
      { tabName: 'Loans', tabHandler: 'BankLoans' },
    ]);

    const template = getTemplateForVisualClass('testBank');
    const collected = collectTemplatePropertyNamesStructured(template);

    expect(collected.countProperties).toContain('LoanCount');
    expect(collected.indexedByCount.has('LoanCount')).toBe(true);

    const indexedDefs = collected.indexedByCount.get('LoanCount')!;
    expect(indexedDefs.length).toBeGreaterThanOrEqual(1);

    // TABLE column info should be present
    const tableDef = indexedDefs.find(d => d.columns && d.columns.length > 0);
    expect(tableDef).toBeDefined();
    expect(tableDef!.columns!.length).toBe(4);
  });

  it('should collect columnSuffix in TABLE column defs', () => {
    registerInspectorTabs('testTownTax', [
      { tabName: 'Taxes', tabHandler: 'townTaxes' },
    ]);

    const template = getTemplateForVisualClass('testTownTax');
    const collected = collectTemplatePropertyNamesStructured(template);

    expect(collected.countProperties).toContain('TaxCount');
    const indexedDefs = collected.indexedByCount.get('TaxCount')!;
    const tableDef = indexedDefs.find(d => d.columns && d.columns.length > 0);
    expect(tableDef).toBeDefined();

    // Verify columnSuffix is preserved (Name0 includes language code)
    const nameCol = tableDef!.columns!.find(c => c.columnSuffix === 'Name0');
    expect(nameCol).toBeDefined();
    expect(nameCol!.rdoSuffix).toBe('Tax');
  });

  it('should collect flat properties for simple handlers', () => {
    registerInspectorTabs('testFilms', [
      { tabName: 'Films', tabHandler: 'Films' },
    ]);

    const template = getTemplateForVisualClass('testFilms');
    const collected = collectTemplatePropertyNamesStructured(template);

    expect(collected.regularProperties).toContain('InProd');
    expect(collected.regularProperties).toContain('FilmDone');
    expect(collected.regularProperties).toContain('AutoProd');
    expect(collected.regularProperties).toContain('AutoRel');
    expect(collected.regularProperties).toContain('FilmName');
    expect(collected.regularProperties).toContain('FilmBudget');
    expect(collected.regularProperties).toContain('FilmTime');
  });

  it('should expand WORKFORCE_TABLE to 24 properties (8 per class × 3 classes)', () => {
    registerInspectorTabs('testWorkforce', [
      { tabName: 'Workforce', tabHandler: 'Workforce' },
    ]);

    const template = getTemplateForVisualClass('testWorkforce');
    const collected = collectTemplatePropertyNamesStructured(template);

    // 8 properties per class: Workers, WorkersMax, WorkersK, Salaries,
    // WorkForcePrice, WorkersCap, MinSalaries, SalaryValues
    const workforceProps = [
      'Workers', 'WorkersMax', 'WorkersK', 'Salaries',
      'WorkForcePrice', 'WorkersCap', 'MinSalaries', 'SalaryValues',
    ];
    for (const baseName of workforceProps) {
      for (let i = 0; i < 3; i++) {
        expect(collected.regularProperties).toContain(`${baseName}${i}`);
      }
    }

    // Count workforce-specific properties (all 24)
    const wfProps = Array.from(collected.regularProperties).filter(p =>
      workforceProps.some(base => p.startsWith(base))
    );
    expect(wfProps).toHaveLength(24);
  });
});

describe('registerInspectorTabs integration', () => {
  beforeEach(() => {
    clearInspectorTabsCache();
  });

  it('should register tabs and retrieve template', () => {
    registerInspectorTabs('testClass', [
      { tabName: 'General', tabHandler: 'IndGeneral' },
      { tabName: 'Supplies', tabHandler: 'Supplies' },
      { tabName: 'Workforce', tabHandler: 'Workforce' },
      { tabName: 'Management', tabHandler: 'facManagement' },
      { tabName: 'Money', tabHandler: 'Chart' },
    ]);

    const template = getTemplateForVisualClass('testClass');
    expect(template.groups).toHaveLength(5);
    expect(template.groups[0].handlerName).toBe('IndGeneral');
    expect(template.groups[1].handlerName).toBe('Supplies');
  });

  it('should use canonical group name regardless of raw CLASSES.BIN tabName', () => {
    // Building inspector tab name from CLASSES.BIN is 'SERVICES' (all-caps raw value),
    // but the canonical PropertyGroup name for the Supplies handler is 'Supplies'.
    // registerInspectorTabs must use baseGroup.name, not the raw tabName.
    registerInspectorTabs('testHQ', [
      { tabName: 'SERVICES', tabHandler: 'Supplies' },
    ]);
    const template = getTemplateForVisualClass('testHQ');
    const suppliesGroup = template.groups.find(g => g.handlerName === 'Supplies');
    expect(suppliesGroup).toBeDefined();
    expect(suppliesGroup!.name).toBe('Supplies');  // canonical, not 'SERVICES'
  });

  it('should handle duplicate group IDs with handler suffix', () => {
    registerInspectorTabs('testCapitol', [
      { tabName: 'General', tabHandler: 'capitolGeneral' },
      { tabName: 'Towns', tabHandler: 'CapitolTowns' },
      { tabName: 'Ministries', tabHandler: 'Ministeries' },
      { tabName: 'Votes', tabHandler: 'Votes' },
    ]);

    const template = getTemplateForVisualClass('testCapitol');
    expect(template.groups).toHaveLength(4);

    // Verify all groups have unique IDs
    const ids = template.groups.map(g => g.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });
});

describe('Capitol building RDO property name generation', () => {
  beforeEach(() => {
    clearInspectorTabsCache();
  });

  /**
   * Register a full Capitol building (all 7 tabs) and collect property names.
   * Verifies that the two-phase fetch generates property names matching
   * the actual RDO protocol traces captured from the Delphi server.
   */
  function registerCapitolAndCollect() {
    registerInspectorTabs('testCapitolFull', [
      { tabName: 'General', tabHandler: 'capitolGeneral' },
      { tabName: 'Ministries', tabHandler: 'Ministeries' },
      { tabName: 'Towns', tabHandler: 'CapitolTowns' },
      { tabName: 'Services', tabHandler: 'townServices' },
      { tabName: 'Jobs', tabHandler: 'townJobs' },
      { tabName: 'Residentials', tabHandler: 'townRes' },
      { tabName: 'Votes', tabHandler: 'Votes' },
    ]);
    const template = getTemplateForVisualClass('testCapitolFull');
    return collectTemplatePropertyNamesStructured(template);
  }

  it('capitolGeneral should fetch ActualRuler, QOL, RulerPeriods, HasRuler, ratings, elections', () => {
    const collected = registerCapitolAndCollect();
    // Phase 1 regular properties (from RDO trace: GetPropertyList "ActualRuler\tRulerRating\t...")
    const expectedRegular = [
      'QOL', 'ActualRuler', 'RulerRating', 'TycoonsRating',
      'RulerPeriods', 'YearsToElections', 'HasRuler',
    ];
    for (const prop of expectedRegular) {
      expect(collected.regularProperties).toContain(prop);
    }
    // covCount is a count property for indexed coverage table
    expect(collected.countProperties).toContain('covCount');
  });

  it('capitolGeneral coverage TABLE should generate covName{i} and covValue{i} (no MLS suffix)', () => {
    const collected = registerCapitolAndCollect();
    const indexedDefs = collected.indexedByCount.get('covCount')!;
    expect(indexedDefs).toBeDefined();

    const tableDef = indexedDefs.find(d => d.columns && d.columns.length > 0);
    expect(tableDef).toBeDefined();

    // Capitol writes covName{i} (plain, no MLS .0 suffix) — WorldPolitics.pas:1303
    // Unlike TownHall which uses covName{i}.{lang} (with MLS suffix)
    expect(tableDef!.indexSuffix).toBe('');

    const covNameCol = tableDef!.columns!.find(c => c.rdoSuffix === 'covName');
    expect(covNameCol).toBeDefined();
    expect(covNameCol!.indexSuffix).toBeUndefined();

    const covValueCol = tableDef!.columns!.find(c => c.rdoSuffix === 'covValue');
    expect(covValueCol).toBeDefined();
    expect(covValueCol!.indexSuffix).toBeUndefined();
  });

  it('CapitolTowns should generate Town{i} not TownName{i}', () => {
    const collected = registerCapitolAndCollect();
    const indexedDefs = collected.indexedByCount.get('TownCount')!;
    const tableDef = indexedDefs.find(d => d.columns && d.columns.length > 0);
    expect(tableDef).toBeDefined();

    // The town name column must use rdoSuffix 'Town' → generates Town0, Town1, ...
    const townCol = tableDef!.columns!.find(c => c.rdoSuffix === 'Town');
    expect(townCol).toBeDefined();

    // Must NOT have a TownName column (would generate wrong property names)
    const wrongCol = tableDef!.columns!.find(c => c.rdoSuffix === 'TownName');
    expect(wrongCol).toBeUndefined();

    // TownRating column should exist (Commerce in original client)
    const ratingCol = tableDef!.columns!.find(c => c.rdoSuffix === 'TownRating');
    expect(ratingCol).toBeDefined();
  });

  it('townServices svrName column should have columnSuffix .0 for language code', () => {
    const collected = registerCapitolAndCollect();
    const indexedDefs = collected.indexedByCount.get('srvCount')!;
    const tableDef = indexedDefs.find(d => d.columns && d.columns.length > 0);
    expect(tableDef).toBeDefined();

    // svrName column must have columnSuffix '.0' to generate svrName0.0
    const svrNameCol = tableDef!.columns!.find(c => c.rdoSuffix === 'svrName');
    expect(svrNameCol).toBeDefined();
    expect(svrNameCol!.columnSuffix).toBe('.0');

    // Other columns should NOT have columnSuffix
    const svrDemandCol = tableDef!.columns!.find(c => c.rdoSuffix === 'svrDemand');
    expect(svrDemandCol!.columnSuffix).toBeUndefined();
  });

  it('Ministeries should generate Ministry{i}.0 for name and MinisterBudget{i} for budget', () => {
    const collected = registerCapitolAndCollect();
    const indexedDefs = collected.indexedByCount.get('MinisterCount')!;
    const tableDef = indexedDefs.find(d => d.columns && d.columns.length > 0);
    expect(tableDef).toBeDefined();

    // Ministry column has column-level indexSuffix '.0' for MLS
    const ministryCol = tableDef!.columns!.find(c => c.rdoSuffix === 'Ministry');
    expect(ministryCol).toBeDefined();
    expect(ministryCol!.indexSuffix).toBe('.0');

    // MinisterBudget column should exist (no suffix)
    const budgetCol = tableDef!.columns!.find(c => c.rdoSuffix === 'MinisterBudget');
    expect(budgetCol).toBeDefined();
    expect(budgetCol!.indexSuffix).toBeUndefined();
  });

  it('townJobs should have slider properties with max 200', () => {
    const hiSlider = TOWN_JOBS_GROUP.properties.find(p => p.rdoName === 'hiActualMinSalary');
    expect(hiSlider).toBeDefined();
    expect(hiSlider!.type).toBe(PropertyType.SLIDER);
    expect(hiSlider!.max).toBe(200);

    const midSlider = TOWN_JOBS_GROUP.properties.find(p => p.rdoName === 'midActualMinSalary');
    expect(midSlider!.max).toBe(200);

    const loSlider = TOWN_JOBS_GROUP.properties.find(p => p.rdoName === 'loActualMinSalary');
    expect(loSlider!.max).toBe(200);
  });

  it('townJobs salary properties should be PERCENTAGE type', () => {
    const hiSalary = TOWN_JOBS_GROUP.properties.find(p => p.rdoName === 'hiSalary');
    expect(hiSalary!.type).toBe(PropertyType.PERCENTAGE);

    const midSalaryValue = TOWN_JOBS_GROUP.properties.find(p => p.rdoName === 'midSalaryValue');
    expect(midSalaryValue!.type).toBe(PropertyType.PERCENTAGE);
  });

  it('townRes quality properties should be PERCENTAGE type', () => {
    const hiResQ = TOWN_RES_GROUP.properties.find(p => p.rdoName === 'hiResQ');
    expect(hiResQ!.type).toBe(PropertyType.PERCENTAGE);
    expect(hiResQ!.displayName).toContain('Quality Index');

    const midRent = TOWN_RES_GROUP.properties.find(p => p.rdoName === 'midRentPrice');
    expect(midRent!.type).toBe(PropertyType.PERCENTAGE);
  });

  it('Votes should have Trouble property (hidden when zero)', () => {
    const trouble = VOTES_GROUP.properties.find(p => p.rdoName === 'Trouble');
    expect(trouble).toBeDefined();
    expect(trouble!.type).toBe(PropertyType.NUMBER);
    expect(trouble!.hideEmpty).toBe(true);
  });

  it('Capitol template should have all 7 tabs', () => {
    registerInspectorTabs('testCapitolTabs', [
      { tabName: 'General', tabHandler: 'capitolGeneral' },
      { tabName: 'Ministries', tabHandler: 'Ministeries' },
      { tabName: 'Towns', tabHandler: 'CapitolTowns' },
      { tabName: 'Services', tabHandler: 'townServices' },
      { tabName: 'Jobs', tabHandler: 'townJobs' },
      { tabName: 'Residentials', tabHandler: 'townRes' },
      { tabName: 'Votes', tabHandler: 'Votes' },
    ]);
    const template = getTemplateForVisualClass('testCapitolTabs');
    expect(template.groups).toHaveLength(7);

    const handlerNames = template.groups.map(g => g.handlerName);
    expect(handlerNames).toEqual([
      'capitolGeneral', 'Ministeries', 'CapitolTowns',
      'townServices', 'townJobs', 'townRes', 'Votes',
    ]);
  });
});

describe('UPGRADE_GROUP clone settings', () => {
  it('AcceptCloning rdoCommands key matches property rdoName', () => {
    const acceptProp = UPGRADE_GROUP.properties.find(p => p.rdoName === 'AcceptCloning');
    expect(acceptProp).toBeDefined();
    expect(acceptProp!.type).toBe(PropertyType.BOOLEAN);
    expect(acceptProp!.editable).toBe(true);
    // Key must match rdoName so handlePropertyChange can find the command
    expect(UPGRADE_GROUP.rdoCommands!['AcceptCloning']).toBeDefined();
    expect(UPGRADE_GROUP.rdoCommands!['AcceptCloning'].command).toBe('RDOAcceptCloning');
  });

  it('CloneMenu0 is CLONE_SETTINGS type (not TEXT or ACTION_BUTTON)', () => {
    const cloneMenu = UPGRADE_GROUP.properties.find(p => p.rdoName === 'CloneMenu0');
    expect(cloneMenu).toBeDefined();
    expect(cloneMenu!.type).toBe(PropertyType.CLONE_SETTINGS);
  });

  it('no ACTION_BUTTON for cloneFacility (removed — replaced by CloneSettings component)', () => {
    const actionButton = UPGRADE_GROUP.properties.find(
      p => p.type === PropertyType.ACTION_BUTTON && p.actionId === 'clone'
    );
    expect(actionButton).toBeUndefined();
  });

  it('no CloneFacility in rdoCommands (now uses dedicated handler)', () => {
    expect(UPGRADE_GROUP.rdoCommands!['CloneFacility']).toBeUndefined();
  });
});
