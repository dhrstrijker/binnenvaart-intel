"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

export interface Subscription {
  id: string;
  status: string;
  current_period_end: string;
  recurring_interval: string;
  cancel_at_period_end: boolean;
}

export function useSubscription() {
  const [user, setUser] = useState<User | null>(null);
  const [isPremium, setIsPremium] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [subscription, setSubscription] = useState<Subscription | null>(null);

  useEffect(() => {
    const supabase = createClient();

    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);

      if (user) {
        const { data } = await supabase
          .from("subscriptions")
          .select("id, status, current_period_end, recurring_interval, cancel_at_period_end")
          .eq("user_id", user.id)
          .eq("status", "active")
          .gt("current_period_end", new Date().toISOString())
          .limit(1)
          .maybeSingle();

        if (data) {
          setIsPremium(true);
          setSubscription(data);
        }
      }
      setIsLoading(false);
    }

    load();

    const { data: { subscription: authSub } } = supabase.auth.onAuthStateChange(() => {
      load();
    });

    return () => authSub.unsubscribe();
  }, []);

  return { user, isPremium, isLoading, subscription };
}
