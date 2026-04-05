import { useState, useMemo, useEffect, useRef } from 'react';
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

interface Props {
  household: Household;
}

const FIXED_CATS = ['cat_0', 'cat_3'];
const DAILY_CATS = ['cat_5', 'cat_6'];
const SWIPE_THRESHOLD = 50;

const slideVariants = {
  enter: (d: number) => ({ x: d > 0 ? 300 : -300, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (d: number) => ({ x: d > 0 ? -300 : 300, opacity: 0 }),
};

export default function KakeiboPage({ household }: Props) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const initialYm = searchParams.get('ym') ?? currentYearMonth();
  const [yearMonth, setYearMonth] = useState(initialYm);
  const [slideDir, setSlideDir] = useState(0);
  const { expenses, settlement, loading, confirmSettlement, unconfirmSettlement, unpaySettlement } = useExpenses(household, yearMonth);

  // ローディングが5秒以上続いた場合のタイムアウト検知
  const [loadTimeout, setLoadTimeout] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    if (loading) {
      setLoadTimeout(false);
      timeoutRef.current = setTimeout(() => setLoadTimeout(true), 5000);
    } else {
      setLoadTimeout(false);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    }
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
  }, [loading, yearMonth]);

  const summary = useMemo(() => {
    if (expenses.length === 0) return null;
    return calculateMonthSummary(expenses, household);
  }, [expenses, household]);

  const [m1, m2] = household.memberOrder;
  const name1 = household.memberNames[m1] ?? 'メンバー1';
  const name2 = household.memberNames[m2] ?? 'メンバー2';
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

  const allCatsEntered = household.categories.every((cat) => {
    if (cat.id === 'cat_2') return true;
    return catStatus.has(cat.id);
  });

  const isConfirmed = settlement?.confirmed ?? false;
  const isPaid = !!settlement?.paidAt;
  const scheduledPayDate = settlement?.scheduledPayDate ?? '';

  // 振込予定日の入力用 state
  const todayStr = new Date().toISOString().slice(0, 10);
  const [payDate, setPayDate] = useState(todayStr);

  const goMonth = (dir: -1 | 1) => {
    setSlideDir(dir);
    setYearMonth((ym) => shiftMonth(ym, dir));
  };

  const handleDragEnd = (_: unknown, info: PanInfo) => {
    if (Math.abs(info.offset.x) < SWIPE_THRESHOLD) return;
    goMonth(info.offset.x > 0 ? -1 : 1);
  };

  const handlePayReport = async () => {
    if (!user || !household || !payDate) return;
    const ref = doc(db, 'households', household.id, 'settlements', yearMonth);
    await updateDoc(ref, { paidAt: Timestamp.now(), paidBy: user.uid, scheduledPayDate: payDate });
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
          {loadTimeout && (
            <div style={{ marginTop: 16, textAlign: 'center', color: 'rgba(255,255,255,0.6)', fontSize: 14 }}>
              <p>読み込みに時間がかかっています</p>
              <button
                className="btn btn-sm"
                style={{ marginTop: 8 }}
                onClick={() => window.location.reload()}
              >
                再読み込み
              </button>
            </div>
          )}
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
              {summary.settlement !== 0 && (
                <div className="summary-settlement summary-settlement-hero">
                  {summary.settlement > 0
                    ? `${name2} → ${name1}`
                    : `${name1} → ${name2}`}
                  <span className="summary-settlement-amount">
                    {formatCurrency(Math.abs(summary.settlement))}
                  </span>
                </div>
              )}
              <div className="summary-sub-row">
                <span className="summary-total-sub">合計 {formatCurrency(summary.totalAmount)}</span>
                <span className="summary-member-sub">{name1} {formatCurrency(summary.member1Should)} / {name2} {formatCurrency(summary.member2Should)}</span>
              </div>
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
              const canTap = isDaily || !isFixed;

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

          {/* ── 精算フロー（ホーム下部統合） ── */}
          {summary && (
            <div className="settlement-inline">
              <div className="settlement-steps-inline">
                <div className={`step-inline ${isConfirmed || isPaid ? 'done' : allCatsEntered ? 'current' : 'wait'}`}>
                  <div className="step-dot-inline">{isConfirmed || isPaid ? '✓' : '1'}</div>
                  <span>確定</span>
                </div>
                <div className="step-line-inline" />
                <div className={`step-inline ${isPaid ? 'done' : isConfirmed ? 'current' : 'wait'}`}>
                  <div className="step-dot-inline">{isPaid ? '✓' : '2'}</div>
                  <span>振込</span>
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
                  {scheduledPayDate && (
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 4 }}>
                      📅 振込日: {new Date(scheduledPayDate + 'T00:00:00').toLocaleDateString('ja-JP', { month: 'long', day: 'numeric' })}
                    </div>
                  )}
                  <button className="btn-undo" onClick={() => { if (window.confirm('振込報告を取り下げますか？')) unpaySettlement(); }}>振込を取り下げ</button>
                </div>
              ) : isConfirmed ? (
                <div className="settlement-action-group">
                  <div style={{ width: '100%', marginBottom: 8 }}>
                    <label style={{ display: 'block', fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>
                      📅 振込日を選択
                    </label>
                    <input
                      type="date"
                      value={payDate}
                      min={todayStr}
                      onChange={(e) => setPayDate(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        borderRadius: 8,
                        border: '1px solid rgba(255,255,255,0.15)',
                        fontSize: 15,
                        background: 'rgba(255,255,255,0.08)',
                        color: 'inherit',
                      }}
                    />
                  </div>
                  <motion.button
                    className="btn btn-primary btn-sm"
                    onClick={handlePayReport}
                    whileTap={{ scale: 0.97 }}
                    disabled={!payDate}
                  >
                    💸 {payDate === todayStr
                      ? '今日振り込みました'
                      : `${new Date(payDate + 'T00:00:00').toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' })}に振り込みます`}
                  </motion.button>
                  <button className="btn-undo" onClick={() => { if (window.confirm('確定を取り下げますか？')) unconfirmSettlement(); }}>確定を取り下げ</button>
                </div>
              ) : allCatsEntered ? (
                <motion.button
                  className="btn btn-primary btn-sm"
                  onClick={async () => {
                    try {
                      await confirmSettlement(allCatsEntered);
                    } catch {
                      alert('確定に失敗しました。もう一度お試しください。');
                    }
                  }}
                  whileTap={{ scale: 0.97 }}
                >
                  確定する
                </motion.button>
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
