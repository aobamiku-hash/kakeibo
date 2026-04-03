import { useEffect, useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { useNavigate } from 'react-router-dom';
import { formatYearMonth, formatCurrency } from '../utils/calculation';
import type { Household, Expense, Settlement } from '../types';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  ArcElement,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Doughnut, Line } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, ArcElement, PointElement, LineElement, Tooltip, Legend, Filler);

interface MonthRecord {
  yearMonth: string;
  expenseCount: number;
  total: number;
  settlement: Settlement | null;
  byCat: Map<string, number>;
}

interface Props {
  household: Household;
}

type Tab = 'overview' | 'list';

export default function HistoryPage({ household }: Props) {
  const navigate = useNavigate();
  const [records, setRecords] = useState<MonthRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('overview');
  const [catScope, setCatScope] = useState<'month' | 'year' | 'all'>('month');



  useEffect(() => {
    if (!household) return;

    (async () => {
      const expSnap = await getDocs(
        query(collection(db, 'households', household.id, 'expenses'), orderBy('yearMonth', 'desc')),
      );

      const monthMap = new Map<string, { count: number; total: number; byCat: Map<string, number> }>();
      for (const d of expSnap.docs) {
        const data = d.data() as Expense;
        const ym = data.yearMonth;
        const cur = monthMap.get(ym) ?? { count: 0, total: 0, byCat: new Map() };
        cur.count++;
        cur.total += data.amount;
        cur.byCat.set(data.categoryId, (cur.byCat.get(data.categoryId) ?? 0) + data.amount);
        monthMap.set(ym, cur);
      }

      const setSnap = await getDocs(collection(db, 'households', household.id, 'settlements'));
      const settMap = new Map<string, Settlement>();
      for (const d of setSnap.docs) settMap.set(d.id, d.data() as Settlement);

      const list: MonthRecord[] = [];
      for (const [ym, v] of monthMap) {
        list.push({
          yearMonth: ym,
          expenseCount: v.count,
          total: Math.round(v.total),
          settlement: settMap.get(ym) ?? null,
          byCat: v.byCat,
        });
      }
      list.sort((a, b) => (b.yearMonth > a.yearMonth ? 1 : -1));
      setRecords(list);
      setLoading(false);
    })();
  }, [household]);

  // ── 確定済み月のみ使用（数値の正確性） ──
  const confirmed = useMemo(() => records.filter((r) => r.settlement?.confirmed), [records]);

  // ── 分析データ ──
  const recentMonths = useMemo(() => confirmed.slice(0, 12).reverse(), [confirmed]);

  // 月別トレンド（棒グラフ — 家計合計） は削除済み → 折れ線に統合

  // 3ヶ月移動平均（外れ値をIQR上下限でキャップ）
  const movingAvg3 = useMemo(() => {
    const sorted = confirmed.map((r) => r.total).sort((a, b) => a - b);
    const q1 = sorted[Math.floor(sorted.length * 0.25)] ?? 0;
    const q3 = sorted[Math.floor(sorted.length * 0.75)] ?? 0;
    const iqr = q3 - q1;
    const lower = q1 - 1.5 * iqr;
    const upper = q3 + 1.5 * iqr;
    const cap = (v: number) => Math.max(lower, Math.min(upper, v));
    return recentMonths.map((_, i, arr) => {
      if (i < 2) return null;
      return Math.round((cap(arr[i].total) + cap(arr[i - 1].total) + cap(arr[i - 2].total)) / 3);
    });
  }, [recentMonths, confirmed]);

  // 合計推移（折れ線）+ 移動平均
  const lineData = useMemo(() => ({
    labels: recentMonths.map((r) => {
      const [, m] = r.yearMonth.split('-');
      return `${parseInt(m)}月`;
    }),
    datasets: [
      {
        label: '月額支出',
        data: recentMonths.map((r) => r.total),
        borderColor: 'rgba(46,160,67,0.9)',
        backgroundColor: 'rgba(46,160,67,0.1)',
        tension: 0.3,
        fill: true,
        pointRadius: 4,
        pointBackgroundColor: '#2ea043',
      },
      {
        label: '3ヶ月移動平均',
        data: movingAvg3,
        borderColor: 'rgba(219,97,162,0.9)',
        backgroundColor: 'transparent',
        borderDash: [6, 3],
        tension: 0.4,
        fill: false,
        pointRadius: 2,
        pointBackgroundColor: '#db61a2',
      },
    ],
  }), [recentMonths, movingAvg3]);

  // カテゴリ円グラフ（スコープ切替対応）
  const catColors = [
    'rgba(46,160,67,0.8)', 'rgba(219,97,162,0.8)', 'rgba(212,168,67,0.8)',
    'rgba(88,166,255,0.8)', 'rgba(248,81,73,0.8)', 'rgba(163,113,247,0.8)',
    'rgba(255,159,28,0.8)',
  ];

  const catScopeRecords = useMemo(() => {
    if (confirmed.length === 0) return [];
    if (catScope === 'month') return [confirmed[0]]; // 直近月
    if (catScope === 'year') {
      const year = confirmed[0].yearMonth.split('-')[0];
      return confirmed.filter((r) => r.yearMonth.startsWith(year));
    }
    return confirmed; // all
  }, [confirmed, catScope]);

  const catData = useMemo(() => {
    const totals = new Map<string, number>();
    for (const r of catScopeRecords) {
      for (const [catId, amt] of r.byCat) {
        totals.set(catId, (totals.get(catId) ?? 0) + amt);
      }
    }
    const cats = household.categories
      .map((c) => ({ ...c, total: totals.get(c.id) ?? 0 }))
      .filter((c) => c.total > 0)
      .sort((a, b) => b.total - a.total);

    return {
      labels: cats.map((c) => `${c.emoji} ${c.name}`),
      datasets: [{
        data: cats.map((c) => c.total),
        backgroundColor: cats.map((_, i) => catColors[i % catColors.length]),
        borderWidth: 0,
      }],
      catList: cats,
    };
  }, [catScopeRecords, household.categories]);

  // カテゴリ前月比（各カテゴリの直近入力月と比較）
  const catMom = useMemo(() => {
    if (confirmed.length < 2) return [];
    const latest = confirmed[0];
    return household.categories
      .map((c) => {
        const currAmt = latest.byCat.get(c.id) ?? 0;
        // そのカテゴリの入力がある直近の「別の月」を探す
        const prevMonth = confirmed.find((r, i) => i > 0 && (r.byCat.get(c.id) ?? 0) > 0);
        const prevAmt = prevMonth ? (prevMonth.byCat.get(c.id) ?? 0) : 0;
        const diff = currAmt - prevAmt;
        const pct = prevAmt > 0 ? Math.round((diff / prevAmt) * 100) : currAmt > 0 ? 100 : 0;
        const prevYm = prevMonth?.yearMonth ?? '';
        return { ...c, currAmt: Math.round(currAmt), prevAmt: Math.round(prevAmt), diff: Math.round(diff), pct, prevYm };
      })
      .filter((c) => c.currAmt > 0 || c.prevAmt > 0)
      .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
  }, [confirmed, household.categories]);

  // 前月比
  const momChange = useMemo(() => {
    if (confirmed.length < 2) return null;
    const curr = confirmed[0].total;
    const prev = confirmed[1].total;
    if (prev === 0) return null;
    const pct = Math.round(((curr - prev) / prev) * 100);
    return { curr, prev, diff: curr - prev, pct };
  }, [confirmed]);

  // 中央値（外れ値に強い）
  const medianMonthly = useMemo(() => {
    if (confirmed.length === 0) return 0;
    const sorted = confirmed.map((r) => r.total).sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
      ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
      : sorted[mid];
  }, [confirmed]);

  // ── エンゲル係数（食費カテゴリ自動検出） ──
  const engelCoeff = useMemo(() => {
    const foodCats = household.categories.filter((c) => c.name.includes('食'));
    if (foodCats.length === 0) return null;
    const foodIds = new Set(foodCats.map((c) => c.id));
    let foodTotal = 0, grandTotal = 0;
    for (const r of confirmed) {
      grandTotal += r.total;
      for (const [catId, amt] of r.byCat) {
        if (foodIds.has(catId)) foodTotal += amt;
      }
    }
    if (grandTotal === 0) return null;
    return Math.round((foodTotal / grandTotal) * 1000) / 10; // 小数1桁
  }, [confirmed, household.categories]);

  // ── 線形回帰で来月予測（IQR法で外れ値除外） ──
  const prediction = useMemo(() => {
    if (confirmed.length < 3) return null;
    // IQR法で外れ値を除外
    const sorted = confirmed.map((r) => r.total).sort((a, b) => a - b);
    const q1 = sorted[Math.floor(sorted.length * 0.25)];
    const q3 = sorted[Math.floor(sorted.length * 0.75)];
    const iqr = q3 - q1;
    const lower = q1 - 1.5 * iqr;
    const upper = q3 + 1.5 * iqr;
    const filtered = [...confirmed].reverse().filter((r) => r.total >= lower && r.total <= upper);
    if (filtered.length < 2) return null;
    const n = filtered.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += filtered[i].total;
      sumXY += i * filtered[i].total;
      sumX2 += i * i;
    }
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    const nextVal = Math.round(intercept + slope * n);
    const trend = slope > 0 ? '増加傾向' : slope < 0 ? '減少傾向' : '横ばい';
    const excluded = confirmed.length - filtered.length;
    return { value: Math.max(0, nextVal), slope: Math.round(slope), trend, excluded };
  }, [confirmed]);

  // ── 前年同月比 ──
  const yoy = useMemo(() => {
    if (confirmed.length === 0) return null;
    const latest = confirmed[0];
    const [y, m] = latest.yearMonth.split('-');
    const lastYearYm = `${parseInt(y) - 1}-${m}`;
    const lastYear = confirmed.find((r) => r.yearMonth === lastYearYm);
    if (!lastYear) return null;
    const diff = latest.total - lastYear.total;
    const pct = lastYear.total > 0 ? Math.round((diff / lastYear.total) * 100) : 0;
    return { current: latest.total, past: lastYear.total, diff, pct, ym: lastYearYm, currentYm: latest.yearMonth };
  }, [confirmed]);

  const statusLabel = (s: Settlement | null) => {
    if (!s) return { text: '未確定', cls: 'badge-pending' };
    if (s.paidAt) return { text: '振込済み', cls: 'badge-paid' };
    if (s.confirmed) return { text: '確定済み', cls: 'badge-confirmed' };
    return { text: '未確定', cls: 'badge-pending' };
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { ticks: { color: '#9ba4b0', font: { size: 11 } }, grid: { display: false } },
      y: { ticks: { color: '#9ba4b0', font: { size: 11 }, callback: (v: unknown) => `¥${Number(v).toLocaleString()}` }, grid: { color: 'rgba(255,255,255,0.06)' } },
    },
  };

  const lineOptions = {
    ...chartOptions,
    plugins: { legend: { display: true, labels: { color: '#9ba4b0', font: { size: 11 }, usePointStyle: true, pointStyle: 'line' } } },
  };

  const doughnutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx: { label?: string; raw?: unknown }) => `${ctx.label}: ¥${Number(ctx.raw).toLocaleString()}`,
        },
      },
    },
    cutout: '60%',
  };

  return (
    <div className="page">
      {/* タブ切替 */}
      <div className="analysis-tabs">
        <button className={`analysis-tab ${tab === 'overview' ? 'active' : ''}`} onClick={() => setTab('overview')}>
          📊 分析
        </button>
        <button className={`analysis-tab ${tab === 'list' ? 'active' : ''}`} onClick={() => setTab('list')}>
          📜 月別一覧
        </button>
      </div>

      {loading ? (
        <div className="loading-screen" style={{ minHeight: 200 }}>
          <div className="spinner" />
        </div>
      ) : records.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📜</div>
          <div className="empty-text">まだ記録がありません</div>
        </div>
      ) : tab === 'overview' ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="analysis-content">
          {/* ── KPI カード（基本） ── */}
          <div className="kpi-row">
            <div className="kpi-card">
              <div className="kpi-label">月中央値</div>
              <div className="kpi-value">{formatCurrency(medianMonthly)}</div>
            </div>
            {momChange && (
              <div className="kpi-card">
                <div className="kpi-label">前月比</div>
                <div className={`kpi-value ${momChange.pct > 0 ? 'kpi-up' : momChange.pct < 0 ? 'kpi-down' : ''}`}>
                  {momChange.pct > 0 ? '↑' : momChange.pct < 0 ? '↓' : '→'} {Math.abs(momChange.pct)}%
                </div>
                <div className="kpi-sub">
                  {momChange.diff > 0 ? '+' : ''}{formatCurrency(momChange.diff)}
                </div>
              </div>
            )}
            {engelCoeff !== null && (
              <div className="kpi-card">
                <div className="kpi-label">エンゲル係数</div>
                <div className="kpi-value">{engelCoeff}%</div>
                <div className="kpi-sub">食費比率</div>
              </div>
            )}
            <div className="kpi-card">
              <div className="kpi-label">記録数</div>
              <div className="kpi-value">{confirmed.length}ヶ月</div>
            </div>
          </div>

          {/* ── 支出推移（折れ線 + 移動平均） ── */}
          <div className="card analysis-chart-card">
            <h3 className="analysis-chart-title">📈 支出推移 &amp; 移動平均</h3>
            <div className="analysis-chart-container">
              <Line data={lineData} options={lineOptions} />
            </div>
          </div>

          {/* ── カテゴリ比率（ドーナツ） ── */}
          <div className="card analysis-chart-card">
            <h3 className="analysis-chart-title">📊 カテゴリ別比率</h3>
            <div className="cat-scope-tabs">
              <button className={`cat-scope-btn ${catScope === 'month' ? 'active' : ''}`} onClick={() => setCatScope('month')}>月</button>
              <button className={`cat-scope-btn ${catScope === 'year' ? 'active' : ''}`} onClick={() => setCatScope('year')}>年</button>
              <button className={`cat-scope-btn ${catScope === 'all' ? 'active' : ''}`} onClick={() => setCatScope('all')}>累計</button>
            </div>
            {catScopeRecords.length > 0 && (
              <div className="cat-scope-label">
                {catScope === 'month'
                  ? formatYearMonth(catScopeRecords[0].yearMonth)
                  : catScope === 'year'
                    ? `${catScopeRecords[catScopeRecords.length - 1].yearMonth.split('-')[0]}年（${catScopeRecords.length}ヶ月）`
                    : `${formatYearMonth(catScopeRecords[catScopeRecords.length - 1].yearMonth)} 〜 ${formatYearMonth(catScopeRecords[0].yearMonth)}（${catScopeRecords.length}ヶ月）`}
              </div>
            )}
            <div className="analysis-doughnut-row">
              <div className="analysis-doughnut-chart">
                <Doughnut data={catData} options={doughnutOptions} />
              </div>
              <div className="analysis-cat-list">
                {catData.catList.map((c, i) => {
                  const total = catData.catList.reduce((s, x) => s + x.total, 0);
                  const pct = total > 0 ? Math.round((c.total / total) * 100) : 0;
                  return (
                    <div key={c.id} className="analysis-cat-item">
                      <span className="analysis-cat-dot" style={{ background: catData.datasets[0].backgroundColor[i] }} />
                      <span className="analysis-cat-name">{c.emoji} {c.name}</span>
                      <span className="analysis-cat-pct">{pct}%</span>
                      <span className="analysis-cat-amt">{formatCurrency(c.total)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ── カテゴリ前月比 ── */}
          {catMom.length > 0 && (
            <div className="card analysis-chart-card">
              <h3 className="analysis-chart-title">📉 カテゴリ増減</h3>
              <div className="cat-mom-list">
                {catMom.map((c) => (
                  <div key={c.id} className="cat-mom-item">
                    <span className="cat-mom-name">{c.emoji} {c.name}</span>
                    <span className="cat-mom-amounts">
                      {c.prevYm ? `${formatYearMonth(c.prevYm)}` : '—'} {formatCurrency(c.prevAmt)} → {formatCurrency(c.currAmt)}
                    </span>
                    <span className={`cat-mom-diff ${c.diff > 0 ? 'diff-up' : c.diff < 0 ? 'diff-down' : ''}`}>
                      {c.diff > 0 ? '↑' : c.diff < 0 ? '↓' : '→'} {c.diff !== 0 ? formatCurrency(Math.abs(c.diff)) : '±0'}
                      {c.pct !== 0 && ` (${c.pct > 0 ? '+' : ''}${c.pct}%)`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── 来月予測（線形回帰） ── */}
          {prediction && (
            <div className="card analysis-chart-card stat-highlight">
              <h3 className="analysis-chart-title">🔮 来月の予測</h3>
              <div className="prediction-body">
                <div className="prediction-value">{formatCurrency(prediction.value)}</div>
                <div className="prediction-detail">
                  <span className={`prediction-trend ${prediction.slope > 0 ? 'trend-up' : prediction.slope < 0 ? 'trend-down' : ''}`}>
                    {prediction.trend}
                  </span>
                  <span className="prediction-slope">
                    月あたり {prediction.slope > 0 ? '+' : ''}{formatCurrency(prediction.slope)}
                  </span>
                </div>
                <div className="prediction-note">
                  ※ 線形回帰による推計値（{confirmed.length}ヶ月分）
                  {prediction.excluded > 0 && `　外れ値${prediction.excluded}件除外`}
                </div>
              </div>
            </div>
          )}

          {/* ── 前年同月比 ── */}
          {yoy && (
            <div className="card analysis-chart-card">
              <h3 className="analysis-chart-title">📅 前年同月比</h3>
              <div className="yoy-body">
                <div className="yoy-row">
                  <span className="yoy-label">{formatYearMonth(yoy.ym)}</span>
                  <span className="yoy-val">{formatCurrency(yoy.past)}</span>
                </div>
                <div className="yoy-row">
                  <span className="yoy-label">{formatYearMonth(yoy.currentYm)}</span>
                  <span className="yoy-val">{formatCurrency(yoy.current)}</span>
                </div>
                <div className="yoy-diff-row">
                  <span className={`yoy-diff ${yoy.pct > 0 ? 'diff-up' : yoy.pct < 0 ? 'diff-down' : ''}`}>
                    {yoy.pct > 0 ? '↑' : yoy.pct < 0 ? '↓' : '→'} {Math.abs(yoy.pct)}%
                    （{yoy.diff > 0 ? '+' : ''}{formatCurrency(yoy.diff)}）
                  </span>
                </div>
              </div>
            </div>
          )}
        </motion.div>
      ) : (
        /* ── 月別リスト（既存） ── */
        <div className="history-list">
          {records
            .filter((r) => r.settlement?.confirmed)
            .map((r, i) => {
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
