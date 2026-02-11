"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import AuthForm from "@/components/AuthForm";

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const errorParam = searchParams.get("error");
  const nextParam = searchParams.get("next") ?? "/";
  const safeNext = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/";

  return (
    <div className="rounded-2xl bg-white p-8 shadow-lg ring-1 ring-gray-100">
      <h1 className="text-2xl font-bold text-slate-900">Inloggen</h1>
      <p className="mt-1 text-sm text-slate-500">
        Log in of maak een account aan bij Navisio
      </p>

      {errorParam && (
        <div className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          Inloggen mislukt. Probeer het opnieuw.
        </div>
      )}

      <div className="mt-6">
        <AuthForm
          onSuccess={() => {
            router.push(safeNext);
            router.refresh();
          }}
          redirectTo={typeof window !== "undefined"
            ? `${window.location.origin}/auth/callback?next=${encodeURIComponent(safeNext)}`
            : undefined}
        />
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <div className="mx-auto max-w-md px-4 py-12 sm:px-6">
        <Suspense>
          <LoginContent />
        </Suspense>
      </div>
      <Footer />
    </div>
  );
}
