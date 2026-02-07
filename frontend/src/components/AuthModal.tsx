"use client";

import React, { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

interface AuthModalProps {
  message?: string;
  onSuccess: () => void;
  onClose: () => void;
}

export default function AuthModal({ message, onSuccess, onClose }: AuthModalProps) {
  const [tab, setTab] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [registerSuccess, setRegisterSuccess] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  // Listen for auth state changes (handles OAuth redirect + email login)
  useEffect(() => {
    const supabase = createClient();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") {
        onSuccess();
      }
    });
    return () => subscription.unsubscribe();
  }, [onSuccess]);

  function handleOverlayClick(e: React.MouseEvent) {
    if (e.target === overlayRef.current) onClose();
  }

  function resetForm() {
    setEmail("");
    setPassword("");
    setFullName("");
    setError(null);
    setRegisterSuccess(false);
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError("Inloggen mislukt. Controleer je gegevens en probeer het opnieuw.");
      setLoading(false);
      return;
    }

    setLoading(false);
    // onSuccess will be called by the auth state listener
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    setRegisterSuccess(true);
    setLoading(false);
  }

  async function handleGoogle() {
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(window.location.pathname + window.location.search)}`,
      },
    });
    if (error) setError("Inloggen met Google mislukt. Probeer het later opnieuw.");
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
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="p-6 pt-8">
          {/* Optional message */}
          {message && (
            <div className="mb-4 rounded-lg bg-cyan-50 px-4 py-3 text-sm text-cyan-800">
              {message}
            </div>
          )}

          {/* Register success state */}
          {registerSuccess ? (
            <div className="text-center py-4">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
                <svg className="h-6 w-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="mt-4 text-xl font-bold text-slate-900">Controleer je e-mail</h2>
              <p className="mt-2 text-sm text-slate-500">
                We hebben een bevestigingslink gestuurd naar <strong>{email}</strong>.
                Klik op de link om je account te activeren.
              </p>
              <button
                onClick={onClose}
                className="mt-6 rounded-lg bg-cyan-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-cyan-700"
              >
                Sluiten
              </button>
            </div>
          ) : (
            <>
              {/* Tab switcher */}
              <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
                <button
                  onClick={() => { setTab("login"); resetForm(); }}
                  className={`flex-1 rounded-md px-3 py-2 text-sm font-semibold transition ${
                    tab === "login"
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  Inloggen
                </button>
                <button
                  onClick={() => { setTab("register"); resetForm(); }}
                  className={`flex-1 rounded-md px-3 py-2 text-sm font-semibold transition ${
                    tab === "register"
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  Registreren
                </button>
              </div>

              {/* Error */}
              {error && (
                <div className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              {/* Login form */}
              {tab === "login" && (
                <form onSubmit={handleLogin} className="mt-5 space-y-4">
                  <div>
                    <label htmlFor="modal-email" className="block text-sm font-medium text-slate-700">
                      E-mailadres
                    </label>
                    <input
                      id="modal-email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 shadow-sm focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
                      placeholder="uw@email.nl"
                    />
                  </div>
                  <div>
                    <label htmlFor="modal-password" className="block text-sm font-medium text-slate-700">
                      Wachtwoord
                    </label>
                    <input
                      id="modal-password"
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 shadow-sm focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
                      placeholder="Uw wachtwoord"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full rounded-lg bg-cyan-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-cyan-700 disabled:opacity-50"
                  >
                    {loading ? "Bezig..." : "Inloggen"}
                  </button>
                </form>
              )}

              {/* Register form */}
              {tab === "register" && (
                <form onSubmit={handleRegister} className="mt-5 space-y-4">
                  <div>
                    <label htmlFor="modal-name" className="block text-sm font-medium text-slate-700">
                      Naam
                    </label>
                    <input
                      id="modal-name"
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 shadow-sm focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
                      placeholder="Uw volledige naam"
                    />
                  </div>
                  <div>
                    <label htmlFor="modal-reg-email" className="block text-sm font-medium text-slate-700">
                      E-mailadres
                    </label>
                    <input
                      id="modal-reg-email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 shadow-sm focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
                      placeholder="uw@email.nl"
                    />
                  </div>
                  <div>
                    <label htmlFor="modal-reg-password" className="block text-sm font-medium text-slate-700">
                      Wachtwoord
                    </label>
                    <input
                      id="modal-reg-password"
                      type="password"
                      required
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 shadow-sm focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
                      placeholder="Minimaal 6 tekens"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full rounded-lg bg-cyan-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-cyan-700 disabled:opacity-50"
                  >
                    {loading ? "Bezig..." : "Account aanmaken"}
                  </button>
                </form>
              )}

              {/* Divider + Google */}
              <div className="mt-5">
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-slate-200" />
                  </div>
                  <div className="relative flex justify-center text-xs">
                    <span className="bg-white px-3 text-slate-400">of</span>
                  </div>
                </div>
                <button
                  onClick={handleGoogle}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
                >
                  <svg className="h-5 w-5" viewBox="0 0 24 24">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                  </svg>
                  {tab === "login" ? "Inloggen met Google" : "Registreren met Google"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
