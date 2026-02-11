"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useVesselData } from "@/lib/useVesselData";
import { useVesselFiltering } from "@/lib/useVesselFiltering";
import { useInfiniteScroll } from "@/lib/useInfiniteScroll";
import { useLocalFavorites } from "@/lib/useLocalFavorites";
import { useAuthNudge } from "@/lib/useAuthNudge";
import { useAuthModal } from "@/lib/AuthModalContext";
import { useToast } from "@/lib/ToastContext";
import { useWatchlistCount } from "@/lib/WatchlistContext";
import { useFavoritesCount } from "@/lib/FavoritesCountContext";
import { useSavedSearches } from "@/lib/useSavedSearches";
import VesselCard from "./VesselCard";
import SkeletonCard from "./SkeletonCard";
import AuthNudgeToast from "./AuthNudgeToast";
import Filters, { FilterState } from "./Filters";
import ActiveChips from "./filters/ActiveChips";
import { useScrollDirection } from "@/lib/useScrollDirection";
import { computeDealScores } from "@/lib/dealScore";
import { predictPriceRange, PriceRange } from "@/lib/vesselPricing";
import type { SavedSearchFilters } from "@/lib/savedSearchTypes";

const INITIAL_FILTERS: FilterState = {
  search: "",
  type: "",
  source: "",
  minPrice: "",
  maxPrice: "",
  minLength: "",
  maxLength: "",
  minTonnage: "",
  maxTonnage: "",
  minBuildYear: "",
  maxBuildYear: "",
  sort: "newest",
  showRemoved: false,
};

/** Read filter state from URL search params (client-side only) */
function getInitialFilters(): FilterState {
  if (typeof window === "undefined") return INITIAL_FILTERS;
  const p = new URLSearchParams(window.location.search);
  if (p.toString() === "") return INITIAL_FILTERS;
  return {
    search: p.get("search") ?? "",
    type: p.get("type") ?? "",
    source: p.get("source") ?? "",
    minPrice: p.get("minPrice") ?? "",
    maxPrice: p.get("maxPrice") ?? "",
    minLength: p.get("minLength") ?? "",
    maxLength: p.get("maxLength") ?? "",
    minTonnage: p.get("minTonnage") ?? "",
    maxTonnage: p.get("maxTonnage") ?? "",
    minBuildYear: p.get("minBuildYear") ?? "",
    maxBuildYear: p.get("maxBuildYear") ?? "",
    sort: p.get("sort") ?? "newest",
    showRemoved: p.get("showRemoved") === "true",
  };
}

/** Convert FilterState to SavedSearchFilters (strip sort/showRemoved) */
function toSavedSearchFilters(f: FilterState): SavedSearchFilters {
  const result: SavedSearchFilters = {};
  if (f.search) result.search = f.search;
  if (f.type) result.type = f.type;
  if (f.source) result.source = f.source;
  if (f.minPrice) result.minPrice = f.minPrice;
  if (f.maxPrice) result.maxPrice = f.maxPrice;
  if (f.minLength) result.minLength = f.minLength;
  if (f.maxLength) result.maxLength = f.maxLength;
  if (f.minTonnage) result.minTonnage = f.minTonnage;
  if (f.maxTonnage) result.maxTonnage = f.maxTonnage;
  if (f.minBuildYear) result.minBuildYear = f.minBuildYear;
  if (f.maxBuildYear) result.maxBuildYear = f.maxBuildYear;
  return result;
}

export default function Dashboard() {
  const [filters, setFilters] = useState<FilterState>(getInitialFilters);
  const scrollTargetRef = useRef<string | null>(null);
  const { localFavorites } = useLocalFavorites();
  const { shouldShowNudge, dismissNudge } = useAuthNudge(localFavorites.length);
  const { openAuthModal } = useAuthModal();
  const { showToast } = useToast();
  const { setWatchlistCount } = useWatchlistCount();
  const { setFavoritesCount } = useFavoritesCount();

  // Data fetching
  const { vessels, priceHistoryMap, freeTierTrends, favoriteIds, watchlistIds, loading, error, user, isPremium } = useVesselData();

  // Sync watchlist count to context for bell badge
  useEffect(() => {
    setWatchlistCount(watchlistIds.size);
  }, [watchlistIds.size, setWatchlistCount]);

  // Sync favorites count to context for heart badge
  useEffect(() => {
    setFavoritesCount(user ? favoriteIds.size : localFavorites.length);
  }, [user, favoriteIds.size, localFavorites.length, setFavoritesCount]);

  // Saved searches hook
  const { saveSearch } = useSavedSearches(user, isPremium);

  // Filtering & sorting
  const filtered = useVesselFiltering(vessels, filters);

  // Infinite scroll
  const { visibleCount, setVisibleCount, sentinelRef, hasMore } = useInfiniteScroll({
    totalCount: filtered.length,
    loading,
  });

  // Derived data
  const availableTypes = useMemo(() => {
    const types = new Set(vessels.map((v) => v.type).filter(Boolean));
    return Array.from(types).sort();
  }, [vessels]);

  const dealScores = useMemo(() => computeDealScores(vessels), [vessels]);

  const estimatedRanges = useMemo(() => {
    const map = new Map<string, PriceRange>();
    for (const v of vessels) {
      if (v.price === null) {
        const range = predictPriceRange(v);
        if (range !== null) map.set(v.id, range);
      }
    }
    return map;
  }, [vessels]);

  // Sync filters to URL
  useEffect(() => {
    const params = new URLSearchParams();
    if (filters.search) params.set("search", filters.search);
    if (filters.type) params.set("type", filters.type);
    if (filters.source) params.set("source", filters.source);
    if (filters.minPrice) params.set("minPrice", filters.minPrice);
    if (filters.maxPrice) params.set("maxPrice", filters.maxPrice);
    if (filters.minLength) params.set("minLength", filters.minLength);
    if (filters.maxLength) params.set("maxLength", filters.maxLength);
    if (filters.minTonnage) params.set("minTonnage", filters.minTonnage);
    if (filters.maxTonnage) params.set("maxTonnage", filters.maxTonnage);
    if (filters.minBuildYear) params.set("minBuildYear", filters.minBuildYear);
    if (filters.maxBuildYear) params.set("maxBuildYear", filters.maxBuildYear);
    if (filters.sort && filters.sort !== "newest") params.set("sort", filters.sort);
    if (filters.showRemoved) params.set("showRemoved", "true");
    const qs = params.toString();
    const url = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
    window.history.replaceState(window.history.state, "", url);
  }, [filters]);

  // Restore filters on browser back/forward
  useEffect(() => {
    function handlePopState() {
      setFilters(getInitialFilters());
    }
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  // Capture scroll target on mount
  useEffect(() => {
    scrollTargetRef.current = sessionStorage.getItem("scrollToVessel");
    sessionStorage.removeItem("scrollToVessel");
  }, []);

  // Reset visible count and scroll to top when filters change
  useEffect(() => {
    setVisibleCount(24);
    if (!scrollTargetRef.current) {
      window.scrollTo({ top: 0, behavior: "instant" });
    }
  }, [filters, setVisibleCount]);

  // Scroll to vessel after data loads
  useEffect(() => {
    const target = scrollTargetRef.current;
    if (!target || loading) return;

    const idx = filtered.findIndex((v) => v.id === target);
    if (idx === -1) {
      scrollTargetRef.current = null;
      return;
    }

    if (idx >= visibleCount) {
      setVisibleCount(idx + 1);
      return;
    }

    scrollTargetRef.current = null;
    requestAnimationFrame(() => {
      const el = document.getElementById(`vessel-${target}`);
      if (el) {
        el.scrollIntoView({ behavior: "instant", block: "center" });
      }
    });
  }, [loading, filtered, visibleCount, setVisibleCount]);

  // Auto-save pending search after OAuth redirect
  useEffect(() => {
    if (!user) return;
    const pending = sessionStorage.getItem("pendingSaveSearch");
    if (!pending) return;
    sessionStorage.removeItem("pendingSaveSearch");
    try {
      const pendingFilters = JSON.parse(pending) as SavedSearchFilters;
      saveSearch(pendingFilters, user.id).then(({ success, error: err }) => {
        if (success) {
          showToast({ message: "Zoekopdracht is geactiveerd", type: "success" });
        } else if (err) {
          showToast({ message: err, type: "error" });
        }
      });
    } catch {
      // invalid JSON, ignore
    }
  }, [user, saveSearch, showToast]);

  const handleSaveSearch = useCallback(
    async (f: FilterState) => {
      const searchFilters = toSavedSearchFilters(f);

      if (user) {
        const { success, error: err } = await saveSearch(searchFilters, user.id);
        if (success) {
          showToast({ message: "Zoekopdracht is geactiveerd", type: "success" });
        } else if (err) {
          showToast({ message: err, type: "error" });
        }
      } else {
        // Store filters for after auth
        sessionStorage.setItem("pendingSaveSearch", JSON.stringify(searchFilters));
        openAuthModal({
          message: "Log in om meldingen voor je zoekopdracht te activeren.",
          onSuccess: async (authUser) => {
            const stored = sessionStorage.getItem("pendingSaveSearch");
            if (stored) {
              sessionStorage.removeItem("pendingSaveSearch");
              try {
                const pendingFilters = JSON.parse(stored) as SavedSearchFilters;
                const { success, error: err } = await saveSearch(pendingFilters, authUser.id);
                if (success) {
                  showToast({ message: "Zoekopdracht is geactiveerd", type: "success" });
                } else if (err) {
                  showToast({ message: err, type: "error" });
                }
              } catch {
                // ignore
              }
            }
          },
        });
      }
    },
    [user, saveSearch, showToast, openAuthModal]
  );

  // Collapsible filter bar (mobile only)
  const scrollDir = useScrollDirection(18);
  const [filtersCollapsed, setFiltersCollapsed] = useState(false);
  const popoverOpenRef = useRef(false);

  const handlePopoverChange = useCallback((open: boolean) => {
    popoverOpenRef.current = open;
    // If a popover just opened, make sure filters are expanded
    if (open) setFiltersCollapsed(false);
  }, []);

  // Auto-collapse/expand on scroll (mobile only).
  // Filter bar visibility is transform-based, so cards don't jump when it reappears.
  useEffect(() => {
    // Only collapse on mobile
    const isMobile = window.innerWidth < 768;
    if (!isMobile) {
      setFiltersCollapsed(false);
      return;
    }

    if (popoverOpenRef.current) return;

    if (scrollDir === "down") {
      setFiltersCollapsed(true);
    } else if (scrollDir === "up" || scrollDir === null) {
      setFiltersCollapsed(false);
    }
  }, [scrollDir]);

  const panelInFlow = !filtersCollapsed && scrollDir === null;

  // Expand on resize to desktop
  useEffect(() => {
    function onResize() {
      if (window.innerWidth >= 768) setFiltersCollapsed(false);
    }
    window.addEventListener("resize", onResize, { passive: true });
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const handleFilterUpdate = useCallback(
    (partial: Partial<FilterState>) => {
      setFilters((prev) => ({ ...prev, ...partial }));
    },
    [],
  );

  // Track initial data load so cards only stagger-animate on first load
  const hasLoadedRef = useRef(false);
  useEffect(() => {
    if (!loading && vessels.length > 0) {
      hasLoadedRef.current = true;
    }
  }, [loading, vessels.length]);

  const visibleVessels = filtered.slice(0, visibleCount);

  if (error) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
          <svg
            className="mx-auto h-10 w-10 text-red-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
            />
          </svg>
          <h3 className="mt-3 text-lg font-semibold text-red-800">
            Kon gegevens niet laden
          </h3>
          <p className="mt-1 text-sm text-red-600">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <h1 className="sr-only">Binnenvaartschepen te koop</h1>
      {/* Filters — collapsible on mobile scroll */}
      <div className="sticky top-[var(--header-h,0px)] z-20 -mx-4 px-4 sm:-mx-6 sm:px-6 pt-2 pb-2 bg-gradient-to-b from-slate-50 from-80% to-transparent">
        <div className="relative">
          {/* Keep the panel in flow only near top; elsewhere render as overlay
              so scroll-up auto-expand doesn't push cards down. */}
          <div
            className={`z-30 transition-all duration-300 ease-in-out ${
              panelInFlow ? "relative" : "absolute left-0 right-0 top-0"
            } ${
              filtersCollapsed
                ? "pointer-events-none -translate-y-[calc(100%+0.75rem)] opacity-0"
                : "translate-y-0 opacity-100"
            }`}
          >
            <Filters
              filters={filters}
              onFilterChange={setFilters}
              availableTypes={availableTypes}
              vesselCount={filtered.length}
              onSaveAsSearch={handleSaveSearch}
              hideChips
              onPopoverChange={handlePopoverChange}
            />
          </div>

          {/* Peek tab — absolutely positioned so it doesn't affect layout when hidden */}
          <button
            type="button"
            onClick={() => setFiltersCollapsed(false)}
            className={`absolute left-0 right-0 top-full mx-auto flex w-full items-center justify-center gap-1.5 rounded-b-xl bg-white py-1.5 text-xs font-medium text-slate-500 shadow-md ring-1 ring-gray-100 transition-all duration-300 md:hidden ${
              filtersCollapsed
                ? "translate-y-0 opacity-100"
                : "pointer-events-none -translate-y-1 opacity-0"
            }`}
            aria-label="Filters tonen"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
            Filters
          </button>
        </div>

        {/* Active filter chips — always visible */}
        <div className="mt-1">
          <ActiveChips filters={filters} onClear={handleFilterUpdate} />
        </div>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && filtered.length === 0 && (
        <div className="mt-12 flex flex-col items-center justify-center gap-3 py-16">
          <svg
            className="h-16 w-16 text-slate-300"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 17h1l1-5h14l1 5h1M5 17l-2 4h18l-2-4M7 7h10l2 5H5l2-5zM9 7V5a1 1 0 011-1h4a1 1 0 011 1v2"
            />
          </svg>
          <h3 className="text-lg font-semibold text-slate-600">
            Geen schepen gevonden
          </h3>
          <ul className="mt-1 space-y-0.5 text-sm text-slate-400">
            {filters.type && <li>Probeer een ander scheepstype</li>}
            {(filters.minPrice || filters.maxPrice) && <li>Pas de prijsrange aan</li>}
            {filters.search && <li>Probeer een andere zoekterm</li>}
            {(filters.minLength || filters.maxLength || filters.minTonnage || filters.maxTonnage) && <li>Verruim de afmetingen</li>}
            {!filters.type && !filters.minPrice && !filters.maxPrice && !filters.search && !filters.minLength && !filters.maxLength && !filters.minTonnage && !filters.maxTonnage && (
              <li>Probeer minder filters tegelijk</li>
            )}
          </ul>
          <button
            onClick={() => setFilters(INITIAL_FILTERS)}
            className="mt-4 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-700 transition"
          >
            Wis alle filters
          </button>
        </div>
      )}

      {/* Vessel grid */}
      {!loading && filtered.length > 0 && (
        <>
          <div id="vessel-results" className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            <AnimatePresence mode="popLayout">
              {visibleVessels.map((vessel, index) => (
                <motion.div
                  key={vessel.id}
                  layout
                  layoutId={vessel.id}
                  initial={hasLoadedRef.current ? false : { opacity: 0, y: 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{
                    duration: 0.4,
                    delay: hasLoadedRef.current ? 0 : Math.min(index, 11) * 0.05,
                    layout: { type: "spring", stiffness: 300, damping: 30 },
                  }}
                >
                  <VesselCard
                    vessel={vessel}
                    priceHistory={priceHistoryMap[vessel.id] ?? []}
                    isPremium={isPremium}
                    user={user}
                    freeTierTrend={freeTierTrends[vessel.id] ?? null}
                    dealScore={dealScores.get(vessel.id)}
                    estimatedRange={estimatedRanges.get(vessel.id) ?? null}
                    isFavorite={favoriteIds.has(vessel.id)}
                    isWatched={watchlistIds.has(vessel.id)}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          {/* Scroll sentinel + loading indicator */}
          <div ref={sentinelRef} className="mt-6 flex flex-col items-center gap-2 py-4">
            {hasMore && (
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-cyan-500" />
            )}
            <p className="text-xs text-slate-400">
              {visibleVessels.length} van {filtered.length} schepen
            </p>
          </div>
        </>
      )}

      {/* Auth nudge toast for anonymous users with 3+ local favorites */}
      {!user && shouldShowNudge && (
        <AuthNudgeToast onDismiss={dismissNudge} />
      )}
    </div>
  );
}
