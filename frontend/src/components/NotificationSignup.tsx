"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

export default function NotificationSignup() {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
  }, []);

  async function handleSubscribe() {
    if (!user) return;
    setStatus("loading");

    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("notification_subscribers")
        .insert({
          email: user.email!.toLowerCase(),
          user_id: user.id,
        });

      if (error) {
        if (error.code === "23505") {
          setStatus("success");
          setMessage("Dit e-mailadres is al aangemeld.");
        } else {
          setStatus("error");
          setMessage("Er ging iets mis. Probeer het later opnieuw.");
        }
        return;
      }

      setStatus("success");
      setMessage("Aangemeld! U ontvangt een e-mail bij wijzigingen.");
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
            <button
              onClick={handleSubscribe}
              disabled={status === "loading"}
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
