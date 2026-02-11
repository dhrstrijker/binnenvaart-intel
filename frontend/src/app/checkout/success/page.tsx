"use client";

import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

export default function CheckoutSuccessPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <div className="mx-auto max-w-md px-4 py-16 sm:px-6">
        <div className="rounded-2xl bg-white p-8 text-center shadow-lg ring-1 ring-gray-100">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
            <svg className="h-7 w-7 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="mt-5 text-2xl font-bold text-slate-900">Betaling gelukt!</h1>
          <p className="mt-2 text-sm text-slate-500">
            Je Navisio Pro-abonnement is geactiveerd. Je hebt nu toegang tot
            prijsgeschiedenis, marktanalyses en meer.
          </p>
          <div className="mt-8 flex flex-col gap-3">
            <Link
              href="/live"
              className="inline-block rounded-lg bg-cyan-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-cyan-700"
            >
              Naar live wijzigingen
            </Link>
            <Link
              href="/"
              className="inline-block rounded-lg border border-slate-300 bg-white px-6 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Naar dashboard
            </Link>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
