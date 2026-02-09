"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useEscapeKey } from "@/lib/useEscapeKey";
import { useBodyScrollLock } from "@/lib/useBodyScrollLock";

type Step =
  | "initial"
  | "sending"
  | "emailSent"
  | "login"
  | "loggingIn"
  | "googleLoading";

interface NotificationOnboardingModalProps {
  vesselId: string;
  onSuccess: () => void;
  onClose: () => void;
}

export default function NotificationOnboardingModal({
  vesselId,
  onSuccess,
  onClose,
}: NotificationOnboardingModalProps) {
  const [step, setStep] = useState<Step>("initial");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const overlayRef = useRef<HTMLDivElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEscapeKey(onClose);
  useBodyScrollLock();

  // Focus password field when login step appears
  useEffect(() => {
    if (step === "login") {
      setTimeout(() => passwordRef.current?.focus(), 100);
    }
  }, [step]);

  const completeAfterLogin = useCallback(async () => {
    const supabase = createClient();
    await fetch("/api/notifications/subscribe-auth", { method: "POST" });
    const { data } = await supabase.auth.getUser();
    if (data.user) {
      await supabase
        .from("watchlist")
        .insert({ user_id: data.user.id, vessel_id: vesselId });
    }
    onSuccess();
  }, [vesselId, onSuccess]);

  function handleOverlayClick(e: React.MouseEvent) {
    if (e.target === overlayRef.current) onClose();
  }

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setStep("sending");

    try {
      const res = await fetch("/api/notifications/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Er ging iets mis. Probeer het opnieuw.");
        setStep("initial");
        return;
      }

      if (data.already_subscribed) {
        setStep("login");
      } else {
        setStep("emailSent");
      }
    } catch {
      setError("Er ging iets mis. Probeer het opnieuw.");
      setStep("initial");
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setStep("loggingIn");

    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        setError("Wachtwoord onjuist. Probeer het opnieuw.");
        setStep("login");
        return;
      }

      await completeAfterLogin();
    } catch {
      setError("Er ging iets mis. Probeer het opnieuw.");
      setStep("login");
    }
  }

  async function handleGoogleLogin() {
    setError(null);
    setStep("googleLoading");
    const supabase = createClient();
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(window.location.pathname + window.location.search)}`,
      },
    });
    if (oauthError) {
      setError("Inloggen met Google mislukt. Probeer het opnieuw.");
      setStep("initial");
    }
  }

  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

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
                {step === "login" || step === "loggingIn"
                  ? "Inloggen"
                  : "Ontvang meldingen"}
              </h2>
              <p className="text-sm text-slate-500">
                {step === "login" || step === "loggingIn"
                  ? "Log in om dit schip aan je volglijst toe te voegen."
                  : "Log direct in met Google, of ontvang meldingen via e-mail."}
              </p>
            </div>
          </div>

          {step === "googleLoading" ? (
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
          ) : step === "login" || step === "loggingIn" ? (
            <>
              <div className="mb-4 rounded-lg bg-cyan-50 px-4 py-3 text-sm text-cyan-800">
                Je ontvangt al meldingen op{" "}
                <strong>{email}</strong>. Log in om dit schip te volgen.
              </div>

              <form onSubmit={handleLogin} className="space-y-3">
                <div>
                  <input
                    type="email"
                    value={email}
                    disabled
                    className="block w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-500"
                  />
                </div>
                <div>
                  <input
                    ref={passwordRef}
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
                    placeholder="Wachtwoord"
                  />
                </div>
                {error && <p className="text-xs text-red-600">{error}</p>}
                <button
                  type="submit"
                  disabled={step === "loggingIn"}
                  className="w-full rounded-lg bg-cyan-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-cyan-700 disabled:opacity-50"
                >
                  {step === "loggingIn" ? "Bezig..." : "Inloggen"}
                </button>
              </form>

              {/* Divider + Google */}
              {googleClientId && (
                <div className="mt-4">
                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-slate-200" />
                    </div>
                    <div className="relative flex justify-center text-xs">
                      <span className="bg-white px-3 text-slate-400">of</span>
                    </div>
                  </div>
                  <button
                    onClick={handleGoogleLogin}
                    className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
                  >
                    <GoogleIcon />
                    Inloggen met Google
                  </button>
                </div>
              )}

              <button
                onClick={() => {
                  setStep("initial");
                  setError(null);
                }}
                className="mt-3 w-full text-center text-xs text-slate-400 hover:text-slate-600 transition"
              >
                Terug
              </button>
            </>
          ) : step === "emailSent" ? (
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
            /* initial + sending */
            <>
              {/* Google sign-in button */}
              {googleClientId && (
                <>
                  <button
                    onClick={handleGoogleLogin}
                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
                  >
                    <GoogleIcon />
                    Doorgaan met Google
                  </button>

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
                {error && <p className="text-xs text-red-600">{error}</p>}
                <button
                  type="submit"
                  disabled={step === "sending"}
                  className="w-full rounded-lg bg-cyan-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-cyan-700 disabled:opacity-50"
                >
                  {step === "sending" ? "Bezig..." : "Meldingen activeren"}
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

function GoogleIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}
