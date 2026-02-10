"use client";

import React, { useRef } from "react";
import type { User } from "@supabase/supabase-js";
import { useEscapeKey } from "@/lib/useEscapeKey";
import { useBodyScrollLock } from "@/lib/useBodyScrollLock";
import AuthForm from "@/components/AuthForm";

interface AuthModalProps {
  message?: string;
  onSuccess: (user: User) => void;
  onClose: () => void;
}

export default function AuthModal({ message, onSuccess, onClose }: AuthModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEscapeKey(onClose);
  useBodyScrollLock();

  function handleOverlayClick(e: React.MouseEvent) {
    if (e.target === overlayRef.current) onClose();
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
          <h2 className="text-xl font-bold text-slate-900">Inloggen</h2>
          <p className="mt-1 text-sm text-slate-500">
            Log in of maak een account aan bij Navisio
          </p>
          <div className="mt-5">
            <AuthForm message={message} onSuccess={onSuccess} />
          </div>
        </div>
      </div>
    </div>
  );
}
