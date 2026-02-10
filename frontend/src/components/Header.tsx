"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import NavisioLogo from "./NavisioLogo";
import NavLink from "./NavLink";
import NotificationsDropdown from "./NotificationsDropdown";
import FavoritesDropdown from "./FavoritesDropdown";
import LiveDropdown from "./LiveDropdown";
import { useAuthModal } from "@/lib/AuthModalContext";
import { useOutsideClick } from "@/lib/useOutsideClick";
import { useSubscription } from "@/lib/useSubscription";
import { useFlyingAnimation } from "@/lib/FlyingAnimationContext";

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { openAuthModal } = useAuthModal();
  const { user, isPremium } = useSubscription();
  const flyingCtx = useFlyingAnimation();
  const headerRef = useRef<HTMLElement>(null);
  const favoritesTargetRef = useRef<HTMLSpanElement>(null);
  const notificationsTargetRef = useRef<HTMLSpanElement>(null);

  // Register flying animation targets (flying is skipped on mobile < 768px)
  useEffect(() => {
    if (!flyingCtx) return;
    flyingCtx.registerTarget("favorites", () => favoritesTargetRef.current?.getBoundingClientRect() ?? null);
    flyingCtx.registerTarget("notifications", () => notificationsTargetRef.current?.getBoundingClientRect() ?? null);
  }, [flyingCtx]);

  const closeMenu = useCallback(() => setMenuOpen(false), []);

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

        {/* Right side: nav + icons + auth */}
        <div className="flex items-center gap-2 md:gap-4">
          {/* Desktop nav links */}
          <nav className="hidden items-center gap-2 md:flex">
            <NavLink href="/">Dashboard</NavLink>
          </nav>

          {/* Favorites dropdown */}
          <span ref={favoritesTargetRef} data-fly-target="favorites">
            <FavoritesDropdown user={user} />
          </span>

          {/* Notifications dropdown */}
          <span ref={notificationsTargetRef} data-fly-target="notifications">
            <NotificationsDropdown user={user} isPremium={isPremium} />
          </span>

          {/* Live badge (hidden on small screens via its own classes) */}
          <LiveDropdown />

          {/* Account */}
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
              {/* Desktop: single login button */}
              <button
                onClick={() => openAuthModal()}
                className="hidden rounded-lg bg-cyan-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-cyan-500 md:block"
              >
                Inloggen
              </button>
              {/* Mobile: person icon */}
              <button
                onClick={() => openAuthModal()}
                className="flex h-8 w-8 items-center justify-center rounded-full text-cyan-200 transition hover:bg-white/10 hover:text-white md:hidden"
                aria-label="Inloggen"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                </svg>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
