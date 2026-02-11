"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

interface AuthFormProps {
  message?: string;
  onSuccess?: (user: User) => void;
  /** Override the magic-link redirect URL (defaults to /auth/callback?next=current_path) */
  redirectTo?: string;
}

export default function AuthForm({ message, onSuccess, redirectTo }: AuthFormProps) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<"request" | "verify">("request");
  const [resendCooldown, setResendCooldown] = useState(0);
  const successNotifiedRef = useRef(false);

  const notifySuccess = useCallback((user: User) => {
    if (successNotifiedRef.current) return;
    successNotifiedRef.current = true;
    onSuccess?.(user);
  }, [onSuccess]);

  // Detect cross-tab magic link completion (user clicks link in another tab)
  useEffect(() => {
    const supabase = createClient();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session?.user) {
        notifySuccess(session.user);
      }
    });
    return () => subscription.unsubscribe();
  }, [notifySuccess]);

  // Countdown for resend cooldown to limit accidental rapid retries.
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  function buildRedirectUrl() {
    return redirectTo ??
      `${window.location.origin}/auth/callback?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
  }

  async function sendEmailCode() {
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const emailRedirectTo = buildRedirectUrl();

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo },
    });

    if (error) {
      setError("Er ging iets mis. Probeer het later opnieuw.");
      setLoading(false);
      return;
    }

    successNotifiedRef.current = false;
    setStep("verify");
    setCode("");
    setResendCooldown(30);
    setLoading(false);
  }

  async function handleRequestCode(e: React.FormEvent) {
    e.preventDefault();
    await sendEmailCode();
  }

  async function handleVerifyCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const token = code.trim();

    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token,
      type: "email",
    });

    if (error || !data.user) {
      setError("Code ongeldig of verlopen. Vraag een nieuwe code aan.");
      setLoading(false);
      return;
    }

    notifySuccess(data.user);
    setLoading(false);
  }

  async function handleResendCode() {
    if (resendCooldown > 0 || loading) return;
    await sendEmailCode();
  }

  async function handleGoogle() {
    const supabase = createClient();
    const googleRedirectTo = buildRedirectUrl();

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: googleRedirectTo },
    });
    if (error) setError("Inloggen met Google mislukt. Probeer het later opnieuw.");
  }

  if (step === "verify") {
    return (
      <div className="py-2">
        {message && (
          <div className="mb-4 rounded-lg bg-cyan-50 px-4 py-3 text-sm text-cyan-800">
            {message}
          </div>
        )}

        <div className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
            <svg className="h-6 w-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 4.26a2.25 2.25 0 002.22 0L21 8m-18 0h18v8.25A2.25 2.25 0 0118.75 18.5H5.25A2.25 2.25 0 013 16.25V8z" />
            </svg>
          </div>
          <h2 className="mt-4 text-xl font-bold text-slate-900">Voer je code in</h2>
          <p className="mt-2 text-sm text-slate-500">
            We hebben een e-mail gestuurd naar <strong>{email}</strong> met een 6-cijferige code.
          </p>
        </div>

        {error && (
          <div className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleVerifyCode} className="mt-4 space-y-3">
          <div>
            <label htmlFor="auth-code" className="block text-sm font-medium text-slate-700">
              6-cijferige code
            </label>
            <input
              id="auth-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              required
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-center text-base tracking-[0.2em] text-slate-900 shadow-sm focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
              placeholder="123456"
            />
          </div>

          <button
            type="submit"
            disabled={loading || code.length !== 6}
            className="w-full rounded-lg bg-cyan-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-cyan-700 disabled:opacity-50"
          >
            {loading ? "Bezig..." : "Inloggen met code"}
          </button>
        </form>

        <div className="mt-3 flex items-center justify-between">
          <button
            onClick={handleResendCode}
            disabled={loading || resendCooldown > 0}
            className="text-sm font-medium text-cyan-600 transition hover:text-cyan-700 disabled:opacity-50"
          >
            {resendCooldown > 0 ? `Nieuwe code over ${resendCooldown}s` : "Nieuwe code sturen"}
          </button>
          <button
            onClick={() => {
              setStep("request");
              setCode("");
              setError(null);
            }}
            className="text-sm font-medium text-slate-500 transition hover:text-slate-700"
          >
            Andere e-mail
          </button>
        </div>

        <p className="mt-3 text-center text-xs text-slate-400">
          Werkt de code niet? Je kunt ook de link uit dezelfde e-mail gebruiken.
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Optional contextual message */}
      {message && (
        <div className="mb-4 rounded-lg bg-cyan-50 px-4 py-3 text-sm text-cyan-800">
          {message}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Google OAuth */}
      <button
        onClick={handleGoogle}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
      >
        <svg className="h-5 w-5" viewBox="0 0 24 24">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
        </svg>
        Doorgaan met Google
      </button>

      {/* Divider */}
      <div className="my-5 relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-slate-200" />
        </div>
        <div className="relative flex justify-center text-xs">
          <span className="bg-white px-3 text-slate-400">of</span>
        </div>
      </div>

      {/* Email OTP form */}
      <form onSubmit={handleRequestCode} className="space-y-3">
        <div>
          <label htmlFor="auth-email" className="block text-sm font-medium text-slate-700">
            E-mailadres
          </label>
          <input
            id="auth-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 shadow-sm focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
            placeholder="uw@email.nl"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-cyan-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-cyan-700 disabled:opacity-50"
        >
          {loading ? "Bezig..." : "Code versturen"}
        </button>
        <p className="text-center text-xs text-slate-400">
          We sturen een eenmalige code (en eventueel een inloglink) naar je e-mail
        </p>
      </form>
    </div>
  );
}
