"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

interface WatchlistContextValue {
  watchlistCount: number;
  setWatchlistCount: (count: number) => void;
  bumpCount: (delta: 1 | -1) => void;
}

const WatchlistContext = createContext<WatchlistContextValue>({
  watchlistCount: 0,
  setWatchlistCount: () => {},
  bumpCount: () => {},
});

export function WatchlistProvider({ children }: { children: ReactNode }) {
  const [watchlistCount, setWatchlistCount] = useState(0);

  const bumpCount = useCallback((delta: 1 | -1) => {
    setWatchlistCount((prev) => Math.max(0, prev + delta));
  }, []);

  return (
    <WatchlistContext.Provider value={{ watchlistCount, setWatchlistCount, bumpCount }}>
      {children}
    </WatchlistContext.Provider>
  );
}

export function useWatchlistCount() {
  return useContext(WatchlistContext);
}
