import { useState } from 'react';
import { collection, writeBatch, doc, Timestamp, getDocs, query, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import type { Household } from '../types';
import importData from '../data/importData.json';

const PLACEHOLDER_UID = 'pending_member2';
const OLD_PLACEHOLDER = '__pending_member2__';

interface RawExpense {
  yearMonth: string;
  categoryId: string;
  categoryName: string;
  amount: number;
  paidBy: string; // "shinpei" | "yuka"
  split: [number, number];
  note: string;
}

interface RawSettlement {
  yearMonth: string;
  confirmed: boolean;
  confirmedBy: string[];
  paidAt: boolean;
  paidBy: string;
}

interface Props {
  household: Household;
}

export default function ImportPage({ household }: Props) {
  const { user } = useAuth();
  const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState('');

  const rawData = importData as { expenses: RawExpense[]; settlements?: RawSettlement[] };
  const expenses = rawData.expenses;
  const settlements = rawData.settlements ?? [];

  // memberOrder[0] = しんぺい(最初に作成), memberOrder[1] = ゆか or placeholder
  const [m1, m2] = household.memberOrder;
  const member2Uid = m2 ?? PLACEHOLDER_UID;
  const name1 = household.memberNames[m1] ?? 'メンバー1';
  const name2 = household.memberNames[member2Uid] ?? 'ゆか';

  const uidMap: Record<string, string> = {
    shinpei: m1,
    yuka: member2Uid,
  };

  const handleImport = async () => {
    if (!user) return;
    if (!window.confirm('既存データを全て削除してからインポートします。\nこの操作は取り消せません。実行しますか？')) return;
    setStatus('running');
    setProgress(0);

    try {
      // ── 0. プレースホルダー移行＆member2追加 ──
      // __pending_member2__ はFirestoreの予約語（__接頭辞）のためupdateDocで操作不可
      // memberNames全体を上書きして古いキーを除去
      const hasOldPlaceholder = household.memberOrder.includes(OLD_PLACEHOLDER);
      if (!m2 || hasOldPlaceholder) {
        const cleanNames: Record<string, string> = {};
        for (const [k, v] of Object.entries(household.memberNames)) {
          if (k === OLD_PLACEHOLDER) continue; // 旧プレースホルダーは除去
          cleanNames[k] = v;
        }
        cleanNames[PLACEHOLDER_UID] = 'ゆか';
        // mergeFields で memberNames, memberOrder のみ完全上書き
        await setDoc(doc(db, 'households', household.id), {
          memberOrder: [m1, PLACEHOLDER_UID],
          memberNames: cleanNames,
        }, { mergeFields: ['memberOrder', 'memberNames'] });
      }
      // ── 1. 既存データ全削除 ──
      setMessage('既存データを削除中…');
      const expCol = collection(db, 'households', household.id, 'expenses');
      const existing = await getDocs(query(expCol));
      if (!existing.empty) {
        const batchSize = 400;
        const docs = existing.docs;
        for (let i = 0; i < docs.length; i += batchSize) {
          const batch = writeBatch(db);
          docs.slice(i, i + batchSize).forEach((d) => batch.delete(d.ref));
          await batch.commit();
        }
        setMessage(`${docs.length} 件の既存データを削除しました`);
      }

      // 精算データも削除
      const settCol = collection(db, 'households', household.id, 'settlements');
      const existingSett = await getDocs(query(settCol));
      if (!existingSett.empty) {
        const batch = writeBatch(db);
        existingSett.docs.forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }

      // ── 2. 新データをインポート ──
      const importBatchSize = 400;
      let processed = 0;

      for (let i = 0; i < expenses.length; i += importBatchSize) {
        const chunk = expenses.slice(i, i + importBatchSize);
        const batch = writeBatch(db);

        for (const exp of chunk) {
          const ref = doc(collection(db, 'households', household.id, 'expenses'));
          batch.set(ref, {
            yearMonth: exp.yearMonth,
            categoryId: exp.categoryId,
            amount: exp.amount,
            paidBy: uidMap[exp.paidBy] ?? m1,
            split: exp.split,
            note: exp.note || '',
            createdAt: Timestamp.now(),
            createdBy: user.uid,
          });
        }

        await batch.commit();
        processed += chunk.length;
        setProgress(Math.round((processed / expenses.length) * 100));
        setMessage(`${processed} / ${expenses.length} 件完了`);
      }

      // ── 3. 精算データをインポート ──
      if (settlements.length > 0) {
        setMessage('精算データをインポート中…');
        const settBatch = writeBatch(db);
        for (const s of settlements) {
          const ref = doc(db, 'households', household.id, 'settlements', s.yearMonth);
          settBatch.set(ref, {
            yearMonth: s.yearMonth,
            confirmed: s.confirmed,
            confirmedBy: [m1],
            confirmedAt: Timestamp.now(),
            ...(s.paidAt ? { paidAt: Timestamp.now(), paidBy: member2Uid } : {}),
          });
        }
        await settBatch.commit();
      }

      setStatus('done');
      setMessage(`${expenses.length} 件 + 精算 ${settlements.length} 件のインポートが完了しました！`);
    } catch (err) {
      setStatus('error');
      setMessage(`エラー: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // カテゴリ別にグループ化してプレビュー
  const byCat: Record<string, number> = {};
  const byMonth: Record<string, number> = {};
  for (const e of expenses) {
    byCat[e.categoryName] = (byCat[e.categoryName] ?? 0) + e.amount;
    byMonth[e.yearMonth] = (byMonth[e.yearMonth] ?? 0) + 1;
  }

  return (
    <div className="page" style={{ paddingBottom: 120 }}>
      <h1 className="page-title">データインポート</h1>

      {/* UID マッピング確認 */}
      <div className="page-subtitle">メンバーマッピング</div>
      <div className="card settings-group">
        <div className="settings-item">
          <span className="label">shinpei →</span>
          <span className="value">{name1} ({m1?.slice(0, 8)}…)</span>
        </div>
        <div className="settings-item">
          <span className="label">yuka →</span>
          <span className="value">{m2 ? `${name2} (${m2.slice(0, 8)}…)` : '未参加'}</span>
        </div>
      </div>

      {/* データサマリ */}
      <div className="page-subtitle">インポート対象: {expenses.length} 件</div>
      <div className="card settings-group">
        {Object.entries(byCat).map(([cat, total]) => (
          <div className="settings-item" key={cat}>
            <span className="label">{cat}</span>
            <span className="value">¥{total.toLocaleString()}</span>
          </div>
        ))}
      </div>

      <div className="page-subtitle">月別件数</div>
      <div className="card settings-group" style={{ maxHeight: 200, overflow: 'auto' }}>
        {Object.entries(byMonth)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([ym, count]) => (
            <div className="settings-item" key={ym}>
              <span className="label">{ym}</span>
              <span className="value">{count} 件</span>
            </div>
          ))}
      </div>

      {/* 実行ボタン */}
      <div style={{ marginTop: 24 }}>
        {status === 'idle' && (
          <button className="btn btn-primary" onClick={handleImport}>
            インポート開始
          </button>
        )}
        {status === 'running' && (
          <div>
            <div style={{
              background: 'var(--color-bg-secondary)',
              borderRadius: 8,
              height: 8,
              overflow: 'hidden',
              marginBottom: 8,
            }}>
              <div style={{
                background: 'var(--color-accent)',
                width: `${progress}%`,
                height: '100%',
                transition: 'width 0.3s',
              }} />
            </div>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: 14 }}>{message}</p>
          </div>
        )}
        {status === 'done' && (
          <div className="card" style={{ background: '#34C75920', color: '#34C759', textAlign: 'center', padding: 24 }}>
            ✅ {message}
          </div>
        )}
        {status === 'error' && (
          <div className="card" style={{ background: '#FF3B3020', color: '#FF3B30', padding: 16 }}>
            ❌ {message}
            <button className="btn btn-secondary" style={{ marginTop: 8 }} onClick={() => setStatus('idle')}>
              再試行
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
