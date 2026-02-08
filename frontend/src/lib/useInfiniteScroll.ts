"use client";

import { useState, useEffect, useRef, useCallback } from "react";

interface UseInfiniteScrollOptions {
  /** Total number of items available */
  totalCount: number;
  /** Number of items to add per batch */
  batchSize?: number;
  /** Whether data is still loading (pauses observation) */
  loading?: boolean;
}

interface UseInfiniteScrollResult {
  visibleCount: number;
  setVisibleCount: (count: number | ((prev: number) => number)) => void;
  sentinelRef: React.RefObject<HTMLDivElement | null>;
  hasMore: boolean;
}

export function useInfiniteScroll({
  totalCount,
  batchSize = 24,
  loading = false,
}: UseInfiniteScrollOptions): UseInfiniteScrollResult {
  const [visibleCount, setVisibleCount] = useState(batchSize);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const loadMore = useCallback(() => {
    setVisibleCount((prev) => prev + batchSize);
  }, [batchSize]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || loading || totalCount === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadMore();
        }
      },
      { rootMargin: "200px" }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMore, loading, totalCount]);

  return {
    visibleCount,
    setVisibleCount,
    sentinelRef,
    hasMore: visibleCount < totalCount,
  };
}
