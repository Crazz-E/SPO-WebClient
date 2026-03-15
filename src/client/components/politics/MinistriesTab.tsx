/**
 * MinistriesTab — Ministry table with budget editing + Elect/Depose (president-only).
 */

import { useState, useCallback } from 'react';
import { Edit3 } from 'lucide-react';
import type { BuildingPropertyValue } from '@/shared/types';
import { useClient } from '../../context';
import { useGameStore } from '../../store/game-store';
import { SaveIndicator } from '../building/SaveIndicator';
import { buildValueMap, getNum, formatCompact, isPresidentRole } from './capitol-utils';
import styles from './PoliticsPanel.module.css';

interface MinistriesTabProps {
  properties: BuildingPropertyValue[];
  buildingX: number;
  buildingY: number;
}

export function MinistriesTab({ properties, buildingX, buildingY }: MinistriesTabProps) {
  const client = useClient();
  const ownerRole = useGameStore((s) => s.ownerRole);
  const isPresident = isPresidentRole(ownerRole);

  const valueMap = buildValueMap(properties);
  const ruler = valueMap.get('ActualRuler') ?? '';
  const count = getNum(valueMap, 'MinisterCount');

  const rows = Array.from({ length: count }, (_, i) => ({
    index: i,
    ministryId: valueMap.get(`MinistryId${i}`) ?? String(i),
    ministry: valueMap.get(`Ministry${i}.0`) ?? '',
    minister: valueMap.get(`Minister${i}`) ?? '',
    rating: getNum(valueMap, `MinisterRating${i}`),
    budget: getNum(valueMap, `MinisterBudget${i}`),
  }));

  const handleElect = useCallback(
    (row: typeof rows[0]) => {
      client.onBuildingAction('electMinister', {
        MinistryId: row.ministryId,
        Ministry: row.ministry,
        Minister: row.minister,
        _index: String(row.index),
      });
    },
    [client],
  );

  const handleDepose = useCallback(
    (row: typeof rows[0]) => {
      client.onBuildingAction('deposeMinister', {
        MinistryId: row.ministryId,
        Ministry: row.ministry,
        Minister: row.minister,
        _index: String(row.index),
      });
    },
    [client],
  );

  if (rows.length === 0) {
    return <div className={styles.empty}>No ministry data available</div>;
  }

  return (
    <div>
      <table className={styles.dataTable}>
        <thead>
          <tr>
            <th>Ministry</th>
            <th>Minister</th>
            <th>Rating</th>
            <th>Budget</th>
            {isPresident && <th />}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.index}>
              <td>{row.ministry}</td>
              <td>{row.minister || '—'}</td>
              <td>{row.rating}%</td>
              <td>
                <BudgetInput
                  value={row.budget}
                  buildingX={buildingX}
                  buildingY={buildingY}
                  index={row.index}
                  editable={isPresident}
                />
              </td>
              {isPresident && (
                <td>
                  {row.minister ? (
                    <button
                      className={styles.actionBtnDanger}
                      onClick={() => handleDepose(row)}
                    >
                      Depose
                    </button>
                  ) : (
                    <button
                      className={styles.actionBtn}
                      onClick={() => handleElect(row)}
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

function BudgetInput({
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
  const [value, setValue] = useState(String(initialValue));
  const [editing, setEditing] = useState(false);
  const pendingKey = `RDOSetMinistryBudget:{"index":"${index}"}`;

  const commit = useCallback(() => {
    setEditing(false);
    const numValue = parseInt(value, 10);
    if (!isNaN(numValue) && numValue !== initialValue) {
      client.onSetBuildingProperty(buildingX, buildingY, 'RDOSetMinistryBudget', String(numValue), { index: String(index) });
    }
  }, [value, initialValue, client, buildingX, buildingY, index]);

  if (!editable) {
    return <span>{formatCompact(initialValue)}</span>;
  }

  if (!editing) {
    return (
      <span className={styles.budgetCell}>
        <span
          className={styles.budgetValue}
          onClick={() => setEditing(true)}
          title="Click to edit budget"
        >
          {formatCompact(initialValue)}
        </span>
        <Edit3 size={10} className={styles.budgetEditIcon} />
        <SaveIndicator propertyKey={pendingKey} />
      </span>
    );
  }

  return (
    <span className={styles.budgetCell}>
      <input
        className={styles.budgetInput}
        type="number"
        value={value}
        autoFocus
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') { setValue(String(initialValue)); setEditing(false); }
        }}
      />
      <SaveIndicator propertyKey={pendingKey} />
    </span>
  );
}
