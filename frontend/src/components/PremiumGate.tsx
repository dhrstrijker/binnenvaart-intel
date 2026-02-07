"use client";

import Link from "next/link";

interface PremiumGateProps {
  isPremium: boolean;
  children: React.ReactNode;
}

export default function PremiumGate({ isPremium, children }: PremiumGateProps) {
  if (isPremium) {
    return <>{children}</>;
  }

  return (
    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-5 text-center">
      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-cyan-100">
        <svg className="h-5 w-5 text-cyan-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
      </div>
      <h3 className="mt-3 text-sm font-bold text-slate-900">
        Prijsgeschiedenis beschikbaar met Pro
      </h3>
      <p className="mt-1 text-xs text-slate-500">
        Bekijk prijstrends, wijzigingen en marktanalyses
      </p>
      <Link
        href="/pricing"
        className="mt-3 inline-block rounded-lg bg-cyan-600 px-5 py-2 text-xs font-semibold text-white transition hover:bg-cyan-700"
      >
        Upgrade naar Pro
      </Link>
    </div>
  );
}
