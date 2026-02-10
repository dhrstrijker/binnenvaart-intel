"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import NavisioLogo from "./NavisioLogo";
import NavLink from "./NavLink";
import NotificationsDropdown from "./NotificationsDropdown";
import LiveDropdown from "./LiveDropdown";
import { useAuthModal } from "@/lib/AuthModalContext";
import { useOutsideClick } from "@/lib/useOutsideClick";
import { useSubscription } from "@/lib/useSubscription";
import { useFlyingAnimation } from "@/lib/FlyingAnimationContext";
import { useLocalFavorites } from "@/lib/useLocalFavorites";

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const mobileNavRef = useRef<HTMLDivElement>(null);
  const mobileToggleRef = useRef<HTMLButtonElement>(null);
  const router = useRouter();
  const { openAuthModal } = useAuthModal();
  const { user, isPremium } = useSubscription();
  const flyingCtx = useFlyingAnimation();
  const { localFavorites } = useLocalFavorites();

  const headerRef = useRef<HTMLElement>(null);
  const favoritesTargetRef = useRef<HTMLSpanElement>(null);
  const notificationsTargetRef = useRef<HTMLSpanElement>(null);
  const [authFavCount, setAuthFavCount] = useState(0);

  // Fetch favorites count for logged-in users
  useEffect(() => {
    if (!user) { setAuthFavCount(0); return; }
    const supabase = createClient();
    supabase
      .from("favorites")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .then(({ count }) => setAuthFavCount(count ?? 0));
  }, [user]);

  const favoritesCount = user ? authFavCount : localFavorites.length;

  // Register flying animation targets
  useEffect(() => {
    if (!flyingCtx) return;
    flyingCtx.registerTarget("favorites", () => favoritesTargetRef.current?.getBoundingClientRect() ?? null);
    flyingCtx.registerTarget("notifications", () => notificationsTargetRef.current?.getBoundingClientRect() ?? null);
  }, [flyingCtx]);

  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const closeMobileNav = useCallback(() => setMobileNavOpen(false), []);

  // Expose header height as CSS variable for sticky filter bar positioning
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      document.documentElement.style.setProperty(
        "--header-h",
        `${entry.contentRect.height}px`,
      );
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useOutsideClick(menuRef, closeMenu, menuOpen);
  useOutsideClick(mobileNavRef, closeMobileNav, mobileNavOpen, [mobileToggleRef]);

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
    <header ref={headerRef} className="sticky top-0 z-30 bg-slate-950 shadow-lg">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6">
        <Link href="/">
          <NavisioLogo size="md" variant="light" />
        </Link>

        {/* Desktop: Navigation + Auth */}
        <div className="hidden items-center gap-4 md:flex">
          <nav className="flex items-center gap-2">
            <NavLink href="/">Dashboard</NavLink>
          </nav>

          {/* Favorites heart icon */}
          <span ref={favoritesTargetRef} data-fly-target="favorites">
            <Link
              href="/favorieten"
              className="relative flex h-8 w-8 items-center justify-center rounded-full text-cyan-200 transition hover:bg-white/10 hover:text-white"
              title="Favorieten"
            >
              <svg className="h-5 w-5 fav-outline" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
              </svg>
              <svg className="h-5 w-5 fav-filled hidden" viewBox="0 0 24 24" fill="currentColor">
                <path d="M11.645 20.91l-.007-.003-.022-.012a15.247 15.247 0 01-.383-.218 25.18 25.18 0 01-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0112 5.052 5.5 5.5 0 0116.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 01-4.244 3.17 15.247 15.247 0 01-.383.219l-.022.012-.007.004-.003.001a.752.752 0 01-.704 0l-.003-.001z" />
              </svg>
              {favoritesCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                  {favoritesCount}
                </span>
              )}
            </Link>
          </span>

          {/* Notifications dropdown */}
          <span ref={notificationsTargetRef} data-fly-target="notifications">
            <NotificationsDropdown user={user} isPremium={isPremium} />
          </span>

          <LiveDropdown />

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
              <button
                onClick={() => openAuthModal()}
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-cyan-200 transition hover:bg-white/10 hover:text-white"
              >
                Inloggen
              </button>
              <button
                onClick={() => openAuthModal()}
                className="rounded-lg bg-cyan-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-cyan-500"
              >
                Registreren
              </button>
            </div>
          )}
        </div>

        {/* Mobile: Bell + Hamburger button */}
        <div className="flex items-center gap-1 md:hidden">
          <NotificationsDropdown user={user} isPremium={isPremium} />
          <button
            ref={mobileToggleRef}
            onClick={() => setMobileNavOpen(!mobileNavOpen)}
            className="flex items-center justify-center rounded-lg p-2 text-cyan-200 transition hover:bg-white/10 hover:text-white"
            aria-label={mobileNavOpen ? "Menu sluiten" : "Menu openen"}
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
      </div>

      {/* Mobile navigation menu */}
      {mobileNavOpen && (
        <div ref={mobileNavRef} className="border-t border-white/10 md:hidden">
          <nav className="flex flex-col gap-1 px-4 py-3">
            <NavLink href="/" onClick={() => setMobileNavOpen(false)}>Dashboard</NavLink>
            <NavLink href="/favorieten" onClick={() => setMobileNavOpen(false)}>
              <span className="inline-flex items-center gap-2">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
                </svg>
                Favorieten
                {favoritesCount > 0 && (
                  <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                    {favoritesCount}
                  </span>
                )}
              </span>
            </NavLink>
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
                  onClick={handleSignOut}
                  className="rounded-lg px-3 py-1.5 text-left text-sm font-medium text-red-400 transition hover:bg-white/10"
                >
                  Uitloggen
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => { setMobileNavOpen(false); openAuthModal(); }}
                  className="rounded-lg px-3 py-1.5 text-left text-sm font-medium text-cyan-200 transition hover:bg-white/10 hover:text-white"
                >
                  Inloggen
                </button>
                <button
                  onClick={() => { setMobileNavOpen(false); openAuthModal(); }}
                  className="rounded-lg bg-cyan-600 px-3 py-1.5 text-center text-sm font-semibold text-white transition hover:bg-cyan-500"
                >
                  Registreren
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
