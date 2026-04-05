import { motion, useMotionValue, useTransform, animate } from 'framer-motion';
import { useEffect, useRef } from 'react';
import type { Household } from '../types';
import type { MonthSummary } from '../utils/calculation';
import { formatCurrency } from '../utils/calculation';

function AnimatedCurrency({ value, className }: { value: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const motionVal = useMotionValue(0);
  const display = useTransform(motionVal, (v) => formatCurrency(Math.round(v)));

  useEffect(() => {
    const controls = animate(motionVal, value, { duration: 0.8, ease: [0.25, 0.46, 0.45, 0.94] });
    return controls.stop;
  }, [value, motionVal]);

  useEffect(() => {
    const unsub = display.on('change', (v) => {
      if (ref.current) ref.current.textContent = v;
    });
    return unsub;
  }, [display]);

  return <span ref={ref} className={className}>{formatCurrency(value)}</span>;
}

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
      {/* ── 負担額ヒーロー ── */}
      <div className="settlement-hero">
        <div className="settlement-label">
          {amount === 0 ? '精算なし ✨' : `${from} → ${to}`}
        </div>
        {amount > 0 && (
          <div className="settlement-amount">
            <AnimatedCurrency value={amount} />
          </div>
        )}
      </div>

      {/* ── 合計 + 人別サブ情報 ── */}
      <div className="summary-sub-row">
        <div className="summary-sub-item">
          <span className="summary-sub-label">合計</span>
          <span className="summary-sub-value"><AnimatedCurrency value={summary.totalAmount} /></span>
        </div>
        <div className="summary-sub-item">
          <span className="summary-sub-label">{name1}</span>
          <span className="summary-sub-value"><AnimatedCurrency value={summary.member1Should} /></span>
        </div>
        <div className="summary-sub-item">
          <span className="summary-sub-label">{name2}</span>
          <span className="summary-sub-value"><AnimatedCurrency value={summary.member2Should} /></span>
        </div>
      </div>

      {/* ── カテゴリダイジェスト ── */}
      {summary.byCategory.length > 0 && (
        <div className="cat-digest-grid">
          {summary.byCategory.map(({ category, total }) => (
            <div key={category.id} className="cat-digest-tile">
              <span className="cat-digest-emoji">{category.emoji}</span>
              <span className="cat-digest-name">{category.name}</span>
              <span className="cat-digest-amount">{formatCurrency(total)}</span>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}
