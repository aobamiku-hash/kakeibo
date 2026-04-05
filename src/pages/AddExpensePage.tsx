import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useExpenses } from '../hooks/useExpenses';
import { currentYearMonth, formatCurrency } from '../utils/calculation';
import type { Household, Category } from '../types';

interface Props {
  household: Household;
}

const PRESET_SPLITS: { label: string; value: [number, number] }[] = [
  { label: '5:5', value: [50, 50] },
  { label: '6:4', value: [60, 40] },
  { label: '4:6', value: [40, 60] },
  { label: '全額', value: [100, 0] },
  { label: 'カスタム', value: [-1, -1] },
];

export default function AddExpensePage({ household }: Props) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const yearMonth = currentYearMonth();
  const { addExpense } = useExpenses(household, yearMonth);

  const [member1] = household.memberOrder;

  const [category, setCategory] = useState<Category | null>(null);
  const [amountStr, setAmountStr] = useState('');
  const [split, setSplit] = useState<[number, number]>([50, 50]);
  const [customA, setCustomA] = useState('50');
  const [customB, setCustomB] = useState('50');
  const [isCustom, setIsCustom] = useState(false);
  const [paidBy, setPaidBy] = useState(member1);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const amount = parseInt(amountStr, 10) || 0;

  const handleNumpad = useCallback((key: string) => {
    if (key === 'back') {
      setAmountStr((s) => s.slice(0, -1));
    } else if (key === 'C') {
      setAmountStr('');
    } else {
      setAmountStr((s) => {
        const next = s + key;
        if (next.length > 10) return s;
        return next;
      });
    }
  }, []);

  const handleSelectCategory = (cat: Category) => {
    setCategory(cat);
    setSplit(cat.defaultSplit);
    setIsCustom(false);
  };

  const handleSelectSplit = (preset: typeof PRESET_SPLITS[number]) => {
    if (preset.value[0] === -1) {
      setIsCustom(true);
    } else {
      setIsCustom(false);
      setSplit(preset.value);
    }
  };

  const handleSubmit = async () => {
    if (!category || amount === 0 || !user) return;

    const finalSplit: [number, number] = isCustom
      ? [parseInt(customA, 10) || 0, parseInt(customB, 10) || 0]
      : split;

    if (finalSplit[0] + finalSplit[1] !== 100) {
      alert('負担割合の合計が100%になるように入力してください');
      return;
    }

    setSubmitting(true);

    try {
      await addExpense({
        yearMonth,
        categoryId: category.id,
        amount,
        paidBy,
        split: finalSplit,
        note,
      });

      setDone(true);
      setTimeout(() => navigate('/'), 800);
    } catch (err) {
      console.error('登録エラー:', err);
      alert('登録に失敗しました');
    } finally {
      setSubmitting(false);
    }
  };

  /* ── Success Animation ── */
  if (done) {
    return (
      <div className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
          style={{ textAlign: 'center' }}
        >
          <div style={{ fontSize: 64 }}>✅</div>
          <p style={{ marginTop: 16, fontSize: 18, fontWeight: 600 }}>登録しました！</p>
        </motion.div>
      </div>
    );
  }

  return (
    <motion.div
      className="page"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      <h1 className="page-title">支出を追加</h1>

      {/* ── 金額表示 ── */}
      <div className="amount-display">
        <span className="currency">¥</span>
        <div className="amount-value">
          {amount > 0 ? amount.toLocaleString('ja-JP') : '0'}
        </div>
      </div>

      {/* ── カテゴリ ── */}
      <div className="page-subtitle">カテゴリ</div>
      <div className="category-grid">
        {household.categories.map((cat) => (
          <motion.button
            key={cat.id}
            className={`category-chip${category?.id === cat.id ? ' selected' : ''}`}
            onClick={() => handleSelectCategory(cat)}
            whileTap={{ scale: 0.95 }}
          >
            <span className="chip-emoji">{cat.emoji}</span>
            {cat.name}
          </motion.button>
        ))}
      </div>

      {/* ── 割り勘 ── */}
      <div className="page-subtitle">割り勘</div>
      <div className="split-selector">
        {PRESET_SPLITS.map((p) => (
          <button
            key={p.label}
            className={`split-pill${
              !isCustom && split[0] === p.value[0] && split[1] === p.value[1]
                ? ' selected'
                : isCustom && p.value[0] === -1
                  ? ' selected'
                  : ''
            }`}
            onClick={() => handleSelectSplit(p)}
          >
            {p.label}
          </button>
        ))}
      </div>

      <AnimatePresence>
        {isCustom && (
          <motion.div
            className="custom-ratio-input"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
          >
            <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
              {household.memberNames[household.memberOrder[0]]}
            </span>
            <input
              value={customA}
              onChange={(e) => setCustomA(e.target.value.replace(/\D/g, ''))}
              inputMode="numeric"
            />
            <span className="colon">:</span>
            <input
              value={customB}
              onChange={(e) => setCustomB(e.target.value.replace(/\D/g, ''))}
              inputMode="numeric"
            />
            <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
              {household.memberNames[household.memberOrder[1]]}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── 支払者 ── */}
      <div className="page-subtitle">支払った人</div>
      <div className="payer-toggle">
        {household.memberOrder.map((uid) => (
          <button
            key={uid}
            className={`payer-btn${paidBy === uid ? ' active' : ''}`}
            onClick={() => setPaidBy(uid)}
          >
            {household.memberNames[uid]}
          </button>
        ))}
      </div>

      {/* ── メモ ── */}
      <div className="note-row">
        <span>📝</span>
        <input
          placeholder="メモ（任意）"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>

      {/* ── テンキー ── */}
      <div className="numpad">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', 'back'].map(
          (key) => (
            <button
              key={key}
              className={`numpad-key${key === 'back' ? ' backspace' : ''}`}
              onClick={() => handleNumpad(key)}
            >
              {key === 'back' ? '⌫' : key}
            </button>
          ),
        )}
      </div>

      {/* ── 登録ボタン ── */}
      <motion.button
        className="btn btn-primary"
        style={{ marginTop: 16 }}
        onClick={handleSubmit}
        disabled={!category || amount === 0 || submitting}
        whileTap={{ scale: 0.97 }}
      >
        {submitting ? '登録中…' : `${formatCurrency(amount)} を登録`}
      </motion.button>
    </motion.div>
  );
}
