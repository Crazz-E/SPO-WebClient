/**
 * TownsTab — Capitol towns table with tax sliders and Elect Mayor (president-only).
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import type { BuildingPropertyValue } from '@/shared/types';
import { useClient } from '../../context';
import { SaveIndicator } from '../building/SaveIndicator';
import { buildValueMap, getNum, formatCompact } from './capitol-utils';
import styles from './PoliticsPanel.module.css';

interface TownsTabProps {
  properties: BuildingPropertyValue[];
  buildingX: number;
  buildingY: number;
  /** Does this player govern this Capitol? See `grantAccess`. */
  canGovern: boolean;
}

export function TownsTab({ properties, buildingX, buildingY, canGovern }: TownsTabProps) {
  const client = useClient();
  const isPresident = canGovern;

  const valueMap = buildValueMap(properties);
  const townCount = getNum(valueMap, 'TownCount');

  const rows = Array.from({ length: townCount }, (_, i) => ({
    index: i,
    name: valueMap.get(`Town${i}`) ?? '',
    population: getNum(valueMap, `TownPopulation${i}`),
    qol: getNum(valueMap, `TownQOL${i}`),
    rating: getNum(valueMap, `TownRating${i}`),
    wealth: getNum(valueMap, `TownWealth${i}`),
    tax: getNum(valueMap, `TownTax${i}`),
    qos: getNum(valueMap, `TownQOS${i}`),
    hasMayor: valueMap.get(`HasMayor${i}`) === '1',
  }));

  const handleElectMayor = useCallback(
    (row: typeof rows[0]) => {
      client.onBuildingAction('electMayor', {
        Town: row.name,
        _index: String(row.index),
      });
    },
    [client],
  );

  if (rows.length === 0) {
    return <div className={styles.empty}>No town data available</div>;
  }

  return (
    <div className={styles.tableScroll}>
      <table className={styles.dataTable}>
        <thead>
          <tr>
            <th>Town</th>
            <th>Pop.</th>
            <th>QOL</th>
            <th>Rating</th>
            <th>Commerce</th>
            <th>Wealth</th>
            <th>Tax</th>
            <th>Mayor</th>
            {isPresident && <th />}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.index}>
              <td>{row.name}</td>
              <td>{formatCompact(row.population)}</td>
              <td>{row.qol}%</td>
              <td>{row.rating}%</td>
              <td>{row.qos}%</td>
              <td>{row.wealth}%</td>
              <td>
                <TaxSlider
                  value={row.tax}
                  townName={row.name}
                  buildingX={buildingX}
                  buildingY={buildingY}
                  index={row.index}
                  editable={isPresident}
                />
              </td>
              <td>{row.hasMayor ? 'Yes' : 'No'}</td>
              {isPresident && (
                <td>
                  {/* The seat must be vacant. `RDOSitMayor` applies only when
                      `Mayor.SuperRole = nil` (WorldPolitics.pas:1801) and there
                      is no unseat call at all, so on an occupied seat the button
                      would send a frame the server discards without a word.
                      Voyager hides the box and the button too
                      (CapitolTownsSheet.pas:326-329), so this is parity,
                      recorded in doc/civic-roles-reference.md §7. */}
                  {row.hasMayor ? (
                    <span className={styles.actionUnavailable} title="A mayor only leaves by losing an election">
                      —
                    </span>
                  ) : (
                    <button
                      className={styles.actionBtn}
                      onClick={() => handleElectMayor(row)}
                    >
                      Elect
                    </button>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TaxSlider({
  value: initialValue,
  townName,
  buildingX,
  buildingY,
  index,
  editable,
}: {
  value: number;
  /** Only for the accessible name — every row's slider looks alike otherwise. */
  townName: string;
  buildingX: number;
  buildingY: number;
  index: number;
  editable: boolean;
}) {
  const client = useClient();
  const [value, setValue] = useState(initialValue);
  /**
   * The last figure we put on the wire. `next === initialValue` alone does not
   * dedup a gesture: three events end one (pointer up, key up, and the blur
   * that follows either), and all three carry the SAME new value, which
   * differs from `initialValue` every time. Cleared by the resync below, so a
   * figure can be set again once the town has moved off it.
   */
  const lastSent = useRef<number | null>(null);
  const pendingKey = `RDOSetTownTaxes:{"index":"${index}"}`;

  // See MinWageSlider: local state must yield to a fresh server figure.
  useEffect(() => {
    setValue(initialValue);
    lastSent.current = null;
  }, [initialValue]);

  const commitValue = useCallback(
    (next: number) => {
      if (next === initialValue || next === lastSent.current) return;
      lastSent.current = next;
      client.onSetBuildingProperty(buildingX, buildingY, 'RDOSetTownTaxes', String(next), { index: String(index) });
    },
    [client, buildingX, buildingY, index, initialValue],
  );

  if (!editable) {
    return <span>{initialValue}%</span>;
  }

  return (
    <div className={styles.sliderCell}>
      <input
        type="range"
        className={styles.slider}
        aria-label={`Tax rate for ${townName}`}
        min={0}
        max={100}
        step={1}
        value={value}
        onChange={(e) => setValue(parseInt(e.target.value, 10))}
        // One frame per gesture, keyboard and touch-cancel included — see MinWageSlider.
        onPointerUp={(e) => commitValue(parseInt(e.currentTarget.value, 10))}
        onKeyUp={(e) => commitValue(parseInt(e.currentTarget.value, 10))}
        onBlur={(e) => commitValue(parseInt(e.currentTarget.value, 10))}
      />
      <span className={styles.sliderValue}>{value}%</span>
      <SaveIndicator propertyKey={pendingKey} />
    </div>
  );
}
