/**
 * ProductsGroup — Product output management panel.
 *
 * Extracted from PropertyGroup.tsx. Renders the "Products" special tab:
 * product cards with connection tables and hire/remove actions.
 */

import { useState } from 'react';
import type { BuildingProductData } from '@/shared/types';
import { formatCurrency } from '@/shared/building-details';
import { useClient } from '../../context';
import styles from './PropertyGroup.module.css';

// =============================================================================
// PRODUCTS PANEL (special === 'products')
// =============================================================================

export function ProductsPanel({
  products,
  canEdit,
  buildingX,
  buildingY,
}: {
  products: BuildingProductData[];
  canEdit: boolean;
  buildingX: number;
  buildingY: number;
}) {
  if (products.length === 0) {
    return <div className={styles.empty}>No product outputs</div>;
  }
  return (
    <div className={styles.supplyList}>
      {products.map((product, i) => (
        <ProductCard key={product.metaFluid || i} product={product} canEdit={canEdit} buildingX={buildingX} buildingY={buildingY} />
      ))}
    </div>
  );
}

function ProductCard({
  product,
  canEdit,
  buildingX,
  buildingY,
}: {
  product: BuildingProductData;
  canEdit: boolean;
  buildingX: number;
  buildingY: number;
}) {
  const client = useClient();
  const [expanded, setExpanded] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  const handleRowClick = (idx: number) => {
    setSelectedIdx(selectedIdx === idx ? null : idx);
  };

  const handleHire = () => {
    client.onSearchConnections(buildingX, buildingY, product.metaFluid, product.name || product.metaFluid, 'output');
  };

  const handleFire = () => {
    if (selectedIdx === null) return;
    const conn = product.connections[selectedIdx];
    if (!conn) return;
    client.onDisconnectConnection(buildingX, buildingY, product.metaFluid, 'output', conn.x, conn.y);
    setSelectedIdx(null);
  };

  return (
    <div className={styles.supplyCard}>
      <button className={styles.supplyHeader} onClick={() => setExpanded((v) => !v)}>
        <span className={styles.supplyName}>{product.name || product.metaFluid}</span>
        <span className={styles.supplyCount}>
          {product.connectionCount} buyer{product.connectionCount !== 1 ? 's' : ''}
        </span>
        <span className={styles.supplyChevron}>{expanded ? '\u25B2' : '\u25BC'}</span>
      </button>

      {expanded && (
        <div className={styles.supplyBody}>
          {product.lastFluid && (
            <div className={styles.row}>
              <span className={styles.name}>Last Produced</span>
              <span className={styles.value}>{product.lastFluid}</span>
            </div>
          )}
          {product.quality && (
            <div className={styles.row}>
              <span className={styles.name}>Quality</span>
              <span className={styles.value}>{product.quality}%</span>
            </div>
          )}
          {product.pricePc && (
            <div className={styles.row}>
              <span className={styles.name}>Sell Price</span>
              <span className={styles.value}>{product.pricePc}%</span>
            </div>
          )}
          {product.marketPrice && (
            <div className={styles.row}>
              <span className={styles.name}>Market Price</span>
              <span className={styles.value}>{formatCurrency(parseFloat(product.marketPrice))}</span>
            </div>
          )}

          {product.connections.length > 0 ? (
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
                  <th>Facility</th>
                  <th style={{ width: 80 }}>Owner</th>
                  <th style={{ width: 60 }}>Price</th>
                  <th style={{ width: 60 }}>Quality</th>
                </tr>
              </thead>
              <tbody>
                {product.connections.map((conn, j) => (
                  <tr
                    key={`${conn.x},${conn.y}`}
                    className={`${styles.supplyTableRow}${selectedIdx === j ? ` ${styles.supplyTableRowSelected}` : ''}`}
                    onClick={() => handleRowClick(j)}
                  >
                    <td>{conn.facilityName}</td>
                    <td>{conn.companyName}</td>
                    <td>{conn.price ? `${conn.price}%` : ''}</td>
                    <td>{conn.quality ? `${conn.quality}%` : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className={styles.noConnections}>No buyers connected</div>
          )}

          {canEdit && (
            <div className={styles.supplyActions}>
              <button className={styles.hireBtn} onClick={handleHire}>Hire</button>
              <button
                className={styles.fireBtn}
                onClick={handleFire}
                disabled={selectedIdx === null}
              >
                Remove
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
