/**
 * SuppliesGroup — Supply input management panel.
 *
 * Extracted from PropertyGroup.tsx. Renders the "Supplies" special tab:
 * supply cards with connection tables, max price/min quality sliders,
 * hire/modify/fire actions, and overpayment popover.
 */

import { memo, useState, useCallback, useRef } from 'react';
import type { BuildingSupplyData, BuildingConnectionData } from '@/shared/types';
import { useClient } from '../../context';
import { useUiStore } from '../../store/ui-store';
import { useGateConnections } from './useGateConnections';
import styles from './PropertyGroup.module.css';

/**
 * Disconnecting is destructive and used to fire at once (Fire button, Delete key). It now goes
 * through the shared Dialog (T3, B5): focus lands on Cancel, Escape cancels.
 */
function confirmDisconnect(name: string, fluidLabel: string, direction: 'input' | 'output', onConfirm: () => void): void {
  useUiStore.getState().requestConfirm(
    `Disconnect ${name}?`,
    direction === 'input'
      ? `This building will stop receiving ${fluidLabel} from ${name}. You can reconnect it later.`
      : `${name} will stop buying ${fluidLabel} here. You can reconnect it later.`,
    onConfirm,
    { kind: 'destructive', confirmLabel: 'Disconnect', typeToConfirm: null },
  );
}

// =============================================================================
// SUPPLIES PANEL (special === 'supplies')
// =============================================================================

export function SuppliesPanel({
  supplies,
  canEdit,
  buildingX,
  buildingY,
}: {
  supplies: BuildingSupplyData[];
  canEdit: boolean;
  buildingX: number;
  buildingY: number;
}) {
  if (supplies.length === 0) {
    return <div className={styles.empty}>No supply inputs</div>;
  }
  return (
    <div className={styles.supplyList}>
      {/* Keyed by path, not metaFluid: the fluid id lives in the gate header,
          which is not read until the gate is opened. The path comes from
          GetInputNames and is there from the start. */}
      {supplies.map((supply) => (
        <SupplyCard key={supply.path} supply={supply} canEdit={canEdit} buildingX={buildingX} buildingY={buildingY} />
      ))}
    </div>
  );
}

function OverpaymentPopover({
  conn,
  connIndex,
  supply,
  buildingX,
  buildingY,
  onClose,
}: {
  conn: BuildingConnectionData;
  connIndex: number;
  supply: BuildingSupplyData;
  buildingX: number;
  buildingY: number;
  onClose: () => void;
}) {
  const client = useClient();
  const initialOverprice = parseInt(conn.overprice || '0', 10);
  const [overprice, setOverprice] = useState(isNaN(initialOverprice) ? 0 : initialOverprice);

  // The fluid id comes off the gate header, which is only read once the gate is
  // opened — and this popover only exists inside an opened gate. The guard is
  // what keeps a malformed SET (fluidId: undefined) off the wire if that ever
  // stops being true.
  const fluidId = supply.metaFluid;

  const handleOk = () => {
    if (!fluidId) return;
    client.onSetBuildingProperty(buildingX, buildingY, 'RDOSetInputOverPrice', String(overprice), {
      fluidId,
      index: String(connIndex),
    });
    client.onRefreshBuilding(buildingX, buildingY);
    onClose();
  };

  const handleDelete = () => {
    if (!fluidId) return;
    confirmDisconnect(conn.facilityName, supply.name || fluidId, 'input', () => {
      client.onDisconnectConnection(buildingX, buildingY, fluidId, 'input', conn.x, conn.y);
    });
    onClose();
  };

  return (
    <>
      <div className={styles.overpayBackdrop} onClick={onClose} />
      <div className={styles.overpayPopover}>
        <div className={styles.overpayHeader}>
          <div>Name: <strong>{conn.facilityName}</strong></div>
          <div>Company: <strong>{conn.companyName}</strong></div>
        </div>
        <div className={styles.overpaySliderRow}>
          <span className={styles.sliderLabel}>Overpayment</span>
          <input
            type="range"
            className={styles.slider}
            min={0}
            max={150}
            step={1}
            value={overprice}
            onChange={(e) => setOverprice(parseInt(e.target.value, 10))}
          />
          <span className={styles.sliderValue}>{overprice}%</span>
        </div>
        <div className={styles.overpayActions}>
          <button className={styles.overpayDeleteBtn} onClick={handleDelete}>Delete</button>
          <button className={styles.overpayOkBtn} onClick={handleOk}>OK</button>
          <button className={styles.overpayCancelBtn} onClick={onClose}>Cancel</button>
        </div>
      </div>
    </>
  );
}

const SupplyCard = memo(function SupplyCard({
  supply,
  canEdit,
  buildingX,
  buildingY,
}: {
  supply: BuildingSupplyData;
  canEdit: boolean;
  buildingX: number;
  buildingY: number;
}) {
  const client = useClient();
  // Expansion and this gate's connection rows are one mechanism, shared with
  // ProductCard: opening the gate is what reads its rows.
  const { expanded, toggle, loaded, failed } = useGateConnections(
    'supplies', supply.path, supply.name, buildingX, buildingY,
  );
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [overpayTarget, setOverpayTarget] = useState<number | null>(null);
  const maxPriceTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const minKTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const currentMaxPrice = parseInt(supply.maxPrice || '200', 10);
  const currentMinK = parseInt(supply.minK || '0', 10);
  const [localMaxPrice, setLocalMaxPrice] = useState(isNaN(currentMaxPrice) ? 200 : currentMaxPrice);
  const [localMinK, setLocalMinK] = useState(isNaN(currentMinK) ? 0 : currentMinK);

  // Every mutation below addresses the gate by its fluid id, and that id is a
  // header property — unknown until this gate has been opened and read. The
  // controls that use it are rendered only once it is known; the guards are the
  // second line.
  const fluidId = supply.metaFluid;

  const handleMaxPriceChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    setLocalMaxPrice(val);
    if (maxPriceTimeoutRef.current) clearTimeout(maxPriceTimeoutRef.current);
    maxPriceTimeoutRef.current = setTimeout(() => {
      if (!fluidId) return;
      client.onSetBuildingProperty(buildingX, buildingY, 'RDOSetInputMaxPrice', String(val), {
        fluidId,
      });
    }, 300);
  }, [client, buildingX, buildingY, fluidId]);

  const handleMinKChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    setLocalMinK(val);
    if (minKTimeoutRef.current) clearTimeout(minKTimeoutRef.current);
    minKTimeoutRef.current = setTimeout(() => {
      if (!fluidId) return;
      client.onSetBuildingProperty(buildingX, buildingY, 'RDOSetInputMinK', String(val), {
        fluidId,
      });
    }, 300);
  }, [client, buildingX, buildingY, fluidId]);

  const handleHire = () => {
    if (!fluidId) return;
    client.onSearchConnections(buildingX, buildingY, fluidId, supply.name, 'input');
  };

  const handleModify = () => {
    if (selectedIdx !== null) setOverpayTarget(selectedIdx);
  };

  const handleFire = () => {
    if (selectedIdx === null || !fluidId) return;
    const conn = supply.connections[selectedIdx];
    if (!conn) return;
    confirmDisconnect(conn.facilityName, supply.name || fluidId, 'input', () => {
      client.onDisconnectConnection(buildingX, buildingY, fluidId, 'input', conn.x, conn.y);
      setSelectedIdx(null);
    });
  };

  const handleRowClick = (idx: number) => {
    setSelectedIdx(selectedIdx === idx ? null : idx);
  };

  const handleRowContextMenu = (e: React.MouseEvent, idx: number) => {
    e.preventDefault();
    setOverpayTarget(idx);
  };

  return (
    <div className={styles.supplyCard}>
      <button className={styles.supplyHeader} onClick={toggle}>
        <span className={styles.supplyName}>{supply.name || supply.metaFluid}</span>
        {/* The supplier count is a header property. Reading it for every gate
            cost a round-trip per collapsed row; it now appears once the gate has
            been opened. Absent is honest — `0 suppliers` would not be. */}
        {supply.connectionCount !== undefined && (
          <span className={styles.supplyCount}>
            {supply.connectionCount} supplier{supply.connectionCount !== 1 ? 's' : ''}
          </span>
        )}
        <span className={styles.supplyChevron}>{expanded ? '\u25B2' : '\u25BC'}</span>
      </button>

      {expanded && (
        <div className={styles.supplyBody}>
          {/* Stats row */}
          <div className={styles.supplyStats}>
            {supply.fluidValue && (
              <span className={styles.supplyStat}>Last Value: <strong>{supply.fluidValue}</strong></span>
            )}
            {supply.lastCostPerc && (
              <span className={styles.supplyStat}>Cost: <strong>{supply.lastCostPerc}%</strong></span>
            )}
          </div>

          {/* Max Price slider */}
          {canEdit && supply.maxPrice !== undefined ? (
            <div className={styles.supplySliderRow}>
              <span className={styles.sliderLabel}>Max Price</span>
              <input
                type="range"
                className={styles.slider}
                min={0}
                max={500}
                step={10}
                value={localMaxPrice}
                onChange={handleMaxPriceChange}
              />
              <span className={styles.sliderValue}>{localMaxPrice}%</span>
            </div>
          ) : supply.maxPrice !== undefined ? (
            <div className={styles.row}>
              <span className={styles.name}>Max Price</span>
              <span className={styles.value}>{supply.maxPrice}%</span>
            </div>
          ) : null}

          {/* Min Quality slider */}
          {canEdit && supply.minK !== undefined ? (
            <div className={styles.supplySliderRow}>
              <span className={styles.sliderLabel}>Min Quality</span>
              <input
                type="range"
                className={styles.slider}
                min={0}
                max={100}
                step={1}
                value={localMinK}
                onChange={handleMinKChange}
              />
              <span className={styles.sliderValue}>{localMinK}%</span>
            </div>
          ) : supply.minK !== undefined ? (
            <div className={styles.row}>
              <span className={styles.name}>Min Quality</span>
              <span className={styles.value}>{supply.minK}%</span>
            </div>
          ) : null}

          {/* Connections table */}
          {supply.connections.length > 0 ? (
            <table
              className={styles.supplyTable}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Delete' && canEdit && selectedIdx !== null) {
                  handleFire();
                }
              }}
            >
              <thead>
                <tr>
                  <th style={{ width: 24 }}></th>
                  <th>Facility</th>
                  <th style={{ width: 80 }}>Owner</th>
                  <th style={{ width: 60 }}>Price</th>
                  <th style={{ width: 60 }}>Overpaid</th>
                  <th style={{ width: 80 }}>Last</th>
                  <th style={{ width: 60 }}>Quality</th>
                  <th style={{ width: 60 }}>T.Cost</th>
                </tr>
              </thead>
              <tbody>
                {supply.connections.map((conn, j) => (
                  <tr
                    key={`${j}:${conn.x},${conn.y}`}
                    className={`${styles.supplyTableRow}${selectedIdx === j ? ` ${styles.supplyTableRowSelected}` : ''}`}
                    onClick={() => handleRowClick(j)}
                    onContextMenu={(e) => canEdit && handleRowContextMenu(e, j)}
                  >
                    <td>
                      {conn.connected && <span className={styles.supplyConnectedIcon}>&#10003;</span>}
                    </td>
                    <td>
                      {conn.facilityName || (
                        <span className={styles.unnamedConnection}>no data</span>
                      )}
                    </td>
                    <td>{conn.companyName}</td>
                    <td>${conn.price}</td>
                    <td>{conn.overprice}%</td>
                    <td>{conn.lastValue}</td>
                    <td>{conn.quality}</td>
                    <td>{conn.cost}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className={styles.noConnections}>
              {failed
                ? 'Could not read the suppliers \u2014 close and re-open to retry'
                : !loaded
                  // Opening the gate is what reads it; until that lands an empty
                  // list means "not read yet", not "none".
                  ? 'Loading suppliers\u2026'
                  : (supply.connectionCount ?? 0) > 0
                    // The server counted connections it could not describe:
                    // cnxCount comes off the gate, the rows come from a separate
                    // sub-object read that returned nothing. Claiming "no
                    // suppliers" here is the contradiction the user hit — say
                    // what is actually known.
                    ? `${supply.connectionCount} supplier${supply.connectionCount !== 1 ? 's' : ''} connected — details unavailable`
                    : 'No suppliers connected'}
            </div>
          )}

          {/* Overpayment popover */}
          {overpayTarget !== null && canEdit && supply.connections[overpayTarget] && (
            <OverpaymentPopover
              conn={supply.connections[overpayTarget]}
              connIndex={overpayTarget}
              supply={supply}
              buildingX={buildingX}
              buildingY={buildingY}
              onClose={() => setOverpayTarget(null)}
            />
          )}

          {/* Action buttons */}
          {canEdit && (
            <div className={styles.supplyActions}>
              <button className={styles.hireBtn} onClick={handleHire} disabled={!fluidId}>Hire</button>
              <button
                className={styles.modifyBtn}
                onClick={handleModify}
                disabled={selectedIdx === null}
              >
                Modify
              </button>
              <button
                className={styles.fireBtn}
                onClick={handleFire}
                disabled={selectedIdx === null}
              >
                Fire
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
});
