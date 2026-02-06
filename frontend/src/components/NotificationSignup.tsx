"use client";

import React, { useState } from "react";
import { getSupabase } from "@/lib/supabase";

export default function NotificationSignup() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;

    setStatus("loading");
    try {
      const supabase = getSupabase();
      const { error } = await supabase
        .from("notification_subscribers")
        .insert({ email: email.trim().toLowerCase() });

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
      setEmail("");
    } catch {
      setStatus("error");
      setMessage("Er ging iets mis. Probeer het later opnieuw.");
    }
  }

  return (
    <div className="rounded-xl bg-[#1e3a5f] p-6 text-center shadow-lg">
      <div className="mx-auto max-w-md">
        <svg
          className="mx-auto h-8 w-8 text-blue-300"
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
        <p className="mt-1 text-sm text-blue-200">
          Ontvang een melding bij nieuwe schepen en prijswijzigingen.
        </p>

        {status === "success" ? (
          <div className="mt-4 rounded-lg bg-emerald-500/20 px-4 py-3">
            <p className="text-sm font-medium text-emerald-300">{message}</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-4 flex gap-2">
            <input
              type="email"
              required
              placeholder="uw@email.nl"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (status === "error") setStatus("idle");
              }}
              className="min-w-0 flex-1 rounded-lg border border-white/20 bg-white/10 px-4 py-2.5 text-sm text-white placeholder-blue-300/60 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
            />
            <button
              type="submit"
              disabled={status === "loading"}
              className="rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-[#1e3a5f] transition hover:bg-blue-50 disabled:opacity-50"
            >
              {status === "loading" ? "..." : "Aanmelden"}
            </button>
          </form>
        )}

        {status === "error" && (
          <p className="mt-2 text-sm text-red-300">{message}</p>
        )}
      </div>
    </div>
  );
}
