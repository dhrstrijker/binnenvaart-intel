"use client";

import { useState, useEffect } from "react";
import { useAuthModal } from "@/lib/AuthModalContext";

interface AuthNudgeToastProps {
  onDismiss: () => void;
}

export default function AuthNudgeToast({ onDismiss }: AuthNudgeToastProps) {
  const [visible, setVisible] = useState(false);
  const { openAuthModal } = useAuthModal();

  // Slide in after a short delay for a gentle entrance
  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 800);
    return () => clearTimeout(timer);
  }, []);

  function handleDismiss() {
    setVisible(false);
    setTimeout(onDismiss, 300); // wait for exit animation
  }

  return (
    <div
      className={`fixed bottom-5 right-5 z-40 w-80 rounded-xl bg-white p-4 shadow-xl ring-1 ring-slate-200 transition-all duration-300 ${
        visible ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
      }`}
    >
      <button
        onClick={handleDismiss}
        className="absolute right-2.5 top-2.5 text-slate-300 transition hover:text-slate-500"
        title="Sluiten"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-cyan-50">
          <svg className="h-4 w-4 text-cyan-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
          </svg>
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-800">
            Favorieten bewaren?
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            Maak een account aan om je favorieten op te slaan en meldingen te ontvangen.
          </p>
          <button
            onClick={() => { openAuthModal(); handleDismiss(); }}
            className="mt-2.5 rounded-lg bg-cyan-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-cyan-700"
          >
            Account aanmaken
          </button>
        </div>
      </div>
    </div>
  );
}
