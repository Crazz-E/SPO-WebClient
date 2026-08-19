/**
 * useGateConnections — the shared expand-and-load mechanism behind both
 * accordions in the building inspector.
 *
 * Supplies and Products differ in what a gate *is* (an input gate vs an output
 * gate) and in the columns their rows carry, but not at all in how a gate is
 * opened: click, read that gate's connections once, remember them. That
 * sequence lives here so there is one of it rather than one per panel.
 *
 * The tab request delivers gates with their headers and an empty `connections`
 * list; a gate's rows are read only when it is open. This mirrors the reference
 * client, which loads `CurrentFinger` alone and memoises it —
 * `if reload or not Info.Loaded` (Voyager/ProdSheetForm.pas:464,
 * Voyager/SupplySheetForm.pas:551) — and whose `LoadFingerInfo` performs
 * exactly the SetPath + header + per-connection reads this triggers
 * (Voyager/SupplySheetForm.pas:440-506).
 */

import { useCallback, useEffect } from 'react';
import { useBuildingStore, gateKey } from '../../store/building-store';
import type { GateTabId } from '../../store/building-store';
import { useGameStore } from '../../store/game-store';
import { useClient } from '../../context';

export interface GateConnectionsState {
  /** Whether the gate's body is open. */
  expanded: boolean;
  /** Open/close the gate. Re-opening a failed gate retries the read. */
  toggle: () => void;
  /** A read is in flight — the rows on screen, if any, are the previous ones. */
  isLoading: boolean;
  /**
   * The rows on screen are this gate's, read at least once. Distinguishes "no
   * connections" from "not read yet", which look identical in the data.
   */
  loaded: boolean;
  /** The last read failed. Collapsing and re-expanding retries. */
  failed: boolean;
}

export function useGateConnections(
  tabId: GateTabId,
  path: string,
  name: string,
  buildingX: number,
  buildingY: number,
): GateConnectionsState {
  const client = useClient();
  const key = gateKey(tabId, path);

  // Both selectors return primitives, so a re-render of the panel cannot make
  // them look "changed" and loop the subscription.
  const expanded = useBuildingStore((s) => s.expandedGates.has(key));
  const loadState = useBuildingStore((s) => s.gateLoadingStates[key]);
  const visualClass = useBuildingStore((s) => s.details?.visualClass ?? '0');
  const isConnected = useGameStore((s) => s.status === 'connected');

  const toggle = useCallback(() => {
    useBuildingStore.getState().toggleGateExpanded(tabId, path);
  }, [tabId, path]);

  useEffect(() => {
    if (!expanded || !isConnected) return;
    // 'error' is deliberately terminal here: without it a failed read would be
    // retried on every render for as long as the gate stays open. The user
    // retries by closing and re-opening, which clears the mark.
    if (loadState === 'loaded' || loadState === 'loading' || loadState === 'error') return;
    client.onRequestGateConnections(buildingX, buildingY, tabId, path, name, visualClass);
  }, [expanded, isConnected, loadState, buildingX, buildingY, tabId, path, name, visualClass, client]);

  return {
    expanded,
    toggle,
    isLoading: loadState === 'loading',
    loaded: loadState === 'loaded',
    failed: loadState === 'error',
  };
}
