/**
 * FinancialSummary — Four financial metric cards with gold highlight.
 */

import { formatMoney } from '../../format-utils';
import { StatCard } from '../common';
import styles from './FinancialSummary.module.css';

interface FinancialSummaryProps {
  revenue: string;
  expenses: string;
  profit: string;
  facilityCount: number;
}

export function FinancialSummary({ revenue, expenses, profit, facilityCount }: FinancialSummaryProps) {
  const profitValue = parseFloat(profit);
  const isLoss = profitValue < 0;

  return (
    <div className={styles.grid}>
      <StatCard label="Revenue" value={formatMoney(revenue)} variant="profit" className={styles.card} />
      <StatCard label="Expenses" value={formatMoney(expenses)} variant="loss" className={styles.card} />
      <StatCard label="Net Profit" value={formatMoney(profit)} variant={isLoss ? 'loss' : 'profit'} className={styles.card} />
      <StatCard label="Facilities" value={facilityCount} variant="gold" className={styles.card} />
    </div>
  );
}
