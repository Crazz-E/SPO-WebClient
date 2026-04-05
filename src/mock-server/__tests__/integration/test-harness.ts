/**
 * Integration Test Harness — wires MockWebSocketClient through the real
 * event-handler → ClientBridge → Zustand stores chain.
 *
 * Usage:
 *   const h = createTestHarness(['auth', 'world-list', 'switch-focus']);
 *   const resp = await h.send({ type: WsMessageType.REQ_CONNECT_DIRECTORY, ... });
 *   expect(useGameStore.getState().status).toBe('connected');
 *   h.cleanup();
 */

import type { WsMessage } from '@/shared/types/message-types';
import type { ClientHandlerContext } from '@/client/handlers/client-context';
import type { BuildingDetailsResponse, BuildingFocusInfo } from '@/shared/types';
import { MockWebSocketClient } from '../../mock-ws-client';
import {
  loadScenario,
  loadAll,
  type ScenarioName,
} from '../../scenarios/scenario-registry';
import { dispatchEvent } from '@/client/handlers/event-handler';

// ── Zustand Stores (real, not mocked) ───────────────────────────────────────
import { useGameStore } from '@/client/store/game-store';
import { useBuildingStore } from '@/client/store/building-store';
import { useChatStore } from '@/client/store/chat-store';
import { useMailStore } from '@/client/store/mail-store';
import { useProfileStore } from '@/client/store/profile-store';
import { useSearchStore } from '@/client/store/search-store';
import { usePoliticsStore } from '@/client/store/politics-store';
import { useTransportStore } from '@/client/store/transport-store';
import { useUiStore } from '@/client/store/ui-store';
import { useEmpireStore } from '@/client/store/empire-store';
import { useLogStore } from '@/client/store/log-store';

// ── Types ────────────────────────────────────────────────────────────────────

export interface TestHarness {
  /** The underlying mock WS client — use for low-level access */
  ws: MockWebSocketClient;

  /** The mock ClientHandlerContext with real generation counters */
  ctx: ClientHandlerContext;

  /** Shorthand store accessors */
  stores: {
    game: typeof useGameStore;
    building: typeof useBuildingStore;
    chat: typeof useChatStore;
    mail: typeof useMailStore;
    profile: typeof useProfileStore;
    search: typeof useSearchStore;
    politics: typeof usePoliticsStore;
    transport: typeof useTransportStore;
    ui: typeof useUiStore;
    empire: typeof useEmpireStore;
    log: typeof useLogStore;
  };

  /** Send a WS request and auto-dispatch the response through the event handler */
  send(msg: WsMessage): Promise<WsMessage>;

  /** Dispatch a push event directly to the event handler (simulates server push) */
  dispatchPush(msg: WsMessage): void;

  /** Reset all stores, WS client, and generation counters */
  cleanup(): void;
}

// ── Store Reset ──────────────────────────────────────────────────────────────

/** Capture initial state once at module load so we can reset cheaply */
const INITIAL_BUILDING_STATE = useBuildingStore.getState();
const INITIAL_GAME_STATE = useGameStore.getState();
const INITIAL_CHAT_STATE = useChatStore.getState();
const INITIAL_UI_STATE = useUiStore.getState();

function resetAllStores(): void {
  // Building store — use clearFocus + clearDetails which handle nested state
  useBuildingStore.getState().clearFocus();

  // Game store — reset key fields
  useGameStore.setState({
    status: INITIAL_GAME_STATE.status,
    loginStage: INITIAL_GAME_STATE.loginStage,
    worldName: INITIAL_GAME_STATE.worldName,
    companyId: INITIAL_GAME_STATE.companyId,
    companyName: INITIAL_GAME_STATE.companyName,
    tycoonStats: INITIAL_GAME_STATE.tycoonStats,
  });

  // Chat store — clear messages and users
  useChatStore.setState({
    messages: INITIAL_CHAT_STATE.messages,
    channels: INITIAL_CHAT_STATE.channels,
  });

  // UI store — close panels/modals
  useUiStore.getState().closeRightPanel();
  useUiStore.getState().closeModal();

  // Mail / Profile / Search / Politics / Transport / Empire — reset via setState
  useMailStore.setState({ unreadCount: 0 });
  useProfileStore.setState({ profile: null });
  useLogStore.setState({ entries: [] });
}

// ── Context Factory ──────────────────────────────────────────────────────────

function createMockContext(ws: MockWebSocketClient): ClientHandlerContext {
  // Real generation counter logic — NOT mocked
  const generationCounters = new Map<string, number>();

  const ctx: ClientHandlerContext = {
    // ── WebSocket Transport ──
    sendRequest: jest.fn(async (msg: WsMessage) => ws.send(msg)),
    sendMessage: jest.fn(),
    rawSend: jest.fn(),

    // ── Generation Counters (REAL) ──
    nextGeneration(category: string): number {
      const gen = (generationCounters.get(category) ?? 0) + 1;
      generationCounters.set(category, gen);
      return gen;
    },
    isCurrentGeneration(category: string, gen: number): boolean {
      return generationCounters.get(category) === gen;
    },

    // ── UI / Notification ──
    showNotification: jest.fn(),
    soundManager: { play: jest.fn() } as never,

    // ── Renderer (null — no canvas in tests) ──
    getRenderer: () => null,
    getMapNavigationUI: () => null,

    // ── Session State ──
    storedUsername: 'TestUser',
    storedPassword: 'TestPass',
    availableCompanies: [],
    currentCompanyName: '',
    currentWorldName: '',
    worldXSize: null,
    worldYSize: null,
    worldSeason: null,
    savedPlayerX: undefined,
    savedPlayerY: undefined,

    // ── Building Focus State ──
    currentFocusedBuilding: null,
    currentFocusedVisualClass: null,
    currentTycoonData: null,

    // ── Building Construction State ──
    buildingCategories: [],
    lastLoadedFacilities: [],
    currentBuildingToPlace: null,
    currentBuildingXSize: 1,
    currentBuildingYSize: 1,
    overlayBeforePlacement: { type: 'none' },

    // ── Double-click Prevention ──
    isFocusingBuilding: false,
    isSendingChatMessage: false,
    isJoiningChannel: false,
    isSelectingCompany: false,

    // ── Road Building State ──
    isRoadBuildingMode: false,
    isBuildingRoad: false,
    isRoadDemolishMode: false,

    // ── Zone Painting State ──
    isZonePaintingMode: false,
    selectedZoneType: 0,

    // ── Overlay State ──
    isCityZonesEnabled: false,
    activeOverlayType: null,

    // ── Speculative Prefetch ──
    speculativeBuildingDetails: new Map(),
    speculativeBuildingResolved: new Map(),

    // ── Connect Mode ──
    isConnectMode: false,
    connectSourceBuilding: null,
    connectKeyboardHandler: null,

    // ── Logout ──
    isLoggingOut: false,

    // ── In-flight Dedup ──
    inFlightBuildingDetails: new Map(),

    // ── Cross-handler Methods (stubs) ──
    requestBuildingDetails: jest.fn().mockResolvedValue(null),
    refreshBuildingDetails: jest.fn().mockResolvedValue(undefined),
    setBuildingProperty: jest.fn().mockResolvedValue(true),
    loadMapArea: jest.fn(),
    loadAlignedMapArea: jest.fn(),
    loadAlignedMapAreaForRect: jest.fn(),
    fetchSurfaceForArea: jest.fn().mockResolvedValue(undefined),
    toggleZoneOverlay: jest.fn(),
    cancelBuildingPlacement: jest.fn(),
    cancelRoadBuildingMode: jest.fn(),
    cancelRoadDemolishMode: jest.fn(),
    cancelZonePaintingMode: jest.fn(),
    requestUserList: jest.fn().mockResolvedValue(undefined),
    focusBuilding: jest.fn().mockResolvedValue(undefined),
    loadResearchInventory: jest.fn(),

    // ── Game View Initialization ──
    switchToGameView: jest.fn().mockResolvedValue(undefined),
    preloadFacilityDimensions: jest.fn().mockResolvedValue(undefined),
    connectMailService: jest.fn().mockResolvedValue(undefined),
    getProfile: jest.fn().mockResolvedValue(undefined),
    initChatChannels: jest.fn().mockResolvedValue(undefined),
    sendCameraPositionNow: jest.fn(),
  };

  return ctx;
}

// ── Harness Factory ──────────────────────────────────────────────────────────

/**
 * Create a test harness that wires mock scenarios through the real
 * event-handler → ClientBridge → Zustand store chain.
 *
 * @param scenarioNames - Which scenarios to load (or 'all' for the full set)
 * @param overrides - Optional scenario variable overrides
 */
export function createTestHarness(
  scenarioNames: ScenarioName[] | 'all',
  overrides?: Record<string, string>,
): TestHarness {
  // Load and merge scenarios
  let wsScenarios;
  if (scenarioNames === 'all') {
    const bundle = loadAll(overrides);
    wsScenarios = [bundle.ws];
  } else {
    wsScenarios = scenarioNames
      .map((name) => loadScenario(name, overrides))
      .filter((b) => b.ws)
      .map((b) => b.ws!);
  }

  const ws = new MockWebSocketClient(wsScenarios);
  const ctx = createMockContext(ws);

  resetAllStores();

  const harness: TestHarness = {
    ws,
    ctx,

    stores: {
      game: useGameStore,
      building: useBuildingStore,
      chat: useChatStore,
      mail: useMailStore,
      profile: useProfileStore,
      search: useSearchStore,
      politics: usePoliticsStore,
      transport: useTransportStore,
      ui: useUiStore,
      empire: useEmpireStore,
      log: useLogStore,
    },

    async send(msg: WsMessage): Promise<WsMessage> {
      const response = await ws.send(msg);
      // Auto-dispatch through the real event handler chain
      dispatchEvent(ctx, response);
      return response;
    },

    dispatchPush(msg: WsMessage): void {
      dispatchEvent(ctx, msg);
    },

    cleanup(): void {
      ws.stopScheduledEvents();
      ws.reset();
      resetAllStores();
    },
  };

  return harness;
}
