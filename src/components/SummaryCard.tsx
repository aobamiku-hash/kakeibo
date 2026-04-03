import { motion } from 'framer-motion';
import type { Household } from '../types';
import type { MonthSummary } from '../utils/calculation';
import { formatYearMonth, formatCurrency } from '../utils/calculation';

interface Props {
  summary: MonthSummary;
  household: Household;
}

export default function SummaryCard({ summary, household }: Props) {
  const [m1, m2] = household.memberOrder;
  const name1 = household.memberNames[m1] ?? 'メンバー1';
  const name2 = household.memberNames[m2] ?? 'メンバー2';

  const direction = summary.settlement >= 0;
  const from = direction ? name2 : name1;
  const to = direction ? name1 : name2;
  const amount = Math.abs(summary.settlement);

  return (
    <motion.div
      className="summary-hero"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
    >
      <div className="month-label">{formatYearMonth(summary.yearMonth)}</div>
      <div className="total-amount">{formatCurrency(summary.totalAmount)}</div>

      <div className="member-split">
        <motion.div
          className="member-box"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2, duration: 0.4 }}
        >
          <div className="name">{name1}</div>
          <div className="amount">{formatCurrency(summary.member1Should)}</div>
        </motion.div>
        <motion.div
          className="member-box"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3, duration: 0.4 }}
        >
          <div className="name">{name2}</div>
          <div className="amount">{formatCurrency(summary.member2Should)}</div>
        </motion.div>
      </div>

      <motion.div
        className="settlement-row"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.4, duration: 0.3 }}
      >
        {amount === 0 ? (
          <span>精算なし ✨</span>
        ) : (
          <>
            <span>{from}</span>
            <span className="settlement-arrow">→</span>
            <span>{to}</span>
            <span style={{ marginLeft: 'auto', fontWeight: 700 }}>
              {formatCurrency(amount)}
            </span>
          </>
        )}
      </motion.div>
    </motion.div>
  );
}
