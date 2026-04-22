import { useEffect, useState, useCallback } from 'react';
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  Timestamp,
  setDoc,
  deleteField,
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import type { Expense, Settlement, Household } from '../types';

export function useExpenses(household: Household | null, yearMonth: string) {
  const { user } = useAuth();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [settlement, setSettlement] = useState<Settlement | null>(null);
  const [loading, setLoading] = useState(true);

  /* ── 支出リアルタイム監視 ── */
  useEffect(() => {
    if (!household) {
      setExpenses([]);
      setLoading(false);
      return;
    }

    // 月切り替え時にリセット（旧月データの残留を防止）
    setLoading(true);
    setExpenses([]);

    const timeout = setTimeout(() => setLoading(false), 8000);

    const q = query(
      collection(db, 'households', household.id, 'expenses'),
      where('yearMonth', '==', yearMonth),
      orderBy('createdAt', 'desc'),
    );

    const unsub = onSnapshot(q, (snap) => {
      clearTimeout(timeout);
      const items = snap.docs.map(
        (d) => ({ id: d.id, ...d.data() }) as Expense,
      );
      setExpenses(items);
      setLoading(false);
    }, (err) => {
      clearTimeout(timeout);
      console.error('expenses onSnapshot error:', err);
      setLoading(false);
    });
    return () => { unsub(); clearTimeout(timeout); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [household?.id, yearMonth]);

  /* ── 精算ステータス監視 ── */
  useEffect(() => {
    if (!household) {
      setSettlement(null);
      return;
    }

    // 月切り替え時にリセット
    setSettlement(null);

    const unsub = onSnapshot(
      doc(db, 'households', household.id, 'settlements', yearMonth),
      (snap) => {
        if (snap.exists()) {
          setSettlement(snap.data() as Settlement);
        } else {
          setSettlement(null);
        }
      },
      (err) => {
        console.error('settlement onSnapshot error:', err);
      },
    );
    return unsub;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [household?.id, yearMonth]);

  /* ── 支出追加 ── */
  const addExpense = useCallback(
    async (data: Omit<Expense, 'id' | 'createdAt' | 'createdBy'>) => {
      if (!household || !user) return;
      return addDoc(collection(db, 'households', household.id, 'expenses'), {
        ...data,
        createdAt: Timestamp.now(),
        createdBy: user.uid,
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [household?.id, user?.uid],
  );

  /* ── 支出更新 ── */
  const updateExpense = useCallback(
    async (id: string, data: Partial<Expense>) => {
      if (!household) return;
      await updateDoc(
        doc(db, 'households', household.id, 'expenses', id),
        data,
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [household?.id],
  );

  /* ── 支出削除 ── */
  const deleteExpense = useCallback(
    async (id: string) => {
      if (!household) return;
      await deleteDoc(
        doc(db, 'households', household.id, 'expenses', id),
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [household?.id],
  );

  /* ── 月を確定（管理者が1人で確定） ── */
  const confirmSettlement = useCallback(
    async (allCatsEntered: boolean) => {
      if (!household || !user) return;
      if (!allCatsEntered) {
        throw new Error('全カテゴリが入力されていません');
      }
      const ref = doc(
        db,
        'households',
        household.id,
        'settlements',
        yearMonth,
      );
      await setDoc(ref, {
        yearMonth,
        confirmed: true,
        confirmedBy: [user.uid],
        confirmedAt: Timestamp.now(),
      }, { merge: true });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [household?.id, user?.uid, yearMonth],
  );

  /* ── 確定取り下げ ── */
  const unconfirmSettlement = useCallback(
    async () => {
      if (!household || !user) return;
      const ref = doc(db, 'households', household.id, 'settlements', yearMonth);
      await updateDoc(ref, {
        confirmed: false,
        confirmedBy: [],
        confirmedAt: deleteField(),
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [household?.id, user?.uid, yearMonth],
  );

  /* ── 振込報告取り下げ ── */
  const unpaySettlement = useCallback(
    async () => {
      if (!household || !user) return;
      const ref = doc(db, 'households', household.id, 'settlements', yearMonth);
      await updateDoc(ref, {
        paidAt: deleteField(),
        paidBy: deleteField(),
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [household?.id, user?.uid, yearMonth],
  );

  return {
    expenses,
    settlement,
    loading,
    addExpense,
    updateExpense,
    deleteExpense,
    confirmSettlement,
    unconfirmSettlement,
    unpaySettlement,
  };
}
