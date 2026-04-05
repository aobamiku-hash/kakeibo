import { useRef, useState, useCallback, type ReactNode, type TouchEvent } from 'react';

interface Props {
  children: ReactNode;
}

const THRESHOLD = 80;

export default function PullToRefresh({ children }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const startY = useRef(0);
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    const el = containerRef.current;
    if (!el || el.scrollTop > 0) return;
    startY.current = e.touches[0].clientY;
  }, []);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (refreshing) return;
    const el = containerRef.current;
    if (!el || el.scrollTop > 0) {
      setPullDistance(0);
      return;
    }
    const delta = e.touches[0].clientY - startY.current;
    if (delta > 0) {
      setPullDistance(Math.min(delta * 0.5, 120));
    }
  }, [refreshing]);

  const handleTouchEnd = useCallback(() => {
    if (pullDistance >= THRESHOLD && !refreshing) {
      setRefreshing(true);
      setPullDistance(THRESHOLD);
      // リロード実行
      setTimeout(() => window.location.reload(), 300);
    } else {
      setPullDistance(0);
    }
  }, [pullDistance, refreshing]);

  const progress = Math.min(pullDistance / THRESHOLD, 1);

  return (
    <div
      ref={containerRef}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{ height: '100%', overflow: 'auto', WebkitOverflowScrolling: 'touch' }}
    >
      {/* Pull indicator */}
      <div
        style={{
          height: pullDistance,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          transition: pullDistance === 0 ? 'height 0.3s ease' : 'none',
        }}
      >
        {pullDistance > 10 && (
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              border: '3px solid var(--color-bg-tertiary)',
              borderTopColor: progress >= 1 ? 'var(--color-accent)' : 'var(--color-text-secondary)',
              animation: refreshing ? 'spin 0.6s linear infinite' : 'none',
              transform: `rotate(${progress * 360}deg)`,
              transition: refreshing ? 'none' : 'transform 0.1s',
            }}
          />
        )}
      </div>
      {children}
    </div>
  );
}
