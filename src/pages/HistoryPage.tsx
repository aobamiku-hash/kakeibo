import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { useNavigate } from 'react-router-dom';
import { formatYearMonth, formatCurrency } from '../utils/calculation';
import type { Household, Expense, Settlement } from '../types';
import { CREDIT_SUBCATEGORIES } from '../types';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  ArcElement,
  PointElement,
  LineElement,
  BarElement,
  Tooltip,
  Legend,
  Filler,
  type ChartOptions,
} from 'chart.js';
import zoomPlugin from 'chartjs-plugin-zoom';
import { Doughnut, Bar } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale, LinearScale, ArcElement, PointElement,
  LineElement, BarElement, Tooltip, Legend, Filler, zoomPlugin,
);

/* ═══ Types ═══ */
interface MonthRecord {
  yearMonth: string;
  expenseCount: number;
  total: number;
  settlement: Settlement | null;
  byCat: Map<string, number>;
  byCreditSubcat: Map<string, number>;
}

interface Props {
  household: Household;
}

type Tab = 'overview' | 'list';

/* ═══ Helpers ═══ */
const FOOD_SUBCATS = new Set(['grocery', 'dining']);


function computeEngel(records: MonthRecord[], foodCatIds: Set<string>): number | null {
  let foodTotal = 0, grandTotal = 0;
  for (const r of records) {
    grandTotal += r.total;
    for (const [catId, amt] of r.byCat) {
      if (foodCatIds.has(catId)) foodTotal += amt;
    }
    for (const [subcat, amt] of r.byCreditSubcat) {
      if (FOOD_SUBCATS.has(subcat)) foodTotal += amt;
    }
  }
  if (grandTotal === 0 || foodTotal === 0) return null;
  return Math.round((foodTotal / grandTotal) * 1000) / 10;
}

function computeMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid];
}

/* ═══ Component ═══ */
export default function HistoryPage({ household }: Props) {
  const navigate = useNavigate();
  const [records, setRecords] = useState<MonthRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('overview');
  const chartRef = useRef<ChartJS<'bar'>>(null);
  const [visibleRange, setVisibleRange] = useState<[number, number]>([0, 0]);
  const [hiddenCats, setHiddenCats] = useState<Set<string>>(new Set());
  const [fetchError, setFetchError] = useState<string | null>(null);

  /* ── Data fetch (onSnapshot — キャッシュから即座に返る) ── */
  useEffect(() => {
    if (!household) return;

    const settMap = new Map<string, Settlement>();
    let gotSettlements = false;

    const buildRecords = (
      monthMap: Map<string, { count: number; total: number; byCat: Map<string, number>; byCreditSubcat: Map<string, number> }>,
    ) => {
      const list: MonthRecord[] = [];
      for (const [ym, v] of monthMap) {
        list.push({
          yearMonth: ym, expenseCount: v.count, total: Math.round(v.total),
          settlement: settMap.get(ym) ?? null, byCat: v.byCat, byCreditSubcat: v.byCreditSubcat,
        });
      }
      list.sort((a, b) => (b.yearMonth > a.yearMonth ? 1 : -1));
      return list;
    };

    let latestMonthMap: Map<string, { count: number; total: number; byCat: Map<string, number>; byCreditSubcat: Map<string, number> }> = new Map();

    const unsubExp = onSnapshot(
      query(collection(db, 'households', household.id, 'expenses'), orderBy('yearMonth', 'desc')),
      (snap) => {
        const monthMap = new Map<string, { count: number; total: number; byCat: Map<string, number>; byCreditSubcat: Map<string, number> }>();
        for (const d of snap.docs) {
          const data = d.data() as Expense;
          const ym = data.yearMonth;
          const cur = monthMap.get(ym) ?? { count: 0, total: 0, byCat: new Map(), byCreditSubcat: new Map() };
          cur.count++;
          cur.total += data.amount;
          cur.byCat.set(data.categoryId, (cur.byCat.get(data.categoryId) ?? 0) + data.amount);
          if (data.categoryId === 'cat_4' && data.subcategory) {
            cur.byCreditSubcat.set(data.subcategory, (cur.byCreditSubcat.get(data.subcategory) ?? 0) + data.amount);
          }
          monthMap.set(ym, cur);
        }
        latestMonthMap = monthMap;
        if (gotSettlements) {
          setRecords(buildRecords(monthMap));
        }
        setLoading(false);
      },
      (err) => {
        console.error('HistoryPage expenses snapshot error:', err);
        setFetchError(err instanceof Error ? err.message : 'データ取得に失敗しました');
        setLoading(false);
      },
    );

    const unsubSet = onSnapshot(
      collection(db, 'households', household.id, 'settlements'),
      (snap) => {
        settMap.clear();
        for (const d of snap.docs) settMap.set(d.id, d.data() as Settlement);
        gotSettlements = true;
        if (latestMonthMap.size > 0) {
          setRecords(buildRecords(latestMonthMap));
        }
      },
      (err) => {
        console.error('HistoryPage settlements snapshot error:', err);
        // settlements取得失敗でも expenses だけで表示続行
        gotSettlements = true;
      },
    );

    return () => { unsubExp(); unsubSet(); };
  }, [household]);

  const confirmed = useMemo(() => records.filter(r => r.settlement?.confirmed), [records]);
  const allMonths = useMemo(() => [...confirmed].reverse(), [confirmed]);

  useEffect(() => {
    if (allMonths.length > 0) setVisibleRange([0, allMonths.length - 1]);
  }, [allMonths.length]);

  /* ── Visible slice ── */
  const visibleMonths = useMemo(() => {
    const [lo, hi] = visibleRange;
    return allMonths.slice(lo, hi + 1);
  }, [allMonths, visibleRange]);

  const foodCatIds = useMemo(
    () => new Set(household.categories.filter(c => c.name.includes('食')).map(c => c.id)),
    [household.categories],
  );

  /* ── Range KPIs ── */
  const rangeKpis = useMemo(() => {
    if (visibleMonths.length === 0) return null;
    const totals = visibleMonths.map(r => r.total);
    const median = computeMedian(totals);
    const engel = computeEngel(visibleMonths, foodCatIds);

    const firstYm = visibleMonths[0].yearMonth;
    const lastYm = visibleMonths[visibleMonths.length - 1].yearMonth;

    return { median, engel, monthCount: visibleMonths.length, firstYm, lastYm };
  }, [visibleMonths, foodCatIds]);

  /* ── Category breakdown ── */
  const catColors = [
    'rgba(46,160,67,0.8)', 'rgba(219,97,162,0.8)', 'rgba(212,168,67,0.8)',
    'rgba(88,166,255,0.8)', 'rgba(248,81,73,0.8)', 'rgba(163,113,247,0.8)',
    'rgba(255,159,28,0.8)',
  ];

  const catBreakdown = useMemo(() => {
    const totals = new Map<string, number>();
    for (const r of visibleMonths) {
      for (const [catId, amt] of r.byCat) totals.set(catId, (totals.get(catId) ?? 0) + amt);
    }
    return household.categories
      .map(c => ({ ...c, total: totals.get(c.id) ?? 0 }))
      .filter(c => c.total > 0)
      .sort((a, b) => b.total - a.total);
  }, [visibleMonths, household.categories]);

  const catDoughnut = useMemo(() => ({
    labels: catBreakdown.map(c => `${c.emoji} ${c.name}`),
    datasets: [{
      data: catBreakdown.map(c => c.total),
      backgroundColor: catBreakdown.map((_, i) => catColors[i % catColors.length]),
      borderWidth: 0,
    }],
  }), [catBreakdown]);

  /* ── Credit subcat breakdown ── */
  const creditSubcats = useMemo(() => {
    const totals = new Map<string, number>();
    for (const r of visibleMonths) {
      for (const [subcat, amt] of r.byCreditSubcat) totals.set(subcat, (totals.get(subcat) ?? 0) + amt);
    }
    if (totals.size === 0) return null;
    const items = [...totals.entries()]
      .map(([key, total]) => ({ key, ...(CREDIT_SUBCATEGORIES[key] ?? { name: key, emoji: '📝' }), total }))
      .sort((a, b) => b.total - a.total);
    return { items, grandTotal: items.reduce((s, i) => s + i.total, 0) };
  }, [visibleMonths]);


  /* ── Top 3 + その他 for chart ── */
  const chartCats = useMemo(() => {
    const totals = new Map<string, number>();
    for (const r of allMonths) {
      for (const [catId, amt] of r.byCat) totals.set(catId, (totals.get(catId) ?? 0) + amt);
    }
    const sorted = household.categories
      .map(c => ({ ...c, total: totals.get(c.id) ?? 0 }))
      .filter(c => c.total > 0)
      .sort((a, b) => b.total - a.total);
    const top3 = sorted.slice(0, 3);
    const rest = sorted.slice(3);
    const otherTotal = rest.reduce((s, c) => s + c.total, 0);
    const result: Array<{ id: string; name: string; emoji: string; catIds: string[] }> = top3.map(c => ({
      id: c.id, name: c.name, emoji: c.emoji, catIds: [c.id],
    }));
    if (otherTotal > 0) {
      result.push({ id: '__other__', name: 'その他', emoji: '···', catIds: rest.map(c => c.id) });
    }
    return result;
  }, [allMonths, household.categories]);

  const chartColors = [
    { fill: 'rgba(46,160,67,0.7)', border: 'rgba(46,160,67,1)' },
    { fill: 'rgba(219,97,162,0.7)', border: 'rgba(219,97,162,1)' },
    { fill: 'rgba(88,166,255,0.7)', border: 'rgba(88,166,255,1)' },
    { fill: 'rgba(160,160,170,0.5)', border: 'rgba(160,160,170,0.8)' },
  ];

  const toggleCat = useCallback((catId: string) => {
    setHiddenCats(prev => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId); else next.add(catId);
      return next;
    });
  }, []);

  /* ── Main chart data (stacked bar) ── */
  const mainChartData = useMemo(() => ({
    labels: allMonths.map(r => {
      const [y, m] = r.yearMonth.split('-');
      return allMonths.length > 12 ? `${y.slice(2)}/${parseInt(m)}` : `${parseInt(m)}月`;
    }),
    datasets: chartCats.map((cat, i) => ({
      label: `${cat.emoji} ${cat.name}`,
      data: allMonths.map(r => {
        if (hiddenCats.has(cat.id)) return 0;
        return cat.catIds.reduce((s, cid) => s + (r.byCat.get(cid) ?? 0), 0);
      }),
      backgroundColor: chartColors[i % chartColors.length].fill,
      borderColor: chartColors[i % chartColors.length].border,
      borderWidth: 1,
      borderRadius: 2,
      borderSkipped: false as const,
    })),
  }), [allMonths, chartCats, hiddenCats]);

  /* ── zoom/pan callbacks ── */
  const handleZoomPanComplete = useCallback(({ chart }: { chart: ChartJS }) => {
    const xScale = chart.scales['x'];
    if (!xScale) return;
    const lo = Math.max(0, Math.floor(xScale.min));
    const hi = Math.min(allMonths.length - 1, Math.ceil(xScale.max));
    setVisibleRange([lo, hi]);
  }, [allMonths.length]);

  const handleResetZoom = useCallback(() => {
    chartRef.current?.resetZoom();
    setVisibleRange([0, allMonths.length - 1]);
  }, [allMonths.length]);

  /* ── Chart options ── */
  const mainChartOptions: ChartOptions<'bar'> = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index' as const, intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) => `${ctx.dataset.label}: ¥${Number(ctx.raw ?? 0).toLocaleString()}`,
          footer: (items) => {
            const total = items.reduce((s, i) => s + (Number(i.raw) || 0), 0);
            return `合計: ¥${total.toLocaleString()}`;
          },
        },
      },
      zoom: {
        pan: { enabled: true, mode: 'x', onPanComplete: handleZoomPanComplete },
        zoom: {
          wheel: { enabled: true },
          pinch: { enabled: true },
          drag: {
            enabled: true,
            backgroundColor: 'rgba(46,160,67,0.12)',
            borderColor: 'rgba(46,160,67,0.4)',
            borderWidth: 1,
          },
          mode: 'x',
          onZoomComplete: handleZoomPanComplete,
        },
      },
    },
    scales: {
      x: { stacked: true, ticks: { color: '#9ba4b0', font: { size: 10 }, maxRotation: 0 }, grid: { display: false } },
      y: {
        stacked: true,
        ticks: { color: '#9ba4b0', font: { size: 10 }, callback: (v) => `¥${Number(v).toLocaleString()}` },
        grid: { color: 'rgba(255,255,255,0.04)' },
      },
    },
  }), [handleZoomPanComplete]);


  const doughnutOptions: ChartOptions<'doughnut'> = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: { label: (ctx) => `${ctx.label}: ¥${Number(ctx.raw ?? 0).toLocaleString()}` },
      },
    },
    cutout: '62%',
  }), []);

  const statusLabel = (s: Settlement | null) => {
    if (!s) return { text: '未確定', cls: 'badge-pending' };
    if (s.paidAt) return { text: '振込済み', cls: 'badge-paid' };
    if (s.confirmed) return { text: '確定済み', cls: 'badge-confirmed' };
    return { text: '未確定', cls: 'badge-pending' };
  };

  /* ═══ Render ═══ */
  return (
    <div className="page">
      <div className="analysis-tabs">
        <button className={`analysis-tab ${tab === 'overview' ? 'active' : ''}`} onClick={() => setTab('overview')}>
          📊 分析
        </button>
        <button className={`analysis-tab ${tab === 'list' ? 'active' : ''}`} onClick={() => setTab('list')}>
          📜 月別一覧
        </button>
      </div>

      {loading ? (
        <div className="loading-screen" style={{ minHeight: 200 }}><div className="spinner" /></div>
      ) : fetchError ? (
        <div className="empty-state">
          <div className="empty-icon">⚠️</div>
          <div className="empty-text">{fetchError}</div>
        </div>
      ) : records.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📜</div>
          <div className="empty-text">まだ記録がありません</div>
        </div>
      ) : tab === 'overview' ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="analysis-content">

          {/* ═══ 1. メインチャート ═══ */}
          <div className="card analysis-chart-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 className="analysis-chart-title" style={{ margin: 0 }}>📈 支出推移</h3>
              {visibleRange[1] - visibleRange[0] < allMonths.length - 1 && (
                <button className="range-reset-btn" onClick={handleResetZoom}>全期間</button>
              )}
            </div>
            <div className="zoom-hint">ドラッグで範囲選択 · ピンチで拡大</div>
            <div className="chart-filter-chips">
              {chartCats.map((cat, i) => (
                <button
                  key={cat.id}
                  className={`chart-chip ${hiddenCats.has(cat.id) ? 'chart-chip-off' : ''}`}
                  style={{ '--chip-color': chartColors[i % chartColors.length].border } as React.CSSProperties}
                  onClick={() => toggleCat(cat.id)}
                >
                  {cat.emoji} {cat.name}
                </button>
              ))}
            </div>
            <div className="analysis-chart-container" style={{ height: 320, touchAction: 'none' }}>
              <Bar ref={chartRef} data={mainChartData} options={mainChartOptions} />
            </div>
            {rangeKpis && (
              <div className="range-label">
                {rangeKpis.monthCount === allMonths.length
                  ? `全期間（${rangeKpis.monthCount}ヶ月）`
                  : `${formatYearMonth(rangeKpis.firstYm)} 〜 ${formatYearMonth(rangeKpis.lastYm)}（${rangeKpis.monthCount}ヶ月）`}
              </div>
            )}
          </div>

          {/* ═══ 2. 期間KPI ═══ */}
          {rangeKpis && (
            <div className="kpi-row" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <div className="kpi-card">
                <div className="kpi-label">中央値</div>
                <div className="kpi-value">{formatCurrency(rangeKpis.median)}</div>
              </div>
              {rangeKpis.engel !== null && (
                <div className="kpi-card">
                  <div className="kpi-label">エンゲル係数</div>
                  <div className="kpi-value">{rangeKpis.engel}%</div>
                </div>
              )}
            </div>
          )}

          {/* ═══ 3. カテゴリ内訳 ═══ */}
          <div className="card analysis-chart-card">
            <h3 className="analysis-chart-title">
              📊 カテゴリ内訳
              {rangeKpis && rangeKpis.monthCount < allMonths.length && (
                <span className="range-badge">{formatYearMonth(rangeKpis.firstYm)}〜{formatYearMonth(rangeKpis.lastYm)}</span>
              )}
            </h3>
            <div className="analysis-doughnut-row">
              <div className="analysis-doughnut-chart">
                <Doughnut data={catDoughnut} options={doughnutOptions} />
              </div>
              <div className="analysis-cat-list">
                {catBreakdown.map((c, i) => {
                  const total = catBreakdown.reduce((s, x) => s + x.total, 0);
                  const pct = total > 0 ? Math.round((c.total / total) * 100) : 0;
                  return (
                    <div key={c.id} className="analysis-cat-item">
                      <span className="analysis-cat-dot" style={{ background: catDoughnut.datasets[0].backgroundColor[i] }} />
                      <span className="analysis-cat-name">{c.emoji} {c.name}</span>
                      <span className="analysis-cat-pct">{pct}%</span>
                      <span className="analysis-cat-amt">{formatCurrency(c.total)}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {creditSubcats && (
              <div className="credit-subcat-section">
                <div className="credit-subcat-header">
                  <span>💳</span>
                  <span>クレジット内訳</span>
                  <span style={{ opacity: 0.5, marginLeft: 'auto' }}>{formatCurrency(creditSubcats.grandTotal)}</span>
                </div>
                {creditSubcats.items.map(item => {
                  const pct = creditSubcats.grandTotal > 0
                    ? Math.round((item.total / creditSubcats.grandTotal) * 100) : 0;
                  return (
                    <div key={item.key} className="credit-subcat-row">
                      <span className="credit-subcat-emoji">{item.emoji}</span>
                      <span className="credit-subcat-name">{item.name}</span>
                      <div className="credit-subcat-bar-track">
                        <div className="credit-subcat-bar-fill" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="credit-subcat-pct">{pct}%</span>
                      <span className="credit-subcat-amt">{formatCurrency(item.total)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>



        </motion.div>
      ) : (
        /* ── 月別一覧 ── */
        <div className="history-list">
          {records
            .filter(r => r.settlement?.confirmed)
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
