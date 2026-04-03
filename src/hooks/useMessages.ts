import { useEffect, useState, useCallback } from 'react';
import {
  collection,
  query,
  orderBy,
  limit,
  onSnapshot,
  addDoc,
  deleteDoc,
  doc,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import type { Message, Household } from '../types';

export function useMessages(household: Household | null, messageLimit = 30) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!household) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const timeout = setTimeout(() => setLoading(false), 8000);

    const q = query(
      collection(db, 'households', household.id, 'messages'),
      orderBy('createdAt', 'desc'),
      limit(messageLimit),
    );

    const unsub = onSnapshot(q, (snap) => {
      clearTimeout(timeout);
      const items = snap.docs.map(
        (d) => ({ id: d.id, ...d.data() }) as Message,
      );
      setMessages(items);
      setLoading(false);
    }, () => {
      clearTimeout(timeout);
      setLoading(false);
    });
    return () => { unsub(); clearTimeout(timeout); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [household?.id, messageLimit]);

  const addMessage = useCallback(
    async (text: string) => {
      if (!household || !user || !text.trim()) return;
      await addDoc(collection(db, 'households', household.id, 'messages'), {
        text: text.trim(),
        createdBy: user.uid,
        createdAt: Timestamp.now(),
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [household?.id, user?.uid],
  );

  const deleteMessage = useCallback(
    async (id: string) => {
      if (!household) return;
      await deleteDoc(doc(db, 'households', household.id, 'messages', id));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [household?.id],
  );

  return { messages, loading, addMessage, deleteMessage };
}
