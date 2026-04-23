import { useEffect, useState, useCallback } from 'react';
import {
  doc,
  setDoc,
  updateDoc,
  onSnapshot,
  collection,
  query,
  where,
  getDocs,
  limit,
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import type { Household, Category } from '../types';
import { DEFAULT_CATEGORIES } from '../types';

export function useHousehold() {
  const { user } = useAuth();
  const [household, setHousehold] = useState<Household | null>(null);
  const [loading, setLoading] = useState(true);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [householdId, setHouseholdId] = useState<string | null>(null);

  const recoverHouseholdLink = useCallback(async (uid: string) => {
    try {
      const snap = await getDocs(query(
        collection(db, 'households'),
        where('members', 'array-contains', uid),
        limit(2),
      ));

      if (snap.size === 1) {
        await setDoc(doc(db, 'userHouseholds', uid), {
          householdId: snap.docs[0].id,
        });
        return;
      }

      if (snap.empty) {
        setSetupError('このアカウントは既存の世帯に登録されていません。');
      } else {
        setSetupError('複数の世帯に紐づいています。データを確認してください。');
      }
    } catch (e) {
      console.error('世帯リンク復旧失敗:', e);
      setSetupError('世帯情報の取得に失敗しました。再読み込みしてください。');
    }

    setLoading(false);
  }, []);

  /* ── ユーザーの世帯IDを取得 ── */
  useEffect(() => {
    if (!user) {
      setHousehold(null);
      setHouseholdId(null);
      setSetupError(null);
      setLoading(false);
      return;
    }

    setLoading(true);

    const unsub = onSnapshot(doc(db, 'userHouseholds', user.uid), (snap) => {
      if (snap.exists()) {
        setHouseholdId(snap.data().householdId as string);
        setSetupError(null);
      } else {
        setHouseholdId(null);
        setHousehold(null);
        setSetupError(null);
        recoverHouseholdLink(user.uid);
      }
    });
    return unsub;
  }, [recoverHouseholdLink, user]);

  /* ── 世帯ドキュメントをリアルタイム監視 ── */
  useEffect(() => {
    if (!householdId) {
      setHousehold(null);
      return;
    }

    const unsub = onSnapshot(doc(db, 'households', householdId), (snap) => {
      if (snap.exists()) {
        setHousehold({ id: snap.id, ...snap.data() } as Household);
        setSetupError(null);
      } else {
        setHousehold(null);
        setSetupError('世帯データが見つかりません。');
      }
      setLoading(false);
    });
    return unsub;
  }, [householdId]);

  /* ── カテゴリ更新 ── */
  const updateCategories = useCallback(
    async (categories: Category[]) => {
      if (!household) return;

      const requiredIds = DEFAULT_CATEGORIES.map((_, index) => `cat_${index}`);
      if (requiredIds.some((id) => !categories.some((category) => category.id === id))) {
        throw new Error('基本カテゴリは削除できません。');
      }

      if (categories.some((category) => category.defaultSplit[0] + category.defaultSplit[1] !== 100)) {
        throw new Error('割り勘の比率は合計 100 にしてください。');
      }

      await updateDoc(doc(db, 'households', household.id), { categories });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [household?.id],
  );

  /* ── メンバー名更新 ── */
  const updateMemberName = useCallback(
    async (uid: string, name: string) => {
      if (!household) return;
      await updateDoc(doc(db, 'households', household.id), {
        [`memberNames.${uid}`]: name,
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [household?.id],
  );

  return {
    household,
    loading,
    setupError,
    updateCategories,
    updateMemberName,
  };
}
