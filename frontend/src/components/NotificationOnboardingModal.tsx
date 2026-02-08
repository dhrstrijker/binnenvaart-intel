"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

interface NotificationOnboardingModalProps {
  vesselId: string;
  onSuccess: () => void;
  onClose: () => void;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
            nonce: string;
          }) => void;
          renderButton: (
            element: HTMLElement,
            config: { theme: string; size: string; width: number; text: string }
          ) => void;
        };
      };
    };
  }
}

export default function NotificationOnboardingModal({
  vesselId,
  onSuccess,
  onClose,
}: NotificationOnboardingModalProps) {
  const [email, setEmail] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [alreadySubscribed, setAlreadySubscribed] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [googleError, setGoogleError] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);

  const overlayRef = useRef<HTMLDivElement>(null);
  const googleBtnRef = useRef<HTMLDivElement>(null);
  const nonceRef = useRef<string>("");

  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

  // Close on Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Prevent body scroll
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  // Handle Google credential response
  const handleGoogleCredential = useCallback(
    async (response: { credential: string }) => {
      setGoogleError(null);
      setGoogleLoading(true);

      try {
        const supabase = createClient();
        const { error } = await supabase.auth.signInWithIdToken({
          provider: "google",
          token: response.credential,
          nonce: nonceRef.current,
        });

        if (error) {
          setGoogleError("Inloggen met Google mislukt. Probeer het opnieuw.");
          setGoogleLoading(false);
          return;
        }

        // Auto-subscribe the authenticated user
        await fetch("/api/notifications/subscribe-auth", { method: "POST" });

        // Add to watchlist
        const { data } = await supabase.auth.getUser();
        if (data.user) {
          await supabase
            .from("watchlist")
            .insert({ user_id: data.user.id, vessel_id: vesselId });
        }

        setGoogleLoading(false);
        onSuccess();
      } catch {
        setGoogleError("Er ging iets mis. Probeer het opnieuw.");
        setGoogleLoading(false);
      }
    },
    [vesselId, onSuccess]
  );

  // Load Google Identity Services
  useEffect(() => {
    if (!googleClientId || !googleBtnRef.current) return;

    // Generate nonce
    const rawNonce = crypto.randomUUID();
    nonceRef.current = rawNonce;

    async function initGoogle() {
      // SHA-256 hash the nonce for Google
      const encoder = new TextEncoder();
      const data = encoder.encode(nonceRef.current);
      const hashBuffer = await crypto.subtle.digest("SHA-256", data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashedNonce = hashArray
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      // Check if script already loaded
      if (window.google?.accounts?.id) {
        window.google.accounts.id.initialize({
          client_id: googleClientId!,
          callback: handleGoogleCredential,
          nonce: hashedNonce,
        });
        if (googleBtnRef.current) {
          window.google.accounts.id.renderButton(googleBtnRef.current, {
            theme: "outline",
            size: "large",
            width: 360,
            text: "signin_with",
          });
        }
        return;
      }

      // Load script
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.onload = () => {
        if (!window.google) return;
        window.google.accounts.id.initialize({
          client_id: googleClientId!,
          callback: handleGoogleCredential,
          nonce: hashedNonce,
        });
        if (googleBtnRef.current) {
          window.google.accounts.id.renderButton(googleBtnRef.current, {
            theme: "outline",
            size: "large",
            width: 360,
            text: "signin_with",
          });
        }
      };
      document.head.appendChild(script);
    }

    initGoogle();
  }, [googleClientId, handleGoogleCredential]);

  function handleOverlayClick(e: React.MouseEvent) {
    if (e.target === overlayRef.current) onClose();
  }

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    setEmailError(null);
    setEmailLoading(true);

    try {
      const res = await fetch("/api/notifications/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();

      if (!res.ok) {
        setEmailError(data.error ?? "Er ging iets mis. Probeer het opnieuw.");
        setEmailLoading(false);
        return;
      }

      if (data.already_subscribed) {
        setAlreadySubscribed(true);
      } else {
        setEmailSent(true);
      }
      setEmailLoading(false);
    } catch {
      setEmailError("Er ging iets mis. Probeer het opnieuw.");
      setEmailLoading(false);
    }
  }

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
    >
      <div className="relative w-full max-w-md rounded-2xl bg-white shadow-2xl">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
        >
          <svg
            className="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>

        <div className="p-6 pt-8">
          {/* Header */}
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-50">
              <svg
                className="h-5 w-5 text-amber-600"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M5.25 9a6.75 6.75 0 0113.5 0v.75c0 2.123.8 4.057 2.118 5.52a.75.75 0 01-.297 1.206c-1.544.57-3.16.99-4.831 1.243a3.75 3.75 0 11-7.48 0 24.585 24.585 0 01-4.831-1.244.75.75 0 01-.298-1.205A8.217 8.217 0 005.25 9.75V9zm4.502 8.9a2.25 2.25 0 004.496 0 25.057 25.057 0 01-4.496 0z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                Ontvang meldingen
              </h2>
              <p className="text-sm text-slate-500">
                Log direct in met Google, of ontvang meldingen via e-mail.
              </p>
            </div>
          </div>

          {googleLoading ? (
            <div className="flex items-center justify-center py-8">
              <svg
                className="h-6 w-6 animate-spin text-cyan-600"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              <span className="ml-3 text-sm text-slate-600">
                Bezig met inloggen...
              </span>
            </div>
          ) : alreadySubscribed ? (
            /* Already subscribed state */
            <div className="text-center py-4">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-cyan-100">
                <svg
                  className="h-6 w-6 text-cyan-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <p className="mt-4 text-sm text-slate-600">
                <strong className="text-slate-900">{email}</strong> ontvangt al
                meldingen. Log in om dit schip aan je volglijst toe te voegen.
              </p>
              <button
                onClick={onClose}
                className="mt-5 rounded-lg bg-cyan-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-cyan-700"
              >
                Sluiten
              </button>
            </div>
          ) : emailSent ? (
            /* Email success state */
            <div className="text-center py-4">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
                <svg
                  className="h-6 w-6 text-emerald-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <p className="mt-4 text-sm text-slate-600">
                We hebben een verificatielink gestuurd naar{" "}
                <strong className="text-slate-900">{email}</strong>. Klik op de
                link om meldingen te activeren.
              </p>
              <button
                onClick={onClose}
                className="mt-5 rounded-lg bg-cyan-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-cyan-700"
              >
                Sluiten
              </button>
            </div>
          ) : (
            <>
              {/* Google sign-in button */}
              {googleClientId && (
                <>
                  <div ref={googleBtnRef} className="flex justify-center" />
                  {googleError && (
                    <p className="mt-2 text-center text-xs text-red-600">
                      {googleError}
                    </p>
                  )}

                  {/* Divider */}
                  <div className="my-5 relative">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-slate-200" />
                    </div>
                    <div className="relative flex justify-center text-xs">
                      <span className="bg-white px-3 text-slate-400">
                        of via e-mail
                      </span>
                    </div>
                  </div>
                </>
              )}

              {/* Email form */}
              <form onSubmit={handleEmailSubmit} className="space-y-3">
                <div>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
                    placeholder="uw@email.nl"
                  />
                </div>
                {emailError && (
                  <p className="text-xs text-red-600">{emailError}</p>
                )}
                <button
                  type="submit"
                  disabled={emailLoading}
                  className="w-full rounded-lg bg-cyan-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-cyan-700 disabled:opacity-50"
                >
                  {emailLoading ? "Bezig..." : "Meldingen activeren"}
                </button>
              </form>

              <p className="mt-4 text-center text-xs text-slate-400">
                Je kunt je op elk moment afmelden.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
