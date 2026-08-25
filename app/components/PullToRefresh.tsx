"use client";

import { useState, useRef, useCallback, useEffect, type ReactNode } from "react";

interface PullToRefreshProps {
  onRefresh: () => Promise<void>;
  children: ReactNode;
}

const PULL_THRESHOLD = 70;

export default function PullToRefresh({ onRefresh, children }: PullToRefreshProps) {
  const [pullY, setPullY] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startYRef = useRef(0);
  const isPullingRef = useRef(false);

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (refreshing) return;
      if (window.scrollY === 0) {
        startYRef.current = e.touches[0].clientY;
        isPullingRef.current = true;
      }
    },
    [refreshing]
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!isPullingRef.current || refreshing) return;
      const currentY = e.touches[0].clientY;
      const diff = currentY - startYRef.current;
      if (diff > 0 && window.scrollY === 0) {
        // Friction factor
        const damped = Math.min(diff * 0.45, PULL_THRESHOLD + 20);
        setPullY(damped);
      } else {
        setPullY(0);
      }
    },
    [refreshing]
  );

  const onTouchEnd = useCallback(async () => {
    if (!isPullingRef.current) return;
    isPullingRef.current = false;
    if (pullY >= PULL_THRESHOLD && !refreshing) {
      setRefreshing(true);
      setPullY(PULL_THRESHOLD * 0.6);
      try {
        await onRefresh();
      } finally {
        setRefreshing(false);
        setPullY(0);
      }
    } else {
      setPullY(0);
    }
  }, [pullY, refreshing, onRefresh]);

  return (
    <div
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      className="relative"
    >
      {(pullY > 0 || refreshing) && (
        <div
          className="flex items-center justify-center overflow-hidden transition-all duration-150 text-muted"
          style={{ height: `${pullY}px` }}
          aria-hidden
        >
          <div className="flex items-center gap-2 text-xs font-mono">
            {refreshing ? (
              <>
                <span className="inline-block w-3.5 h-3.5 border-2 border-flood border-t-transparent rounded-full animate-spin" />
                <span className="text-flood">Actualisation…</span>
              </>
            ) : (
              <>
                <span
                  className="transition-transform duration-150 inline-block"
                  style={{
                    transform: `rotate(${Math.min(180, (pullY / PULL_THRESHOLD) * 180)}deg)`,
                  }}
                >
                  ↓
                </span>
                <span>{pullY >= PULL_THRESHOLD ? "Relâcher pour actualiser" : "Glisser pour actualiser"}</span>
              </>
            )}
          </div>
        </div>
      )}
      {children}
    </div>
  );
}
