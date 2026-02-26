/**
 * Log Store — Ring buffer for protocol/debug log entries.
 * Replaces the legacy UIManager.log() → #console-output DOM approach.
 */

import { create } from 'zustand';

export interface LogEntry {
  id: number;
  timestamp: number;
  source: string;
  message: string;
}

interface LogState {
  entries: LogEntry[];
  nextId: number;

  addEntry: (source: string, message: string) => void;
  clear: () => void;
}

const MAX_ENTRIES = 500;

export const useLogStore = create<LogState>((set) => ({
  entries: [],
  nextId: 1,

  addEntry: (source, message) =>
    set((state) => {
      const entry: LogEntry = {
        id: state.nextId,
        timestamp: Date.now(),
        source,
        message,
      };
      const entries = state.entries.length >= MAX_ENTRIES
        ? [...state.entries.slice(1), entry]
        : [...state.entries, entry];
      return { entries, nextId: state.nextId + 1 };
    }),

  clear: () => set({ entries: [], nextId: 1 }),
}));
