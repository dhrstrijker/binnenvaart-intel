"use client";

import React, { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Vessel, PriceHistory } from "@/lib/supabase";
import { createClient } from "@/lib/supabase/client";
import VesselCard from "./VesselCard";
import FavoriteButton from "./FavoriteButton";
import WatchlistButton from "./WatchlistButton";
import StickyVesselInfo from "./StickyVesselInfo";
import StickyBrokerCTA from "./StickyBrokerCTA";
import TechnicalSpecs from "./TechnicalSpecs";
import ImageGallery from "./ImageGallery";
import PriceHistorySection from "./PriceHistorySection";
import { useSubscription } from "@/lib/useSubscription";
import { hasRichData } from "@/lib/rawDetails";

interface VesselPageContentProps {
  vessel: Vessel;
  similarVessels: Vessel[];
}

export default function VesselPageContent({ vessel, similarVessels }: VesselPageContentProps) {
  const { user, isPremium, isLoading: subLoading } = useSubscription();
  const [history, setHistory] = useState<PriceHistory[]>([]);
  const [shareOpen, setShareOpen] = useState(false);
  const shareTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [freeTrend, setFreeTrend] = useState<'up' | 'down' | null>(null);

  useEffect(() => {
    return () => {
      if (shareTimerRef.current) clearTimeout(shareTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (subLoading || !user || !isPremium) return;

    async function fetchHistory() {
      const supabase = createClient();
      const ids = [vessel.id];
      if (vessel.linked_sources) {
        for (const ls of vessel.linked_sources) {
          if (ls.vessel_id !== vessel.id) {
            ids.push(ls.vessel_id);
          }
        }
      }

      const { data } = await supabase
        .from("price_history")
        .select("*")
        .in("vessel_id", ids)
        .order("recorded_at", { ascending: true });

      if (data) setHistory(data);
    }

    fetchHistory();
  }, [vessel.id, vessel.linked_sources, user, isPremium, subLoading]);

  // Free-tier price trend from activity_log
  useEffect(() => {
    if (subLoading || isPremium) return;

    async function fetchFreeTrend() {
      const supabase = createClient();
      const { data } = await supabase
        .from("activity_log")
        .select("old_price, new_price")
        .eq("vessel_id", vessel.id)
        .eq("event_type", "price_changed")
        .order("recorded_at", { ascending: false })
        .limit(1);

      if (data && data.length > 0) {
        const { old_price, new_price } = data[0];
        if (old_price !== null && new_price !== null) {
          if (new_price > old_price) setFreeTrend('up');
          else if (new_price < old_price) setFreeTrend('down');
        }
      }
    }

    fetchFreeTrend();
  }, [vessel.id, isPremium, subLoading]);

  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: vessel.name, url });
      } catch {
        /* user cancelled */
      }
    } else {
      await navigator.clipboard.writeText(url);
      setShareOpen(true);
      if (shareTimerRef.current) clearTimeout(shareTimerRef.current);
      shareTimerRef.current = setTimeout(() => setShareOpen(false), 2000);
    }
  };

  const showTechnical = hasRichData(vessel.raw_details);

  const sectionVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: (delay: number) => ({
      opacity: 1,
      y: 0,
      transition: { duration: 0.4, ease: "easeOut" as const, delay },
    }),
  };

  return (
    <article className="pb-20 lg:pb-0">
      {/* Sold banner */}
      {vessel.status === "sold" && (
        <div className="mb-4 rounded-xl bg-amber-50 px-4 py-3 ring-1 ring-amber-200">
          <p className="text-sm font-semibold text-amber-800">
            Dit schip is verkocht.
          </p>
        </div>
      )}
      {/* Removed banner */}
      {vessel.status === "removed" && (
        <div className="mb-4 rounded-xl bg-red-50 px-4 py-3 ring-1 ring-red-200">
          <p className="text-sm font-semibold text-red-800">
            Dit schip is niet meer beschikbaar.
          </p>
        </div>
      )}

      {/* Main 2-column grid */}
      <div className="lg:grid lg:grid-cols-[1fr_340px] lg:gap-8">
        {/* Left column */}
        <div className="min-w-0 space-y-6">
          {/* Image gallery with action buttons */}
          <motion.div
            initial="hidden"
            animate="visible"
            custom={0}
            variants={sectionVariants}
          >
            <ImageGallery imageUrl={vessel.image_url}>
              <FavoriteButton
                vesselId={vessel.id}
                user={user}
                className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/90 text-slate-500 shadow-sm backdrop-blur-sm transition-colors hover:text-red-500 disabled:opacity-50"
              />
              <WatchlistButton
                vesselId={vessel.id}
                user={user}
                className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/90 text-slate-500 shadow-sm backdrop-blur-sm transition-colors hover:text-amber-500 disabled:opacity-50"
              />
              <div className="relative">
                <button
                  type="button"
                  onClick={handleShare}
                  className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/90 text-slate-500 shadow-sm backdrop-blur-sm transition-colors hover:text-cyan-600"
                  title="Deel dit schip"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                  </svg>
                </button>
                {shareOpen && (
                  <span className="absolute -bottom-8 right-0 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-xs font-medium text-white">
                    Link gekopieerd!
                  </span>
                )}
              </div>
            </ImageGallery>
          </motion.div>

          {/* Mobile-only: vessel info card immediately after image */}
          <motion.div
            className="lg:hidden"
            initial="hidden"
            animate="visible"
            custom={0.1}
            variants={sectionVariants}
          >
            <StickyVesselInfo vessel={vessel} />
          </motion.div>

          {/* Technical specs — conditional on data */}
          {showTechnical && (
            <motion.div
              initial="hidden"
              animate="visible"
              custom={0.15}
              variants={sectionVariants}
            >
              <TechnicalSpecs vessel={vessel} />
            </motion.div>
          )}

          {/* Price history section */}
          <motion.div
            initial="hidden"
            animate="visible"
            custom={0.2}
            variants={sectionVariants}
          >
            <PriceHistorySection
              vessel={vessel}
              history={history}
              isPremium={isPremium}
              freeTrend={freeTrend}
            />
          </motion.div>
        </div>

        {/* Right column — sticky sidebar (desktop only) */}
        <motion.div
          className="mt-6 lg:mt-0"
          initial="hidden"
          animate="visible"
          custom={0.1}
          variants={sectionVariants}
        >
          <div className="sticky top-6 space-y-4">
            <div className="hidden lg:block">
              <StickyVesselInfo vessel={vessel} />
            </div>
            <StickyBrokerCTA vessel={vessel} />
          </div>
        </motion.div>
      </div>

      {/* Full-width sections below */}

      {/* Back link */}
      <motion.div
        className="mt-8 border-t border-slate-200 pt-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, delay: 0.25 }}
      >
        <a
          href="/"
          onClick={(e) => {
            e.preventDefault();
            window.history.back();
          }}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-cyan-600 hover:text-cyan-800 transition-colors"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Terug naar overzicht
        </a>
      </motion.div>

      {/* Similar vessels */}
      {similarVessels.length > 0 && (
        <motion.div
          className="mt-8"
          initial="hidden"
          animate="visible"
          custom={0.25}
          variants={sectionVariants}
        >
          <h2 className="text-lg font-bold text-slate-900">Misschien ook interessant</h2>
          <p className="mt-1 text-sm text-slate-500">
            Vergelijkbare {vessel.type ? vessel.type.toLowerCase() : "schepen"} in dezelfde prijsklasse
          </p>
          <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {similarVessels.map((v, index) => (
              <motion.div
                key={v.id}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.1 }}
                transition={{ duration: 0.4, delay: Math.min(index, 5) * 0.05 }}
              >
                <VesselCard vessel={v} />
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}
    </article>
  );
}
