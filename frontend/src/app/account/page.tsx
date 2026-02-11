"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useSubscription } from "@/lib/useSubscription";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import NotificationSettings from "@/components/NotificationSettings";

export default function AccountPage() {
  const router = useRouter();
  const { user, isPremium, isLoading, subscription } = useSubscription();
  const [profile, setProfile] = useState<{ full_name: string; avatar_url: string } | null>(null);

  useEffect(() => {
    if (!isLoading && !user) {
      router.push("/login?next=%2Faccount");
    }
  }, [user, isLoading, router]);

  useEffect(() => {
    if (!user) return;
    const supabase = createClient();
    supabase
      .from("profiles")
      .select("full_name, avatar_url")
      .eq("id", user.id)
      .single()
      .then(({ data }) => setProfile(data));
  }, [user]);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  if (isLoading || !user) {
    return (
      <div className="min-h-screen bg-slate-50">
        <Header />
        <div className="flex items-center justify-center py-24">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-cyan-500" />
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
        <h1 className="text-2xl font-bold text-slate-900">Account</h1>

        {/* Profile info */}
        <div className="mt-6 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
            Profiel
          </h2>
          <div className="mt-4 space-y-3">
            <div>
              <p className="text-xs text-slate-400">Naam</p>
              <p className="text-sm font-medium text-slate-900">
                {profile?.full_name || user.user_metadata?.full_name || "-"}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-400">E-mail</p>
              <p className="text-sm font-medium text-slate-900">{user.email}</p>
            </div>
          </div>
        </div>

        {/* Subscription */}
        <div className="mt-6 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
            Abonnement
          </h2>
          {isPremium && subscription ? (
            <div className="mt-4">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                  Pro actief
                </span>
                <span className="text-sm text-slate-500">
                  {subscription.recurring_interval === "year" ? "Jaarlijks" : "Maandelijks"}
                </span>
              </div>
              <p className="mt-2 text-sm text-slate-500">
                {subscription.cancel_at_period_end
                  ? `Loopt af op ${new Date(subscription.current_period_end).toLocaleDateString("nl-NL")}`
                  : `Verlengt op ${new Date(subscription.current_period_end).toLocaleDateString("nl-NL")}`}
              </p>
              <a
                href="/api/customer-portal"
                className="mt-4 inline-block rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                Abonnement beheren
              </a>
            </div>
          ) : (
            <div className="mt-4">
              <p className="text-sm text-slate-500">
                Je hebt momenteel geen actief abonnement.
              </p>
              <a
                href="/pricing"
                className="mt-4 inline-block rounded-lg bg-cyan-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-cyan-700"
              >
                Upgrade naar Pro
              </a>
            </div>
          )}
        </div>

        {/* Notification settings */}
        <div className="mt-6">
          <NotificationSettings user={user} />
        </div>

        {/* Saved searches */}
        <div className="mt-6 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
            Zoekopdrachten & volglijst
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            Beheer je opgeslagen zoekopdrachten en volglijst via het bel-icoon in de navigatiebalk.
          </p>
          <Link
            href="/"
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-cyan-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-cyan-700"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            Naar dashboard
          </Link>
        </div>

        {/* Sign out */}
        <div className="mt-8">
          <button
            onClick={handleSignOut}
            className="rounded-lg border border-red-200 px-5 py-2.5 text-sm font-semibold text-red-600 transition hover:bg-red-50"
          >
            Uitloggen
          </button>
        </div>
      </div>
      <Footer />
    </div>
  );
}
