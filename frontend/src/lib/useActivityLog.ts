"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ActivityLogEntry } from "@/lib/supabase";

export function useActivityLog(limit: number = 10) {
  const [entries, setEntries] = useState<ActivityLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch() {
      const supabase = createClient();
      const { data } = await supabase
        .from("activity_log")
        .select("*")
        .order("recorded_at", { ascending: false })
        .limit(limit);

      setEntries(data ?? []);
      setLoading(false);
    }

    fetch();
  }, [limit]);

  return { entries, loading };
}
