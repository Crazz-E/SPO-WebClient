/**
 * FinancialSummary — Four financial metric cards with gold highlight.
 */

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
      <div className={styles.card}>
        <span className={styles.value}>${revenue}</span>
        <span className={styles.label}>Revenue</span>
      </div>
      <div className={styles.card}>
        <span className={styles.value}>${expenses}</span>
        <span className={styles.label}>Expenses</span>
      </div>
      <div className={`${styles.card} ${isLoss ? styles.loss : styles.profit}`}>
        <span className={styles.value}>${profit}</span>
        <span className={styles.label}>Net Profit</span>
      </div>
      <div className={styles.card}>
        <span className={styles.value}>{facilityCount}</span>
        <span className={styles.label}>Facilities</span>
      </div>
    </div>
  );
}
