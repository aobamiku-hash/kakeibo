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
  Timestamp,
  arrayUnion,
  limit,
  writeBatch,
  deleteField,
  runTransaction,
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import type { Household, Category } from '../types';
import { DEFAULT_CATEGORIES } from '../types';

const PLACEHOLDER_UID = 'pending_member2';

export function useHousehold() {
  const { user } = useAuth();
  const [household, setHousehold] = useState<Household | null>(null);
  const [loading, setLoading] = useState(true);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [householdId, setHouseholdId] = useState<string | null>(null);

  /* ── ユーザーの世帯IDを取得 ── */
  useEffect(() => {
    if (!user) { setLoading(false); return; }

    const unsub = onSnapshot(doc(db, 'userHouseholds', user.uid), (snap) => {
      if (snap.exists()) {
        setHouseholdId(snap.data().householdId as string);
      } else {
        setHouseholdId(null);
        // 世帯なし → 自動作成 or 自動参加
        autoSetup(user.uid, user.displayName ?? 'メンバー');
      }
    });
    return unsub;
  }, [user]);

  /* ── 世帯ドキュメントをリアルタイム監視 ── */
  useEffect(() => {
    if (!householdId) return;

    const unsub = onSnapshot(doc(db, 'households', householdId), (snap) => {
      if (snap.exists()) {
        setHousehold({ id: snap.id, ...snap.data() } as Household);
      }
      setLoading(false);
    });
    return unsub;
  }, [householdId]);

  /* ── 自動セットアップ: 空いている世帯があれば参加、なければ作成 ── */
  async function autoSetup(uid: string, displayName: string) {
    try {
      // 空きのある世帯を検索（メンバーが1人のもの）
      const q = query(
        collection(db, 'households'),
        where('memberCount', '==', 1),
        limit(1),
      );
      const snap = await getDocs(q);

      if (!snap.empty) {
        // 既存世帯に参加（トランザクションで競合を防止）
        const hDoc = snap.docs[0];
        const hRef = doc(db, 'households', hDoc.id);

        const joined = await runTransaction(db, async (tx) => {
          const freshSnap = await tx.get(hRef);
          if (!freshSnap.exists() || freshSnap.data().memberCount !== 1) return false;

          const hData = freshSnap.data();
          const oldOrder: string[] = hData.memberOrder ?? [];
          const hasPlaceholder = oldOrder.includes(PLACEHOLDER_UID);
          const newOrder = hasPlaceholder
            ? oldOrder.map((id: string) => (id === PLACEHOLDER_UID ? uid : id))
            : [...oldOrder, uid];

          tx.update(hRef, {
            members: arrayUnion(uid),
            memberOrder: newOrder,
            [`memberNames.${uid}`]: hData.memberNames?.[PLACEHOLDER_UID] ?? displayName,
            [`memberNames.${PLACEHOLDER_UID}`]: deleteField(),
            memberCount: 2,
          });
          return hasPlaceholder;
        });

        if (joined !== false) {
          await setDoc(doc(db, 'userHouseholds', uid), {
            householdId: hDoc.id,
          });
          if (joined === true) {
            await replacePlaceholderInExpenses(hDoc.id, uid);
          }
        } else {
          // 競合で参加できなかった → 新規作成にフォールバック
          await createNewHousehold(uid, displayName);
        }
      } else {
        await createNewHousehold(uid, displayName);
      }
    } catch (e) {
      console.error('自動セットアップ失敗:', e);
      setSetupError('世帯のセットアップに失敗しました。再読み込みしてください。');
      setLoading(false);
    }
  }

  async function createNewHousehold(uid: string, displayName: string) {
    const categories: Category[] = DEFAULT_CATEGORIES.map((c, i) => ({
      ...c,
      id: `cat_${i}`,
    }));

    const hRef = doc(collection(db, 'households'));
    await setDoc(hRef, {
      members: [uid],
      memberNames: { [uid]: displayName },
      memberOrder: [uid],
      inviteCode: '',
      categories,
      memberCount: 1,
      createdAt: Timestamp.now(),
    });
    await setDoc(doc(db, 'userHouseholds', uid), {
      householdId: hRef.id,
    });
  }

  /** プレースホルダーUIDを実UIDに一括置換 */
  async function replacePlaceholderInExpenses(householdId: string, realUid: string) {
    try {
      const expRef = collection(db, 'households', householdId, 'expenses');
      const q2 = query(expRef, where('paidBy', '==', PLACEHOLDER_UID));
      const expSnap = await getDocs(q2);

      if (expSnap.empty) return;

      const batchSize = 400;
      const docs = expSnap.docs;
      for (let i = 0; i < docs.length; i += batchSize) {
        const batch = writeBatch(db);
        docs.slice(i, i + batchSize).forEach((d) => {
          batch.update(d.ref, { paidBy: realUid });
        });
        await batch.commit();
      }
      console.log(`Replaced ${docs.length} placeholder paidBy entries`);
    } catch (e) {
      console.error('プレースホルダー置換失敗:', e);
    }
  }

  /* ── カテゴリ更新 ── */
  const updateCategories = useCallback(
    async (categories: Category[]) => {
      if (!household) return;
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
