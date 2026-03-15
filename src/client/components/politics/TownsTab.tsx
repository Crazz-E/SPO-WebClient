/**
 * TownsTab — Capitol towns table with tax sliders and Elect Mayor (president-only).
 */

import { useState, useCallback } from 'react';
import type { BuildingPropertyValue } from '@/shared/types';
import { useClient } from '../../context';
import { useGameStore } from '../../store/game-store';
import { SaveIndicator } from '../building/SaveIndicator';
import { buildValueMap, getNum, formatCompact, isPresidentRole } from './capitol-utils';
import styles from './PoliticsPanel.module.css';

interface TownsTabProps {
  properties: BuildingPropertyValue[];
  buildingX: number;
  buildingY: number;
}

export function TownsTab({ properties, buildingX, buildingY }: TownsTabProps) {
  const client = useClient();
  const ownerRole = useGameStore((s) => s.ownerRole);
  const isPresident = isPresidentRole(ownerRole);

  const valueMap = buildValueMap(properties);
  const ruler = valueMap.get('ActualRuler') ?? '';
  const townCount = getNum(valueMap, 'TownCount');

  const rows = Array.from({ length: townCount }, (_, i) => ({
    index: i,
    name: valueMap.get(`Town${i}`) ?? '',
    population: getNum(valueMap, `TownPopulation${i}`),
    qol: getNum(valueMap, `TownQOL${i}`),
    commerce: getNum(valueMap, `TownRating${i}`),
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
            <th>Commerce</th>
            <th>Tax</th>
            <th>QoS</th>
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
              <td>{row.commerce}%</td>
              <td>
                <TaxSlider
                  value={row.tax}
                  buildingX={buildingX}
                  buildingY={buildingY}
                  index={row.index}
                  editable={isPresident}
                />
              </td>
              <td>{row.qos}%</td>
              <td>{row.hasMayor ? 'Yes' : 'No'}</td>
              {isPresident && (
                <td>
                  <button
                    className={styles.actionBtn}
                    onClick={() => handleElectMayor(row)}
                  >
                    Elect
                  </button>
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
  buildingX,
  buildingY,
  index,
  editable,
}: {
  value: number;
  buildingX: number;
  buildingY: number;
  index: number;
  editable: boolean;
}) {
  const client = useClient();
  const [value, setValue] = useState(initialValue);
  const pendingKey = `RDOSetTownTaxes:{"index":"${index}"}`;

  const handleChange = useCallback(
    (newValue: number) => {
      setValue(newValue);
      client.onSetBuildingProperty(buildingX, buildingY, 'RDOSetTownTaxes', String(newValue), { index: String(index) });
    },
    [client, buildingX, buildingY, index],
  );

  if (!editable) {
    return <span>{initialValue}%</span>;
  }

  return (
    <div className={styles.sliderCell}>
      <input
        type="range"
        className={styles.slider}
        min={0}
        max={100}
        step={1}
        value={value}
        onChange={(e) => handleChange(parseInt(e.target.value, 10))}
      />
      <span className={styles.sliderValue}>{value}%</span>
      <SaveIndicator propertyKey={pendingKey} />
    </div>
  );
}
