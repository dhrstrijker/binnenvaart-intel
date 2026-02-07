"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import type { User } from "@supabase/supabase-js";

const MONTHLY_PRODUCT_ID = process.env.NEXT_PUBLIC_POLAR_PRODUCT_ID_MONTHLY ?? "";
const ANNUAL_PRODUCT_ID = process.env.NEXT_PUBLIC_POLAR_PRODUCT_ID_ANNUAL ?? "";

const features = [
  "Prijsgeschiedenis per schip",
  "Marktanalyse dashboard",
  "Prijstrend-indicatoren",
  "E-mail notificaties",
  "Bronvergelijking",
];

export default function PricingPage() {
  const [user, setUser] = useState<User | null>(null);
  const [isPremium, setIsPremium] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function check() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);

      if (user) {
        const { data } = await supabase
          .from("subscriptions")
          .select("status, current_period_end")
          .eq("user_id", user.id)
          .eq("status", "active")
          .gt("current_period_end", new Date().toISOString())
          .limit(1);
        setIsPremium((data?.length ?? 0) > 0);
      }
      setLoading(false);
    }
    check();
  }, []);

  function checkoutUrl(productId: string) {
    const params = new URLSearchParams({ products: productId });
    if (user) {
      params.set("customerEmail", user.email ?? "");
      params.set("metadata", JSON.stringify({ user_id: user.id }));
    }
    return `/api/checkout?${params.toString()}`;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-slate-900">Navisio Pro</h1>
          <p className="mt-2 text-lg text-slate-500">
            Krijg toegang tot prijsgeschiedenis, marktanalyse en meer
          </p>
        </div>

        {isPremium && !loading && (
          <div className="mx-auto mt-8 max-w-md rounded-xl bg-emerald-50 p-6 text-center ring-1 ring-emerald-200">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100">
              <svg className="h-5 w-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="mt-3 text-lg font-semibold text-emerald-900">Je hebt al een abonnement</h3>
            <p className="mt-1 text-sm text-emerald-700">
              Je hebt toegang tot alle Pro-functies.
            </p>
            <a
              href="/api/customer-portal"
              className="mt-4 inline-block rounded-lg bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
            >
              Abonnement beheren
            </a>
          </div>
        )}

        {!isPremium && !loading && (
          <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2">
            {/* Monthly */}
            <div className="rounded-2xl bg-white p-8 shadow-lg ring-1 ring-gray-100">
              <h3 className="text-lg font-semibold text-slate-900">Maandelijks</h3>
              <div className="mt-4">
                <span className="text-4xl font-extrabold text-slate-900">&euro;19</span>
                <span className="text-sm text-slate-500">/maand</span>
              </div>
              <ul className="mt-6 space-y-3">
                {features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-slate-600">
                    <svg className="h-4 w-4 shrink-0 text-cyan-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    {f}
                  </li>
                ))}
              </ul>
              {user ? (
                <a
                  href={checkoutUrl(MONTHLY_PRODUCT_ID)}
                  className="mt-8 block w-full rounded-lg bg-cyan-600 px-4 py-3 text-center text-sm font-semibold text-white transition hover:bg-cyan-700"
                >
                  Kies maandelijks
                </a>
              ) : (
                <Link
                  href="/login"
                  className="mt-8 block w-full rounded-lg bg-cyan-600 px-4 py-3 text-center text-sm font-semibold text-white transition hover:bg-cyan-700"
                >
                  Log in om te abonneren
                </Link>
              )}
            </div>

            {/* Annual */}
            <div className="relative rounded-2xl bg-white p-8 shadow-lg ring-2 ring-cyan-500">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-cyan-500 px-4 py-1 text-xs font-bold text-white">
                BESPAAR 35%
              </div>
              <h3 className="text-lg font-semibold text-slate-900">Jaarlijks</h3>
              <div className="mt-4">
                <span className="text-4xl font-extrabold text-slate-900">&euro;149</span>
                <span className="text-sm text-slate-500">/jaar</span>
              </div>
              <p className="mt-1 text-xs text-slate-400">
                &euro;12,42/maand &middot; 2 maanden gratis
              </p>
              <ul className="mt-6 space-y-3">
                {features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-slate-600">
                    <svg className="h-4 w-4 shrink-0 text-cyan-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    {f}
                  </li>
                ))}
              </ul>
              {user ? (
                <a
                  href={checkoutUrl(ANNUAL_PRODUCT_ID)}
                  className="mt-8 block w-full rounded-lg bg-cyan-600 px-4 py-3 text-center text-sm font-semibold text-white transition hover:bg-cyan-700"
                >
                  Kies jaarlijks
                </a>
              ) : (
                <Link
                  href="/login"
                  className="mt-8 block w-full rounded-lg bg-cyan-600 px-4 py-3 text-center text-sm font-semibold text-white transition hover:bg-cyan-700"
                >
                  Log in om te abonneren
                </Link>
              )}
            </div>
          </div>
        )}

        {/* Free tier explanation */}
        <div className="mt-12 rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
          <h3 className="text-lg font-semibold text-slate-900">Gratis tier</h3>
          <p className="mt-1 text-sm text-slate-500">
            Zonder abonnement heb je toegang tot het volledige overzicht van schepen te koop,
            inclusief specificaties, afbeeldingen en huidige prijzen van 5 makelaars.
          </p>
        </div>
      </div>
      <Footer />
    </div>
  );
}
