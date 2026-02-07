"use client";

import { useEffect, useState } from "react";
import { useSubscription } from "@/lib/useSubscription";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import PremiumGate from "@/components/PremiumGate";

interface NotificationStats {
  totalSent: number;
  totalDelivered: number;
  totalOpened: number;
  totalClicked: number;
  totalBounced: number;
  activeSubscribers: number;
  verifiedSubscribers: number;
}

export default function NotificationAnalyticsPage() {
  const [stats, setStats] = useState<NotificationStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { isPremium, isLoading: subLoading } = useSubscription();

  useEffect(() => {
    async function fetchStats() {
      if (subLoading || !isPremium) {
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const res = await fetch("/api/notification-stats");
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Kon statistieken niet laden");
        }
        const data = await res.json();
        setStats(data);
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "Kon statistieken niet laden"
        );
      }
      setLoading(false);
    }

    fetchStats();
  }, [isPremium, subLoading]);

  // Calculate rates
  const deliveryRate = stats && stats.totalSent > 0
    ? ((stats.totalDelivered / stats.totalSent) * 100).toFixed(1)
    : "0.0";
  const openRate = stats && stats.totalSent > 0
    ? ((stats.totalOpened / stats.totalSent) * 100).toFixed(1)
    : "0.0";
  const clickRate = stats && stats.totalSent > 0
    ? ((stats.totalClicked / stats.totalSent) * 100).toFixed(1)
    : "0.0";
  const bounceRate = stats && stats.totalSent > 0
    ? ((stats.totalBounced / stats.totalSent) * 100).toFixed(1)
    : "0.0";

  const isBounceHigh = stats && stats.totalSent > 0 && (stats.totalBounced / stats.totalSent) > 0.05;

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {/* Page title */}
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-slate-900">Meldingsanalyse</h2>
          <p className="text-sm text-slate-500">
            Inzicht in uw e-mailnotificaties
          </p>
        </div>

        {/* Error state */}
        {error && (
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
        )}

        {/* Loading state */}
        {loading && !error && (
          <div className="mt-12 flex flex-col items-center justify-center gap-3 py-16">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-cyan-500" />
            <p className="text-sm text-slate-500">Statistieken laden...</p>
          </div>
        )}

        {/* Content wrapped in PremiumGate */}
        {!loading && !error && (
          <PremiumGate isPremium={isPremium}>
            {stats && stats.totalSent === 0 ? (
              /* Empty state */
              <div className="rounded-xl border border-dashed border-slate-200 bg-white p-12 text-center">
                <svg
                  className="mx-auto h-12 w-12 text-slate-300"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"
                  />
                </svg>
                <h3 className="mt-4 text-lg font-semibold text-slate-900">
                  Nog geen meldingen verzonden
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  Statistieken worden hier weergegeven zodra er e-mailnotificaties zijn verzonden.
                </p>
              </div>
            ) : (
              /* Stats display */
              <div className="space-y-6">
                {/* KPI cards row - 4 cards */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {/* Total sent */}
                  <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-50">
                        <svg className="h-5 w-5 text-cyan-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-slate-900">{stats?.totalSent ?? 0}</p>
                        <p className="text-xs text-slate-500">Totaal verzonden</p>
                      </div>
                    </div>
                  </div>

                  {/* Delivery rate */}
                  <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-50">
                        <svg className="h-5 w-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-slate-900">{deliveryRate}%</p>
                        <p className="text-xs text-slate-500">Afgeleverd</p>
                      </div>
                    </div>
                  </div>

                  {/* Open rate */}
                  <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50">
                        <svg className="h-5 w-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-slate-900">{openRate}%</p>
                        <p className="text-xs text-slate-500">Geopend</p>
                      </div>
                    </div>
                  </div>

                  {/* Active subscribers */}
                  <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-50">
                        <svg className="h-5 w-5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-slate-900">{stats?.activeSubscribers ?? 0}</p>
                        <p className="text-xs text-slate-500">Actieve abonnees</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Second row - 2 cards */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {/* Bounce rate */}
                  <div className={`rounded-2xl bg-white p-6 shadow-sm ring-1 ${isBounceHigh ? 'ring-amber-200' : 'ring-gray-100'}`}>
                    <div className="flex items-center gap-3">
                      <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${isBounceHigh ? 'bg-amber-50' : 'bg-slate-50'}`}>
                        <svg className={`h-5 w-5 ${isBounceHigh ? 'text-amber-600' : 'text-slate-600'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                        </svg>
                      </div>
                      <div className="flex-1">
                        <p className={`text-2xl font-bold ${isBounceHigh ? 'text-amber-900' : 'text-slate-900'}`}>{bounceRate}%</p>
                        <p className={`text-xs ${isBounceHigh ? 'text-amber-700' : 'text-slate-500'}`}>
                          Bounce rate {isBounceHigh && '(hoog)'}
                        </p>
                      </div>
                    </div>
                    {isBounceHigh && (
                      <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2">
                        <p className="text-xs text-amber-800">
                          Een bounce rate boven 5% kan duiden op ongeldige e-mailadressen.
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Click rate */}
                  <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50">
                        <svg className="h-5 w-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.042 21.672L13.684 16.6m0 0l-2.51 2.225.569-9.47 5.227 7.917-3.286-.672zM12 2.25V4.5m5.834.166l-1.591 1.591M20.25 10.5H18M7.757 14.743l-1.59 1.59M6 10.5H3.75m4.007-4.243l-1.59-1.59" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-slate-900">{clickRate}%</p>
                        <p className="text-xs text-slate-500">Click rate</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </PremiumGate>
        )}
      </div>

      <Footer />
    </div>
  );
}
