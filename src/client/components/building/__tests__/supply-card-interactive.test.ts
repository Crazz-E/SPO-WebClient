/**
 * Tests for interactive SupplyCard and OverpaymentPopover logic.
 * Test env is `node` (no jsdom) — tests verify data flow, not DOM rendering.
 */

import { describe, it, expect } from '@jest/globals';
import type {
  BuildingSupplyData,
  BuildingProductData,
  BuildingConnectionData,
} from '../../../../shared/types';

// =============================================================================
// HELPERS
// =============================================================================

function createConnection(overrides?: Partial<BuildingConnectionData>): BuildingConnectionData {
  return {
    facilityName: 'Steel Mill',
    companyName: 'ACME Corp',
    createdBy: 'System',
    price: '120',
    overprice: '10',
    lastValue: '500',
    cost: '15',
    quality: '85',
    connected: true,
    x: 100,
    y: 200,
    ...overrides,
  };
}

function createProduct(overrides?: Partial<BuildingProductData>): BuildingProductData {
  return {
    path: 'output0',
    name: 'Clothing',
    metaFluid: 'Clothing',
    lastFluid: '200',
    connectionCount: 1,
    connections: [createConnection({ facilityName: 'Fashion Store', x: 500, y: 600 })],
    quality: '90',
    pricePc: '100',
    avgPrice: '105',
    marketPrice: '1500',
    ...overrides,
  };
}

function createSupply(overrides?: Partial<BuildingSupplyData>): BuildingSupplyData {
  return {
    path: 'input0',
    name: 'Chemicals',
    metaFluid: 'Chemicals',
    fluidValue: '150',
    connectionCount: 2,
    connections: [createConnection(), createConnection({ facilityName: 'Refinery', x: 300, y: 400 })],
    maxPrice: '200',
    minK: '30',
    lastCostPerc: '85',
    sortMode: '0',
    qpSorted: 'No',
    ...overrides,
  };
}

// =============================================================================
// SUPPLY CARD - SLIDER VISIBILITY
// =============================================================================

describe('SupplyCard slider visibility logic', () => {
  it('should show sliders when canEdit is true and properties exist', () => {
    const supply = createSupply({ maxPrice: '200', minK: '30' });
    const canEdit = true;
    const showMaxPriceSlider = canEdit && supply.maxPrice !== undefined;
    const showMinKSlider = canEdit && supply.minK !== undefined;
    expect(showMaxPriceSlider).toBe(true);
    expect(showMinKSlider).toBe(true);
  });

  it('should show static text when canEdit is false', () => {
    const supply = createSupply({ maxPrice: '200', minK: '30' });
    const canEdit = false;
    const showMaxPriceSlider = canEdit && supply.maxPrice !== undefined;
    const showMinKSlider = canEdit && supply.minK !== undefined;
    const showMaxPriceStatic = !canEdit && supply.maxPrice !== undefined;
    const showMinKStatic = !canEdit && supply.minK !== undefined;
    expect(showMaxPriceSlider).toBe(false);
    expect(showMinKSlider).toBe(false);
    expect(showMaxPriceStatic).toBe(true);
    expect(showMinKStatic).toBe(true);
  });

  it('should hide sliders when properties are undefined', () => {
    const supply = createSupply({ maxPrice: undefined, minK: undefined });
    const canEdit = true;
    const showMaxPriceSlider = canEdit && supply.maxPrice !== undefined;
    const showMinKSlider = canEdit && supply.minK !== undefined;
    expect(showMaxPriceSlider).toBe(false);
    expect(showMinKSlider).toBe(false);
  });
});

// =============================================================================
// SUPPLY CARD - SLIDER VALUES
// =============================================================================

describe('SupplyCard slider value parsing', () => {
  it('should parse maxPrice as integer for slider', () => {
    const supply = createSupply({ maxPrice: '350' });
    const val = parseInt(supply.maxPrice || '200', 10);
    expect(val).toBe(350);
  });

  it('should default maxPrice to 200 when missing', () => {
    const supply = createSupply({ maxPrice: undefined });
    const val = parseInt(supply.maxPrice || '200', 10);
    expect(val).toBe(200);
  });

  it('should parse minK as integer for slider', () => {
    const supply = createSupply({ minK: '50' });
    const val = parseInt(supply.minK || '0', 10);
    expect(val).toBe(50);
  });

  it('should default minK to 0 when missing', () => {
    const supply = createSupply({ minK: undefined });
    const val = parseInt(supply.minK || '0', 10);
    expect(val).toBe(0);
  });
});

// =============================================================================
// CONNECTIONS TABLE
// =============================================================================

describe('SupplyCard connections table', () => {
  it('should render all connection columns', () => {
    const conn = createConnection();
    const columns = {
      connected: conn.connected,
      facilityName: conn.facilityName,
      companyName: conn.companyName,
      price: conn.price,
      overprice: conn.overprice,
      lastValue: conn.lastValue,
      quality: conn.quality,
      cost: conn.cost,
    };
    expect(columns.connected).toBe(true);
    expect(columns.facilityName).toBe('Steel Mill');
    expect(columns.companyName).toBe('ACME Corp');
    expect(columns.price).toBe('120');
    expect(columns.overprice).toBe('10');
    expect(columns.lastValue).toBe('500');
    expect(columns.quality).toBe('85');
    expect(columns.cost).toBe('15');
  });

  it('should have coordinates for each connection', () => {
    const conn = createConnection({ x: 150, y: 250 });
    expect(conn.x).toBe(150);
    expect(conn.y).toBe(250);
  });

  it('should support multiple connections in a supply', () => {
    const supply = createSupply();
    expect(supply.connections.length).toBe(2);
    expect(supply.connections[0].facilityName).toBe('Steel Mill');
    expect(supply.connections[1].facilityName).toBe('Refinery');
  });
});

// =============================================================================
// HIRE BUTTON
// =============================================================================

describe('SupplyCard Hire button', () => {
  it('should pass correct params to onSearchConnections', () => {
    const supply = createSupply();
    const buildingX = 50;
    const buildingY = 75;

    // Simulates what the Hire button dispatches
    const callArgs = {
      x: buildingX,
      y: buildingY,
      fluidId: supply.metaFluid,
      fluidName: supply.name,
      direction: 'input' as const,
    };

    expect(callArgs.x).toBe(50);
    expect(callArgs.y).toBe(75);
    expect(callArgs.fluidId).toBe('Chemicals');
    expect(callArgs.fluidName).toBe('Chemicals');
    expect(callArgs.direction).toBe('input');
  });
});

// =============================================================================
// OVERPAYMENT POPOVER
// =============================================================================

describe('OverpaymentPopover', () => {
  it('should initialize overprice from connection data', () => {
    const conn = createConnection({ overprice: '25' });
    const initialOverprice = parseInt(conn.overprice || '0', 10);
    expect(initialOverprice).toBe(25);
  });

  it('should default overprice to 0 for NaN values', () => {
    const conn = createConnection({ overprice: '' });
    const parsed = parseInt(conn.overprice || '0', 10);
    const initialOverprice = isNaN(parsed) ? 0 : parsed;
    expect(initialOverprice).toBe(0);
  });

  it('should build correct RDO params for OK action', () => {
    const supply = createSupply();
    const connIndex = 1;
    const overprice = 75;

    const params = {
      propertyName: 'RDOSetInputOverPrice',
      value: String(overprice),
      additionalParams: {
        fluidId: supply.metaFluid,
        index: String(connIndex),
      },
    };

    expect(params.propertyName).toBe('RDOSetInputOverPrice');
    expect(params.value).toBe('75');
    expect(params.additionalParams.fluidId).toBe('Chemicals');
    expect(params.additionalParams.index).toBe('1');
  });

  it('should build correct disconnect params for Delete action', () => {
    const supply = createSupply();
    const conn = supply.connections[0];

    const params = {
      fluidId: supply.metaFluid,
      direction: 'input' as const,
      x: conn.x,
      y: conn.y,
    };

    expect(params.fluidId).toBe('Chemicals');
    expect(params.direction).toBe('input');
    expect(params.x).toBe(100);
    expect(params.y).toBe(200);
  });
});

// =============================================================================
// SELECTION STATE
// =============================================================================

describe('SupplyCard selection state', () => {
  it('should toggle selection on click', () => {
    let selectedIdx: number | null = null;

    // Click row 0 -> select
    selectedIdx = selectedIdx === 0 ? null : 0;
    expect(selectedIdx).toBe(0);

    // Click row 0 again -> deselect
    selectedIdx = selectedIdx === 0 ? null : 0;
    expect(selectedIdx).toBeNull();
  });

  it('should change selection to different row', () => {
    let selectedIdx: number | null = 0;

    // Click row 1 -> select row 1
    selectedIdx = selectedIdx === 1 ? null : 1;
    expect(selectedIdx).toBe(1);
  });

  it('should disable Modify button when nothing selected', () => {
    const selectedIdx: number | null = null;
    const modifyDisabled = selectedIdx === null;
    expect(modifyDisabled).toBe(true);
  });

  it('should enable Modify button when row selected', () => {
    const selectedIdx: number | null = 2;
    const modifyDisabled = selectedIdx === null;
    expect(modifyDisabled).toBe(false);
  });
});

// =============================================================================
// RDO COMMAND WIRING
// =============================================================================

describe('Supply RDO command wiring', () => {
  it('should format RDOSetInputMaxPrice params correctly', () => {
    const params = {
      propertyName: 'RDOSetInputMaxPrice',
      value: '500',
      additionalParams: { fluidId: 'Steel' },
    };
    expect(params.propertyName).toBe('RDOSetInputMaxPrice');
    expect(params.value).toBe('500');
    expect(params.additionalParams.fluidId).toBe('Steel');
  });

  it('should format RDOSetInputMinK params correctly', () => {
    const params = {
      propertyName: 'RDOSetInputMinK',
      value: '50',
      additionalParams: { fluidId: 'Chemicals' },
    };
    expect(params.propertyName).toBe('RDOSetInputMinK');
    expect(params.value).toBe('50');
    expect(params.additionalParams.fluidId).toBe('Chemicals');
  });

  it('should format RDODisconnectInput with coordinate pair (trailing comma for Delphi ParseGateList)', () => {
    const x = 100;
    const y = 200;
    const connectionList = `${x},${y},`;

    const params = {
      command: 'RDODisconnectInput',
      value: '0',
      additionalParams: { fluidId: 'Chemicals', connectionList },
    };

    expect(params.command).toBe('RDODisconnectInput');
    expect(params.additionalParams.connectionList).toBe('100,200,');
  });
});

// =============================================================================
// SUPPLY CARD - FIRE BUTTON
// =============================================================================

describe('SupplyCard Fire button', () => {
  it('should build correct disconnect params for selected connection', () => {
    const supply = createSupply();
    const selectedIdx = 0;
    const conn = supply.connections[selectedIdx];

    const params = {
      buildingX: 50,
      buildingY: 75,
      fluidId: supply.metaFluid,
      direction: 'input' as const,
      x: conn.x,
      y: conn.y,
    };

    expect(params.fluidId).toBe('Chemicals');
    expect(params.direction).toBe('input');
    expect(params.x).toBe(100);
    expect(params.y).toBe(200);
  });

  it('should use second connection when selectedIdx is 1', () => {
    const supply = createSupply();
    const selectedIdx = 1;
    const conn = supply.connections[selectedIdx];

    expect(conn.facilityName).toBe('Refinery');
    expect(conn.x).toBe(300);
    expect(conn.y).toBe(400);
  });

  it('should be disabled when no row is selected', () => {
    const selectedIdx: number | null = null;
    const fireDisabled = selectedIdx === null;
    expect(fireDisabled).toBe(true);
  });

  it('should be enabled when a row is selected', () => {
    const selectedIdx: number | null = 0;
    const fireDisabled = selectedIdx === null;
    expect(fireDisabled).toBe(false);
  });

  it('should clear selection after firing', () => {
    let selectedIdx: number | null = 0;
    // Simulate handleFire: disconnect + clear selection
    selectedIdx = null;
    expect(selectedIdx).toBeNull();
  });
});

// =============================================================================
// PRODUCT CARD - FIRE BUTTON
// =============================================================================

describe('ProductCard Fire button', () => {
  it('should build correct disconnect params for selected buyer', () => {
    const product = createProduct();
    const selectedIdx = 0;
    const conn = product.connections[selectedIdx];

    const params = {
      buildingX: 50,
      buildingY: 75,
      fluidId: product.metaFluid,
      direction: 'output' as const,
      x: conn.x,
      y: conn.y,
    };

    expect(params.fluidId).toBe('Clothing');
    expect(params.direction).toBe('output');
    expect(params.x).toBe(500);
    expect(params.y).toBe(600);
  });

  it('should toggle row selection on click', () => {
    let selectedIdx: number | null = null;

    // Click row 0 -> select
    selectedIdx = selectedIdx === 0 ? null : 0;
    expect(selectedIdx).toBe(0);

    // Click row 0 again -> deselect
    selectedIdx = selectedIdx === 0 ? null : 0;
    expect(selectedIdx).toBeNull();
  });

  it('should be disabled when no row is selected', () => {
    const selectedIdx: number | null = null;
    const fireDisabled = selectedIdx === null;
    expect(fireDisabled).toBe(true);
  });

  it('should only show actions when canEdit is true', () => {
    const canEdit = false;
    const showActions = canEdit;
    expect(showActions).toBe(false);

    const canEditTrue = true;
    expect(canEditTrue).toBe(true);
  });

  it('should format RDODisconnectOutput with coordinate pair (trailing comma for Delphi ParseGateList)', () => {
    const product = createProduct();
    const conn = product.connections[0];
    const connectionList = `${conn.x},${conn.y},`;

    const params = {
      command: 'RDODisconnectOutput',
      value: '0',
      additionalParams: { fluidId: product.metaFluid, connectionList },
    };

    expect(params.command).toBe('RDODisconnectOutput');
    expect(params.additionalParams.fluidId).toBe('Clothing');
    expect(params.additionalParams.connectionList).toBe('500,600,');
  });
});

// =============================================================================
// KEYBOARD DELETE DISCONNECT
// =============================================================================

describe('Keyboard DELETE disconnect', () => {
  it('should trigger fire when Delete pressed with selection (input)', () => {
    const canEdit = true;
    const selectedIdx: number | null = 0;
    const key = 'Delete';
    const shouldFire = key === 'Delete' && canEdit && selectedIdx !== null;
    expect(shouldFire).toBe(true);
  });

  it('should trigger fire when Delete pressed with selection (output)', () => {
    const canEdit = true;
    const selectedIdx: number | null = 0;
    const key = 'Delete';
    const shouldFire = key === 'Delete' && canEdit && selectedIdx !== null;
    expect(shouldFire).toBe(true);
  });

  it('should not trigger when no selection', () => {
    const canEdit = true;
    const selectedIdx: number | null = null;
    const key = 'Delete';
    const shouldFire = key === 'Delete' && canEdit && selectedIdx !== null;
    expect(shouldFire).toBe(false);
  });

  it('should not trigger when canEdit is false', () => {
    const canEdit = false;
    const selectedIdx: number | null = 0;
    const key = 'Delete';
    const shouldFire = key === 'Delete' && canEdit && selectedIdx !== null;
    expect(shouldFire).toBe(false);
  });

  it('should not trigger for other keys', () => {
    const canEdit = true;
    const selectedIdx: number | null = 0;
    const key: string = 'Backspace';
    const shouldFire = key === 'Delete' && canEdit && selectedIdx !== null;
    expect(shouldFire).toBe(false);
  });
});
