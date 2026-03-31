/**
 * Tests for Warehouse Wares feature — WARE_CHECKLIST PropertyType.
 *
 * Validates:
 * - WH_GENERAL_GROUP template has WARE_CHECKLIST for GateMap
 * - WH_GENERAL_GROUP template has Years property
 * - WarehouseWareData interface shape
 * - GateMap → WarehouseWareData conversion logic
 *
 * Archaeology: WHGeneralSheet.pas — clbNames checklist, RDOSelectWare
 */

import { WH_GENERAL_GROUP } from '@/shared/building-details/template-groups';
import { PropertyType } from '@/shared/building-details/property-definitions';
import type { WarehouseWareData } from '@/shared/types';

describe('WH_GENERAL_GROUP warehouse wares', () => {
  it('GateMap property uses WARE_CHECKLIST type', () => {
    const prop = WH_GENERAL_GROUP.properties.find(p => p.rdoName === 'GateMap');
    expect(prop).toBeDefined();
    expect(prop!.type).toBe(PropertyType.WARE_CHECKLIST);
  });

  it('GateMap displayName is "Wares"', () => {
    const prop = WH_GENERAL_GROUP.properties.find(p => p.rdoName === 'GateMap');
    expect(prop!.displayName).toBe('Wares');
  });

  it('GateMap does not have hideEmpty (always visible)', () => {
    const prop = WH_GENERAL_GROUP.properties.find(p => p.rdoName === 'GateMap');
    expect(prop!.hideEmpty).toBeUndefined();
  });

  it('Years property is present with NUMBER type and years unit', () => {
    const prop = WH_GENERAL_GROUP.properties.find(p => p.rdoName === 'Years');
    expect(prop).toBeDefined();
    expect(prop!.type).toBe(PropertyType.NUMBER);
    expect(prop!.unit).toBe('years');
    expect(prop!.displayName).toBe('Age');
  });

  it('Years appears after ROI in property order', () => {
    const roiIdx = WH_GENERAL_GROUP.properties.findIndex(p => p.rdoName === 'ROI');
    const yearsIdx = WH_GENERAL_GROUP.properties.findIndex(p => p.rdoName === 'Years');
    expect(roiIdx).toBeGreaterThanOrEqual(0);
    expect(yearsIdx).toBe(roiIdx + 1);
  });

  it('RDOSelectWare is wired in rdoCommands', () => {
    expect(WH_GENERAL_GROUP.rdoCommands).toBeDefined();
    expect(WH_GENERAL_GROUP.rdoCommands!['RDOSelectWare']).toEqual({
      command: 'RDOSelectWare',
    });
  });
});

describe('WarehouseWareData interface', () => {
  it('accepts valid ware data', () => {
    const ware: WarehouseWareData = {
      name: 'Pharmaceutics',
      enabled: true,
      index: 0,
    };
    expect(ware.name).toBe('Pharmaceutics');
    expect(ware.enabled).toBe(true);
    expect(ware.index).toBe(0);
  });

  it('represents GateMap "101" as three wares with correct enabled flags', () => {
    const gateMap = '101';
    const names = ['Pharmaceutics', 'Processed Food', 'Fresh Food'];
    const wares: WarehouseWareData[] = names.map((name, i) => ({
      name,
      enabled: i < gateMap.length ? gateMap[i] === '1' : false,
      index: i,
    }));

    expect(wares).toHaveLength(3);
    expect(wares[0]).toEqual({ name: 'Pharmaceutics', enabled: true, index: 0 });
    expect(wares[1]).toEqual({ name: 'Processed Food', enabled: false, index: 1 });
    expect(wares[2]).toEqual({ name: 'Fresh Food', enabled: true, index: 2 });
  });

  it('handles empty GateMap (all wares disabled)', () => {
    const gateMap = '';
    const names = ['Drugs', 'Food'];
    const wares: WarehouseWareData[] = names.map((name, i) => ({
      name,
      enabled: i < gateMap.length ? gateMap[i] === '1' : false,
      index: i,
    }));

    expect(wares[0].enabled).toBe(false);
    expect(wares[1].enabled).toBe(false);
  });

  it('handles GateMap shorter than ware count (extras disabled)', () => {
    const gateMap = '1';
    const names = ['Drugs', 'Food', 'Clothing'];
    const wares: WarehouseWareData[] = names.map((name, i) => ({
      name,
      enabled: i < gateMap.length ? gateMap[i] === '1' : false,
      index: i,
    }));

    expect(wares[0].enabled).toBe(true);
    expect(wares[1].enabled).toBe(false);
    expect(wares[2].enabled).toBe(false);
  });
});

describe('WARE_CHECKLIST PropertyType', () => {
  it('exists in PropertyType enum', () => {
    expect(PropertyType.WARE_CHECKLIST).toBe('WARE_CHECKLIST');
  });
});
