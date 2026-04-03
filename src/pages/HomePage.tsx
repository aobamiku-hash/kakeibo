import { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useExpenses } from '../hooks/useExpenses';
import { calculateMonthSummary, currentYearMonth, shiftMonth, formatYearMonth } from '../utils/calculation';
import SummaryCard from '../components/SummaryCard';
import ExpenseItem from '../components/ExpenseItem';
import PullToRefresh from '../components/PullToRefresh';
import type { Household, Expense } from '../types';

interface Props {
  household: Household;
}

export default function HomePage({ household }: Props) {
  const [yearMonth, setYearMonth] = useState(currentYearMonth());
  const { expenses, loading } = useExpenses(household, yearMonth);

  const summary = useMemo(() => {
    if (expenses.length === 0) return null;
    return calculateMonthSummary(expenses, household);
  }, [expenses, household]);

  const [editTarget, setEditTarget] = useState<Expense | null>(null);
  const handleRefresh = useCallback(() => {}, []);

  return (
    <PullToRefresh onRefresh={handleRefresh}>
    <div className="page">
      {/* ── 月ナビゲーション ── */}
      <div className="month-nav">
        <button onClick={() => setYearMonth((ym) => shiftMonth(ym, -1))}>
          ‹
        </button>
        <AnimatePresence mode="wait">
          <motion.span
            key={yearMonth}
            className="month-text"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.2 }}
          >
            {formatYearMonth(yearMonth)}
          </motion.span>
        </AnimatePresence>
        <button onClick={() => setYearMonth((ym) => shiftMonth(ym, 1))}>
          ›
        </button>
      </div>

      {loading ? (
        <div className="loading-screen" style={{ minHeight: 200 }}>
          <div className="spinner" />
        </div>
      ) : expenses.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📝</div>
          <div className="empty-text">
            まだ支出がありません
            <br />
            「＋ 追加」から最初の支出を登録しましょう
          </div>
        </div>
      ) : (
        <>
          {/* ── サマリーカード ── */}
          {summary && (
            <SummaryCard
              key={yearMonth}
              summary={{ ...summary, yearMonth }}
              household={household}
            />
          )}

          {/* ── 支出一覧 ── */}
          <div className="section-header">
            <h2>支出一覧</h2>
            <span className="see-all">{expenses.length}件</span>
          </div>

          <div className="card">
            <div className="expense-list">
              <AnimatePresence>
                {expenses.map((exp) => (
                  <ExpenseItem
                    key={exp.id}
                    expense={exp}
                    household={household}
                    onTap={() => setEditTarget(editTarget?.id === exp.id ? null : exp)}
                  />
                ))}
              </AnimatePresence>
            </div>
          </div>
        </>
      )}

      {/* ── 編集モーダル（簡易） ── */}
      <AnimatePresence>
        {editTarget && (
          <EditSheet
            expense={editTarget}
            household={household}
            yearMonth={yearMonth}
            onClose={() => setEditTarget(null)}
          />
        )}
      </AnimatePresence>
    </div>
    </PullToRefresh>
  );
}

/* ── 簡易編集シート ── */
function EditSheet({
  expense,
  household,
  yearMonth,
  onClose,
}: {
  expense: Expense;
  household: Household;
  yearMonth: string;
  onClose: () => void;
}) {
  const { deleteExpense } = useExpenses(household, yearMonth);

  const handleDelete = async () => {
    await deleteExpense(expense.id);
    onClose();
  };

  const cat = household.categories.find((c) => c.id === expense.categoryId);

  return (
    <motion.div
      style={{
        position: 'fixed',
        bottom: 80,
        left: 16,
        right: 16,
        zIndex: 200,
        maxWidth: 448,
        margin: '0 auto',
      }}
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 40 }}
      transition={{ type: 'spring', damping: 25 }}
    >
      <div className="card" style={{ boxShadow: 'var(--shadow-lg)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 18, fontWeight: 600 }}>
            {cat?.emoji} {cat?.name}
          </span>
          <button onClick={onClose} style={{ fontSize: 24, color: 'var(--color-text-secondary)' }}>
            ×
          </button>
        </div>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: 14, marginBottom: 16 }}>
          {expense.note || 'メモなし'}
        </p>
        <button className="btn btn-danger" onClick={handleDelete}>
          この支出を削除
        </button>
      </div>
    </motion.div>
  );
}
