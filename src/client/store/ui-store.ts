/**
 * UI Store — Panel visibility, modal state, command palette, and mobile navigation.
 * Controls what UI surfaces are visible at any moment.
 */

import { create } from 'zustand';
import type { BuildingCategory, BuildingInfo } from '@/shared/types';
import { useBuildingStore } from './building-store';
import { useGameStore } from './game-store';

export type RightPanelType = 'building' | 'mail' | 'search' | 'transport';
export type LeftPanelType = 'empire' | 'facilities' | 'overlays';
export type ModalType = 'buildMenu' | 'settings' | 'confirm' | 'prompt' | 'createCompany' | 'connectionPicker' | 'zonePicker' | 'supplierSearch' | 'buildingInspector' | 'changelog';
export type MobileTab = 'map' | 'empire' | 'build' | 'mail' | 'more';

interface UiState {
  // Panels
  rightPanel: RightPanelType | null;
  leftPanel: LeftPanelType | null;

  // Modals (overlay everything)
  modal: ModalType | null;
  /** Payload for confirmation dialogs */
  confirmPayload: { title: string; message: string; onConfirm: () => void } | null;
  /** Payload for text-input prompt dialogs */
  promptPayload: { title: string; message: string; placeholder?: string; defaultValue?: string; onSubmit: (value: string) => void } | null;

  // Build menu data
  buildMenuCategories: BuildingCategory[];
  buildMenuFacilities: BuildingInfo[];
  capitolIconUrl: string;

  // Command palette
  commandPaletteOpen: boolean;

  // Mobile
  mobileTab: MobileTab;

  // Actions — Panels
  openRightPanel: (type: RightPanelType) => void;
  closeRightPanel: () => void;
  toggleRightPanel: (type: RightPanelType) => void;
  openLeftPanel: (type: LeftPanelType) => void;
  closeLeftPanel: () => void;
  toggleLeftPanel: (type: LeftPanelType) => void;
  closeAllPanels: () => void;

  // Actions — Modals
  openModal: (type: ModalType) => void;
  closeModal: () => void;
  requestConfirm: (title: string, message: string, onConfirm: () => void) => void;
  requestPrompt: (title: string, message: string, onSubmit: (value: string) => void, options?: { placeholder?: string; defaultValue?: string }) => void;

  // Actions — Build menu data
  setBuildMenuCategories: (cats: BuildingCategory[], capitolIconUrl?: string) => void;
  setBuildMenuFacilities: (facs: BuildingInfo[]) => void;
  clearBuildMenuData: () => void;

  // Actions — Command palette
  openCommandPalette: () => void;
  closeCommandPalette: () => void;
  toggleCommandPalette: () => void;

  // Actions — Mobile
  setMobileTab: (tab: MobileTab) => void;

  // Actions — Escape (close topmost layer)
  dismissTopmost: () => void;
}

export const useUiStore = create<UiState>((set, get) => ({
  rightPanel: null,
  leftPanel: null,
  modal: null,
  confirmPayload: null,
  promptPayload: null,
  buildMenuCategories: [],
  buildMenuFacilities: [],
  capitolIconUrl: '',
  commandPaletteOpen: false,
  mobileTab: 'empire',

  // Panels
  openRightPanel: (type) => set({ rightPanel: type }),
  closeRightPanel: () => set({ rightPanel: null }),
  toggleRightPanel: (type) => {
    const current = get().rightPanel;
    set({ rightPanel: current === type ? null : type });
  },

  openLeftPanel: (type) => set({ leftPanel: type }),
  closeLeftPanel: () => set({ leftPanel: null }),
  toggleLeftPanel: (type) => {
    const current = get().leftPanel;
    set({ leftPanel: current === type ? null : type });
  },

  closeAllPanels: () => set({ rightPanel: null, leftPanel: null }),

  // Modals
  openModal: (type) => {
    // Civic building modal replaces the right-panel building inspector
    if (type === 'buildingInspector') {
      set({ modal: type, rightPanel: null });
    } else {
      set({ modal: type });
    }
  },
  closeModal: () => set({ modal: null, confirmPayload: null, promptPayload: null }),
  requestConfirm: (title, message, onConfirm) =>
    set({ modal: 'confirm', confirmPayload: { title, message, onConfirm } }),
  requestPrompt: (title, message, onSubmit, options) =>
    set({ modal: 'prompt', promptPayload: { title, message, onSubmit, ...options } }),

  // Build menu data
  setBuildMenuCategories: (cats, capitolIconUrl) => set({ buildMenuCategories: cats, ...(capitolIconUrl ? { capitolIconUrl } : {}) }),
  setBuildMenuFacilities: (facs) => set({ buildMenuFacilities: facs }),
  clearBuildMenuData: () => set({ buildMenuCategories: [], buildMenuFacilities: [] }),

  // Command palette
  openCommandPalette: () => set({ commandPaletteOpen: true }),
  closeCommandPalette: () => set({ commandPaletteOpen: false }),
  toggleCommandPalette: () => set((s) => ({ commandPaletteOpen: !s.commandPaletteOpen })),

  // Mobile
  setMobileTab: (tab) => set({ mobileTab: tab }),

  // Escape — dismiss topmost layer in priority order
  dismissTopmost: () => {
    const state = get();
    if (state.commandPaletteOpen) {
      set({ commandPaletteOpen: false });
    } else {
      // Server switch overlay sits at z-450 (above modals z-400)
      const gameState = useGameStore.getState();
      if (gameState.serverSwitchMode) {
        const canCancel = (gameState.loginStage === 'zones' || gameState.loginStage === 'worlds')
          && !gameState.loginLoading;
        if (canCancel) {
          gameState.cancelServerSwitch();
          return;
        }
      }
      if (state.modal) {
        if (state.modal === 'buildingInspector') {
          useBuildingStore.getState().clearFocus();
        }
        set({ modal: null, confirmPayload: null, promptPayload: null });
      } else if (state.rightPanel) {
        set({ rightPanel: null });
      } else if (state.leftPanel) {
        set({ leftPanel: null });
      }
    }
  },
}));
