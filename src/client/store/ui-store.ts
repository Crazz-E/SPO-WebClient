/**
 * UI Store — Panel visibility, modal state, command palette, and mobile navigation.
 * Controls what UI surfaces are visible at any moment.
 */

import { create } from 'zustand';
import type { BuildingCategory, BuildingInfo } from '@/shared/types';

export type RightPanelType = 'building' | 'mail' | 'search' | 'politics' | 'transport';
export type LeftPanelType = 'empire';
export type ModalType = 'buildMenu' | 'settings' | 'confirm' | 'createCompany' | 'connectionPicker';
export type MobileTab = 'map' | 'empire' | 'build' | 'mail' | 'more';

interface UiState {
  // Panels
  rightPanel: RightPanelType | null;
  leftPanel: LeftPanelType | null;

  // Modals (overlay everything)
  modal: ModalType | null;
  /** Payload for confirmation dialogs */
  confirmPayload: { title: string; message: string; onConfirm: () => void } | null;

  // Build menu data
  buildMenuCategories: BuildingCategory[];
  buildMenuFacilities: BuildingInfo[];

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

  // Actions — Build menu data
  setBuildMenuCategories: (cats: BuildingCategory[]) => void;
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
  buildMenuCategories: [],
  buildMenuFacilities: [],
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
  openModal: (type) => set({ modal: type }),
  closeModal: () => set({ modal: null, confirmPayload: null }),
  requestConfirm: (title, message, onConfirm) =>
    set({ modal: 'confirm', confirmPayload: { title, message, onConfirm } }),

  // Build menu data
  setBuildMenuCategories: (cats) => set({ buildMenuCategories: cats }),
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
    } else if (state.modal) {
      set({ modal: null, confirmPayload: null });
    } else if (state.rightPanel) {
      set({ rightPanel: null });
    } else if (state.leftPanel) {
      set({ leftPanel: null });
    }
  },
}));
