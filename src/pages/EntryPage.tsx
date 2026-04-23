import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { DocumentReference, DocumentData } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { useExpenses } from '../hooks/useExpenses';
import { formatCurrency, currentYearMonth, formatYearMonth } from '../utils/calculation';
import type { Household, Expense, Settlement } from '../types';
import { CREDIT_SUBCATEGORIES } from '../types';

interface Props {
  household: Household;
}

export default function EntryPage({ household }: Props) {
  const { catId } = useParams<{ catId: string }>();
  const [searchParams] = useSearchParams();
  const yearMonth = searchParams.get('ym') ?? currentYearMonth();
  const openFormParam = searchParams.get('openForm') === '1';
  const navigate = useNavigate();
  const { user } = useAuth();
  const { expenses, settlement, addExpense, updateExpense, deleteExpense } = useExpenses(household, yearMonth);

  const [m1, m2] = household.memberOrder;
  const cat = catId ? household.categories.find((c) => c.id === catId) : undefined;

  // このカテゴリの既存データ
  const catExpenses = useMemo(
    () => expenses.filter((e) => e.categoryId === catId),
    [expenses, catId],
  );
  const creditDetailExpenses = useMemo(
    () => catExpenses.filter((e) => e.subcategory),
    [catExpenses],
  );

  if (!cat) {
    return (
      <div className="page">
        <p>カテゴリが見つかりません</p>
        <button className="btn btn-secondary" onClick={() => navigate('/')}>戻る</button>
      </div>
    );
  }

  const isFixed = cat.id === 'cat_0' || cat.id === 'cat_3'; // 家賃, ネット
  const isMulti = cat.id === 'cat_5' || cat.id === 'cat_6'; // 立て替え / 割り勘
  const isWarikan = cat.id === 'cat_6'; // 割り勘
  const isBimonthly = cat.id === 'cat_2'; // 水道は隔月
  const isCreditCard = cat.id === 'cat_4';
  const hasCreditDetails = isCreditCard && creditDetailExpenses.length > 0;
  const hasLegacyCreditAggregate = hasCreditDetails && catExpenses.some((e) => !e.subcategory);

  return (
    <motion.div
      className="page"
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.25 }}
    >
      {/* ── ヘッダー ── */}
      <div className="entry-header">
        <button className="back-button" onClick={() => navigate(`/kakeibo?ym=${yearMonth}`)}>‹</button>
        <span className="entry-month">{formatYearMonth(yearMonth)}</span>
      </div>

      <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 32 }}>{cat.emoji}</span>
        {cat.name}
      </h1>

      {hasCreditDetails ? (
        <CreditCardView
          household={household}
          expenses={creditDetailExpenses}
          hasLegacyAggregate={hasLegacyCreditAggregate}
          m1={m1}
          m2={m2}
        />
      ) : isMulti ? (
        <MultiEntryView
          household={household}
          cat={cat}
          yearMonth={yearMonth}
          expenses={catExpenses}
          settlement={settlement}
          addExpense={addExpense}
          updateExpense={updateExpense}
          deleteExpense={deleteExpense}
          isWarikan={isWarikan}
          m1={m1}
          m2={m2}
          user={user}
          openFormOnMount={openFormParam}
        />
      ) : (
        <SingleEntryView
          household={household}
          cat={cat}
          yearMonth={yearMonth}
          existing={catExpenses[0] ?? null}
          addExpense={addExpense}
          updateExpense={updateExpense}
          deleteExpense={deleteExpense}
          isFixed={isFixed}
          isBimonthly={isBimonthly}
          m1={m1}
          m2={m2}
          navigate={navigate}
          user={user}
        />
      )}
    </motion.div>
  );
}

/* ═══════════════════════════════════════
   クレカ内訳ビュー（cat_4 + subcategory があるとき）
   ═══════════════════════════════════════ */
function CreditCardView({
  household, expenses, hasLegacyAggregate, m1, m2,
}: {
  household: Household;
  expenses: Expense[];
  hasLegacyAggregate: boolean;
  m1: string;
  m2: string;
}) {
  const [expandedCat, setExpandedCat] = useState<string | null>(null);
  const name1 = household.memberNames[m1] ?? 'メンバー1';
  const name2 = household.memberNames[m2] ?? 'メンバー2';

  // サブカテゴリ別に集計
  const subcatGroups = useMemo(() => {
    const map = new Map<string, { items: Expense[]; total: number }>();
    for (const exp of expenses) {
      const key = exp.subcategory || 'unknown';
      const cur = map.get(key) ?? { items: [], total: 0 };
      cur.items.push(exp);
      cur.total += exp.amount;
      map.set(key, cur);
    }
    // 金額降順ソート
    return [...map.entries()].sort((a, b) => b[1].total - a[1].total);
  }, [expenses]);

  const total = expenses.reduce((s, e) => s + e.amount, 0);
  const m1Total = expenses.reduce((s, e) => s + e.amount * (e.split[0] / 100), 0);
  const m2Total = expenses.reduce((s, e) => s + e.amount * (e.split[1] / 100), 0);

  return (
    <>
      {hasLegacyAggregate && (
        <div className="card" style={{ marginBottom: 12, padding: '12px 16px', fontSize: 12, opacity: 0.72 }}>
          旧形式のクレカ集計行は二重計上を防ぐため、この内訳表示から除外しています。
        </div>
      )}

      {/* ── 合計サマリー ── */}
      <div className="card" style={{ marginBottom: 16, padding: '16px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ fontSize: 14, opacity: 0.7 }}>合計</span>
          <span style={{ fontSize: 24, fontWeight: 700 }}>{formatCurrency(total)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 13, opacity: 0.7 }}>
          <span>{name1} {formatCurrency(Math.round(m1Total))}</span>
          <span>{name2} {formatCurrency(Math.round(m2Total))}</span>
        </div>
        <div style={{ fontSize: 12, opacity: 0.5, marginTop: 4 }}>
          {expenses.length}件の明細
        </div>
      </div>

      {/* ── サブカテゴリ別内訳 ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {subcatGroups.map(([key, group]) => {
          const subInfo = CREDIT_SUBCATEGORIES[key] ?? { name: key, emoji: '📝' };
          const isExpanded = expandedCat === key;
          const pct = total > 0 ? Math.round((group.total / total) * 100) : 0;

          return (
            <div key={key} className="card" style={{ padding: 0, overflow: 'hidden' }}>
              {/* ヘッダー（タップで展開） */}
              <button
                onClick={() => setExpandedCat(isExpanded ? null : key)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  width: '100%', padding: '14px 16px', border: 'none',
                  background: 'transparent', color: 'inherit', cursor: 'pointer',
                  textAlign: 'left', fontSize: 14,
                }}
              >
                <span style={{ fontSize: 20 }}>{subInfo.emoji}</span>
                <span style={{ flex: 1, fontWeight: 600 }}>{subInfo.name}</span>
                <span style={{ opacity: 0.5, fontSize: 12 }}>{group.items.length}件</span>
                <span style={{ fontWeight: 600, minWidth: 80, textAlign: 'right' }}>
                  {formatCurrency(group.total)}
                </span>
                <span style={{ opacity: 0.4, fontSize: 12, minWidth: 36, textAlign: 'right' }}>
                  {pct}%
                </span>
                <span style={{ fontSize: 12, opacity: 0.4, transition: 'transform 0.2s', transform: isExpanded ? 'rotate(180deg)' : '' }}>
                  ▼
                </span>
              </button>

              {/* ── 割合バー ── */}
              <div style={{ height: 3, background: 'rgba(255,255,255,0.05)', margin: '0 16px' }}>
                <div style={{
                  height: '100%', width: `${pct}%`,
                  background: 'rgba(46,160,67,0.6)', borderRadius: 2,
                  transition: 'width 0.3s',
                }} />
              </div>

              {/* ── 展開リスト ── */}
              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    style={{ overflow: 'hidden' }}
                  >
                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: '8px 0' }}>
                      {[...group.items]
                        .sort((a: Expense, b: Expense) => b.amount - a.amount)
                        .map((exp: Expense) => {
                          const payer = household.memberNames[exp.paidBy] ?? '?';
                          return (
                            <div
                              key={exp.id}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 8,
                                padding: '8px 16px', fontSize: 13,
                              }}
                            >
                              <span style={{ flex: 1, opacity: 0.8 }}>{exp.note || '—'}</span>
                              <span style={{
                                fontSize: 11, opacity: 0.5,
                                background: 'rgba(255,255,255,0.06)',
                                padding: '2px 6px', borderRadius: 4,
                              }}>
                                {payer}
                              </span>
                              <span style={{ fontWeight: 500, minWidth: 70, textAlign: 'right' }}>
                                {formatCurrency(exp.amount)}
                              </span>
                            </div>
                          );
                        })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </>
  );
}

/* ═══════════════════════════════════════
   単一入力ビュー（家賃/電気ガス/水道/クレジット/ネット）
   ═══════════════════════════════════════ */
function SingleEntryView({
  household, cat, yearMonth, existing, addExpense, updateExpense, deleteExpense, isFixed, isBimonthly, m1, m2, navigate, user,
}: {
  household: Household;
  cat: Household['categories'][number];
  yearMonth: string;
  existing: Expense | null;
  addExpense: (d: Omit<Expense, 'id' | 'createdAt' | 'createdBy'>) => Promise<DocumentReference<DocumentData> | undefined>;
  updateExpense: (id: string, d: Partial<Expense>) => Promise<void>;
  deleteExpense: (id: string) => Promise<void>;
  isFixed: boolean;
  isBimonthly: boolean;
  m1: string;
  m2: string;
  navigate: (p: string) => void;
  user: { uid: string } | null;
}) {
  const FIXED_AMOUNTS: Record<string, number> = { cat_0: 46430, cat_3: 5130 };
  const FIXED_PAYER: Record<string, string> = { cat_0: m1, cat_3: m2 };
  const defaultAmt = isFixed ? String(FIXED_AMOUNTS[cat.id] ?? 0) : '';
  const [amountStr, setAmountStr] = useState(existing && !existing.isSkipped ? String(existing.amount) : defaultAmt);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const amount = parseInt(amountStr, 10) || 0;
  const payer = FIXED_PAYER[cat.id] ?? m1;

  const handleSave = async () => {
    if (amount === 0 || !user) return;
    setSaving(true);
    try {
      const data = {
        yearMonth,
        categoryId: cat.id,
        amount,
        paidBy: payer,
        split: cat.defaultSplit as [number, number],
        note: '',
      };
      if (existing) {
        await updateExpense(existing.id, {
          amount,
          note: '',
          isSkipped: false,
          split: cat.defaultSplit as [number, number],
        });
      } else {
        await addExpense({ ...data, isSkipped: false });
      }
      setDone(true);
      setTimeout(() => navigate('/'), 600);
    } catch (err) {
      console.error('保存エラー:', err);
      alert('保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!existing) return;
    if (!window.confirm('この項目を削除しますか？')) return;
    try {
      await deleteExpense(existing.id);
      navigate('/');
    } catch (err) {
      console.error('削除エラー:', err);
      alert('削除に失敗しました');
    }
  };

  if (done) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200 }}>
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring' }}>
          <div style={{ fontSize: 64, textAlign: 'center' }}>✅</div>
        </motion.div>
      </div>
    );
  }

  return (
    <>
      <div className="entry-amount-display">
        <span className="currency">¥</span>
        <input
          type="text"
          inputMode="numeric"
          className="entry-amount-input"
          value={amountStr}
          onChange={(e) => setAmountStr(e.target.value.replace(/\D/g, ''))}
          placeholder="0"
          readOnly={isFixed}
        />
      </div>

      <div className="entry-info-row">
        <span>割り勘</span>
        <span className="entry-info-value">{cat.defaultSplit[0]}:{cat.defaultSplit[1]}</span>
      </div>
      <div className="entry-info-row">
        <span>支払者</span>
        <span className="entry-info-value">{household.memberNames[payer]}</span>
      </div>

      <motion.button
        className="btn btn-primary"
        style={{ marginTop: 24 }}
        onClick={handleSave}
        disabled={amount === 0 || saving}
        whileTap={{ scale: 0.97 }}
      >
        {saving ? '保存中…' : existing ? '更新する' : `${formatCurrency(amount)} を登録`}
      </motion.button>

      {existing && (
        <button
          className="btn btn-danger"
          style={{ marginTop: 12 }}
          onClick={handleDelete}
        >
          削除
        </button>
      )}

      {isBimonthly && !existing && (
        <motion.button
          className="btn btn-secondary"
          style={{ marginTop: 12 }}
          onClick={async () => {
            if (!user) return;
            setSaving(true);
            try {
              await addExpense({
                yearMonth,
                categoryId: cat.id,
                amount: 0,
                paidBy: m1,
                split: cat.defaultSplit as [number, number],
                note: '今月はスキップ',
                isSkipped: true,
              });
              setDone(true);
              setTimeout(() => navigate('/'), 600);
            } catch (err) {
              console.error('スキップエラー:', err);
              alert('スキップに失敗しました');
            } finally {
              setSaving(false);
            }
          }}
          disabled={saving}
          whileTap={{ scale: 0.97 }}
        >
          今月はスキップ
        </motion.button>
      )}

      {existing?.isSkipped && (
        <div className="card" style={{ marginTop: 12, padding: 14, fontSize: 13, opacity: 0.78 }}>
          この月は「請求なし」として記録済みです。金額を入力して保存すると通常の水道代に戻せます。
        </div>
      )}
    </>
  );
}

/* ═══════════════════════════════════════
   複数入力ビュー（立て替え / 割り勘）
   ═══════════════════════════════════════ */
function MultiEntryView({
  household, cat, yearMonth, expenses, settlement, addExpense, updateExpense, deleteExpense, isWarikan, m1, m2, user, openFormOnMount,
}: {
  household: Household;
  cat: Household['categories'][number];
  yearMonth: string;
  expenses: Expense[];
  settlement: Settlement | null;
  addExpense: (d: Omit<Expense, 'id' | 'createdAt' | 'createdBy'>) => Promise<DocumentReference<DocumentData> | undefined>;
  updateExpense: (id: string, d: Partial<Expense>) => Promise<void>;
  deleteExpense: (id: string) => Promise<void>;
  isWarikan: boolean;
  m1: string;
  m2: string;
  user: { uid: string } | null;
  openFormOnMount?: boolean;
}) {
  const [showForm, setShowForm] = useState(openFormOnMount ?? false);
  const [amountStr, setAmountStr] = useState('');
  const [note, setNote] = useState('');
  const [paidBy, setPaidBy] = useState(m1);
  const [splitA, setSplitA] = useState(isWarikan ? 60 : 0);
  const [splitB, setSplitB] = useState(isWarikan ? 40 : 100);
  const [editingExp, setEditingExp] = useState<Expense | null>(null);
  const [editAmountStr, setEditAmountStr] = useState('');
  const [editNote, setEditNote] = useState('');
  const [editPaidBy, setEditPaidBy] = useState(m1);
  const [newlyAddedId, setNewlyAddedId] = useState<string | null>(null);
  const [pendingRevealId, setPendingRevealId] = useState<string | null>(null);
  const amountInputRef = useRef<HTMLInputElement | null>(null);
  const expenseRowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const focusTimerRef = useRef<number | null>(null);
  const highlightTimerRef = useRef<number | null>(null);

  const amount = parseInt(amountStr, 10) || 0;
  const name1 = household.memberNames[m1] ?? 'メンバー1';
  const name2 = household.memberNames[m2] ?? 'メンバー2';
  const selectedPayerName = household.memberNames[paidBy] ?? 'メンバー';
  const noteSuggestions = isWarikan
    ? ['ごはん', '買い物', 'おでかけ', 'プレゼント']
    : ['ランチ', '日用品', '交通', '立替精算'];

  const isLocked = !!(settlement?.confirmed || settlement?.paidAt);

  // iOS: ボトムシート表示中はbodyスクロールをロック
  useEffect(() => {
    if (editingExp || showForm) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [editingExp, showForm]);

  const handleSlider = useCallback((val: number) => {
    setSplitA(val);
    setSplitB(100 - val);
  }, []);

  const focusAmountInput = useCallback(() => {
    const input = amountInputRef.current;
    if (!input) return;
    input.focus({ preventScroll: true });
    const cursorPosition = input.value.length;
    input.setSelectionRange(cursorPosition, cursorPosition);
  }, []);

  useEffect(() => {
    if (!showForm) return;

    const frameId = window.requestAnimationFrame(() => {
      focusAmountInput();
      focusTimerRef.current = window.setTimeout(() => {
        focusAmountInput();
        focusTimerRef.current = null;
      }, 220);
    });

    return () => {
      window.cancelAnimationFrame(frameId);
      if (focusTimerRef.current !== null) {
        window.clearTimeout(focusTimerRef.current);
        focusTimerRef.current = null;
      }
    };
  }, [focusAmountInput, showForm]);

  useEffect(() => {
    if (!pendingRevealId) return;

    const targetRow = expenseRowRefs.current[pendingRevealId];
    if (!targetRow) return;

    const frameId = window.requestAnimationFrame(() => {
      targetRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setNewlyAddedId(pendingRevealId);
      if (highlightTimerRef.current !== null) {
        window.clearTimeout(highlightTimerRef.current);
      }
      highlightTimerRef.current = window.setTimeout(() => {
        setNewlyAddedId((current) => (current === pendingRevealId ? null : current));
        highlightTimerRef.current = null;
      }, 2200);
      setPendingRevealId(null);
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [expenses, pendingRevealId]);

  useEffect(() => () => {
    if (focusTimerRef.current !== null) {
      window.clearTimeout(focusTimerRef.current);
    }
    if (highlightTimerRef.current !== null) {
      window.clearTimeout(highlightTimerRef.current);
    }
  }, []);

  const registerExpenseRow = useCallback((id: string, node: HTMLDivElement | null) => {
    if (node) {
      expenseRowRefs.current[id] = node;
      return;
    }
    delete expenseRowRefs.current[id];
  }, []);

  const openCreateSheet = useCallback(() => {
    setShowForm(true);
  }, []);

  const handleAdd = () => {
    if (amount === 0 || !user) return;

    let finalSplit: [number, number];
    let finalPaidBy: string;
    if (isWarikan) {
      finalSplit = [splitA, splitB];
      finalPaidBy = paidBy;
    } else {
      finalSplit = paidBy === m1 ? [0, 100] : [100, 0];
      finalPaidBy = paidBy;
    }
    const expenseData = {
      yearMonth,
      categoryId: cat.id,
      amount,
      paidBy: finalPaidBy,
      split: finalSplit,
      note,
    };
    const previousAmountStr = amountStr;
    const previousNote = note;

    // 楽観的UI: フォームを即座にリセット（onSnapshotでリストが更新される）
    setAmountStr('');
    setNote('');
    setShowForm(false);

    // バックグラウンドで書き込み（persistentLocalCacheがローカルに書き込み後にサーバー同期）
    addExpense(expenseData).then((docRef) => {
      // 追加成功→snapshot 反映後にスクロールとハイライトを実行
      if (docRef?.id) {
        setPendingRevealId(docRef.id);
      }
    }).catch((err) => {
      console.error('追加エラー:', err);
      setAmountStr(previousAmountStr);
      setNote(previousNote);
      setShowForm(true);
      alert('追加に失敗しました（再度お試しください）');
    });
  };

  const openEdit = (exp: Expense) => {
    if (isLocked) return;
    setEditingExp(exp);
    setEditAmountStr(String(exp.amount));
    setEditNote(exp.note || '');
    setEditPaidBy(exp.paidBy);
  };

  const handleEditSave = () => {
    if (!editingExp) return;
    const newAmount = parseInt(editAmountStr, 10) || 0;
    if (newAmount === 0) return;
    if (!window.confirm(`¥${newAmount.toLocaleString()} に更新しますか？`)) return;

    const updates: Partial<Expense> = {
      amount: newAmount,
      note: editNote,
      paidBy: editPaidBy,
    };
    if (!isWarikan) {
      updates.split = editPaidBy === m1 ? [0, 100] : [100, 0];
    }
    const targetId = editingExp.id;

    // 楽観的UI: シートを即座に閉じる
    setEditingExp(null);

    updateExpense(targetId, updates).catch((err) => {
      console.error('編集エラー:', err);
      alert('更新に失敗しました（再度お試しください）');
    });
  };

  const handleEditDelete = () => {
    if (!editingExp) return;
    if (!window.confirm(`この${isWarikan ? '割り勘' : '立替'}を削除しますか？この操作は取り消せません。`)) return;

    const targetId = editingExp.id;

    // 楽観的UI: シートを即座に閉じる
    setEditingExp(null);

    deleteExpense(targetId).catch((err) => {
      console.error('削除エラー:', err);
      alert('削除に失敗しました（再度お試しください）');
    });
  };

  const total = expenses.reduce((s, e) => s + e.amount, 0);
  const m1Total = expenses.filter((e) => e.paidBy === m1).reduce((s, e) => s + e.amount, 0);
  const m2Total = expenses.filter((e) => e.paidBy === m2).reduce((s, e) => s + e.amount, 0);
  const m1Should = Math.round(expenses.reduce((s, e) => s + e.amount * (e.split[0] / 100), 0));
  const diff = m1Total - m1Should;

  return (
    <>
      {/* ── ステータスバナー ── */}
      {isLocked && (
        <div className="status-banner locked">
          <span>{settlement?.paidAt ? '💸 振込済み' : '✅ 確定済み'}</span>
          <span className="status-banner-sub">編集・削除は取り下げ後に行えます</span>
        </div>
      )}

      {/* ── サマリー（差額ファースト） ── */}
      {expenses.length > 0 && (
        <div className="tatekae-summary">
          {diff !== 0 ? (
            <div className="tatekae-diff-hero">
              <div className="tatekae-diff-label">精算額</div>
              <div className="tatekae-diff-amount">{formatCurrency(Math.abs(diff))}</div>
              <div className="tatekae-diff-detail">
                {diff > 0
                  ? `${name2} → ${name1} へ支払い`
                  : `${name1} → ${name2} へ支払い`}
              </div>
            </div>
          ) : (
            <div className="tatekae-diff-hero">
              <div className="tatekae-diff-label">精算額</div>
              <div className="tatekae-diff-amount">¥0</div>
              <div className="tatekae-diff-detail">差額なし</div>
            </div>
          )}
          <div className="tatekae-bars">
            <div className="tatekae-bar-row">
              <span className="tatekae-bar-name">{name1}</span>
              <div className="tatekae-bar-track">
                <div
                  className="tatekae-bar-fill m1"
                  style={{ width: total > 0 ? `${(m1Total / total) * 100}%` : '0%' }}
                />
              </div>
              <span className="tatekae-bar-amount">{formatCurrency(m1Total)}</span>
            </div>
            <div className="tatekae-bar-row">
              <span className="tatekae-bar-name">{name2}</span>
              <div className="tatekae-bar-track">
                <div
                  className="tatekae-bar-fill m2"
                  style={{ width: total > 0 ? `${(m2Total / total) * 100}%` : '0%' }}
                />
              </div>
              <span className="tatekae-bar-amount">{formatCurrency(m2Total)}</span>
            </div>
          </div>
          <div className="tatekae-total">合計 {formatCurrency(total)}・{expenses.length}件</div>
        </div>
      )}

      {/* ── 明細リスト（タップで編集） ── */}
      {expenses.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          {!isLocked && (
            <div style={{
              padding: '8px 16px 4px', fontSize: 11, opacity: 0.4, textAlign: 'center',
            }}>タップして編集</div>
          )}
          <div className="multi-entry-list">
            <AnimatePresence initial={false}>
            {expenses.map((exp) => {
              const isNew = exp.id === newlyAddedId;
              const dateStr = exp.createdAt?.toDate
                ? exp.createdAt.toDate().toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })
                : null;
              return (
              <motion.div
                key={exp.id}
                ref={(node) => registerExpenseRow(exp.id, node)}
                className={`multi-entry-row ${isLocked ? 'locked' : ''}${isNew ? ' newly-added' : ''}`}
                onClick={() => openEdit(exp)}
                whileTap={isLocked ? undefined : { scale: 0.97 }}
                initial={{ opacity: 0, y: -10 }}
                animate={isNew
                  ? {
                    opacity: 1,
                    y: 0,
                    scale: [1, 1.015, 1],
                    backgroundColor: ['rgba(46,160,67,0.28)', 'rgba(46,160,67,0.06)', 'rgba(46,160,67,0)'],
                  }
                  : { opacity: 1, y: 0, backgroundColor: 'rgba(46,160,67,0)' }
                }
                transition={{ duration: 0.45 }}
                layout
              >
                <div className="multi-entry-info">
                  <span className="multi-entry-amount">{formatCurrency(exp.amount)}</span>
                  <span className="multi-entry-meta">
                    {household.memberNames[exp.paidBy] ?? '?'} {isWarikan ? '支払い' : '立替'}
                    {exp.note && ` · ${exp.note}`}
                    {dateStr && <span className="multi-entry-date">{dateStr}</span>}
                    {isNew && <span className="multi-entry-badge">追加済み</span>}
                  </span>
                </div>
                {!isLocked && <span style={{ fontSize: 14, opacity: 0.3 }}>›</span>}
              </motion.div>
              );
            })}
            </AnimatePresence>
          </div>
        </div>
      )}

      {/* ── 編集ボトムシート ── */}
      <AnimatePresence>
        {editingExp && (
          <>
            <motion.div
              className="bottom-sheet-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setEditingExp(null)}
            />
            <motion.div
              className="bottom-sheet"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            >
              <div className="bottom-sheet-handle" />
              <h3 style={{ textAlign: 'center', marginBottom: 16, fontSize: 16 }}>
                {isWarikan ? '割り勘を編集' : '立替を編集'}
              </h3>

              <div className="form-group">
                <label className="form-label">金額</label>
                <div className="entry-amount-display small">
                  <span className="currency">¥</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    className="entry-amount-input"
                    value={editAmountStr}
                    onChange={(e) => setEditAmountStr(e.target.value.replace(/\D/g, ''))}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">{isWarikan ? '支払った人' : '立て替えた人'}</label>
                <div className="payer-toggle">
                  {household.memberOrder.filter(Boolean).map((uid) => (
                    <button
                      key={uid}
                      className={`payer-btn${editPaidBy === uid ? ' active' : ''}`}
                      onClick={() => setEditPaidBy(uid)}
                    >
                      {household.memberNames[uid] ?? uid.slice(0, 6)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">メモ</label>
                <input
                  className="form-input"
                  value={editNote}
                  onChange={(e) => setEditNote(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
                <button
                  className="btn btn-danger"
                  style={{ flex: 1, minHeight: 48 }}
                  onClick={handleEditDelete}
                >
                  🗑 削除
                </button>
                <motion.button
                  className="btn btn-primary"
                  style={{ flex: 1, minHeight: 48 }}
                  onClick={handleEditSave}
                  disabled={(parseInt(editAmountStr, 10) || 0) === 0}
                  whileTap={{ scale: 0.97 }}
                >
                  保存
                </motion.button>
              </div>

              <button
                className="btn btn-secondary"
                style={{ width: '100%', marginTop: 8 }}
                onClick={() => setEditingExp(null)}
              >
                キャンセル
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── FAB：立替登録ボタン（常に画面下に固定） ── */}
      {!isLocked && (
        <motion.button
          className="tatekae-fab"
          onClick={openCreateSheet}
          whileTap={{ scale: 0.94 }}
          aria-label={`${cat.name}を登録`}
        >
          ＋
        </motion.button>
      )}

      {/* ── 追加ボトムシート ── */}
      <AnimatePresence>
        {showForm && (
          <>
            <motion.div
              className="bottom-sheet-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowForm(false)}
            />
            <motion.div
              className="bottom-sheet"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              onAnimationComplete={focusAmountInput}
            >
              <div className="bottom-sheet-handle" />
              <h3 style={{ textAlign: 'center', marginBottom: 16, fontSize: 16 }}>
                {isWarikan ? '割り勘を追加' : '立替を追加'}
              </h3>

              <div className="multi-entry-sheet-hero">
                <div className="multi-entry-sheet-kicker">{cat.emoji} {cat.name}</div>
                <div className="multi-entry-sheet-amount">
                  {amount > 0 ? formatCurrency(amount) : '金額を入力'}
                </div>
                <div className="multi-entry-sheet-detail">
                  {isWarikan ? `${selectedPayerName} が支払い` : `${selectedPayerName} が立て替え`}
                  {note ? ` · ${note}` : ' · 短いメモだと後から見返しやすいです'}
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">金額</label>
                <div className="entry-amount-display small">
                  <span className="currency">¥</span>
                  <input
                    ref={amountInputRef}
                    type="text"
                    inputMode="numeric"
                    enterKeyHint="done"
                    className="entry-amount-input"
                    value={amountStr}
                    onChange={(e) => setAmountStr(e.target.value.replace(/\D/g, ''))}
                    placeholder="0"
                  />
                </div>
                <div className="multi-entry-section-hint">シートを開いたらそのまま数字入力できます</div>
              </div>

              <div className="form-group">
                <label className="form-label">
                  {isWarikan ? '支払った人' : '立て替えた人'}
                </label>
                <div className="payer-toggle">
                  {household.memberOrder.filter(Boolean).map((uid) => (
                    <button
                      key={uid}
                      className={`payer-btn${paidBy === uid ? ' active' : ''}`}
                      onClick={() => setPaidBy(uid)}
                    >
                      {household.memberNames[uid] ?? uid.slice(0, 6)}
                    </button>
                  ))}
                </div>
                <div className="multi-entry-section-hint">現在は {selectedPayerName} を選択中</div>
              </div>

              {isWarikan && (
                <div className="form-group">
                  <label className="form-label">負担割合</label>
                  <div className="ratio-slider-container">
                    <div className="ratio-labels">
                      <span>{name1} {splitA}%</span>
                      <span>{name2} {splitB}%</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={5}
                      value={splitA}
                      onChange={(e) => handleSlider(parseInt(e.target.value, 10))}
                      className="ratio-slider"
                    />
                    <div className="ratio-presets">
                      {[
                        [50, 50], [60, 40], [40, 60], [70, 30], [100, 0],
                      ].map(([a, b]) => (
                        <button
                          key={`${a}:${b}`}
                          className={`ratio-preset-btn${splitA === a ? ' active' : ''}`}
                          onClick={() => { setSplitA(a); setSplitB(b); }}
                        >
                          {a}:{b}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <div className="form-group">
                <label className="form-label">メモ</label>
                <input
                  className="form-input"
                  placeholder={isWarikan ? '例: 夜ごはん、チケット、プレゼント' : '例: スーパー、ランチ、交通費'}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
                <div className="note-chip-list">
                  {noteSuggestions.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      className={`note-chip${note === suggestion ? ' active' : ''}`}
                      onClick={() => setNote((current) => (current === suggestion ? '' : suggestion))}
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
                <div className="multi-entry-section-hint">メモは任意ですが、1語あると一覧で探しやすくなります</div>
              </div>

              <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
                <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowForm(false)}>
                  キャンセル
                </button>
                <motion.button
                  className="btn btn-primary"
                  style={{ flex: 2 }}
                  onClick={handleAdd}
                  disabled={amount === 0}
                  whileTap={{ scale: 0.97 }}
                >
                  {formatCurrency(amount)} を追加
                </motion.button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
