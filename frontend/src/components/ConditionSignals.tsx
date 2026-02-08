import { Vessel } from "@/lib/supabase";

interface ConditionSignalsProps {
  vessel: Vessel;
}

interface Signal {
  label: string;
  value: string;
  status: "good" | "neutral" | "warning";
}

function getNestedValue(obj: Record<string, unknown>, path: string): string | null {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return null;
    const match = part.match(/^(.+)\[(\d+)]$/);
    if (match) {
      current = (current as Record<string, unknown>)[match[1]];
      if (!Array.isArray(current)) return null;
      current = current[parseInt(match[2])];
    } else {
      current = (current as Record<string, unknown>)[part];
    }
  }
  if (current == null) return null;
  if (typeof current === "string") return current;
  if (typeof current === "number" || typeof current === "boolean") return String(current);
  if (Array.isArray(current)) {
    const texts = current.map((item) => {
      if (item == null) return null;
      if (typeof item !== "object") return String(item);
      const o = item as Record<string, unknown>;
      const name = o.name ?? o.title ?? o.type ?? o.description;
      if (name) return String(name);
      const strs = Object.values(o).filter((v) => typeof v === "string");
      return strs.length > 0 ? strs.join(", ") : null;
    }).filter(Boolean);
    return texts.length > 0 ? texts.join("; ") : null;
  }
  if (typeof current === "object") {
    const o = current as Record<string, unknown>;
    const name = o.name ?? o.title ?? o.type ?? o.description;
    if (name) return String(name);
    const strs = Object.values(o).filter((v) => typeof v === "string");
    return strs.length > 0 ? strs.join(", ") : null;
  }
  return String(current);
}

function extractSignals(vessel: Vessel): Signal[] {
  const raw = vessel.raw_details;
  if (!raw || typeof raw !== "object") return [];

  const signals: Signal[] = [];
  const source = vessel.source;

  // Engine hours
  const engineHoursPaths: Record<string, string> = {
    pcshipbrokers: "hoofdmotor uren",
    gtsschepen: "machinekamer - draaiuren totaal",
    rensendriessen: "main_engine_1_hours",
  };
  const ehPath = engineHoursPaths[source];
  if (ehPath) {
    const val = source === "rensendriessen"
      ? getNestedValue(raw, ehPath)
      : (raw[ehPath] as string | null);
    if (val && val !== "null" && val.trim() !== "") {
      signals.push({ label: "Draaiuren motor", value: val, status: "neutral" });
    }
  }
  // GSK engines
  const gskEngineHours = getNestedValue(raw, "technics.engines[0].runningHours");
  if (source === "gsk" && gskEngineHours && gskEngineHours !== "null") {
    signals.push({ label: "Draaiuren motor", value: gskEngineHours, status: "neutral" });
  }

  // Certificate
  const certPaths: Record<string, string> = {
    pcshipbrokers: "certificaat van onderzoek",
    gtsschepen: "algemene gegevens - certificaat van onderzoek",
    rensendriessen: "certificate_shipsattest",
  };
  const certPath = certPaths[source];
  if (certPath) {
    const val = source === "rensendriessen"
      ? getNestedValue(raw, certPath)
      : (raw[certPath] as string | null);
    if (val && val !== "null" && val.trim() !== "") {
      signals.push({ label: "Certificaat van onderzoek", value: val, status: "good" });
    }
  }
  // GSK certificates
  const gskCert = getNestedValue(raw, "general.certificates");
  if (source === "gsk" && gskCert && gskCert !== "null") {
    signals.push({ label: "Certificaat", value: gskCert, status: "good" });
  }

  // Green Award (pcshipbrokers only)
  if (source === "pcshipbrokers") {
    const greenAward = raw["green award"] as string | null;
    if (greenAward && greenAward !== "null" && greenAward.trim() !== "") {
      signals.push({ label: "Green Award", value: greenAward, status: "good" });
    }
  }

  // Renovations
  if (source === "pcshipbrokers") {
    const reno = raw["recente vernieuwingen"] as string | null;
    if (reno && reno !== "null" && reno.trim() !== "") {
      signals.push({ label: "Recente vernieuwingen", value: reno, status: "good" });
    }
  }
  if (source === "gsk") {
    const improvements = getNestedValue(raw, "lifestory.improvements");
    if (improvements && improvements !== "null" && improvements.trim() !== "") {
      signals.push({ label: "Verbeteringen", value: improvements, status: "good" });
    }
  }

  // Revision year
  if (source === "gtsschepen") {
    const rev = raw["machinekamer - jaar revisie"] as string | null;
    if (rev && rev !== "null" && rev.trim() !== "") {
      signals.push({ label: "Jaar revisie motor", value: rev, status: "neutral" });
    }
  }
  if (source === "rensendriessen") {
    const rev = getNestedValue(raw, "main_engine_1_revision");
    if (rev && rev !== "null" && rev.trim() !== "") {
      signals.push({ label: "Revisie motor", value: rev, status: "neutral" });
    }
  }

  return signals;
}

const statusColors: Record<Signal["status"], string> = {
  good: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  neutral: "bg-slate-50 text-slate-700 ring-slate-200",
  warning: "bg-amber-50 text-amber-700 ring-amber-200",
};

const statusIcons: Record<Signal["status"], string> = {
  good: "text-emerald-500",
  neutral: "text-slate-400",
  warning: "text-amber-500",
};

export default function ConditionSignals({ vessel }: ConditionSignalsProps) {
  const signals = extractSignals(vessel);
  if (signals.length === 0) return null;

  return (
    <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
      <h2 className="text-sm font-semibold text-slate-900">Conditie-indicatoren</h2>
      <div className="mt-3 space-y-2">
        {signals.map((s) => (
          <div key={s.label} className={`rounded-lg px-3 py-2 ring-1 ${statusColors[s.status]}`}>
            <div className="flex items-start gap-2">
              <svg className={`mt-0.5 h-4 w-4 shrink-0 ${statusIcons[s.status]}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                {s.status === "good" ? (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                ) : s.status === "warning" ? (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                )}
              </svg>
              <div className="min-w-0">
                <p className="text-xs font-medium">{s.label}</p>
                <p className="mt-0.5 text-xs break-words">{s.value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
