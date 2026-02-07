"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useSubscription } from "@/lib/useSubscription";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

export default function AccountPage() {
  const router = useRouter();
  const { user, isPremium, isLoading, subscription } = useSubscription();
  const [profile, setProfile] = useState<{ full_name: string; avatar_url: string } | null>(null);

  useEffect(() => {
    if (!isLoading && !user) {
      router.push("/login");
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
