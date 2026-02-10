"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

interface FavoritesCountContextValue {
  favoritesCount: number;
  setFavoritesCount: (count: number) => void;
  bumpCount: (delta: 1 | -1) => void;
}

const FavoritesCountContext = createContext<FavoritesCountContextValue>({
  favoritesCount: 0,
  setFavoritesCount: () => {},
  bumpCount: () => {},
});

export function FavoritesCountProvider({ children }: { children: ReactNode }) {
  const [favoritesCount, setFavoritesCount] = useState(0);

  const bumpCount = useCallback((delta: 1 | -1) => {
    setFavoritesCount((prev) => Math.max(0, prev + delta));
  }, []);

  return (
    <FavoritesCountContext.Provider value={{ favoritesCount, setFavoritesCount, bumpCount }}>
      {children}
    </FavoritesCountContext.Provider>
  );
}

export function useFavoritesCount() {
  return useContext(FavoritesCountContext);
}
