"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";

interface AuditEvent {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  ts: string | null;
}

interface Summary {
  email: string;
  name: string;
  total_events: number;
  by_type: Record<string, number>;
  latest: string | null;
}

const TYPE_LABEL: Record<string, string> = {
  repurpose: "Drug Repurposing",
  validate_dossier: "CDSCO Dossier",
  herbcheck: "HerbCheck Screen",
};

const TYPE_COLOR: Record<string, string> = {
  repurpose: "var(--blue)",
  validate_dossier: "var(--amber)",
  herbcheck: "var(--red)",
};

function fmtTs(ts: string | null): string {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleString("en-IN", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return ts; }
}

function summarizePayload(type: string, p: Record<string, unknown>): string {
  if (type === "repurpose") return `${p.disease ?? "?"} → ${p.candidate_count ?? 0} candidates${p.top ? ` (top: ${p.top})` : ""}`;
  if (type === "validate_dossier") return `${p.compound ?? "?"} · ${p.evidence_strength ?? "?"} evidence${p.applicant_firm ? ` · ${p.applicant_firm}` : ""}`;
  if (type === "herbcheck") {
    const herbs = Array.isArray(p.herbs) ? (p.herbs as string[]).join(", ") : "?";
    const drugs = Array.isArray(p.drugs) ? (p.drugs as string[]).join(", ") : "?";
    return `${herbs} × ${drugs} · ${p.interaction_count ?? 0} interactions · ${p.highest_severity ?? "—"}`;
  }
  return JSON.stringify(p).slice(0, 120);
}

export default function DashboardPage() {
  const { user, fetchWithAuth } = useAuth();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [sRes, eRes] = await Promise.all([
          fetchWithAuth("/api/me/summary"),
          fetchWithAuth("/api/me/events?limit=100"),
        ]);
        const s = await sRes.json();
        const e = await eRes.json();
        if (cancelled) return;
        if (!sRes.ok) setError(s.error ?? "Failed to load summary");
        else { setSummary(s); setEvents(e.events ?? []); }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Network error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user, fetchWithAuth]);

  const exportCsv = () => {
    const rows = [["timestamp", "type", "detail"]];
    events.forEach((e) => rows.push([e.ts ?? "", e.type, summarizePayload(e.type, e.payload)]));
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `petridish_activity_${Date.now()}.csv`;
    a.click();
  };

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <div style={{ maxWidth: 1000, margin: "0 auto", padding: "40px 24px" }}>
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <span className="badge badge-green">Account</span>
            <span style={{ color: "var(--text-3)", fontSize: 12 }}>Audit trail · regulatory traceability</span>
          </div>
          <h1 style={{ fontSize: 32, fontWeight: 900, letterSpacing: "-0.03em", marginBottom: 8 }}>
            Your <span style={{ color: "var(--green)" }}>Workbench</span>
          </h1>
          <p style={{ color: "var(--text-2)", fontSize: 14 }}>
            {summary?.name || user?.displayName || "Signed in"} · {summary?.email || user?.email}
          </p>
        </div>

        {loading && (
          <div className="card" style={{ padding: 40, textAlign: "center", color: "var(--text-3)" }}>
            Loading your activity…
          </div>
        )}

        {error && !loading && (
          <div style={{ background: "var(--red-dim)", border: "1px solid rgba(244,63,94,0.3)", borderRadius: 12, padding: "14px 18px", marginBottom: 16 }}>
            <p style={{ color: "#fca5a5", fontSize: 14 }}>⚠ {error}</p>
            <p style={{ color: "var(--text-3)", fontSize: 12, marginTop: 6 }}>
              If this is your first session, run a query on /repurpose, /validate, or /herbcheck and refresh.
            </p>
          </div>
        )}

        {summary && !loading && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 18 }}>
              <div className="card" style={{ padding: 18, textAlign: "center" }}>
                <p style={{ fontSize: 10, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Total Actions</p>
                <p style={{ fontSize: 26, fontWeight: 800, color: "var(--text-1)" }}>{summary.total_events}</p>
              </div>
              {Object.entries(summary.by_type).map(([t, n]) => (
                <div key={t} className="card" style={{ padding: 18, textAlign: "center" }}>
                  <p style={{ fontSize: 10, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>{TYPE_LABEL[t] ?? t}</p>
                  <p style={{ fontSize: 26, fontWeight: 800, color: TYPE_COLOR[t] ?? "var(--text-1)" }}>{n}</p>
                </div>
              ))}
            </div>

            <div className="card" style={{ padding: 22 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <p className="section-label">Activity log ({events.length})</p>
                {events.length > 0 && (
                  <button onClick={exportCsv} style={{
                    padding: "7px 16px", borderRadius: 8, border: "1px solid var(--border)",
                    background: "var(--surface-2)", color: "var(--text-2)", fontSize: 12,
                    fontWeight: 600, cursor: "pointer",
                  }}>↓ Export CSV</button>
                )}
              </div>
              {events.length === 0 ? (
                <p style={{ color: "var(--text-3)", fontSize: 13, padding: "24px 0", textAlign: "center" }}>
                  No activity yet. Generate a dossier, run a repurposing scan, or screen a herb-drug pair — your audit trail builds automatically.
                </p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {events.map((e) => (
                    <div key={e.id} style={{
                      display: "grid", gridTemplateColumns: "150px 130px 1fr", gap: 12,
                      alignItems: "center", padding: "9px 12px",
                      background: "var(--surface-2)", borderRadius: 8, fontSize: 12.5,
                    }}>
                      <span style={{ color: "var(--text-3)", fontSize: 11 }}>{fmtTs(e.ts)}</span>
                      <span style={{ color: TYPE_COLOR[e.type] ?? "var(--text-2)", fontWeight: 700, fontSize: 11.5 }}>
                        {TYPE_LABEL[e.type] ?? e.type}
                      </span>
                      <span style={{ color: "var(--text-2)" }}>{summarizePayload(e.type, e.payload)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <p style={{ marginTop: 16, fontSize: 11, color: "var(--text-3)", lineHeight: 1.6 }}>
              Every dossier, repurposing scan, and herb-drug screen is logged with a server-side timestamp in Firestore —
              an immutable per-user audit trail aligned with CDSCO submission traceability and FDA 21 CFR Part 11 expectations.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
