import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { useHousehold } from './hooks/useHousehold';
import { useFirestoreReconnect } from './hooks/useFirestoreReconnect';
import BottomNav from './components/BottomNav';
import ErrorBoundary from './components/ErrorBoundary';
import LoginPage from './pages/LoginPage';
import HomePage from './pages/NewHomePage';
import KakeiboPage from './pages/KakeiboPage';
import EntryPage from './pages/EntryPage';
import HistoryPage from './pages/HistoryPage';
import SettingsPage from './pages/SettingsPage';
import ImportPage from './pages/ImportPage';
import { useState, useEffect } from 'react';

const pageVariants = {
  initial: { opacity: 0, y: 18 },
  in: { opacity: 1, y: 0 },
  out: { opacity: 0, y: -12 },
};
const pageTransition = { duration: 0.25, ease: 'easeInOut' };

function LoadingScreen({ message }: { message?: string }) {
  const [showRefresh, setShowRefresh] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShowRefresh(true), 4000);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="loading-screen" style={{ flexDirection: 'column', gap: 16, textAlign: 'center' }}>
      <div className="spinner" />
      {message && (
        <p style={{ color: 'var(--color-text-secondary)', fontSize: 14 }}>{message}</p>
      )}
      {showRefresh && (
        <button
          className="btn btn-secondary"
          style={{ marginTop: 8, fontSize: 13 }}
          onClick={() => {
            if ('serviceWorker' in navigator) {
              navigator.serviceWorker.getRegistrations().then((regs) =>
                Promise.all(regs.map((r) => r.unregister()))
              ).then(() => {
                caches.keys().then((names) =>
                  Promise.all(names.map((n) => caches.delete(n)))
                ).then(() => window.location.reload());
              });
            } else {
              window.location.reload();
            }
          }}
        >
          読み込みに時間がかかっています。タップして更新
        </button>
      )}
    </div>
  );
}

function AppRoutes() {
  const { user, loading: authLoading } = useAuth();
  const { household, loading: hhLoading, setupError } = useHousehold();
  const location = useLocation();
  useFirestoreReconnect();

  if (authLoading || (user && hhLoading)) {
    return <LoadingScreen />;
  }

  if (!user) return <LoginPage />;

  // セットアップ失敗
  if (setupError) {
    return (
      <div className="loading-screen" style={{ flexDirection: 'column', gap: 16, textAlign: 'center' }}>
        <p style={{ color: 'var(--color-danger)', fontSize: 14 }}>{setupError}</p>
        <button className="btn btn-primary" onClick={() => window.location.reload()}>
          再読み込み
        </button>
      </div>
    );
  }

  // 世帯セットアップ中（まだ作成されていない）
  if (!household) {
    return <LoadingScreen message="セットアップ中…" />;
  }

  return (
    <>
      <AnimatePresence mode="wait">
        <motion.div
          key={location.pathname}
          initial="initial"
          animate="in"
          exit="out"
          variants={pageVariants}
          transition={pageTransition}
          style={{ minHeight: '100dvh' }}
        >
          <ErrorBoundary>
          <Routes location={location}>
            <Route path="/" element={<HomePage household={household} />} />
            <Route path="/kakeibo" element={<KakeiboPage household={household} />} />
            <Route path="/entry/:catId" element={<EntryPage household={household} />} />
            <Route path="/history" element={<HistoryPage household={household} />} />
            <Route path="/settings" element={<SettingsPage household={household} />} />
            <Route path="/import" element={<ImportPage household={household} />} />
          </Routes>
          </ErrorBoundary>
        </motion.div>
      </AnimatePresence>
      <BottomNav />
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
