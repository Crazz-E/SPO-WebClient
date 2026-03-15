/**
 * DataTable — Generic typed table with alternating row tints,
 * sortable columns, and right-aligned numbers.
 */

import { type ReactNode, useState, useCallback } from 'react';
import styles from './DataTable.module.css';

interface DataTableColumn<T> {
  key: string;
  label: string;
  width?: string;
  align?: 'left' | 'right';
  render?: (row: T) => ReactNode;
  sortable?: boolean;
}

interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  keyField: string;
  /** Alternating row tints. Default true. */
  striped?: boolean;
  /** Smaller padding. Default false. */
  compact?: boolean;
  onRowClick?: (row: T) => void;
  className?: string;
}

type SortDir = 'asc' | 'desc';

export function DataTable<T extends Record<string, unknown>>({
  columns,
  rows,
  keyField,
  striped = true,
  compact = false,
  onRowClick,
  className,
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const handleSort = useCallback((key: string) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }, [sortKey]);

  const sortedRows = sortKey
    ? [...rows].sort((a, b) => {
        const av = a[sortKey];
        const bv = b[sortKey];
        if (av == null || bv == null) return 0;
        const cmp = av < bv ? -1 : av > bv ? 1 : 0;
        return sortDir === 'asc' ? cmp : -cmp;
      })
    : rows;

  return (
    <div className={`${styles.wrapper} ${className ?? ''}`}>
      <table className={`${styles.table} ${compact ? styles.compact : ''}`}>
        <thead>
          <tr>
            {columns.map(col => (
              <th
                key={col.key}
                className={`${col.align === 'right' ? styles.right : ''} ${col.sortable ? styles.sortable : ''}`}
                style={col.width ? { width: col.width } : undefined}
                onClick={col.sortable ? () => handleSort(col.key) : undefined}
              >
                {col.label}
                {col.sortable && sortKey === col.key && (
                  <span className={styles.sortArrow}>
                    {sortDir === 'asc' ? ' \u25B4' : ' \u25BE'}
                  </span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row, i) => (
            <tr
              key={String(row[keyField] ?? i)}
              className={`${striped && i % 2 === 1 ? styles.striped : ''} ${onRowClick ? styles.clickable : ''}`}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
            >
              {columns.map(col => (
                <td
                  key={col.key}
                  className={col.align === 'right' ? styles.right : ''}
                >
                  {col.render ? col.render(row) : String(row[col.key] ?? '')}
                </td>
              ))}
            </tr>
          ))}
          {sortedRows.length === 0 && (
            <tr>
              <td colSpan={columns.length} className={styles.empty}>
                No data
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
