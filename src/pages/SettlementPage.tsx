import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import { useExpenses } from '../hooks/useExpenses';
import {
  calculateMonthSummary,
  currentYearMonth,
  shiftMonth,
  formatYearMonth,
  formatCurrency,
} from '../utils/calculation';
import type { Household } from '../types';

interface Props {
  household: Household;
}

export default function SettlementPage({ household }: Props) {
  const { user } = useAuth();
  const [yearMonth, setYearMonth] = useState(currentYearMonth());
  const { expenses, settlement, loading, confirmSettlement } = useExpenses(
    household,
    yearMonth,
  );

  const summary = useMemo(() => {
    if (expenses.length === 0) return null;
    return calculateMonthSummary(expenses, household);
  }, [expenses, household]);

  const [m1, m2] = household.memberOrder;
  const name1 = household.memberNames[m1] ?? 'メンバー1';
  const name2 = household.memberNames[m2] ?? 'メンバー2';

  const isConfirmed = settlement?.confirmed ?? false;
  const myConfirmed = settlement?.confirmedBy?.includes(user?.uid ?? '') ?? false;

  return (
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
            {formatYearMonth(yearMonth)}の精算
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
      ) : !summary ? (
        <div className="empty-state">
          <div className="empty-icon">📊</div>
          <div className="empty-text">この月の支出はありません</div>
        </div>
      ) : (
        <>
          {/* ── 精算ステータス ── */}
          <motion.div
            className="card settlement-status"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="status-icon">
              {isConfirmed ? '✅' : myConfirmed ? '⏳' : '📊'}
            </div>

            {(() => {
              const direction = summary.settlement >= 0;
              const from = direction ? name2 : name1;
              const to = direction ? name1 : name2;
              const amt = Math.abs(summary.settlement);

              if (amt === 0) {
                return (
                  <>
                    <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>
                      精算なし
                    </div>
                    <div className="status-text">今月の支出は均等に分担されています</div>
                  </>
                );
              }

              return (
                <>
                  <div style={{ fontSize: 14, color: 'var(--color-text-secondary)', marginBottom: 4 }}>
                    {from} → {to}
                  </div>
                  <div style={{ fontSize: 36, fontWeight: 700, marginBottom: 8 }}>
                    {formatCurrency(amt)}
                  </div>
                  <div className="status-text">
                    {isConfirmed
                      ? '確定済み'
                      : myConfirmed
                        ? 'パートナーの確認待ち'
                        : '確認して確定してください'}
                  </div>
                  {isConfirmed && (
                    <span className="badge badge-success" style={{ marginTop: 8 }}>
                      ✓ 確定済み
                    </span>
                  )}
                  {!isConfirmed && myConfirmed && (
                    <span className="badge badge-warning" style={{ marginTop: 8 }}>
                      ⏳ 待機中
                    </span>
                  )}
                </>
              );
            })()}
          </motion.div>

          {/* ── 内訳 ── */}
          <div className="section-header">
            <h2>負担内訳</h2>
          </div>
          <div className="card">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{name1}の負担</div>
                <div style={{ fontSize: 20, fontWeight: 700 }}>{formatCurrency(summary.member1Should)}</div>
                <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
                  支払済み {formatCurrency(summary.member1Paid)}
                </div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{name2}の負担</div>
                <div style={{ fontSize: 20, fontWeight: 700 }}>{formatCurrency(summary.member2Should)}</div>
                <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
                  支払済み {formatCurrency(summary.member2Paid)}
                </div>
              </div>
            </div>
          </div>

          {/* ── カテゴリ別 ── */}
          <div className="section-header">
            <h2>カテゴリ別</h2>
          </div>
          <div className="card category-breakdown">
            {summary.byCategory.map(({ category, total }) => (
              <div key={category.id} className="breakdown-row">
                <div className="breakdown-left">
                  <span className="breakdown-emoji">{category.emoji}</span>
                  <div>
                    <div className="breakdown-name">{category.name}</div>
                    <div className="breakdown-split">
                      {category.defaultSplit[0]}:{category.defaultSplit[1]}
                    </div>
                  </div>
                </div>
                <div className="breakdown-amount">{formatCurrency(total)}</div>
              </div>
            ))}
          </div>

          {/* ── 確定ボタン ── */}
          {!isConfirmed && (
            <motion.button
              className="btn btn-primary"
              style={{ marginTop: 24 }}
              onClick={() => {
                const allCatsEntered = household.categories.every((cat) => {
                  if (cat.id === 'cat_2') return true;
                  return expenses.some((e) => e.categoryId === cat.id);
                });
                confirmSettlement(allCatsEntered);
              }}
              disabled={myConfirmed}
              whileTap={{ scale: 0.97 }}
            >
              {myConfirmed ? 'パートナーの確認待ち…' : '今月を確定する'}
            </motion.button>
          )}
        </>
      )}
    </div>
  );
}
