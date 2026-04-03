import { useEffect } from 'react';
import { disableNetwork, enableNetwork } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * タブがフォアグラウンドに戻ったとき Firestore の再接続を促進する。
 * disableNetwork → enableNetwork で WebSocket を即座に再確立させる。
 */
export function useFirestoreReconnect() {
  useEffect(() => {
    let reconnecting = false;

    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible' && !reconnecting) {
        reconnecting = true;
        try {
          await disableNetwork(db);
          await enableNetwork(db);
        } catch {
          // ネットワーク操作失敗は無視（オフライン時など）
        } finally {
          reconnecting = false;
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);
}
