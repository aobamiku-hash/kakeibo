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
import { doc, updateDoc, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import type { Household } from '../types';

interface Props {
  household: Household;
}

export default function SettlementPage({ household }: Props) {
  const { user } = useAuth();
  const [yearMonth, setYearMonth] = useState(currentYearMonth());
  const { expenses, settlement, loading, confirmSettlement } = useExpenses(household, yearMonth);

  const summary = useMemo(() => {
    if (expenses.length === 0) return null;
    return calculateMonthSummary(expenses, household);
  }, [expenses, household]);

  const [m1, m2] = household.memberOrder;
  const name1 = household.memberNames[m1] ?? 'メンバー1';
  const name2 = household.memberNames[m2] ?? 'メンバー2';

  const isConfirmed = settlement?.confirmed ?? false;
  const isPaid = !!settlement?.paidAt;
  const scheduledPayDate = settlement?.scheduledPayDate ?? '';

  // 振込予定日の入力用 state（デフォルト: 今日）
  const todayStr = new Date().toISOString().slice(0, 10);
  const [payDate, setPayDate] = useState(todayStr);

  // 確定ボタンを押す → confirmed: true
  const handleConfirm = async () => {
    if (!user || !household) return;
    const allCatsEntered = household.categories.every((cat) => {
      if (cat.id === 'cat_2') return true;
      return expenses.some((e) => e.categoryId === cat.id);
    });
    await confirmSettlement(allCatsEntered);
  };

  // 振込報告ボタンを押す（振込予定日を保存）
  const handlePayReport = async () => {
    if (!user || !household || !payDate) return;
    const ref = doc(db, 'households', household.id, 'settlements', yearMonth);
    await updateDoc(ref, {
      paidAt: Timestamp.now(),
      paidBy: user.uid,
      scheduledPayDate: payDate,
    });
  };

  return (
    <div className="page">
      {/* ── 月ナビ ── */}
      <div className="month-nav">
        <button onClick={() => setYearMonth((ym) => shiftMonth(ym, -1))}>‹</button>
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
        <button onClick={() => setYearMonth((ym) => shiftMonth(ym, 1))}>›</button>
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
          {/* ── 精算ステータスカード ── */}
          <motion.div
            className={`card settlement-card ${isPaid ? 'paid' : isConfirmed ? 'confirmed' : ''}`}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            {/* ステップインジケーター */}
            <div className="settlement-steps">
              <div className={`step ${isConfirmed || isPaid ? 'done' : 'current'}`}>
                <div className="step-dot">1</div>
                <div className="step-label">確定</div>
              </div>
              <div className="step-line" />
              <div className={`step ${isPaid ? 'done' : isConfirmed ? 'current' : ''}`}>
                <div className="step-dot">2</div>
                <div className="step-label">振込</div>
              </div>
              <div className="step-line" />
              <div className={`step ${isPaid ? 'done' : ''}`}>
                <div className="step-dot">3</div>
                <div className="step-label">完了</div>
              </div>
            </div>

            {/* 精算金額 */}
            {(() => {
              const amt = Math.abs(summary.settlement);
              if (amt === 0) {
                return (
                  <div className="settlement-amount-section">
                    <div className="settlement-zero">精算なし</div>
                    <div className="settlement-sub">支出は均等に分担されています</div>
                  </div>
                );
              }
              const from = summary.settlement > 0 ? name2 : name1;
              const to = summary.settlement > 0 ? name1 : name2;
              return (
                <div className="settlement-amount-section">
                  <div className="settlement-direction">{from} → {to}</div>
                  <div className="settlement-amount">{formatCurrency(amt)}</div>
                </div>
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

          {/* ── アクションボタン ── */}
          {isPaid ? (
            <div className="card" style={{ background: '#34C75915', textAlign: 'center', padding: 24, marginTop: 24 }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
              <div style={{ fontWeight: 700, color: 'var(--color-success)' }}>精算完了</div>
              {scheduledPayDate && (
                <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 8 }}>
                  📅 振込日: {new Date(scheduledPayDate + 'T00:00:00').toLocaleDateString('ja-JP', { month: 'long', day: 'numeric' })}
                </div>
              )}
            </div>
          ) : isConfirmed ? (
            <div style={{ marginTop: 24 }}>
              <div className="card" style={{ background: '#FF950015', textAlign: 'center', padding: 16, marginBottom: 12 }}>
                <span style={{ color: 'var(--color-warning)', fontWeight: 600 }}>
                  確定済み — 振込待ち
                </span>
              </div>
              <div className="card" style={{ padding: 16, marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 8 }}>
                  📅 振込日を選択
                </label>
                <input
                  type="date"
                  value={payDate}
                  min={todayStr}
                  onChange={(e) => setPayDate(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 10,
                    border: '1px solid var(--color-border)',
                    fontSize: 16,
                    background: 'var(--color-bg)',
                    color: 'var(--color-text)',
                  }}
                />
              </div>
              <motion.button
                className="btn btn-primary"
                onClick={handlePayReport}
                whileTap={{ scale: 0.97 }}
                disabled={!payDate}
              >
                💸 {payDate === todayStr
                  ? '今日振り込みました'
                  : `${new Date(payDate + 'T00:00:00').toLocaleDateString('ja-JP', { month: 'long', day: 'numeric' })}に振り込みます`}
              </motion.button>
            </div>
          ) : (
            <div style={{ marginTop: 24 }}>
              <motion.button
                className="btn btn-primary"
                onClick={handleConfirm}
                whileTap={{ scale: 0.97 }}
              >
                {formatYearMonth(yearMonth)}分を確定する
              </motion.button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
