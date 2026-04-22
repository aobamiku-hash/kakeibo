import { useState, useMemo, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useExpenses } from '../hooks/useExpenses';
import { useMessages } from '../hooks/useMessages';
import { useTrips } from '../hooks/useTrips';
import { collection, query, where, onSnapshot, limit as fbLimit } from 'firebase/firestore';
import { db } from '../firebase';
import {
  calculateMonthSummary,
  currentYearMonth,
  formatYearMonth,
  formatCurrency,
  todayDateString,
} from '../utils/calculation';
import type { Household, Settlement } from '../types';

interface Props {
  household: Household;
}

export default function HomePage({ household }: Props) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const yearMonth = currentYearMonth();
  const { expenses, settlement, loading: expLoading } = useExpenses(household, yearMonth);
  const { messages, loading: msgLoading, addMessage, deleteMessage } = useMessages(household);
  const { trips, loading: tripLoading, addTrip, deleteTrip } = useTrips(household);

  const [m1, m2] = household.memberOrder;
  const name1 = household.memberNames[m1] ?? 'メンバー1';
  const name2 = household.memberNames[m2] ?? 'メンバー2';

  // ── 確定済み & 未振込の月を取得 ──
  const [pendingPayments, setPendingPayments] = useState<{ yearMonth: string; settlement: Settlement }[]>([]);
  useEffect(() => {
    const q = query(
      collection(db, 'households', household.id, 'settlements'),
      where('confirmed', '==', true),
      fbLimit(24),
    );
    const unsub = onSnapshot(q, (snap) => {
      const pending: { yearMonth: string; settlement: Settlement }[] = [];
      const nowStr = todayDateString();
      snap.forEach((d) => {
        const s = d.data() as Settlement;
        // 未振込 OR 振込予定日が今日以降 → pending として表示
        const isScheduledFuture = s.scheduledPayDate && s.scheduledPayDate >= nowStr;
        if ((!s.paidAt || isScheduledFuture) && d.id !== yearMonth) {
          pending.push({ yearMonth: d.id, settlement: s });
        }
      });
      pending.sort((a, b) => (b.yearMonth > a.yearMonth ? 1 : -1));
      setPendingPayments(pending);
    }, (err) => {
      console.error('振込待ち取得エラー:', err);
      setPendingPayments([]);
    });
    return unsub;
  }, [household.id, yearMonth]);

  // ── メッセージ入力 ──
  const [msgText, setMsgText] = useState('');
  const [sending, setSending] = useState(false);
  const msgEndRef = useRef<HTMLDivElement>(null);

  const handleSendMsg = async () => {
    if (!msgText.trim() || sending) return;
    const text = msgText;
    setSending(true);
    setMsgText('');
    try {
      await addMessage(text);
    } catch {
      setMsgText(text);
    } finally {
      setSending(false);
    }
  };

  useEffect(() => {
    msgEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // ── 旅行追加フォーム ──
  const [showTripForm, setShowTripForm] = useState(false);
  const [tripName, setTripName] = useState('');
  const [tripDate, setTripDate] = useState('');
  const [tripEmoji, setTripEmoji] = useState('✈️');

  const handleAddTrip = async () => {
    if (!tripName.trim() || !tripDate) return;
    await addTrip({ name: tripName.trim(), targetDate: tripDate, emoji: tripEmoji });
    setTripName('');
    setTripDate('');
    setTripEmoji('✈️');
    setShowTripForm(false);
  };

  // ── 今月ダイジェスト ──
  const summary = useMemo(() => {
    if (expenses.length === 0) return null;
    return calculateMonthSummary(expenses, household);
  }, [expenses, household]);

  const catStatus = useMemo(() => {
    const entered = new Set(expenses.map((e) => e.categoryId));
    return household.categories.map((cat) => ({
      ...cat,
      entered: entered.has(cat.id) || cat.id === 'cat_0' || cat.id === 'cat_2' || cat.id === 'cat_3',
    }));
  }, [expenses, household]);

  const enteredCount = catStatus.filter((c) => c.entered).length;
  const totalCats = catStatus.length;
  const isConfirmed = settlement?.confirmed ?? false;
  const isPaid = !!settlement?.paidAt;
  const allEntered = enteredCount === totalCats;
  const scheduledPayDate = settlement?.scheduledPayDate ?? '';

  // 振込予定日が今日以降かどうか
  const todayStr = todayDateString();
  const isPayDatePending = scheduledPayDate && scheduledPayDate >= todayStr;

  const statusText = isPaid
    ? isPayDatePending
      ? `📅 ${new Date(scheduledPayDate + 'T00:00:00').toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' })}振込予定`
      : '✅ 精算完了'
    : isConfirmed
      ? '💸 振込待ち'
      : allEntered
        ? '🎉 確定可能'
        : '📝 未確定';

  // ── カウントダウン計算 ──
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const activeTrips = trips
    .map((t) => {
      const target = new Date(t.targetDate + 'T00:00:00');
      const diff = Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      return { ...t, daysLeft: diff };
    })
    .filter((t) => t.daysLeft >= 0);

  // stagger animation
  const stagger = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.12 } },
  };
  const fadeUp = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' } },
  };

  const [boardOpen, setBoardOpen] = useState(false);

  return (
    <div className="page home-page">
      <motion.div variants={stagger} initial="hidden" animate="show">
        {/* ── 1. 今月ダイジェスト（最重要） ── */}
        <motion.div className="digest-card" variants={fadeUp}>
          {expLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '24px 0' }}>
              <div className="spinner" style={{ width: 28, height: 28 }} />
            </div>
          ) : (
            <>
            <div
              className="digest-card-tap"
              onClick={() => navigate(`/kakeibo?ym=${yearMonth}`)}
            >
              <div className="digest-header">
                <span className="digest-month">{formatYearMonth(yearMonth)}</span>
                <span className={`digest-status-badge ${isPaid && !isPayDatePending ? 'paid' : isConfirmed || isPayDatePending ? 'confirmed' : allEntered ? 'ready' : 'pending'}`}>
                  {statusText}
                </span>
              </div>
              {summary ? (
                <div className="digest-body">
                  {summary.settlement !== 0 && (
                    <div className="digest-settlement digest-settlement-hero">
                      <div className="digest-settlement-direction">
                        {summary.settlement > 0
                          ? `${name2} → ${name1}`
                          : `${name1} → ${name2}`}
                      </div>
                      <div className="digest-settlement-value">
                        {formatCurrency(Math.abs(summary.settlement))}
                      </div>
                    </div>
                  )}
                  <div className="digest-sub-row">
                    <span className="digest-total-sub">合計 {formatCurrency(summary.totalAmount)}</span>
                    <span className="digest-member-sub">{name1} {formatCurrency(summary.member1Should)} / {name2} {formatCurrency(summary.member2Should)}</span>
                  </div>

                  {/* カテゴリダイジェスト */}
                  <div className="digest-cat-grid">
                    {household.categories.map((cat) => {
                      const catTotal = summary.byCategory.find((bc) => bc.category.id === cat.id)?.total ?? 0;
                      return (
                        <div
                          key={cat.id}
                          className={`digest-cat-tile${catTotal > 0 ? ' has-amount' : ''}`}
                          onClick={(e) => { e.stopPropagation(); navigate(`/entry/${cat.id}?ym=${yearMonth}`); }}
                        >
                          <span className="digest-cat-tile-emoji">{cat.emoji}</span>
                          <span className="digest-cat-tile-name">{cat.name}</span>
                          <span className="digest-cat-tile-amount">
                            {catTotal > 0 ? formatCurrency(catTotal) : '—'}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {/* アクションヒント（カード内） */}
                  {isPaid && isPayDatePending && (
                    <div className="digest-action confirmed">
                      📅 {new Date(scheduledPayDate + 'T00:00:00').toLocaleDateString('ja-JP', { month: 'long', day: 'numeric' })}振込予定
                    </div>
                  )}
                  {!isPaid && isConfirmed && (
                    <div className="digest-action confirmed">
                      💸 {summary.settlement > 0 ? `${name2}→${name1}` : `${name1}→${name2}`} {formatCurrency(Math.abs(summary.settlement))} 振込
                    </div>
                  )}
                  {!isPaid && !isConfirmed && allEntered && (
                    <div className="digest-action ready">🎉 確定可能</div>
                  )}
                </div>
              ) : (
                <div className="digest-empty">まだ入力がありません</div>
              )}
              <div className="digest-arrow">›</div>
            </div>

            {/* クイック登録（カード内下部） */}
            <div className="digest-quick">
              {household.categories
                .filter((cat) => cat.id === 'cat_5' || cat.id === 'cat_6')
                .map((cat) => (
                  <button
                    key={cat.id}
                    className="digest-quick-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/entry/${cat.id}?ym=${yearMonth}${cat.id === 'cat_5' || cat.id === 'cat_6' ? '&openForm=1' : ''}`);
                    }}
                  >
                    {cat.emoji} {cat.name}
                  </button>
                ))}
            </div>
            </>
          )}
          </motion.div>

          {/* ── 2. 振込待ち（コンパクト） ── */}
          {pendingPayments.length > 0 && (
            <motion.div className="pending-bar-section" variants={fadeUp}>
              {pendingPayments.map((pp) => {
                const ppPayDate = pp.settlement.scheduledPayDate;
                const ppPending = ppPayDate && ppPayDate >= todayStr;
                return (
                  <button
                    key={pp.yearMonth}
                    className="pending-bar"
                    onClick={() => navigate(`/kakeibo?ym=${pp.yearMonth}`)}
                  >
                    {ppPending
                      ? `📅 ${formatYearMonth(pp.yearMonth)}｜${new Date(ppPayDate + 'T00:00:00').toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })} 振込予定 ›`
                      : `💸 ${formatYearMonth(pp.yearMonth)} 振込待ち ›`}
                  </button>
                );
              })}
            </motion.div>
          )}

          {/* ── 3. 情報セクション区切り ── */}
          <div className="home-section-divider">
            <span className="home-section-label">イベント & 伝言</span>
          </div>

          {/* ── 4. カウントダウン（コンパクト1行バー） ── */}
          {tripLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0' }}>
              <div className="spinner" style={{ width: 20, height: 20 }} />
            </div>
          ) : activeTrips.length > 0 ? (
            <motion.div className="countdown-bar-section" variants={fadeUp}>
              {activeTrips.map((trip) => (
                <div key={trip.id} className="countdown-bar">
                  <span className="countdown-bar-emoji">{trip.emoji}</span>
                  <span className="countdown-bar-name">{trip.name}</span>
                  <span className="countdown-bar-days">
                    <strong>{trip.daysLeft}</strong>日後
                  </span>
                  <button
                    className="countdown-bar-delete"
                    onClick={() => { if (window.confirm(`「${trip.name}」を削除しますか？`)) deleteTrip(trip.id); }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </motion.div>
          ) : null}
          {!tripLoading && (
          <>
          <button
            className="btn-add-trip"
            onClick={() => setShowTripForm(!showTripForm)}
          >
            {showTripForm ? '✕ 閉じる' : '✈️ イベント追加'}
          </button>
          <AnimatePresence>
            {showTripForm && (
              <motion.div
                className="trip-form"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
              >
                <div className="trip-form-row">
                  <select
                    value={tripEmoji}
                    onChange={(e) => setTripEmoji(e.target.value)}
                    className="trip-emoji-select"
                  >
                    {['✈️', '🏖️', '🎄', '🎂', '🏔️', '🎵', '🍽️', '💍', '🎪'].map((e) => (
                      <option key={e} value={e}>{e}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    placeholder="イベント名"
                    value={tripName}
                    onChange={(e) => setTripName(e.target.value)}
                    className="trip-name-input"
                  />
                </div>
                <div className="trip-form-row">
                  <input
                    type="date"
                    value={tripDate}
                    onChange={(e) => setTripDate(e.target.value)}
                    className="trip-date-input"
                  />
                  <button className="btn btn-primary btn-sm" onClick={handleAddTrip}>
                    追加
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          </>
          )}

          {/* ── 4. 伝言板（折りたたみ） ── */}
          {msgLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0' }}>
              <div className="spinner" style={{ width: 20, height: 20 }} />
            </div>
          ) : (
          <motion.div className="board-section" variants={fadeUp}>
            <button
              className="board-toggle"
              onClick={() => setBoardOpen(!boardOpen)}
            >
              <span>💬 伝言板</span>
              {messages.length > 0 && (
                <span className="board-badge">{messages.length}</span>
              )}
              <span className={`board-chevron ${boardOpen ? 'open' : ''}`}>›</span>
            </button>
            <AnimatePresence>
              {boardOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  style={{ overflow: 'hidden' }}
                >
                  <div className="board-messages">
                    {messages.length === 0 ? (
                      <div className="board-empty">メッセージはまだありません</div>
                    ) : (
                      [...messages].reverse().map((msg) => {
                        const isMine = msg.createdBy === user?.uid;
                        const name = household.memberNames[msg.createdBy] ?? '?';
                        const time = msg.createdAt?.toDate?.()
                          ? msg.createdAt.toDate().toLocaleString('ja-JP', {
                              month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                            })
                          : '';
                        return (
                          <div key={msg.id} className={`board-msg ${isMine ? 'mine' : 'theirs'}`}>
                            {!isMine && <div className="board-msg-name">{name}</div>}
                            <div className="board-msg-bubble">
                              <span>{msg.text}</span>
                              {isMine && (
                                <button
                                  className="board-msg-delete"
                                  onClick={() => { if (window.confirm('このメッセージを削除しますか？')) deleteMessage(msg.id); }}
                                >
                                  ×
                                </button>
                              )}
                            </div>
                            <div className="board-msg-time">{time}</div>
                          </div>
                        );
                      })
                    )}
                    <div ref={msgEndRef} />
                  </div>
                  <div className="board-input">
                    <input
                      type="text"
                      value={msgText}
                      onChange={(e) => setMsgText(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSendMsg()}
                      placeholder="メッセージを入力…"
                      className="board-input-field"
                    />
                    <button
                      className="board-send-btn"
                      onClick={handleSendMsg}
                      disabled={!msgText.trim() || sending}
                    >
                      送信
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
          )}
        </motion.div>
    </div>
  );
}
