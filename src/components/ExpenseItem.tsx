import { motion } from 'framer-motion';
import type { Expense, Household } from '../types';
import { formatCurrency } from '../utils/calculation';

interface Props {
  expense: Expense;
  household: Household;
  onTap?: () => void;
}

export default function ExpenseItem({ expense, household, onTap }: Props) {
  const cat = household.categories.find((c) => c.id === expense.categoryId);
  const payer = household.memberNames[expense.paidBy] ?? '—';
  const splitLabel = expense.split[0] === 0 && expense.split[1] === 100
    ? '全額'
    : expense.split[0] === 100 && expense.split[1] === 0
      ? '全額'
      : `${expense.split[0]}:${expense.split[1]}`;

  return (
    <motion.div
      className="expense-item"
      onClick={onTap}
      whileTap={{ scale: 0.98 }}
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="expense-emoji">{cat?.emoji ?? '📝'}</div>
      <div className="expense-info">
        <div className="category-name">{cat?.name ?? expense.categoryId}</div>
        <div className="expense-meta">
          {splitLabel} ・ {payer}
          {expense.note ? ` ・ ${expense.note}` : ''}
        </div>
      </div>
      <div className="expense-amount">{formatCurrency(expense.amount)}</div>
    </motion.div>
  );
}
