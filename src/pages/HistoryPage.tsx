import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { useNavigate } from 'react-router-dom';
import { formatYearMonth, formatCurrency } from '../utils/calculation';
import type { Household, Settlement } from '../types';

interface MonthRecord {
  yearMonth: string;
  expenseCount: number;
  total: number;
  settlement: Settlement | null;
}

interface Props {
  household: Household;
}

export default function HistoryPage({ household }: Props) {
  const navigate = useNavigate();
  const [records, setRecords] = useState<MonthRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!household) return;

    (async () => {
      // 全支出を取得
      const expSnap = await getDocs(
        query(collection(db, 'households', household.id, 'expenses'), orderBy('yearMonth', 'desc')),
      );

      // 月別集計
      const monthMap = new Map<string, { count: number; total: number }>();
      for (const d of expSnap.docs) {
        const data = d.data();
        const ym = data.yearMonth as string;
        const cur = monthMap.get(ym) ?? { count: 0, total: 0 };
        cur.count++;
        cur.total += data.amount as number;
        monthMap.set(ym, cur);
      }

      // 精算データ取得
      const setSnap = await getDocs(collection(db, 'households', household.id, 'settlements'));
      const settMap = new Map<string, Settlement>();
      for (const d of setSnap.docs) {
        settMap.set(d.id, d.data() as Settlement);
      }

      // 結合（確定済み/振込済みのみ表示）
      const list: MonthRecord[] = [];
      for (const [ym, { count, total }] of monthMap) {
        const sett = settMap.get(ym) ?? null;
        if (!sett?.confirmed) continue;
        list.push({
          yearMonth: ym,
          expenseCount: count,
          total: Math.round(total),
          settlement: sett,
        });
      }
      list.sort((a, b) => (b.yearMonth > a.yearMonth ? 1 : -1));
      setRecords(list);
      setLoading(false);
    })();
  }, [household]);

  const statusLabel = (s: Settlement | null) => {
    if (!s) return { text: '未確定', cls: 'badge-pending' };
    if (s.paidAt) return { text: '振込済み', cls: 'badge-paid' };
    if (s.confirmed) return { text: '確定済み', cls: 'badge-confirmed' };
    return { text: '未確定', cls: 'badge-pending' };
  };

  return (
    <div className="page">
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 16 }}>履歴</h1>

      {loading ? (
        <div className="loading-screen" style={{ minHeight: 200 }}>
          <div className="spinner" />
        </div>
      ) : records.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📜</div>
          <div className="empty-text">まだ記録がありません</div>
        </div>
      ) : (
        <div className="history-list">
          {records.map((r, i) => {
            const { text, cls } = statusLabel(r.settlement);
            return (
              <motion.div
                key={r.yearMonth}
                className="card history-row"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                onClick={() => navigate(`/kakeibo?ym=${r.yearMonth}`)}
              >
                <div className="history-left">
                  <div className="history-month">{formatYearMonth(r.yearMonth)}</div>
                  <div className="history-count">{r.expenseCount}件</div>
                </div>
                <div className="history-right">
                  <div className="history-total">{formatCurrency(r.total)}</div>
                  <span className={`history-badge ${cls}`}>{text}</span>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
