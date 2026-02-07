"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

export default function NotificationSignup() {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [consent, setConsent] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
  }, []);

  async function handleSubscribe() {
    if (!user || !consent) return;
    setStatus("loading");

    const verificationToken = crypto.randomUUID();
    const unsubscribeToken = crypto.randomUUID();

    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("notification_subscribers")
        .insert({
          email: user.email!.toLowerCase(),
          user_id: user.id,
          verification_token: verificationToken,
          unsubscribe_token: unsubscribeToken,
        });

      if (error) {
        if (error.code === "23505") {
          setStatus("success");
          setMessage("Dit e-mailadres is al aangemeld. Controleer je inbox voor de verificatiemail.");
        } else {
          setStatus("error");
          setMessage("Er ging iets mis. Probeer het later opnieuw.");
        }
        return;
      }

      // Send verification email via API route
      await fetch("/api/send-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: user.email!.toLowerCase(),
          verificationToken,
        }),
      });

      setStatus("success");
      setMessage("Verificatiemail verstuurd! Controleer je inbox om je aanmelding te bevestigen.");
    } catch {
      setStatus("error");
      setMessage("Er ging iets mis. Probeer het later opnieuw.");
    }
  }

  return (
    <div className="rounded-xl bg-slate-950 p-6 text-center shadow-lg">
      <div className="mx-auto max-w-md">
        <svg
          className="mx-auto h-8 w-8 text-cyan-300"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"
          />
        </svg>
        <h3 className="mt-3 text-lg font-semibold text-white">
          E-mailnotificaties
        </h3>
        <p className="mt-1 text-sm text-cyan-200">
          Ontvang een melding bij nieuwe schepen en prijswijzigingen.
        </p>

        {!user ? (
          <div className="mt-4">
            <Link
              href="/login"
              className="inline-block rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-50"
            >
              Log in om meldingen te ontvangen
            </Link>
          </div>
        ) : status === "success" ? (
          <div className="mt-4 rounded-lg bg-emerald-500/20 px-4 py-3">
            <p className="text-sm font-medium text-emerald-300">{message}</p>
          </div>
        ) : (
          <div className="mt-4">
            <p className="mb-3 text-sm text-cyan-100">
              Meldingen worden gestuurd naar <strong>{user.email}</strong>
            </p>
            <label className="mb-3 flex items-start gap-2 text-left">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-600 bg-slate-800 text-cyan-400 focus:ring-cyan-400"
              />
              <span className="text-xs text-cyan-200/80">
                Ik ga akkoord met het ontvangen van e-mailnotificaties over
                nieuwe schepen en prijswijzigingen.
              </span>
            </label>
            <button
              onClick={handleSubscribe}
              disabled={status === "loading" || !consent}
              className="rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-50 disabled:opacity-50"
            >
              {status === "loading" ? "..." : "Aanmelden voor notificaties"}
            </button>
          </div>
        )}

        {status === "error" && (
          <p className="mt-2 text-sm text-red-300">{message}</p>
        )}
      </div>
    </div>
  );
}
