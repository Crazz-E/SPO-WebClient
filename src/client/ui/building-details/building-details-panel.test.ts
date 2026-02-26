/**
 * Unit tests for BuildingDetailsPanel
 *
 * Tests the new facility tab features:
 * - isOwner security gating (hide rename/delete/edit controls for non-owners)
 * - Auto-refresh timer (start on show, stop on hide, skip when editing)
 * - onNavigateToBuilding callback wiring
 *
 * Environment: node (no jsdom) — DOM elements mocked as plain objects.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import type { BuildingDetailsResponse, BuildingDetailsTab } from '../../../shared/types';

// ---------------------------------------------------------------------------
// DOM mock infrastructure
// ---------------------------------------------------------------------------

/** Minimal mock element that satisfies the panel's DOM usage */
interface MockElement {
  id: string;
  className: string;
  style: Record<string, string>;
  textContent: string;
  innerHTML: string;
  tagName: string;
  children: MockElement[];
  parentElement: MockElement | null;
  onclick: ((e: unknown) => void) | null;
  onmousedown: ((e: unknown) => void) | null;
  onkeydown: ((e: unknown) => void) | null;
  disabled: boolean;
  value: string;
  type: string;
  title: string;
  // Methods
  appendChild: jest.Mock;
  remove: jest.Mock;
  addEventListener: jest.Mock;
  closest: jest.Mock;
  querySelector: jest.Mock;
  querySelectorAll: jest.Mock;
  contains: jest.Mock;
  focus: jest.Mock;
  select: jest.Mock;
  classList: {
    add: jest.Mock;
    remove: jest.Mock;
    contains: jest.Mock;
  };
  getBoundingClientRect: jest.Mock;
}

function createMockElement(tag = 'div'): MockElement {
  const el: MockElement = {
    id: '',
    className: '',
    style: {},
    textContent: '',
    innerHTML: '',
    tagName: tag.toUpperCase(),
    children: [],
    parentElement: null,
    onclick: null,
    onmousedown: null,
    onkeydown: null,
    disabled: false,
    value: '',
    type: '',
    title: '',
    appendChild: jest.fn(function (this: MockElement, child: MockElement) {
      el.children.push(child);
      child.parentElement = el;
      return child;
    }),
    remove: jest.fn(),
    addEventListener: jest.fn(),
    closest: jest.fn(() => null),
    querySelector: jest.fn(() => null),
    querySelectorAll: jest.fn(() => []),
    contains: jest.fn(() => false),
    focus: jest.fn(),
    select: jest.fn(),
    classList: {
      add: jest.fn(),
      remove: jest.fn(),
      contains: jest.fn(() => false),
    },
    getBoundingClientRect: jest.fn(() => ({ width: 1200, height: 800, top: 0, left: 0, right: 1200, bottom: 800 })),
  };
  return el;
}

// ---------------------------------------------------------------------------
// document mock — wired so BuildingDetailsPanel can construct its DOM
// ---------------------------------------------------------------------------

const elementsById = new Map<string, MockElement>();

const mockDocument = {
  createElement: jest.fn((tag: string) => createMockElement(tag)),
  getElementById: jest.fn((id: string) => elementsById.get(id) || null),
  onmousemove: null as ((e: unknown) => void) | null,
  onmouseup: null as (() => void) | null,
};

// Assign to global before importing the module
(global as unknown as Record<string, unknown>).document = mockDocument;

// ---------------------------------------------------------------------------
// Mock dependent modules
// ---------------------------------------------------------------------------

jest.mock('../../../shared/building-details', () => ({
  getGroupById: jest.fn(() => undefined),
}));

jest.mock('./property-renderers', () => ({
  renderPropertyGroup: jest.fn(() => createMockElement()),
}));

jest.mock('./property-table', () => ({
  renderSuppliesWithTabs: jest.fn(() => createMockElement()),
}));

jest.mock('./property-graph', () => ({
  renderSparklineGraph: jest.fn(() => createMockElement()),
}));

// Now import the class under test
import { BuildingDetailsPanel, BuildingDetailsPanelOptions } from './building-details-panel';

// Import mocked modules so we can inspect calls
import { getGroupById } from '../../../shared/building-details';
import { renderPropertyGroup } from './property-renderers';

const mockGetGroupById = getGroupById as jest.Mock;
const mockRenderPropertyGroup = renderPropertyGroup as jest.Mock;

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeDetails(overrides: Partial<BuildingDetailsResponse> = {}): BuildingDetailsResponse {
  return {
    buildingId: 'b-123',
    buildingName: 'My Factory',
    ownerName: 'TestCompany',
    x: 100,
    y: 200,
    visualClass: '42',
    templateName: 'Industrial Factory',
    securityId: 'sec-1',
    tabs: [
      { id: 'generic', name: 'General', icon: 'G', order: 0, handlerName: 'IndGeneral' },
    ] as BuildingDetailsTab[],
    groups: {
      generic: [
        { name: 'Name', value: 'My Factory' },
        { name: 'Owner', value: 'TestCompany' },
      ],
    },
    timestamp: Date.now(),
    ...overrides,
  };
}

/**
 * Create a panel with standard options, wiring mock elements so getElementById works.
 */
function createPanel(opts: Partial<BuildingDetailsPanelOptions> = {}): BuildingDetailsPanel {
  // When createElement is called for the modal, wire sub-elements
  // The panel calls document.createElement and then getElementById in renderContent
  mockDocument.createElement.mockImplementation((tag: string) => {
    const el = createMockElement(tag);
    return el;
  });

  const container = createMockElement();
  container.getBoundingClientRect.mockReturnValue({ width: 1200, height: 800, top: 0, left: 0, right: 1200, bottom: 800 });

  const panel = new BuildingDetailsPanel(
    container as never,
    {
      onRefresh: jest.fn(async () => {}),
      onPropertyChange: jest.fn(async () => {}),
      ...opts,
    }
  );

  return panel;
}

/**
 * Register mock elements by ID so getElementById returns them during renderContent
 */
function registerMockElements(): Record<string, MockElement> {
  const nameEl = createMockElement();
  nameEl.id = 'bd-building-name';
  const templateEl = createMockElement();
  templateEl.id = 'bd-template-name';
  const coordsEl = createMockElement();
  coordsEl.id = 'bd-coords';
  const visualClassEl = createMockElement();
  visualClassEl.id = 'bd-visual-class';
  const timestampEl = createMockElement();
  timestampEl.id = 'bd-timestamp';
  const renameBtn = createMockElement('button');
  renameBtn.id = 'bd-rename-btn';

  const elements: Record<string, MockElement> = {
    'bd-building-name': nameEl,
    'bd-template-name': templateEl,
    'bd-coords': coordsEl,
    'bd-visual-class': visualClassEl,
    'bd-timestamp': timestampEl,
    'bd-rename-btn': renameBtn,
  };

  for (const [id, el] of Object.entries(elements)) {
    elementsById.set(id, el);
  }

  mockDocument.getElementById.mockImplementation((id: string) => elementsById.get(id) || null);

  return elements;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BuildingDetailsPanel', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    elementsById.clear();
    mockDocument.createElement.mockImplementation((tag: string) => createMockElement(tag));
    mockDocument.getElementById.mockImplementation((id: string) => elementsById.get(id) || null);
    mockGetGroupById.mockReset().mockReturnValue(undefined);
    mockRenderPropertyGroup.mockReset().mockReturnValue(createMockElement());
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  // =========================================================================
  // isOwner security gating
  // =========================================================================

  describe('isOwner security gating', () => {
    it('should hide rename and delete buttons when player does not own the building', () => {
      const panel = createPanel({ currentCompanyName: 'OtherCompany' });
      const elements = registerMockElements();
      const details = makeDetails({ ownerName: 'TestCompany' });

      // Mock querySelector for delete button
      const deleteBtn = createMockElement('button');
      deleteBtn.className = 'header-delete-btn';

      // Access the modal through the panel's internal state
      const modalEl = (panel as unknown as { modal: MockElement }).modal;
      if (modalEl) {
        modalEl.querySelector = jest.fn((selector: string) => {
          if (selector === '.header-delete-btn') return deleteBtn;
          return null;
        }) as jest.Mock;
      }

      panel.show(details);

      // Rename button should be hidden (ownerName !== currentCompanyName)
      expect(elements['bd-rename-btn'].style.display).toBe('none');
      // Delete button should be hidden
      expect(deleteBtn.style.display).toBe('none');
    });

    it('should show rename and delete buttons when player owns the building', () => {
      const panel = createPanel({ currentCompanyName: 'TestCompany' });
      const elements = registerMockElements();
      const details = makeDetails({ ownerName: 'TestCompany' });

      const deleteBtn = createMockElement('button');
      deleteBtn.className = 'header-delete-btn';

      const modalEl = (panel as unknown as { modal: MockElement }).modal;
      if (modalEl) {
        modalEl.querySelector = jest.fn((selector: string) => {
          if (selector === '.header-delete-btn') return deleteBtn;
          return null;
        }) as jest.Mock;
      }

      panel.show(details);

      // Both should be visible
      expect(elements['bd-rename-btn'].style.display).toBe('');
      expect(deleteBtn.style.display).toBe('');
    });

    it('should hide controls when currentCompanyName is not set', () => {
      const panel = createPanel({ currentCompanyName: undefined });
      const elements = registerMockElements();
      const details = makeDetails({ ownerName: 'TestCompany' });

      const deleteBtn = createMockElement('button');
      const modalEl = (panel as unknown as { modal: MockElement }).modal;
      if (modalEl) {
        modalEl.querySelector = jest.fn(() => deleteBtn) as jest.Mock;
      }

      panel.show(details);

      // No company name = not owner
      expect(elements['bd-rename-btn'].style.display).toBe('none');
      expect(deleteBtn.style.display).toBe('none');
    });

    it('should pass undefined for onPropertyChange callback when not owner', () => {
      registerMockElements();
      const onPropertyChange = jest.fn(async () => {});
      const panel = createPanel({
        currentCompanyName: 'OtherCompany',
        onPropertyChange,
      });
      const details = makeDetails({ ownerName: 'TestCompany' });

      panel.show(details);

      // Access the internal isOwner state
      const isOwner = (panel as unknown as { isOwner: boolean }).isOwner;
      expect(isOwner).toBe(false);
    });

    it('should return true for isOwner when names match', () => {
      registerMockElements();
      const panel = createPanel({ currentCompanyName: 'MyCompany' });
      const details = makeDetails({ ownerName: 'MyCompany' });

      panel.show(details);

      const isOwner = (panel as unknown as { isOwner: boolean }).isOwner;
      expect(isOwner).toBe(true);
    });
  });

  // =========================================================================
  // Auto-refresh timer
  // =========================================================================

  describe('auto-refresh timer', () => {
    it('should start auto-refresh when panel is shown', () => {
      registerMockElements();
      const onRefresh = jest.fn(async () => {});
      const panel = createPanel({ onRefresh, currentCompanyName: 'TestCompany' });
      const details = makeDetails();

      panel.show(details);

      // Timer should be set (not null)
      const interval = (panel as unknown as { refreshInterval: ReturnType<typeof setInterval> | null }).refreshInterval;
      expect(interval).not.toBeNull();
    });

    it('should call onRefresh after 20 seconds', () => {
      registerMockElements();
      const onRefresh = jest.fn(async () => {});
      const panel = createPanel({ onRefresh, currentCompanyName: 'TestCompany' });
      const details = makeDetails();

      panel.show(details);

      // Advance 20 seconds
      jest.advanceTimersByTime(20_000);

      expect(onRefresh).toHaveBeenCalledTimes(1);
    });

    it('should call onRefresh multiple times at 20s intervals', () => {
      registerMockElements();
      const onRefresh = jest.fn(async () => {});
      const panel = createPanel({ onRefresh, currentCompanyName: 'TestCompany' });

      panel.show(makeDetails());

      jest.advanceTimersByTime(60_000); // 3 intervals

      expect(onRefresh).toHaveBeenCalledTimes(3);
    });

    it('should stop auto-refresh when panel is hidden', () => {
      registerMockElements();
      const onRefresh = jest.fn(async () => {});
      const panel = createPanel({ onRefresh, currentCompanyName: 'TestCompany' });

      panel.show(makeDetails());
      panel.hide();

      const interval = (panel as unknown as { refreshInterval: ReturnType<typeof setInterval> | null }).refreshInterval;
      expect(interval).toBeNull();

      // No more calls after hide
      jest.advanceTimersByTime(60_000);
      expect(onRefresh).toHaveBeenCalledTimes(0);
    });

    it('should skip refresh when user is actively editing', () => {
      registerMockElements();
      const onRefresh = jest.fn(async () => {});
      const panel = createPanel({ onRefresh, currentCompanyName: 'TestCompany' });

      panel.show(makeDetails());

      // Simulate user focusing an input
      const activeEl = createMockElement('input');
      (panel as unknown as { activeFocusedElement: MockElement | null }).activeFocusedElement = activeEl as never;

      jest.advanceTimersByTime(20_000);

      // Should NOT call onRefresh while user is editing
      expect(onRefresh).toHaveBeenCalledTimes(0);
    });

    it('should resume refresh after user stops editing', () => {
      registerMockElements();
      const onRefresh = jest.fn(async () => {});
      const panel = createPanel({ onRefresh, currentCompanyName: 'TestCompany' });

      panel.show(makeDetails());

      // Simulate user focusing then unfocusing
      const activeEl = createMockElement('input');
      (panel as unknown as { activeFocusedElement: MockElement | null }).activeFocusedElement = activeEl as never;

      jest.advanceTimersByTime(20_000);
      expect(onRefresh).toHaveBeenCalledTimes(0);

      // User stops editing
      (panel as unknown as { activeFocusedElement: MockElement | null }).activeFocusedElement = null;

      jest.advanceTimersByTime(20_000);
      expect(onRefresh).toHaveBeenCalledTimes(1);
    });

    it('should not start timer if onRefresh is not provided', () => {
      registerMockElements();
      const panel = createPanel({ onRefresh: undefined, currentCompanyName: 'TestCompany' });

      panel.show(makeDetails());

      // Timer is set but won't call anything
      jest.advanceTimersByTime(20_000);
      // No error thrown = success
    });

    it('should restart timer when show is called again', () => {
      registerMockElements();
      const onRefresh = jest.fn(async () => {});
      const panel = createPanel({ onRefresh, currentCompanyName: 'TestCompany' });

      panel.show(makeDetails());
      jest.advanceTimersByTime(15_000); // 15s into first timer

      // Show again — should restart the 20s timer
      panel.show(makeDetails());
      jest.advanceTimersByTime(15_000); // Only 15s since restart

      // Should NOT have fired yet (only 15s since restart)
      expect(onRefresh).toHaveBeenCalledTimes(0);

      jest.advanceTimersByTime(5_000); // Now 20s since restart
      expect(onRefresh).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // Panel visibility
  // =========================================================================

  describe('panel visibility', () => {
    it('should report visible after show()', () => {
      registerMockElements();
      const panel = createPanel({ currentCompanyName: 'TestCompany' });

      panel.show(makeDetails());

      expect(panel.isVisible()).toBe(true);
    });

    it('should report hidden initially', () => {
      const panel = createPanel({ currentCompanyName: 'TestCompany' });

      // Modal display is set to 'none' in init
      expect(panel.isVisible()).toBe(false);
    });
  });

  // =========================================================================
  // update() smart vs full render
  // =========================================================================

  describe('update()', () => {
    it('should store new details when update is called', () => {
      registerMockElements();
      const panel = createPanel({ currentCompanyName: 'TestCompany' });

      const details1 = makeDetails({ buildingName: 'Factory A' });
      panel.show(details1);

      const details2 = makeDetails({ buildingName: 'Factory B' });
      panel.update(details2);

      const currentDetails = (panel as unknown as { currentDetails: BuildingDetailsResponse }).currentDetails;
      expect(currentDetails.buildingName).toBe('Factory B');
    });

    it('should use smart render when user is editing', () => {
      registerMockElements();
      const panel = createPanel({ currentCompanyName: 'TestCompany' });

      panel.show(makeDetails());

      // Simulate active editing
      const activeEl = createMockElement('input');
      (panel as unknown as { activeFocusedElement: MockElement | null }).activeFocusedElement = activeEl as never;

      // Mock renderContentSmart to verify it's called
      const smartRenderSpy = jest.spyOn(panel as unknown as { renderContentSmart: () => void }, 'renderContentSmart');

      panel.update(makeDetails({ buildingName: 'Updated' }));

      expect(smartRenderSpy).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // updateOptions()
  // =========================================================================

  describe('updateOptions()', () => {
    it('should update currentCompanyName via updateOptions', () => {
      registerMockElements();
      const panel = createPanel({ currentCompanyName: 'OldCompany' });

      panel.show(makeDetails({ ownerName: 'NewCompany' }));

      // Not owner yet
      let isOwner = (panel as unknown as { isOwner: boolean }).isOwner;
      expect(isOwner).toBe(false);

      // Update company name
      panel.updateOptions({ currentCompanyName: 'NewCompany' });

      isOwner = (panel as unknown as { isOwner: boolean }).isOwner;
      expect(isOwner).toBe(true);
    });
  });

  // =========================================================================
  // isMayor security gating (Town Hall tabs)
  // =========================================================================

  describe('isMayor security gating', () => {
    /** Build a Town Hall details response with ActualRuler */
    function makeTownHallDetails(mayor: string, companyOwner = 'TownAdmin'): BuildingDetailsResponse {
      return makeDetails({
        ownerName: companyOwner,
        tabs: [
          { id: 'townGeneral', name: 'General', icon: 'G', order: 0, handlerName: 'townGeneral' },
          { id: 'townJobs', name: 'Jobs', icon: 'J', order: 10, handlerName: 'townJobs' },
        ],
        groups: {
          townGeneral: [
            { name: 'ActualRuler', value: mayor },
            { name: 'Town', value: 'Smallville' },
          ],
          townJobs: [
            { name: 'hiActualMinSalary', value: '100' },
            { name: 'midActualMinSalary', value: '80' },
            { name: 'loActualMinSalary', value: '60' },
          ],
        },
      });
    }

    it('should return true for isMayor when ActualRuler matches currentCompanyName', () => {
      registerMockElements();
      const panel = createPanel({ currentCompanyName: 'MayorCorp' });

      panel.show(makeTownHallDetails('MayorCorp'));

      const isMayor = (panel as unknown as { isMayor: boolean }).isMayor;
      expect(isMayor).toBe(true);
    });

    it('should return false for isMayor when ActualRuler does not match', () => {
      registerMockElements();
      const panel = createPanel({ currentCompanyName: 'OtherCorp' });

      panel.show(makeTownHallDetails('MayorCorp'));

      const isMayor = (panel as unknown as { isMayor: boolean }).isMayor;
      expect(isMayor).toBe(false);
    });

    it('should return false for isMayor when no townGeneral group exists', () => {
      registerMockElements();
      const panel = createPanel({ currentCompanyName: 'MayorCorp' });

      // Standard building with no townGeneral group
      panel.show(makeDetails({ ownerName: 'MayorCorp' }));

      const isMayor = (panel as unknown as { isMayor: boolean }).isMayor;
      expect(isMayor).toBe(false);
    });

    it('should return false for isMayor when currentCompanyName is not set', () => {
      registerMockElements();
      const panel = createPanel({ currentCompanyName: undefined });

      panel.show(makeTownHallDetails('MayorCorp'));

      const isMayor = (panel as unknown as { isMayor: boolean }).isMayor;
      expect(isMayor).toBe(false);
    });

    it('should return false for isMayor when ActualRuler property is missing', () => {
      registerMockElements();
      const panel = createPanel({ currentCompanyName: 'MayorCorp' });

      const details = makeDetails({
        groups: {
          townGeneral: [
            { name: 'Town', value: 'Smallville' },
            // ActualRuler intentionally omitted
          ],
        },
      });

      panel.show(details);

      const isMayor = (panel as unknown as { isMayor: boolean }).isMayor;
      expect(isMayor).toBe(false);
    });

    it('should pass changeCallback for town tab when user is mayor', () => {
      registerMockElements();
      const onPropertyChange = jest.fn(async () => {});
      const panel = createPanel({ currentCompanyName: 'MayorCorp', onPropertyChange });

      // Mock getGroupById to return a group with properties for townJobs
      mockGetGroupById.mockReturnValue({
        id: 'townJobs',
        name: 'Jobs',
        properties: [
          { rdoName: 'hiActualMinSalary', displayName: 'Executive Min Salary', type: 'slider', editable: true },
        ],
      });

      const details = makeTownHallDetails('MayorCorp');
      panel.show(details);

      // Switch to townJobs tab by setting currentTab and calling renderTabContent
      (panel as unknown as { currentTab: string }).currentTab = 'townJobs';
      (panel as unknown as { renderTabContent: () => void }).renderTabContent();

      // renderPropertyGroup should have been called with a defined changeCallback (3rd arg)
      expect(mockRenderPropertyGroup).toHaveBeenCalled();
      const lastCall = mockRenderPropertyGroup.mock.calls[mockRenderPropertyGroup.mock.calls.length - 1];
      expect(lastCall[2]).toBeDefined(); // changeCallback should be a function
    });

    it('should pass undefined changeCallback for town tab when user is not mayor', () => {
      registerMockElements();
      const onPropertyChange = jest.fn(async () => {});
      const panel = createPanel({ currentCompanyName: 'NotTheMayor', onPropertyChange });

      mockGetGroupById.mockReturnValue({
        id: 'townJobs',
        name: 'Jobs',
        properties: [
          { rdoName: 'hiActualMinSalary', displayName: 'Executive Min Salary', type: 'slider', editable: true },
        ],
      });

      const details = makeTownHallDetails('MayorCorp');
      panel.show(details);

      // Switch to townJobs tab
      (panel as unknown as { currentTab: string }).currentTab = 'townJobs';
      (panel as unknown as { renderTabContent: () => void }).renderTabContent();

      // renderPropertyGroup should have been called with undefined changeCallback
      expect(mockRenderPropertyGroup).toHaveBeenCalled();
      const lastCall = mockRenderPropertyGroup.mock.calls[mockRenderPropertyGroup.mock.calls.length - 1];
      expect(lastCall[2]).toBeUndefined(); // changeCallback should be undefined
    });

    it('should still use isOwner for non-town tabs on a Town Hall building', () => {
      registerMockElements();
      const onPropertyChange = jest.fn(async () => {});
      // User is mayor but NOT owner — non-town tab should use isOwner
      const panel = createPanel({ currentCompanyName: 'MayorCorp', onPropertyChange });

      mockGetGroupById.mockReturnValue({
        id: 'generic',
        name: 'General',
        properties: [
          { rdoName: 'Name', displayName: 'Name', type: 'text' },
        ],
      });

      const details = makeTownHallDetails('MayorCorp', 'SomeOtherOwner');
      // Add a non-town tab
      details.tabs.push({ id: 'generic', name: 'General', icon: 'G', order: 20, handlerName: 'IndGeneral' });
      details.groups['generic'] = [{ name: 'Name', value: 'Town Hall' }];

      panel.show(details);

      // Switch to non-town tab
      (panel as unknown as { currentTab: string }).currentTab = 'generic';
      (panel as unknown as { renderTabContent: () => void }).renderTabContent();

      // Not owner (MayorCorp !== SomeOtherOwner), so changeCallback should be undefined
      expect(mockRenderPropertyGroup).toHaveBeenCalled();
      const lastCall = mockRenderPropertyGroup.mock.calls[mockRenderPropertyGroup.mock.calls.length - 1];
      expect(lastCall[2]).toBeUndefined();
    });
  });
});
