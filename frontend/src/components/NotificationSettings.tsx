"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

interface NotificationPreferences {
  new_vessels: boolean;
  price_changes: boolean;
  removed_vessels: boolean;
}

const DEFAULT_PREFS: NotificationPreferences = {
  new_vessels: true,
  price_changes: true,
  removed_vessels: false,
};

interface NotificationSettingsProps {
  user: User;
}

export default function NotificationSettings({ user }: NotificationSettingsProps) {
  const [prefs, setPrefs] = useState<NotificationPreferences>(DEFAULT_PREFS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("notification_subscribers")
      .select("preferences")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.preferences) {
          setPrefs({ ...DEFAULT_PREFS, ...(data.preferences as NotificationPreferences) });
        }
        setLoading(false);
      });
  }, [user.id]);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    const supabase = createClient();

    const { error } = await supabase
      .from("notification_subscribers")
      .upsert(
        {
          user_id: user.id,
          email: user.email,
          preferences: prefs,
          active: true,
        },
        { onConflict: "user_id" }
      );

    setSaving(false);
    if (!error) {
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    }
  }

  function toggle(key: keyof NotificationPreferences) {
    setPrefs((prev) => ({ ...prev, [key]: !prev[key] }));
    setSaved(false);
  }

  if (loading) {
    return (
      <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-cyan-500" />
          <span className="text-sm text-slate-400">Meldingen laden...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
        E-mailmeldingen
      </h2>
      <p className="mt-1 text-xs text-slate-400">
        Kies welke meldingen je per e-mail wilt ontvangen.
      </p>

      <div className="mt-4 space-y-3">
        <ToggleRow
          label="Nieuwe schepen"
          description="Ontvang een melding wanneer er nieuwe schepen worden gevonden."
          checked={prefs.new_vessels}
          onChange={() => toggle("new_vessels")}
        />
        <ToggleRow
          label="Prijswijzigingen"
          description="Ontvang een melding wanneer de prijs van een schip verandert."
          checked={prefs.price_changes}
          onChange={() => toggle("price_changes")}
        />
        <ToggleRow
          label="Verwijderde schepen"
          description="Ontvang een melding wanneer een schip van de markt verdwijnt."
          checked={prefs.removed_vessels}
          onChange={() => toggle("removed_vessels")}
        />
      </div>

      <div className="mt-5 flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg bg-cyan-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-cyan-700 disabled:opacity-50"
        >
          {saving ? "Opslaan..." : "Voorkeuren opslaan"}
        </button>
        {saved && (
          <span className="text-sm font-medium text-emerald-600">
            Opgeslagen
          </span>
        )}
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={onChange}
        className={`relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
          checked ? "bg-cyan-600" : "bg-slate-200"
        }`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform ${
            checked ? "translate-x-4.5" : "translate-x-0.5"
          }`}
        />
      </button>
      <div>
        <p className="text-sm font-medium text-slate-800">{label}</p>
        <p className="text-xs text-slate-400">{description}</p>
      </div>
    </label>
  );
}
