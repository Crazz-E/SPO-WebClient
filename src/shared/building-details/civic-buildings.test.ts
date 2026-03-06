import { isCivicBuilding, clearCivicVisualClassIds, getCivicVisualClassIds, registerCivicVisualClass } from './civic-buildings';
import { registerInspectorTabs, clearInspectorTabsCache } from './property-templates';
import { MINISTERIES_GROUP } from './template-groups';
import { PropertyType } from './property-definitions';

describe('isCivicBuilding', () => {
  afterEach(() => {
    clearInspectorTabsCache();
    clearCivicVisualClassIds();
  });

  it('returns true for Capitol visual class', () => {
    expect(isCivicBuilding('PGICapitolA')).toBe(true);
  });

  it('returns true for TownHall visual classes', () => {
    expect(isCivicBuilding('PGITownHallA')).toBe(true);
    expect(isCivicBuilding('PGITownHallB')).toBe(true);
    expect(isCivicBuilding('PGITownHallC')).toBe(true);
    expect(isCivicBuilding('PGITownHallD')).toBe(true);
  });

  it('returns false for non-civic buildings', () => {
    expect(isCivicBuilding('PGIWarehouseA')).toBe(false);
    expect(isCivicBuilding('PGIFactoryA')).toBe(false);
    expect(isCivicBuilding('PGIResidentialA')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isCivicBuilding('')).toBe(false);
  });

  it('returns false for default visual class "0"', () => {
    expect(isCivicBuilding('0')).toBe(false);
  });

  it('returns true for numeric Capitol visual class via template cache', () => {
    registerInspectorTabs('152', [
      { tabName: 'General', tabHandler: 'capitolGeneral' },
      { tabName: 'Towns', tabHandler: 'CapitolTowns' },
    ], 'Capitol');
    expect(isCivicBuilding('152')).toBe(true);
  });

  it('returns true for numeric TownHall visual class via template cache', () => {
    registerInspectorTabs('200', [
      { tabName: 'General', tabHandler: 'townGeneral' },
      { tabName: 'Jobs', tabHandler: 'townJobs' },
    ], 'TownHall');
    expect(isCivicBuilding('200')).toBe(true);
  });

  it('returns false for numeric non-civic visual class', () => {
    registerInspectorTabs('99', [
      { tabName: 'General', tabHandler: 'unkGeneral' },
      { tabName: 'Workforce', tabHandler: 'Workforce' },
    ], 'Factory');
    expect(isCivicBuilding('99')).toBe(false);
  });

  it('auto-registers civic visual class ID so it persists after cache clear', () => {
    // Register Capitol with civic handler
    registerInspectorTabs('152', [
      { tabName: 'General', tabHandler: 'capitolGeneral' },
    ], 'Capitol');
    expect(isCivicBuilding('152')).toBe(true);

    // Clear template cache — but civic ID set should persist
    clearInspectorTabsCache();
    expect(isCivicBuilding('152')).toBe(true);
  });

  it('does NOT auto-register non-civic visual class IDs', () => {
    registerInspectorTabs('99', [
      { tabName: 'General', tabHandler: 'unkGeneral' },
    ], 'Factory');

    clearInspectorTabsCache();
    // After cache clear, non-civic ID should be false (no civic registration)
    expect(isCivicBuilding('99')).toBe(false);
  });
});

describe('getCivicVisualClassIds', () => {
  afterEach(() => {
    clearInspectorTabsCache();
    clearCivicVisualClassIds();
  });

  it('returns empty array when no civic IDs are registered', () => {
    expect(getCivicVisualClassIds()).toEqual([]);
  });

  it('returns registered civic IDs from registerInspectorTabs', () => {
    registerInspectorTabs('152', [
      { tabName: 'General', tabHandler: 'capitolGeneral' },
    ], 'Capitol');
    registerInspectorTabs('200', [
      { tabName: 'General', tabHandler: 'townGeneral' },
    ], 'TownHall');

    const ids = getCivicVisualClassIds();
    expect(ids).toContain('152');
    expect(ids).toContain('200');
    expect(ids).toHaveLength(2);
  });

  it('returns IDs registered via registerCivicVisualClass directly', () => {
    registerCivicVisualClass('42');
    registerCivicVisualClass('99');

    const ids = getCivicVisualClassIds();
    expect(ids).toContain('42');
    expect(ids).toContain('99');
  });

  it('does not include non-civic visual classes', () => {
    registerInspectorTabs('99', [
      { tabName: 'General', tabHandler: 'unkGeneral' },
    ], 'Factory');

    expect(getCivicVisualClassIds()).toEqual([]);
  });
});

describe('MINISTERIES_GROUP template configuration', () => {
  it('MinisterBudget rdoCommand should have indexed: true', () => {
    const budgetMapping = MINISTERIES_GROUP.rdoCommands?.['MinisterBudget'];
    expect(budgetMapping).toBeDefined();
    expect(budgetMapping?.command).toBe('RDOSetMinistryBudget');
    expect(budgetMapping?.indexed).toBe(true);
  });

  it('ministerAction column should show Elect when Minister is empty', () => {
    const table = MINISTERIES_GROUP.properties.find(p => p.type === PropertyType.TABLE);
    const actionCol = table?.columns?.find(c => c.actionId === 'electMinister');
    expect(actionCol).toBeDefined();
    expect(actionCol?.visibleWhen).toEqual({ column: 'Minister', condition: 'empty' });
    expect(actionCol?.buttonLabel).toBe('Elect');
  });

  it('ministerAction column should show Depose via altAction when Minister is notEmpty', () => {
    const table = MINISTERIES_GROUP.properties.find(p => p.type === PropertyType.TABLE);
    const actionCol = table?.columns?.find(c => c.actionId === 'electMinister');
    expect(actionCol?.altAction).toBeDefined();
    expect(actionCol?.altAction?.actionId).toBe('deposeMinister');
    expect(actionCol?.altAction?.buttonLabel).toBe('Depose');
    expect(actionCol?.altAction?.condition).toBe('notEmpty');
  });
});
