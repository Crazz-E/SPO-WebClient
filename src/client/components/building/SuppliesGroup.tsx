/**
 * SuppliesGroup — Supply input management panel.
 *
 * Extracted from PropertyGroup.tsx. Renders the "Supplies" special tab:
 * supply cards with connection tables, max price/min quality sliders,
 * hire/modify/fire actions, and overpayment popover.
 */

import { useState, useCallback, useRef } from 'react';
import type { BuildingSupplyData, BuildingConnectionData } from '@/shared/types';
import { formatCurrency, formatNumber } from '@/shared/building-details';
import { useClient } from '../../context';
import styles from './PropertyGroup.module.css';

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
      {supplies.map((supply, i) => (
        <SupplyCard key={supply.metaFluid || i} supply={supply} canEdit={canEdit} buildingX={buildingX} buildingY={buildingY} />
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

  const handleOk = () => {
    client.onSetBuildingProperty(buildingX, buildingY, 'RDOSetInputOverPrice', String(overprice), {
      fluidId: supply.metaFluid,
      index: String(connIndex),
    });
    client.onRefreshBuilding(buildingX, buildingY);
    onClose();
  };

  const handleDelete = () => {
    client.onDisconnectConnection(buildingX, buildingY, supply.metaFluid, 'input', conn.x, conn.y);
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

function SupplyCard({
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
  const [expanded, setExpanded] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [overpayTarget, setOverpayTarget] = useState<number | null>(null);
  const maxPriceTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const minKTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const currentMaxPrice = parseInt(supply.maxPrice || '200', 10);
  const currentMinK = parseInt(supply.minK || '0', 10);
  const [localMaxPrice, setLocalMaxPrice] = useState(isNaN(currentMaxPrice) ? 200 : currentMaxPrice);
  const [localMinK, setLocalMinK] = useState(isNaN(currentMinK) ? 0 : currentMinK);

  const handleMaxPriceChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    setLocalMaxPrice(val);
    if (maxPriceTimeoutRef.current) clearTimeout(maxPriceTimeoutRef.current);
    maxPriceTimeoutRef.current = setTimeout(() => {
      client.onSetBuildingProperty(buildingX, buildingY, 'RDOSetInputMaxPrice', String(val), {
        fluidId: supply.metaFluid,
      });
    }, 300);
  }, [client, buildingX, buildingY, supply.metaFluid]);

  const handleMinKChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    setLocalMinK(val);
    if (minKTimeoutRef.current) clearTimeout(minKTimeoutRef.current);
    minKTimeoutRef.current = setTimeout(() => {
      client.onSetBuildingProperty(buildingX, buildingY, 'RDOSetInputMinK', String(val), {
        fluidId: supply.metaFluid,
      });
    }, 300);
  }, [client, buildingX, buildingY, supply.metaFluid]);

  const handleHire = () => {
    client.onSearchConnections(buildingX, buildingY, supply.metaFluid, supply.name, 'input');
  };

  const handleModify = () => {
    if (selectedIdx !== null) setOverpayTarget(selectedIdx);
  };

  const handleFire = () => {
    if (selectedIdx === null) return;
    const conn = supply.connections[selectedIdx];
    if (!conn) return;
    client.onDisconnectConnection(buildingX, buildingY, supply.metaFluid, 'input', conn.x, conn.y);
    setSelectedIdx(null);
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
      <button className={styles.supplyHeader} onClick={() => setExpanded((v) => !v)}>
        <span className={styles.supplyName}>{supply.name || supply.metaFluid}</span>
        <span className={styles.supplyCount}>
          {supply.connectionCount} supplier{supply.connectionCount !== 1 ? 's' : ''}
        </span>
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
                    key={`${conn.x},${conn.y}`}
                    className={`${styles.supplyTableRow}${selectedIdx === j ? ` ${styles.supplyTableRowSelected}` : ''}`}
                    onClick={() => handleRowClick(j)}
                    onContextMenu={(e) => canEdit && handleRowContextMenu(e, j)}
                  >
                    <td>
                      {conn.connected && <span className={styles.supplyConnectedIcon}>&#10003;</span>}
                    </td>
                    <td>{conn.facilityName}</td>
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
            <div className={styles.noConnections}>No suppliers connected</div>
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
              <button className={styles.hireBtn} onClick={handleHire}>Hire</button>
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
}
