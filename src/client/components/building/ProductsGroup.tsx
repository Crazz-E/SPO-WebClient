/**
 * ProductsGroup — Product output management panel.
 *
 * Compact two-line product tiles with inline price slider (always visible).
 * Expanding reveals connections table + hire/remove actions.
 */

import { useState } from 'react';
import type { BuildingProductData } from '@/shared/types';
import { formatCurrency } from '@/shared/building-details';
import { useClient } from '../../context';
import { PriceSliderWithMarker } from './PropertyTables';
import styles from './PropertyGroup.module.css';

// =============================================================================
// PRODUCTS PANEL (special === 'products')
// =============================================================================

export function ProductsPanel({
  products,
  canEdit,
  buildingX,
  buildingY,
  onPropertyChange,
}: {
  products: BuildingProductData[];
  canEdit: boolean;
  buildingX: number;
  buildingY: number;
  onPropertyChange: (propertyName: string, value: number, params?: Record<string, string>) => void;
}) {
  if (products.length === 0) {
    return <div className={styles.empty}>No product outputs</div>;
  }
  return (
    <div className={styles.productList}>
      {products.map((product, i) => (
        <ProductCard
          key={product.metaFluid || i}
          product={product}
          canEdit={canEdit}
          buildingX={buildingX}
          buildingY={buildingY}
          onPropertyChange={onPropertyChange}
        />
      ))}
    </div>
  );
}

function getQualityVariant(quality: number): string {
  if (quality >= 80) return styles.badgeGood;
  if (quality >= 40) return styles.badgeWarn;
  return styles.badgeBad;
}

function ProductCard({
  product,
  canEdit,
  buildingX,
  buildingY,
  onPropertyChange,
}: {
  product: BuildingProductData;
  canEdit: boolean;
  buildingX: number;
  buildingY: number;
  onPropertyChange: (propertyName: string, value: number, params?: Record<string, string>) => void;
}) {
  const client = useClient();
  const [expanded, setExpanded] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  const quality = parseFloat(product.quality) || 0;
  const pricePc = parseFloat(product.pricePc) || 0;
  const avgPrice = parseFloat(product.avgPrice) || 0;
  const marketPrice = parseFloat(product.marketPrice) || 0;
  const dollarPrice = marketPrice > 0 ? (pricePc / 100) * marketPrice : 0;

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

  const handlePriceChange = (rdoName: string, value: number) => {
    onPropertyChange(rdoName, value, { fluidId: product.metaFluid });
  };

  return (
    <div className={styles.productCard}>
      {/* Line 1: Name + inline badges + buyer count + chevron */}
      <button
        className={styles.productHeader}
        onClick={() => setExpanded((v) => !v)}
        title={product.lastFluid ? `Last produced: ${product.lastFluid}` : undefined}
      >
        <span className={styles.productName}>{product.name || product.metaFluid}</span>
        {quality > 0 && (
          <span className={`${styles.inlineBadge} ${getQualityVariant(quality)}`}>
            Q:{quality}%
          </span>
        )}
        {!canEdit && pricePc > 0 && (
          <span className={styles.inlineBadge}>P:{pricePc}%</span>
        )}
        <span className={styles.productBuyerCount}>
          {product.connectionCount}{product.connectionCount !== 1 ? '>' : '>'}
        </span>
        <span className={styles.productChevron}>{expanded ? '\u25B2' : '\u25BC'}</span>
      </button>

      {/* Line 2: Price slider (always visible for owners) or read-only price */}
      {canEdit ? (
        <div className={styles.productPriceRow}>
          <PriceSliderWithMarker
            value={pricePc}
            avgPrice={avgPrice}
            max={300}
            step={5}
            canEdit={canEdit}
            rdoName="PricePc"
            onPropertyChange={handlePriceChange}
          />
          {dollarPrice > 0 && (
            <span className={styles.productDollarPrice}>{formatCurrency(dollarPrice)}</span>
          )}
        </div>
      ) : (
        pricePc > 0 && dollarPrice > 0 && (
          <div className={styles.productPriceReadonly}>
            {formatCurrency(dollarPrice)} ({pricePc}%)
          </div>
        )
      )}

      {/* Expanded: connections table + actions */}
      {expanded && (
        <div className={styles.productBody}>
          {product.connections.length > 0 ? (
            <table
              className={styles.productTable}
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
                  <th style={{ width: 50 }}>Price</th>
                  <th style={{ width: 50 }}>Quality</th>
                </tr>
              </thead>
              <tbody>
                {product.connections.map((conn, j) => (
                  <tr
                    key={`${conn.x},${conn.y}`}
                    className={`${styles.productTableRow}${selectedIdx === j ? ` ${styles.productTableRowSelected}` : ''}`}
                    onClick={() => handleRowClick(j)}
                    title={conn.companyName || undefined}
                  >
                    <td className={styles.productFacilityCell}>
                      <span className={styles.productFacilityName}>{conn.facilityName}</span>
                      {conn.companyName && (
                        <span className={styles.productOwnerDot}> · {conn.companyName}</span>
                      )}
                    </td>
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
            <div className={styles.productActions}>
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
