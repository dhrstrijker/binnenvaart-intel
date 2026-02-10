"use client";

import React, { useState, useEffect } from "react";
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
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  // Detect cross-tab magic link completion (user clicks link in another tab)
  useEffect(() => {
    const supabase = createClient();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session?.user) {
        onSuccess?.(session.user);
      }
    });
    return () => subscription.unsubscribe();
  }, [onSuccess]);

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const emailRedirectTo = redirectTo ??
      `${window.location.origin}/auth/callback?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo },
    });

    if (error) {
      setError("Er ging iets mis. Probeer het later opnieuw.");
      setLoading(false);
      return;
    }

    setEmailSent(true);
    setLoading(false);
  }

  async function handleGoogle() {
    const supabase = createClient();
    const googleRedirectTo = redirectTo ??
      `${window.location.origin}/auth/callback?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: googleRedirectTo },
    });
    if (error) setError("Inloggen met Google mislukt. Probeer het later opnieuw.");
  }

  // "Check your inbox" state
  if (emailSent) {
    return (
      <div className="text-center py-2">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
          <svg className="h-6 w-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
          </svg>
        </div>
        <h2 className="mt-4 text-xl font-bold text-slate-900">Controleer je inbox</h2>
        <p className="mt-2 text-sm text-slate-500">
          We hebben een inloglink gestuurd naar <strong>{email}</strong>.
          Klik op de link in de e-mail om in te loggen.
        </p>
        <button
          onClick={() => { setEmailSent(false); setEmail(""); }}
          className="mt-4 text-sm font-medium text-cyan-600 transition hover:text-cyan-700"
        >
          Andere e-mail gebruiken
        </button>
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

      {/* Magic link email form */}
      <form onSubmit={handleMagicLink} className="space-y-3">
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
          {loading ? "Bezig..." : "Inloglink versturen"}
        </button>
        <p className="text-center text-xs text-slate-400">
          We sturen een link waarmee je direct inlogt
        </p>
      </form>
    </div>
  );
}
