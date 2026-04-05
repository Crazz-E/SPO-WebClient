/**
 * User Journey Integration Tests — verifies normal user workflows
 * end-to-end using mock scenarios, fully offline.
 *
 * Exercises: MockWebSocketClient → event-handler → ClientBridge → Zustand stores
 * and handler functions → ClientBridge → Zustand stores.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { WsMessageType } from '@/shared/types/message-types';
import type { WsMessage, BuildingDetailsResponse } from '@/shared/types';
import { createTestHarness, type TestHarness } from './test-harness';
import {
  handleMapClick,
  showBuildingOverlay,
  openInspectorForFocused,
  unfocusBuilding,
} from '@/client/handlers/building-focus-handler';
import { dispatchEvent } from '@/client/handlers/event-handler';

/* ── Mocks (required for node environment) ─────────────────────────────── */

jest.mock('@/client/components/common/Toast', () => ({
  showToast: jest.fn(),
}));

jest.mock('@/shared/building-details/civic-buildings', () => ({
  isCivicBuilding: (vc: string) => vc === '9999',
}));

jest.mock('@/client/facility-dimensions-cache', () => ({
  getFacilityDimensionsCache: () => ({
    getFacility: () => ({ xsize: 1, ysize: 1 }),
  }),
}));

jest.mock('@/shared/building-details', () => ({
  registerInspectorTabs: jest.fn(),
}));

/* ── Test Suite ─────────────────────────────────────────────────────────── */

describe('User Journey Integration', () => {
  let h: TestHarness;

  afterEach(() => {
    h?.cleanup();
  });

  // ─── Test 1: Login → world select → company select ─────────────────

  describe('login flow', () => {
    beforeEach(() => {
      h = createTestHarness(['auth', 'world-list', 'company-list', 'select-company']);
    });

    it('completes full login sequence via WS layer', async () => {
      // Step 1: Connect to directory
      const authResp = await h.ws.send({
        type: WsMessageType.REQ_CONNECT_DIRECTORY,
        wsRequestId: 'auth-001',
        username: 'Crazz',
        password: 'Simcity99',
        zonePath: 'Root/Areas/Asia/Worlds',
      } as WsMessage);

      expect(authResp.type).toBe(WsMessageType.RESP_CONNECT_SUCCESS);
      const resp = authResp as unknown as Record<string, unknown>;
      const worlds = resp.worlds as Array<Record<string, unknown>>;
      expect(worlds.length).toBeGreaterThan(0);

      // Step 2: Login to world
      const worldResp = await h.ws.send({
        type: WsMessageType.REQ_LOGIN_WORLD,
        wsRequestId: 'cl-001',
        username: 'Crazz',
        password: 'Simcity99',
        worldName: 'Shamba',
      } as WsMessage);

      expect(worldResp.type).toBe(WsMessageType.RESP_LOGIN_SUCCESS);

      // Step 3: Select company
      const companyResp = await h.ws.send({
        type: WsMessageType.REQ_SELECT_COMPANY,
        wsRequestId: 'sc-001',
        companyName: 'Yellow Inc.',
      } as WsMessage);

      expect(companyResp.type).toBe(WsMessageType.RESP_RDO_RESULT);

      // Verify session state tracks progression
      const sessionState = h.ws.getSessionState();
      expect(sessionState.phase).toBe('COMPANY_SELECTED');
    });
  });

  // ─── Test 2: Tycoon stats update via push event ────────────────────

  describe('tycoon stats update', () => {
    beforeEach(() => {
      h = createTestHarness(['auth']);
      h.ctx.storedUsername = 'Crazz';
    });

    it('updates game store when tycoon stats push arrives', () => {
      h.dispatchPush({
        type: WsMessageType.EVENT_TYCOON_UPDATE,
        cash: '$1,234,567',
        incomePerHour: '$456',
        ranking: 3,
        buildingCount: 15,
        maxBuildings: 50,
        failureLevel: 0,
      } as WsMessage);

      const stats = h.stores.game.getState().tycoonStats;
      expect(stats).toBeDefined();
      expect(stats!.cash).toBe('$1,234,567');
      expect(stats!.incomePerHour).toBe('$456');
      expect(stats!.ranking).toBe(3);
      expect(stats!.buildingCount).toBe(15);
    });
  });

  // ─── Test 3: Click building → overlay appears ──────────────────────

  describe('building overlay (first click)', () => {
    beforeEach(() => {
      h = createTestHarness(['switch-focus', 'building-details']);
    });

    it('shows building overlay on first click', async () => {
      await showBuildingOverlay(h.ctx, 472, 392, '100');

      // ctx should track the focused building
      expect(h.ctx.currentFocusedBuilding).not.toBeNull();
      expect(h.ctx.currentFocusedBuilding!.x).toBe(472);
      expect(h.ctx.currentFocusedBuilding!.y).toBe(392);

      // Store should have the building in overlay mode
      const bldState = h.stores.building.getState();
      expect(bldState.focusedBuilding).not.toBeNull();
      expect(bldState.isOverlayMode).toBe(true);
    });
  });

  // ─── Test 4: Open building inspector → load details ────────────────

  describe('building inspector (second click)', () => {
    beforeEach(() => {
      h = createTestHarness(['switch-focus', 'building-details']);
    });

    it('opens inspector panel with details on second click', async () => {
      // First click — overlay
      await showBuildingOverlay(h.ctx, 472, 392, 'PGIChemicalPlantA');

      // Mock requestBuildingDetails to return building details
      const mockDetails: Partial<BuildingDetailsResponse> = {
        x: 472,
        y: 392,
        visualClass: 'PGIChemicalPlantA',
        templateName: 'ChemicalPlant',
        ownerName: 'Yellow Inc.',
        buildingName: 'Chemical Plant 3',
        tabs: [],
        groups: {},
      };
      (h.ctx.requestBuildingDetails as jest.Mock).mockResolvedValue(mockDetails);

      // Second click — inspector
      await openInspectorForFocused(h.ctx, 472, 392, 'PGIChemicalPlantA');

      // UI panel should be open
      const uiState = h.stores.ui.getState();
      expect(uiState.rightPanel).toBe('building');
    });
  });

  // ─── Test 5: Inspect building → switch to another ──────────────────

  describe('building switch while inspector open', () => {
    beforeEach(() => {
      h = createTestHarness(['switch-focus', 'building-details']);
    });

    it('clears first building and shows second on rapid switch', async () => {
      // Focus first building
      await showBuildingOverlay(h.ctx, 472, 392, '100');
      expect(h.ctx.currentFocusedBuilding!.x).toBe(472);

      // Switch to second building — this should unfocus first
      await showBuildingOverlay(h.ctx, 477, 392, '200');
      expect(h.ctx.currentFocusedBuilding!.x).toBe(477);

      // Store should show second building, not first
      const bldState = h.stores.building.getState();
      expect(bldState.focusedBuilding).not.toBeNull();
      expect(bldState.focusedBuilding!.x).toBe(477);
    });
  });

  // ─── Test 6: Mail push event ───────────────────────────────────────

  describe('mail notification', () => {
    beforeEach(() => {
      h = createTestHarness(['mail']);
    });

    it('updates mail unread count on push event', () => {
      h.dispatchPush({
        type: WsMessageType.EVENT_NEW_MAIL,
        unreadCount: 5,
      } as WsMessage);

      const mailState = h.stores.mail.getState();
      expect(mailState.unreadCount).toBe(5);
    });
  });

  // ─── Test 7: Full journey — focus → inspect → unfocus ─────────────

  describe('full building lifecycle', () => {
    beforeEach(() => {
      h = createTestHarness(['switch-focus', 'building-details']);
    });

    it('completes focus → inspect → unfocus without orphaned state', async () => {
      // Step 1: Focus building (overlay)
      await showBuildingOverlay(h.ctx, 472, 392, '100');
      expect(h.stores.building.getState().focusedBuilding).not.toBeNull();
      expect(h.stores.building.getState().isOverlayMode).toBe(true);

      // Step 2: Open inspector
      const mockDetails: Partial<BuildingDetailsResponse> = {
        x: 472,
        y: 392,
        visualClass: '100',
        templateName: 'Farm',
        ownerName: 'Yellow Inc.',
        buildingName: 'Farm 10',
        tabs: [],
        groups: {},
      };
      (h.ctx.requestBuildingDetails as jest.Mock).mockResolvedValue(mockDetails);
      await openInspectorForFocused(h.ctx, 472, 392, '100');
      expect(h.stores.ui.getState().rightPanel).toBe('building');

      // Step 3: Unfocus — should clean up everything
      unfocusBuilding(h.ctx);
      expect(h.ctx.currentFocusedBuilding).toBeNull();
      expect(h.ctx.currentFocusedVisualClass).toBeNull();

      // Store should be clean
      const bldState = h.stores.building.getState();
      expect(bldState.focusedBuilding).toBeNull();
      expect(bldState.details).toBeNull();
    });
  });
});
