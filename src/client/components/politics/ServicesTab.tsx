/**
 * ServicesTab — the town's service provision (`townServices`).
 *
 * Voyager gives this its own sheet, captioned `COMMERCE` on the Town Hall and
 * `SERVICES` on the Capitol, both driven by the same handler
 * (`TownProdxSheet.pas`, registered as `townServices`). It is read-only on both.
 *
 * Like `townTaxes`, the gateway has always shipped this group and no tab
 * rendered it.
 */

import { useMemo } from 'react';
import type { BuildingPropertyValue } from '@/shared/types';
import { buildValueMap, getNum, formatCompact } from './capitol-utils';
import styles from './PoliticsPanel.module.css';

interface ServiceRow {
  index: number;
  name: string;
  demand: number;
  offer: number;
  capacity: number;
  /** Cached as a 0..1 float, unlike every other percentage in this panel. */
  ratio: number;
  marketPrice: string;
  price: number;
  quality: number;
}

interface ServicesTabProps {
  properties: BuildingPropertyValue[];
}

export function ServicesTab({ properties }: ServicesTabProps) {
  const { rows, generalIndex } = useMemo(() => {
    const valueMap = buildValueMap(properties);
    const count = getNum(valueMap, 'srvCount');
    return {
      generalIndex: getNum(valueMap, 'GQOS'),
      rows: Array.from({ length: count }, (_, i): ServiceRow => ({
        index: i,
        // MLS key: the language ordinal is a suffix on the property name.
        name: valueMap.get(`svrName${i}.0`) ?? '',
        demand: getNum(valueMap, `svrDemand${i}`),
        offer: getNum(valueMap, `svrOffer${i}`),
        capacity: getNum(valueMap, `svrCapacity${i}`),
        ratio: parseFloat(valueMap.get(`svrRatio${i}`) ?? '0') || 0,
        marketPrice: valueMap.get(`svrMarketPrice${i}`) ?? '',
        price: getNum(valueMap, `svrPrice${i}`),
        quality: getNum(valueMap, `svrQuality${i}`),
      })),
    };
  }, [properties]);

  if (rows.length === 0) {
    return <div className={styles.empty}>No service data available.</div>;
  }

  return (
    <>
      <div className={styles.statRow}>
        <span className={styles.statLabel}>General Index</span>
        <span className={styles.statValue}>{generalIndex}%</span>
      </div>
      <div className={styles.tableScroll}>
        <table className={styles.dataTable}>
          <thead>
            <tr>
              <th>Name</th>
              <th>Demand</th>
              <th>Offer</th>
              <th>Capacity</th>
              <th>Ratio</th>
              <th>IFEL Price</th>
              <th>Avg. Price</th>
              <th>Quality</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.index}>
                <td>{row.name}</td>
                <td>{formatCompact(row.demand)}</td>
                <td>{formatCompact(row.offer)}</td>
                <td>{formatCompact(row.capacity)}</td>
                {/* svrRatio is the one 0..1 float in this group. */}
                <td>{Math.round(row.ratio * 100)}%</td>
                <td>{row.marketPrice}</td>
                <td>{row.price}%</td>
                <td>{row.quality}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
