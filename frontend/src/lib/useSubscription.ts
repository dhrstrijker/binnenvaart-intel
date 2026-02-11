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

    async function getUserWithTimeout(timeoutMs: number): Promise<User | null> {
      return await new Promise<User | null>((resolve, reject) => {
        const timeoutHandle = setTimeout(() => {
          reject(new Error("auth.getUser timeout"));
        }, timeoutMs);

        supabase.auth
          .getUser()
          .then(({ data }) => {
            clearTimeout(timeoutHandle);
            resolve(data.user ?? null);
          })
          .catch((err) => {
            clearTimeout(timeoutHandle);
            reject(err);
          });
      });
    }

    async function load(providedUser?: User | null) {
      try {
        const currentUser = providedUser === undefined ? await getUserWithTimeout(8000) : providedUser;
        setUser(currentUser ?? null);
        setIsPremium(false);
        setSubscription(null);

        if (currentUser) {
          const { data } = await supabase
            .from("subscriptions")
            .select("id, status, current_period_end, recurring_interval, cancel_at_period_end")
            .eq("user_id", currentUser.id)
            .eq("status", "active")
            .gt("current_period_end", new Date().toISOString())
            .limit(1)
            .maybeSingle();

          if (data) {
            setIsPremium(true);
            setSubscription(data);
          }
        }
      } catch (err) {
        console.error("Failed to load subscription state", err);
        setUser(null);
        setIsPremium(false);
        setSubscription(null);
      } finally {
        setIsLoading(false);
      }
    }

    load();

    const { data: { subscription: authSub } } = supabase.auth.onAuthStateChange((_event, session) => {
      load(session?.user ?? null);
    });

    return () => authSub.unsubscribe();
  }, []);

  return { user, isPremium, isLoading, subscription };
}
