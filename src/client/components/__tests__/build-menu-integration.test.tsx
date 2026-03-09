/**
 * Integration test: Build Menu flow.
 *
 * Tests the full user journey:
 * 1. Open build menu modal → categories request fires
 * 2. Store receives categories → category grid renders
 * 3. Click category → facilities request fires
 * 4. Store receives facilities → facility list renders
 * 5. Click facility → modal closes, placement mode starts
 * 6. Capitol card (public office role) → fires onBuildCapitol
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { screen, fireEvent, act } from '@testing-library/react';
import {
  renderWithProviders,
  resetStores,
  createSpiedCallbacks,
} from '../../__tests__/setup/render-helpers';
import { useUiStore } from '../../store/ui-store';
import { useGameStore } from '../../store/game-store';
import { BuildMenu } from '../modals/BuildMenu';
import type { BuildingCategory, BuildingInfo } from '@/shared/types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockCategories: BuildingCategory[] = [
  { kindName: 'Commerce', kind: '1', cluster: 'default', folder: 'commerce', iconPath: '/icons/commerce.png', tycoonLevel: 0 },
  { kindName: 'Industry', kind: '2', cluster: 'default', folder: 'industry', iconPath: '/icons/industry.png', tycoonLevel: 2 },
];

const mockFacilities: BuildingInfo[] = [
  {
    facilityClass: 'SmallStore',
    name: 'Small Store',
    description: 'A basic retail shop',
    cost: 50000,
    area: 4,
    iconPath: '/icons/small-store.png',
    available: true,
    visualClassId: '101',
    zoneRequirement: '',
  },
  {
    facilityClass: 'LargeStore',
    name: 'Large Store',
    description: 'A large department store',
    cost: 250000,
    area: 9,
    iconPath: '/icons/large-store.png',
    available: false,
    visualClassId: '102',
    zoneRequirement: 'commercial',
  },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Build Menu — integration flow', () => {
  beforeEach(() => {
    resetStores();
    useUiStore.setState({
      buildMenuCategories: [],
      buildMenuFacilities: [],
      capitolIconUrl: '',
    });
  });

  it('renders nothing when modal is not buildMenu', () => {
    const { container } = renderWithProviders(<BuildMenu />);
    expect(container.innerHTML).toBe('');
  });

  it('requests categories when modal opens', () => {
    const catSpy = jest.fn();
    const mockCallbacks = createSpiedCallbacks({ onRequestBuildingCategories: catSpy });

    useUiStore.setState({ modal: 'buildMenu' });

    renderWithProviders(<BuildMenu />, { clientCallbacks: mockCallbacks });

    expect(catSpy).toHaveBeenCalled();
  });

  it('renders category cards when store receives data', () => {
    useUiStore.setState({
      modal: 'buildMenu',
      buildMenuCategories: mockCategories,
    });

    renderWithProviders(<BuildMenu />);

    expect(screen.getByText('Commerce')).toBeTruthy();
    expect(screen.getByText('Industry')).toBeTruthy();
    expect(screen.getByText('Lv.2')).toBeTruthy();
  });

  it('requests facilities when category is clicked', () => {
    const facSpy = jest.fn();
    const mockCallbacks = createSpiedCallbacks({ onRequestBuildingFacilities: facSpy });

    useUiStore.setState({
      modal: 'buildMenu',
      buildMenuCategories: mockCategories,
    });

    renderWithProviders(<BuildMenu />, { clientCallbacks: mockCallbacks });

    fireEvent.click(screen.getByText('Commerce'));

    expect(facSpy).toHaveBeenCalledWith('1', 'default');
  });

  it('renders facility list when store receives facilities', () => {
    // Pre-set facilities so the useEffect fires on mount
    useUiStore.setState({
      modal: 'buildMenu',
      buildMenuCategories: mockCategories,
      buildMenuFacilities: mockFacilities,
    });

    renderWithProviders(<BuildMenu />);

    // Click Commerce to go to facilities phase
    fireEvent.click(screen.getByText('Commerce'));

    // Facilities were already in the store, so the useEffect clears isLoading.
    // Trigger another store update to re-render with the loaded data.
    act(() => {
      useUiStore.setState({ buildMenuFacilities: [...mockFacilities] });
    });

    expect(screen.getByText('Small Store')).toBeTruthy();
    expect(screen.getByText('A basic retail shop')).toBeTruthy();
    expect(screen.getByText('Large Store')).toBeTruthy();
    expect(screen.getByText('A large department store')).toBeTruthy();
  });

  it('closes modal and starts placement when available facility clicked', () => {
    const placeSpy = jest.fn();
    const mockCallbacks = createSpiedCallbacks({ onPlaceBuilding: placeSpy });

    useUiStore.setState({
      modal: 'buildMenu',
      buildMenuCategories: mockCategories,
    });

    renderWithProviders(<BuildMenu />, { clientCallbacks: mockCallbacks });

    // Go to facilities phase
    fireEvent.click(screen.getByText('Commerce'));

    // Set facilities
    act(() => {
      useUiStore.setState({ buildMenuFacilities: mockFacilities });
    });

    // Click available facility
    fireEvent.click(screen.getByText('Small Store'));

    // Modal should close and placement should start
    expect(useUiStore.getState().modal).toBeNull();
    expect(placeSpy).toHaveBeenCalledWith('SmallStore', '101');
  });

  it('does not start placement for unavailable facility', () => {
    const placeSpy = jest.fn();
    const mockCallbacks = createSpiedCallbacks({ onPlaceBuilding: placeSpy });

    useUiStore.setState({
      modal: 'buildMenu',
      buildMenuCategories: mockCategories,
    });

    renderWithProviders(<BuildMenu />, { clientCallbacks: mockCallbacks });

    // Go to facilities phase
    fireEvent.click(screen.getByText('Commerce'));

    act(() => {
      useUiStore.setState({ buildMenuFacilities: mockFacilities });
    });

    // Click unavailable facility (Large Store)
    const largeStore = screen.getByText('Large Store').closest('button');
    if (largeStore) fireEvent.click(largeStore);

    // Should NOT have called placement
    expect(placeSpy).not.toHaveBeenCalled();
  });

  it('shows Capitol card for public office role', () => {
    useUiStore.setState({
      modal: 'buildMenu',
      buildMenuCategories: mockCategories,
      capitolIconUrl: '/icons/capitol.png',
    });
    useGameStore.setState({ isPublicOfficeRole: true });

    renderWithProviders(<BuildMenu />);

    expect(screen.getByText('Capitol')).toBeTruthy();
    expect(screen.getByText('Public Office')).toBeTruthy();
  });

  it('Capitol card calls onBuildCapitol and closes modal', () => {
    const capitolSpy = jest.fn();
    const mockCallbacks = createSpiedCallbacks({ onBuildCapitol: capitolSpy });

    useUiStore.setState({
      modal: 'buildMenu',
      buildMenuCategories: mockCategories,
      capitolIconUrl: '/icons/capitol.png',
    });
    useGameStore.setState({ isPublicOfficeRole: true });

    renderWithProviders(<BuildMenu />, { clientCallbacks: mockCallbacks });

    fireEvent.click(screen.getByText('Capitol'));

    expect(capitolSpy).toHaveBeenCalled();
    expect(useUiStore.getState().modal).toBeNull();
  });

  it('close button dismisses modal', () => {
    useUiStore.setState({
      modal: 'buildMenu',
      buildMenuCategories: mockCategories,
    });

    renderWithProviders(<BuildMenu />);

    fireEvent.click(screen.getByLabelText('Close'));

    expect(useUiStore.getState().modal).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Residential grouping
// ---------------------------------------------------------------------------

const mockResidentialFacilities: BuildingInfo[] = [
  { facilityClass: 'PGIHiResA', name: 'Luxury Apartments', description: 'High class', cost: 200000, area: 4, iconPath: '', available: true, visualClassId: '5001', zoneRequirement: '', residenceClass: 'high' },
  { facilityClass: 'PGIMidResA', name: 'Town Houses', description: 'Middle class', cost: 100000, area: 4, iconPath: '', available: true, visualClassId: '5101', zoneRequirement: '', residenceClass: 'middle' },
  { facilityClass: 'PGILoResA', name: 'Low Income Housing', description: 'Low class', cost: 50000, area: 4, iconPath: '', available: true, visualClassId: '5201', zoneRequirement: '', residenceClass: 'low' },
];

describe('Build Menu — residential grouping', () => {
  beforeEach(() => {
    resetStores();
    useUiStore.setState({
      buildMenuCategories: [],
      buildMenuFacilities: [],
      capitolIconUrl: '',
    });
  });

  it('renders grouped residential facilities with High/Mid/Low headers', () => {
    useUiStore.setState({
      modal: 'buildMenu',
      buildMenuCategories: mockCategories,
    });

    renderWithProviders(<BuildMenu />);

    // Go to facilities phase
    fireEvent.click(screen.getByText('Commerce'));

    act(() => {
      useUiStore.setState({ buildMenuFacilities: mockResidentialFacilities });
    });

    expect(screen.getByText('High Class')).toBeTruthy();
    expect(screen.getByText('Middle Class')).toBeTruthy();
    expect(screen.getByText('Low Class')).toBeTruthy();
    expect(screen.getByText('Luxury Apartments')).toBeTruthy();
    expect(screen.getByText('Town Houses')).toBeTruthy();
    expect(screen.getByText('Low Income Housing')).toBeTruthy();
  });

  it('shows ungrouped facilities alongside classified groups', () => {
    const mixed: BuildingInfo[] = [
      ...mockResidentialFacilities,
      { facilityClass: 'PGIResSpecial', name: 'Special Building', description: '', cost: 30000, area: 4, iconPath: '', available: true, visualClassId: '5301', zoneRequirement: '' },
    ];

    useUiStore.setState({
      modal: 'buildMenu',
      buildMenuCategories: mockCategories,
    });

    renderWithProviders(<BuildMenu />);

    fireEvent.click(screen.getByText('Commerce'));

    act(() => {
      useUiStore.setState({ buildMenuFacilities: mixed });
    });

    // Groups should render
    expect(screen.getByText('High Class')).toBeTruthy();
    // Ungrouped facility should also render
    expect(screen.getByText('Special Building')).toBeTruthy();
  });

  it('renders flat list when no facility has residenceClass', () => {
    useUiStore.setState({
      modal: 'buildMenu',
      buildMenuCategories: mockCategories,
    });

    renderWithProviders(<BuildMenu />);

    fireEvent.click(screen.getByText('Commerce'));

    act(() => {
      useUiStore.setState({ buildMenuFacilities: mockFacilities });
    });

    // No group headers should be present
    expect(screen.queryByText('High Class')).toBeNull();
    expect(screen.queryByText('Middle Class')).toBeNull();
    expect(screen.queryByText('Low Class')).toBeNull();
    // Buildings still render
    expect(screen.getByText('Small Store')).toBeTruthy();
  });
});
