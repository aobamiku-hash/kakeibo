import { useState, useMemo } from 'react';
import { motion, AnimatePresence, type PanInfo } from 'framer-motion';
import { useNavigate, useSearchParams } from 'react-router-dom';
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
import { CREDIT_SUBCATEGORIES } from '../types';

interface Props {
  household: Household;
}

const FIXED_CATS = ['cat_0', 'cat_3'];
const DAILY_CATS = ['cat_5', 'cat_6'];
const SWIPE_THRESHOLD = 50;

export default function DashboardPage({ household }: Props) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const initialYm = searchParams.get('ym') ?? currentYearMonth();
  const [yearMonth, setYearMonth] = useState(initialYm);
  const [slideDir, setSlideDir] = useState(0);
  const { expenses, settlement, loading, confirmSettlement, unconfirmSettlement, unpaySettlement } = useExpenses(household, yearMonth);

  const summary = useMemo(() => {
    if (expenses.length === 0) return null;
    return calculateMonthSummary(expenses, household);
  }, [expenses, household]);

  const [m1, m2] = household.memberOrder;
  const name1 = household.memberNames[m1] ?? 'メンバー1';
  const name2 = household.memberNames[m2] ?? 'メンバー2';
  const isManager = user?.uid === m1;

  const catStatus = useMemo(() => {
    const map = new Map<string, { count: number; total: number; m1Share: number; m2Share: number }>();
    for (const exp of expenses) {
      const cur = map.get(exp.categoryId) ?? { count: 0, total: 0, m1Share: 0, m2Share: 0 };
      map.set(exp.categoryId, {
        count: cur.count + 1,
        total: cur.total + exp.amount,
        m1Share: cur.m1Share + exp.amount * (exp.split[0] / 100),
        m2Share: cur.m2Share + exp.amount * (exp.split[1] / 100),
      });
    }
    return map;
  }, [expenses]);

  // クレカサブカテゴリ集計
  const creditSubcats = useMemo(() => {
    const map = new Map<string, number>();
    for (const exp of expenses) {
      if (exp.categoryId === 'cat_4' && exp.subcategory) {
        map.set(exp.subcategory, (map.get(exp.subcategory) ?? 0) + exp.amount);
      }
    }
    if (map.size === 0) return null;
    return [...map.entries()]
      .map(([key, total]) => ({ key, ...(CREDIT_SUBCATEGORIES[key] ?? { name: key, emoji: '📝' }), total }))
      .sort((a, b) => b.total - a.total);
  }, [expenses]);

  const allCatsEntered = household.categories.every((cat) => {
    if (cat.id === 'cat_2') return true;
    return catStatus.has(cat.id);
  });

  const isConfirmed = settlement?.confirmed ?? false;
  const isPaid = !!settlement?.paidAt;

  const goMonth = (dir: -1 | 1) => {
    setSlideDir(dir);
    setYearMonth((ym) => shiftMonth(ym, dir));
  };

  const handleDragEnd = (_: unknown, info: PanInfo) => {
    if (Math.abs(info.offset.x) < SWIPE_THRESHOLD) return;
    goMonth(info.offset.x > 0 ? -1 : 1);
  };

  const handlePayReport = async () => {
    if (!user || !household) return;
    try {
      const ref = doc(db, 'households', household.id, 'settlements', yearMonth);
      await updateDoc(ref, { paidAt: Timestamp.now(), paidBy: user.uid });
    } catch (err) {
      console.error('振込報告エラー:', err);
      alert('振込報告に失敗しました');
    }
  };

  const slideVariants = {
    enter: (d: number) => ({ x: d > 0 ? 300 : -300, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (d: number) => ({ x: d > 0 ? -300 : 300, opacity: 0 }),
  };

  return (
    <div className="page swipe-page">
      {/* ── 月ナビ ── */}
      <div className="month-nav">
        <button onClick={() => goMonth(-1)}>‹</button>
        <AnimatePresence mode="wait" custom={slideDir}>
          <motion.span
            key={yearMonth}
            className="month-text"
            custom={slideDir}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.2 }}
          >
            {formatYearMonth(yearMonth)}
          </motion.span>
        </AnimatePresence>
        <button onClick={() => goMonth(1)}>›</button>
      </div>
      <div className="swipe-hint">← スワイプで月移動 →</div>

      <AnimatePresence mode="wait" custom={slideDir}>
        <motion.div
          key={yearMonth}
          custom={slideDir}
          variants={slideVariants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ duration: 0.2 }}
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.15}
          onDragEnd={handleDragEnd}
          style={{ touchAction: 'pan-y' }}
        >
      {loading ? (
        <div className="loading-screen" style={{ minHeight: 200 }}>
          <div className="spinner" />
        </div>
      ) : (
        <>
          {/* ── ステータスバナー ── */}
          <motion.div
            className={`status-banner ${isPaid ? 'paid' : isConfirmed ? 'confirmed' : allCatsEntered ? 'ready' : 'pending'}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <span className="status-icon">
              {isPaid ? '✅' : isConfirmed ? '💸' : allCatsEntered ? '🎉' : '📝'}
            </span>
            <span className="status-label">
              {isPaid ? '精算完了' : isConfirmed ? '振込待ち' : allCatsEntered ? '確定可能' : '入力中…'}
            </span>
          </motion.div>

          {/* ── サマリーカード ── */}
          {summary && (
            <div className="summary-compact">
              <div className="summary-total-row">
                <span className="summary-total-label">合計</span>
                <span className="summary-total-amount">{formatCurrency(summary.totalAmount)}</span>
              </div>
              <div className="summary-members-row">
                <div className="summary-member-col">
                  <span className="summary-member-name">{name1}</span>
                  <span className="summary-member-amount">{formatCurrency(summary.member1Should)}</span>
                </div>
                <div className="summary-member-col">
                  <span className="summary-member-name">{name2}</span>
                  <span className="summary-member-amount">{formatCurrency(summary.member2Should)}</span>
                </div>
              </div>
              {summary.settlement !== 0 && (
                <div className="summary-settlement">
                  {summary.settlement > 0
                    ? `${name2} → ${name1} ${formatCurrency(summary.settlement)}`
                    : `${name1} → ${name2} ${formatCurrency(Math.abs(summary.settlement))}`}
                </div>
              )}
            </div>
          )}

          {/* ── カテゴリタイル ── */}
          <div className="cat-grid">
            {household.categories.map((cat, i) => {
              const status = catStatus.get(cat.id);
              const isFixed = FIXED_CATS.includes(cat.id);
              const isDaily = DAILY_CATS.includes(cat.id);
              const entered = !!status || isFixed;
              const isSkipped = cat.id === 'cat_2' && status?.total === 0;
              const canTap = isDaily || (isManager && !isFixed);

              return (
                <motion.button
                  key={cat.id}
                  className={[
                    'cat-tile',
                    entered ? 'entered' : 'empty',
                    isFixed ? 'fixed' : '',
                    isDaily ? 'daily' : '',
                    !canTap ? 'readonly' : '',
                  ].filter(Boolean).join(' ')}
                  onClick={() => canTap && navigate(`/entry/${cat.id}?ym=${yearMonth}`)}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  whileTap={canTap ? { scale: 0.96 } : {}}
                >
                  <div className="cat-tile-top">
                    <span className="cat-tile-emoji">{cat.emoji}</span>
                    {isFixed ? (
                      <span className="cat-tile-badge fixed-badge">固定</span>
                    ) : isDaily ? (
                      <span className="cat-tile-badge daily-badge">＋</span>
                    ) : (
                      <span className={`cat-tile-indicator ${entered ? 'on' : ''}`}>
                        {entered ? '✓' : ''}
                      </span>
                    )}
                  </div>
                  <div className="cat-tile-name">{cat.name}</div>
                  {isSkipped ? (
                    <div className="cat-tile-amount skipped-text">スキップ</div>
                  ) : status ? (
                    <>
                      <div className="cat-tile-amount">
                        {formatCurrency(status.total)}
                        {(isDaily || cat.id === 'cat_4') && status.count > 1 && (
                          <span className="cat-tile-count"> ({status.count}件)</span>
                        )}
                      </div>
                      {!isFixed && (
                        <div className="cat-tile-shares">
                          <span>{name1} {formatCurrency(Math.round(status.m1Share))}</span>
                          <span>{name2} {formatCurrency(Math.round(status.m2Share))}</span>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="cat-tile-amount empty-text">
                      {isDaily ? 'タップして追加' : '未入力'}
                    </div>
                  )}
                </motion.button>
              );
            })}
          </div>

          {/* ── クレカ内訳（データがある月のみ） ── */}
          {creditSubcats && (
            <div className="card" style={{ padding: '12px 16px', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                <span style={{ fontSize: 16 }}>💳</span>
                <span style={{ fontSize: 13, fontWeight: 600 }}>クレジット内訳</span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {creditSubcats.map((item) => (
                  <div
                    key={item.key}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 4,
                      background: 'rgba(255,255,255,0.04)', borderRadius: 8,
                      padding: '4px 10px', fontSize: 12,
                    }}
                  >
                    <span>{item.emoji}</span>
                    <span style={{ opacity: 0.7 }}>{item.name}</span>
                    <span style={{ fontWeight: 600 }}>{formatCurrency(item.total)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── 精算フロー（ホーム下部統合） ── */}
          {summary && (
            <div className="settlement-inline">
              <div className="settlement-steps-inline">
                <div className={`step-inline ${isConfirmed || isPaid ? 'done' : allCatsEntered ? 'current' : 'wait'}`}>
                  <div className="step-dot-inline">{isConfirmed || isPaid ? '✓' : '1'}</div>
                  <span>{name1}確定</span>
                </div>
                <div className="step-line-inline" />
                <div className={`step-inline ${isPaid ? 'done' : isConfirmed ? 'current' : 'wait'}`}>
                  <div className="step-dot-inline">{isPaid ? '✓' : '2'}</div>
                  <span>{name2}振込</span>
                </div>
                <div className="step-line-inline" />
                <div className={`step-inline ${isPaid ? 'done' : 'wait'}`}>
                  <div className="step-dot-inline">{isPaid ? '✓' : '3'}</div>
                  <span>完了</span>
                </div>
              </div>

              {summary.settlement !== 0 && !isPaid && (
                <div className="settlement-transfer-inline">
                  {summary.settlement > 0 ? `${name2} → ${name1}` : `${name1} → ${name2}`}
                  <strong> {formatCurrency(Math.abs(summary.settlement))}</strong>
                </div>
              )}

              {isPaid ? (
                <div className="settlement-done-inline">
                  ✅ 精算完了
                  <button className="btn-undo" onClick={unpaySettlement}>振込を取り下げ</button>
                </div>
              ) : isConfirmed ? (
                !isManager ? (
                  <div className="settlement-action-group">
                    <motion.button
                      className="btn btn-primary btn-sm"
                      onClick={handlePayReport}
                      whileTap={{ scale: 0.97 }}
                    >
                      💸 振り込みました
                    </motion.button>
                  </div>
                ) : (
                  <div className="settlement-action-group">
                    <div className="settlement-wait-inline">{name2}の振込待ち…</div>
                    <button className="btn-undo" onClick={unconfirmSettlement}>確定を取り下げ</button>
                  </div>
                )
              ) : allCatsEntered ? (
                isManager ? (
                  <motion.button
                    className="btn btn-primary btn-sm"
                    onClick={() => confirmSettlement(allCatsEntered)}
                    whileTap={{ scale: 0.97 }}
                  >
                    確定する
                  </motion.button>
                ) : (
                  <div className="settlement-wait-inline">{name1}の確定待ち</div>
                )
              ) : (
                <div className="settlement-wait-inline">全カテゴリ入力後に確定</div>
              )}
            </div>
          )}
        </>
      )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
