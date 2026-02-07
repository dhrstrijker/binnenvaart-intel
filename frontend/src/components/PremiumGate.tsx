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
    <div className="relative">
      <div className="pointer-events-none select-none blur-[6px]">
        {children}
      </div>
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="rounded-2xl bg-white/95 px-8 py-6 text-center shadow-xl ring-1 ring-gray-200 backdrop-blur-sm">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-cyan-100">
            <svg className="h-5 w-5 text-cyan-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h3 className="mt-3 text-lg font-bold text-slate-900">
            Upgrade naar Navisio Pro
          </h3>
          <p className="mt-1 max-w-xs text-sm text-slate-500">
            Bekijk prijsgeschiedenis, marktanalyses en meer
          </p>
          <Link
            href="/pricing"
            className="mt-4 inline-block rounded-lg bg-cyan-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-cyan-700"
          >
            Bekijk abonnementen
          </Link>
        </div>
      </div>
    </div>
  );
}
