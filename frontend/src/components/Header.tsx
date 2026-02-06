"use client";

import NavisioLogo from "./NavisioLogo";
import NavLink from "./NavLink";

export default function Header() {
  return (
    <header className="bg-slate-950 shadow-lg">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6">
        <div className="flex items-center gap-3">
          <div>
            <NavisioLogo size="md" variant="light" />
            <p className="mt-0.5 text-xs text-cyan-200">
              Scheepsmarkt intelligence
            </p>
          </div>
        </div>

        {/* Navigation + Status */}
        <div className="flex items-center gap-4">
          <nav className="flex items-center gap-2">
            <NavLink href="/">Dashboard</NavLink>
            <NavLink href="/analytics">Analyse</NavLink>
          </nav>
          <div className="hidden items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 sm:flex">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            <span className="text-xs font-medium text-cyan-100">Live</span>
          </div>
        </div>
      </div>
    </header>
  );
}
