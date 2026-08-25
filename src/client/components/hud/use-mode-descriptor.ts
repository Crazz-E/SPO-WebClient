/**
 * The active map MODE, described once for both command bars (handoff 00 §4.2).
 *
 * Placement, road building, road demolition and zone painting all put the client in a mode
 * that outlives the click that started it. The desktop CommandBar turns its search row into a
 * mode bar; mobile does the same in place of its tile row (placement keeps its own
 * PlacementHUD). Both need the SAME words and the same way out, so the reading of the stores
 * lives here and each bar only decides how to draw it.
 */

import { useGameStore } from '../../store/game-store';
import { useUiStore } from '../../store/ui-store';
import { useClient } from '../../context';
import { overlayModeNote } from '../../handlers/overlay-mode';
import { BRIDGE_COST_PER_TILE, ROAD_COST_PER_TILE } from '../../../shared/road-cost';
import { formatMoney } from '../../format-utils';

export interface ModeDescriptor {
  /** What kind of mode is running — the small caps word of the bar */
  kind: 'Placement' | 'Road' | 'Zones' | 'Connect';
  /** The name of what is being placed or done */
  title: string;
  /** What the player has to do next */
  hint: string;
  /** Placement only: the ghost sits on a spot the server would refuse */
  invalid: boolean;
  /** Placement only: the price of the building, already formatted */
  cost: string | null;
  /** Placement only: the cash left after the spend, already formatted */
  cashAfter: string | null;
  /** True when that remaining cash is negative */
  cashAfterNegative: boolean;
  /** What happened to the map overlay when the mode started, or null */
  overlayNote: string | null;
  /** Placement is the only mode that offers "Rotate view" */
  isPlacing: boolean;
  /** Leaving the mode — cancel the placement, or toggle the mode off */
  onDone: () => void;
  /**
   * Label of the way-out button. 'Done' by default; connect says 'Cancel' —
   * it has no partial state to validate, leaving without a click IS cancelling.
   */
  doneLabel: string;
}

/** The mode currently running, or null when the player is free on the map. */
export function useModeDescriptor(): ModeDescriptor | null {
  const client = useClient();
  const isPlacing = useUiStore((s) => s.isPlacingBuilding);
  const placementValid = useUiStore((s) => s.placementValid);
  const facility = useUiStore((s) => s.placingFacility);
  const isRoadBuild = useGameStore((s) => s.isRoadBuildingMode);
  const isRoadDemolish = useGameStore((s) => s.isRoadDemolishMode);
  const isZone = useGameStore((s) => s.isZonePaintingMode);
  const connect = useUiStore((s) => s.connectMode);
  const cash = useGameStore((s) => s.tycoonStats?.cash);
  const overlayNote = overlayModeNote(useGameStore((s) => s.overlayBeforeMode));

  if (isPlacing) {
    const cashNum = cash ? parseFloat(String(cash).replace(/,/g, '')) : NaN;
    const after = facility && !Number.isNaN(cashNum) ? cashNum - facility.cost : null;
    return {
      kind: 'Placement',
      title: facility?.name ?? 'Building',
      hint: placementValid ? 'Click the map to place' : 'Invalid spot — move the ghost',
      invalid: !placementValid,
      cost: facility ? formatMoney(facility.cost) : null,
      cashAfter: after !== null ? formatMoney(after) : null,
      cashAfterNegative: after !== null && after < 0,
      overlayNote,
      isPlacing: true,
      onDone: () => client.onCancelBuildingPlacement(),
      doneLabel: 'Done',
    };
  }

  const base = { invalid: false, cost: null, cashAfter: null, cashAfterNegative: false, overlayNote, isPlacing: false, doneLabel: 'Done' } as const;

  if (isRoadBuild) {
    // H7 (#99): the flat "per tile" was never the price — water without concrete costs the
    // bridge rate and a tile that already carries a road is free.
    const roadHint = `Drag on the map — ${formatMoney(ROAD_COST_PER_TILE)} per tile, ${formatMoney(BRIDGE_COST_PER_TILE)} over water; existing road is free`;
    return { ...base, kind: 'Road', title: 'Build', hint: roadHint, onDone: () => client.onBuildRoad() };
  }
  if (isRoadDemolish) {
    return { ...base, kind: 'Road', title: 'Demolish', hint: 'Drag on the map', onDone: () => client.onDemolishRoad() };
  }
  if (isZone) {
    return { ...base, kind: 'Zones', title: 'Paint', hint: 'Drag a rectangle on the map', onDone: () => client.onCancelZonePainting() };
  }
  if (connect.active) {
    // N10 — one mode, two origins (the inspector's connectMap and the picker's
    // Pick on map). The sheet stack is hidden while it runs; Cancel or Esc
    // brings it back untouched.
    return { ...base, kind: 'Connect', title: connect.subject || 'Building', hint: 'Click a building to connect', onDone: () => client.onCancelConnectMode(), doneLabel: 'Cancel' };
  }
  return null;
}
