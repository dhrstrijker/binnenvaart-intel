"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSubscription } from "@/lib/useSubscription";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SearchTaskPage from "@/components/SearchTaskPage";

export default function ZoekopdrachtenPage() {
  const router = useRouter();
  const { user, isPremium, isLoading } = useSubscription();

  useEffect(() => {
    if (!isLoading && !user) {
      router.push("/login");
    }
  }, [user, isLoading, router]);

  if (isLoading || !user) {
    return (
      <div className="min-h-screen bg-slate-50">
        <Header />
        <div className="flex items-center justify-center py-24">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-cyan-500" />
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <SearchTaskPage user={user} isPremium={isPremium} />
      <Footer />
    </div>
  );
}
