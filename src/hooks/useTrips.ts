import { useEffect, useState, useCallback } from 'react';
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  addDoc,
  deleteDoc,
  doc,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import type { Trip, Household } from '../types';

export function useTrips(household: Household | null) {
  const { user } = useAuth();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!household) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const timeout = setTimeout(() => setLoading(false), 8000);

    const q = query(
      collection(db, 'households', household.id, 'trips'),
      orderBy('targetDate', 'asc'),
    );

    const unsub = onSnapshot(q, (snap) => {
      clearTimeout(timeout);
      const items = snap.docs.map(
        (d) => ({ id: d.id, ...d.data() }) as Trip,
      );
      setTrips(items);
      setLoading(false);
    }, () => {
      clearTimeout(timeout);
      setLoading(false);
    });
    return () => { unsub(); clearTimeout(timeout); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [household?.id]);

  const addTrip = useCallback(
    async (data: { name: string; targetDate: string; emoji: string }) => {
      if (!household || !user) return;
      await addDoc(collection(db, 'households', household.id, 'trips'), {
        ...data,
        createdBy: user.uid,
        createdAt: Timestamp.now(),
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [household?.id, user?.uid],
  );

  const deleteTrip = useCallback(
    async (id: string) => {
      if (!household) return;
      await deleteDoc(doc(db, 'households', household.id, 'trips', id));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [household?.id],
  );

  return { trips, loading, addTrip, deleteTrip };
}
