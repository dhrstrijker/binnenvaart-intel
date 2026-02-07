"use client";

import { useState, useEffect, useCallback } from "react";

const NUDGE_DISMISSED_KEY = "navisio_nudge_dismissed";
const NUDGE_THRESHOLD = 3;

export function useAuthNudge(localFavoritesCount: number) {
  const [dismissed, setDismissed] = useState(true); // default to hidden

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(NUDGE_DISMISSED_KEY) === "true");
    } catch {
      setDismissed(false);
    }
  }, []);

  const shouldShowNudge = !dismissed && localFavoritesCount >= NUDGE_THRESHOLD;

  const dismissNudge = useCallback(() => {
    setDismissed(true);
    try {
      localStorage.setItem(NUDGE_DISMISSED_KEY, "true");
    } catch {
      // ignore
    }
  }, []);

  return { shouldShowNudge, dismissNudge };
}
