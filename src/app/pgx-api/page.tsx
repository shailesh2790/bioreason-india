"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth";

const TRACKED_DRUGS = [
  "Clopidogrel", "Warfarin", "Primaquine", "Codeine", "Tramadol",
  "Simvastatin", "Azathioprine", "Irinotecan",
];

interface Alert {
  severity: string;
  variant: string;
  gene: string;
  star_allele: string;
  af_india: number;
  af_global: number;
  category: string;
  message: string;
  action: string;
  alternatives: string[];
  test_recommended: boolean;
}

interface CheckResponse {
  drug: string;
  sensitivity: string;
  overall_severity: string;
  alerts: Alert[];
  safer_alternatives: { name: string; rationale: string }[];
  indian_context: any;
}

const PYTHON_SNIPPET = `import requests

resp = requests.post(
    "https://bioreason-india.vercel.app/api/pgx/check",
    json={
        "drug": "Clopidogrel",
        "variants": ["rs4244285"],   # CYP2C19*2 — known carrier
        "state": "Bihar",
        "ethnicity": "Indo-Aryan",
        "indication": "ACS",
    },
)
result = resp.json()
if result["overall_severity"] == "HIGH":
    # Block the prescription, surface alternatives
    show_clinician_alert(result["alerts"], result["safer_alternatives"])`;

const CURL_SNIPPET = `curl -X POST https://bioreason-india.vercel.app/api/pgx/check \\
  -H "Content-Type: application/json" \\
  -d '{
    "drug": "Clopidogrel",
    "variants": ["rs4244285"],
    "state": "Bihar"
  }'`;

const JS_SNIPPET = `// EHR client — runs at prescription-write time
const r = await fetch("https://bioreason-india.vercel.app/api/pgx/check", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    drug: "Clopidogrel",
    variants: ["rs4244285"],     // pull from patient PGx record
    state: patient.state,         // applies Indian population prior if no genotype
    ethnicity: patient.ancestry,
    indication: "ACS",
  }),
});
const safety = await r.json();
if (safety.overall_severity === "HIGH") {
  prescribingUI.blockAndAlert(safety);
}`;

export default function PgxApiPage() {
  const { fetchWithAuth } = useAuth();
  const [drug, setDrug] = useState("Clopidogrel");
  const [variants, setVariants] = useState("rs4244285");
  const [state, setState] = useState("Bihar");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CheckResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const test = async () => {
    setLoading(true); setError(null); setResult(null);
    try {
      const res = await fetchWithAuth("/api/pgx/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          drug,
          variants: variants.split(",").map((v) => v.trim()).filter(Boolean),
          state,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Error"); return; }
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "error");
    } finally {
      setLoading(false);
    }
  };

  const sevColor = (s: string) =>
    s === "HIGH" ? "var(--red)" :
    s === "MODERATE" ? "var(--amber)" :
    s === "INFO" ? "var(--blue)" : "var(--text-3)";

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "40px 24px" }}>

        <div style={{ marginBottom: 32 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
            <span className="badge badge-purple">SOLUTION 3 · PGx Safety Layer</span>
            <span className="badge badge-green">Production API</span>
            <span style={{ color: "var(--text-3)", fontSize: 12 }}>Sub-200ms · Stateless · EHR-ready</span>
          </div>
          <h1 style={{ fontSize: 36, fontWeight: 900, letterSpacing: "-0.03em", marginBottom: 10 }}>
            Pharmacogenomic <span style={{ color: "var(--purple)" }}>Safety API</span>
          </h1>
          <p style={{ color: "var(--text-2)", fontSize: 15, maxWidth: 760, lineHeight: 1.7 }}>
            CYP2C19*2 makes clopidogrel ineffective. It occurs in <strong style={{ color: "var(--red)" }}>23% of South Asians</strong> vs 15% globally. ~300M Indians are on antiplatelet therapy. No Indian EHR flags this. <strong style={{ color: "var(--text-1)" }}>This API does</strong> — embed it in any prescribing system and surface IndiGen-calibrated PGx alerts at the moment a doctor types the drug name.
          </p>
        </div>

        {/* Live demo + result */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>

          <div className="card" style={{ padding: 20 }}>
            <p className="section-label" style={{ marginBottom: 14 }}>Live demo</p>

            <label style={{ fontSize: 11, color: "var(--text-3)", display: "block", marginBottom: 4 }}>Drug</label>
            <select value={drug} onChange={(e) => setDrug(e.target.value)} style={{
              width: "100%", padding: "9px 12px", fontSize: 13, marginBottom: 10,
              background: "var(--surface-2)", border: "1px solid var(--border)",
              borderRadius: 10, color: "var(--text-1)", outline: "none",
            }}>
              {TRACKED_DRUGS.map((d) => <option key={d}>{d}</option>)}
            </select>

            <label style={{ fontSize: 11, color: "var(--text-3)", display: "block", marginBottom: 4 }}>
              Patient variants (rsids, comma-separated; leave empty for population-prior)
            </label>
            <input value={variants} onChange={(e) => setVariants(e.target.value)} className="input-bio"
              placeholder="rs4244285, rs5030655"
              style={{ width: "100%", padding: "9px 12px", fontSize: 13, marginBottom: 10 }}
            />

            <label style={{ fontSize: 11, color: "var(--text-3)", display: "block", marginBottom: 4 }}>State (for population priors)</label>
            <input value={state} onChange={(e) => setState(e.target.value)} className="input-bio"
              style={{ width: "100%", padding: "9px 12px", fontSize: 13, marginBottom: 14 }}
            />

            <button onClick={test} disabled={loading} className="btn-primary"
              style={{ width: "100%", padding: "10px 18px", fontSize: 13, background: loading ? "var(--surface-3)" : "var(--purple)", color: "#fff", border: "none", borderRadius: 9, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer" }}
            >
              {loading ? "Checking…" : "POST /api/pgx/check →"}
            </button>
          </div>

          <div className="card" style={{ padding: 20, minHeight: 240 }}>
            <p className="section-label" style={{ marginBottom: 14 }}>Response</p>
            {error && <p style={{ color: "#fca5a5", fontSize: 13 }}>⚠ {error}</p>}
            {!result && !error && !loading && (
              <p style={{ fontSize: 13, color: "var(--text-3)" }}>Click <em>POST /api/pgx/check</em> to see a real response.</p>
            )}
            {loading && <p style={{ fontSize: 13, color: "var(--text-3)" }}>…</p>}
            {result && (
              <div>
                <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12 }}>
                  <span style={{
                    padding: "4px 12px", borderRadius: 99, fontSize: 11, fontWeight: 800,
                    background: `${sevColor(result.overall_severity)}20`,
                    color: sevColor(result.overall_severity),
                    border: `1px solid ${sevColor(result.overall_severity)}40`,
                  }}>
                    {result.overall_severity}
                  </span>
                  <span style={{ fontSize: 12, color: "var(--text-3)" }}>
                    {result.alerts.length} alert{result.alerts.length === 1 ? "" : "s"} · {result.sensitivity} sensitivity
                  </span>
                </div>
                {result.alerts.map((a, i) => (
                  <div key={i} style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, padding: 10, marginBottom: 8 }}>
                    <p style={{ fontSize: 12, color: sevColor(a.severity), fontWeight: 700, marginBottom: 4 }}>
                      [{a.severity}] {a.gene}{a.star_allele} ({a.category})
                    </p>
                    <p style={{ fontSize: 12, color: "var(--text-2)", marginBottom: 6 }}>{a.message}</p>
                    <p style={{ fontSize: 11, color: "var(--text-3)" }}>{a.action}</p>
                  </div>
                ))}
                {result.safer_alternatives.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <p className="section-label" style={{ marginBottom: 6 }}>Safer alternatives</p>
                    {result.safer_alternatives.map((s) => (
                      <p key={s.name} style={{ fontSize: 12, color: "var(--text-2)", marginBottom: 4 }}>
                        <strong style={{ color: "var(--green)" }}>{s.name}</strong> — {s.rationale}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Endpoint reference */}
        <div className="card" style={{ padding: 24, marginBottom: 16 }}>
          <p className="section-label" style={{ marginBottom: 14 }}>Endpoint reference</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {[
              { method: "POST", path: "/api/pgx/check", desc: "Single-drug prescription safety check" },
              { method: "POST", path: "/api/pgx/batch", desc: "Bulk medication review (e.g. pre-discharge reconciliation)" },
              { method: "GET",  path: "/api/pgx/drugs", desc: "List drugs covered by the layer" },
              { method: "GET",  path: "/api/pgx/variants", desc: "List variants tracked + Indian allele frequencies" },
            ].map((ep) => (
              <div key={ep.path} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", background: "var(--surface-2)", borderRadius: 8 }}>
                <span style={{
                  padding: "2px 8px", borderRadius: 5, fontSize: 11, fontFamily: "monospace", fontWeight: 800,
                  background: ep.method === "POST" ? "var(--blue-dim)" : "var(--green-dim)",
                  color: ep.method === "POST" ? "var(--blue)" : "var(--green)",
                  border: `1px solid ${ep.method === "POST" ? "rgba(59,130,246,0.3)" : "rgba(16,185,129,0.3)"}`,
                }}>{ep.method}</span>
                <code style={{ fontSize: 13, fontFamily: "monospace", color: "var(--text-1)" }}>{ep.path}</code>
                <span style={{ fontSize: 12, color: "var(--text-3)", marginLeft: "auto" }}>{ep.desc}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Code samples */}
        <div className="card" style={{ padding: 24 }}>
          <p className="section-label" style={{ marginBottom: 14 }}>Integration examples</p>

          <p style={{ fontSize: 11, color: "var(--text-3)", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 700, marginBottom: 6 }}>Python</p>
          <pre style={{ fontSize: 12, color: "var(--text-2)", fontFamily: "monospace", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, padding: 14, overflowX: "auto", lineHeight: 1.6, margin: 0, marginBottom: 16 }}>{PYTHON_SNIPPET}</pre>

          <p style={{ fontSize: 11, color: "var(--text-3)", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 700, marginBottom: 6 }}>JavaScript / TypeScript (in EHR client)</p>
          <pre style={{ fontSize: 12, color: "var(--text-2)", fontFamily: "monospace", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, padding: 14, overflowX: "auto", lineHeight: 1.6, margin: 0, marginBottom: 16 }}>{JS_SNIPPET}</pre>

          <p style={{ fontSize: 11, color: "var(--text-3)", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 700, marginBottom: 6 }}>cURL</p>
          <pre style={{ fontSize: 12, color: "var(--green)", fontFamily: "monospace", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, padding: 14, overflowX: "auto", lineHeight: 1.6, margin: 0 }}>{CURL_SNIPPET}</pre>
        </div>

      </div>
    </main>
  );
}
