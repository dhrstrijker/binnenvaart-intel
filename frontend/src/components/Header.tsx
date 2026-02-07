"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import NavisioLogo from "./NavisioLogo";
import NavLink from "./NavLink";
import type { User } from "@supabase/supabase-js";

export default function Header() {
  const [user, setUser] = useState<User | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setUser(data.user));

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    setMenuOpen(false);
    router.push("/");
    router.refresh();
  }

  const initials = user?.user_metadata?.full_name
    ? (user.user_metadata.full_name as string)
        .split(" ")
        .map((n: string) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : user?.email?.slice(0, 2).toUpperCase() ?? "?";

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

        {/* Desktop: Navigation + Auth */}
        <div className="hidden items-center gap-4 md:flex">
          <nav className="flex items-center gap-2">
            <NavLink href="/">Dashboard</NavLink>
            <NavLink href="/analytics">Analyse</NavLink>
            <NavLink href="/pricing">Prijzen</NavLink>
          </nav>

          <div className="hidden items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 sm:flex">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            <span className="text-xs font-medium text-cyan-100">Live</span>
          </div>

          {/* Auth buttons */}
          {user ? (
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-cyan-600 text-xs font-bold text-white transition hover:bg-cyan-500"
              >
                {initials}
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-full z-50 mt-2 w-48 rounded-xl bg-white py-1 shadow-xl ring-1 ring-gray-100">
                  <div className="border-b border-slate-100 px-4 py-2">
                    <p className="truncate text-sm font-medium text-slate-900">
                      {user.user_metadata?.full_name || user.email}
                    </p>
                    {user.user_metadata?.full_name && (
                      <p className="truncate text-xs text-slate-400">{user.email}</p>
                    )}
                  </div>
                  <Link
                    href="/account"
                    onClick={() => setMenuOpen(false)}
                    className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    Account
                  </Link>
                  <button
                    onClick={handleSignOut}
                    className="block w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                  >
                    Uitloggen
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                href="/login"
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-cyan-200 transition hover:bg-white/10 hover:text-white"
              >
                Inloggen
              </Link>
              <Link
                href="/signup"
                className="rounded-lg bg-cyan-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-cyan-500"
              >
                Registreren
              </Link>
            </div>
          )}
        </div>

        {/* Mobile: Hamburger button */}
        <button
          onClick={() => setMobileNavOpen(!mobileNavOpen)}
          className="flex items-center justify-center rounded-lg p-2 text-cyan-200 transition hover:bg-white/10 hover:text-white md:hidden"
          aria-label="Menu openen"
        >
          {mobileNavOpen ? (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          )}
        </button>
      </div>

      {/* Mobile navigation menu */}
      {mobileNavOpen && (
        <div className="border-t border-white/10 md:hidden">
          <nav className="flex flex-col gap-1 px-4 py-3">
            <NavLink href="/">Dashboard</NavLink>
            <NavLink href="/analytics">Analyse</NavLink>
            <NavLink href="/pricing">Prijzen</NavLink>
          </nav>
          <div className="border-t border-white/10 px-4 py-3">
            {user ? (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-cyan-600 text-xs font-bold text-white">
                    {initials}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-white">
                      {user.user_metadata?.full_name || user.email}
                    </p>
                    {user.user_metadata?.full_name && (
                      <p className="truncate text-xs text-cyan-300">{user.email}</p>
                    )}
                  </div>
                </div>
                <Link
                  href="/account"
                  onClick={() => setMobileNavOpen(false)}
                  className="rounded-lg px-3 py-1.5 text-sm font-medium text-cyan-200 transition hover:bg-white/10 hover:text-white"
                >
                  Account
                </Link>
                <button
                  onClick={() => { handleSignOut(); setMobileNavOpen(false); }}
                  className="rounded-lg px-3 py-1.5 text-left text-sm font-medium text-red-400 transition hover:bg-white/10"
                >
                  Uitloggen
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <Link
                  href="/login"
                  onClick={() => setMobileNavOpen(false)}
                  className="rounded-lg px-3 py-1.5 text-sm font-medium text-cyan-200 transition hover:bg-white/10 hover:text-white"
                >
                  Inloggen
                </Link>
                <Link
                  href="/signup"
                  onClick={() => setMobileNavOpen(false)}
                  className="rounded-lg bg-cyan-600 px-3 py-1.5 text-center text-sm font-semibold text-white transition hover:bg-cyan-500"
                >
                  Registreren
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
