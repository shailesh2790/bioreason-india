"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth";

interface QueryResult {
  drug: string;
  synergists: any[];
  phyto_synergists: any[];
  answer: string;
  error?: string;
}

const EXAMPLE_DRUGS = [
  "Metformin", "Warfarin", "Imatinib", "Doxorubicin",
  "Rifampicin", "Isoniazid", "Artemisinin", "Dapsone",
];

export default function SynergyPage() {
  const { fetchWithAuth } = useAuth();
  const [drug, setDrug] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (d = drug) => {
    if (!d.trim() || loading) return;
    setLoading(true);
    setResult(null);
    setError(null);

    const question = `Drug combination analysis for ${d}:
1. Which drugs are marked as SYNERGISTIC_WITH ${d} in the knowledge graph?
2. Which IMPPAT phytochemicals are synergistic with ${d}?
3. For each synergistic pair, what shared gene targets or pathways explain the synergy?
4. Flag any combinations that might be clinically relevant for Indian patients (India-endemic diseases or Indian PGx context).
5. Are there any CONTRAINDICATED combinations to avoid?
Return up to 15 synergistic partners ranked by mechanistic evidence strength.`;

    try {
      const res = await fetchWithAuth("/api/reason", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, max_hops: 3, india_context: true }),
      });
      const data = await res.json();
      if (data.error) { setError(data.error); return; }
      setResult({ drug: d, synergists: [], phyto_synergists: [], answer: data.answer });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <div style={{ maxWidth: 1000, margin: "0 auto", padding: "40px 24px" }}>

        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <span className="badge badge-cyan">Synergy Explorer</span>
            <span style={{ color: "var(--text-3)", fontSize: 12 }}>2.67M SYNERGISTIC_WITH edges · PrimeKG</span>
          </div>
          <h1 style={{ fontSize: 36, fontWeight: 900, letterSpacing: "-0.03em", marginBottom: 10 }}>
            Drug Combination{" "}
            <span style={{ color: "var(--cyan)" }}>Explorer</span>
          </h1>
          <p style={{ color: "var(--text-2)", fontSize: 15, maxWidth: 620, lineHeight: 1.7 }}>
            Discover synergistic drug combinations from 2.67M curated pharmacological interaction edges.
            Includes Ayurvedic compound synergies — unique to PetriDish. Optimised for India-endemic diseases.
          </p>
        </div>

        {/* Drug selector */}
        <div className="card" style={{ padding: 24, marginBottom: 24 }}>
          <label className="section-label" style={{ display: "block", marginBottom: 14 }}>Select Drug</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 18 }}>
            {EXAMPLE_DRUGS.map((d) => (
              <button
                key={d}
                onClick={() => setDrug(d)}
                style={{
                  fontSize: 12, padding: "6px 14px", borderRadius: 8,
                  cursor: "pointer", fontWeight: 600, transition: "all 0.15s",
                  background: drug === d ? "var(--cyan-dim)" : "var(--surface-2)",
                  color: drug === d ? "var(--cyan)" : "var(--text-3)",
                  border: drug === d ? "1px solid rgba(6,182,212,0.4)" : "1px solid var(--border)",
                }}
              >
                {d}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <input
              value={drug}
              onChange={(e) => setDrug(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && run()}
              placeholder="Or type any drug name…"
              className="input-bio"
              style={{ flex: 1, padding: "11px 16px", fontSize: 14 }}
            />
            <button
              onClick={() => run()}
              disabled={!drug.trim() || loading}
              style={{
                padding: "11px 24px",
                background: drug.trim() && !loading ? "var(--cyan)" : "var(--surface-3)",
                color: drug.trim() && !loading ? "#030B14" : "var(--text-3)",
                border: "none", borderRadius: 10, fontWeight: 800, fontSize: 14,
                cursor: drug.trim() && !loading ? "pointer" : "not-allowed",
                transition: "all 0.2s",
              }}
            >
              {loading ? "Scanning…" : "Find Synergies →"}
            </button>
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="card" style={{ padding: "48px 24px", textAlign: "center" }}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
              <svg width="48" height="48" viewBox="0 0 48 48" style={{ animation: "rotate-slow 2s linear infinite" }}>
                <circle cx="24" cy="24" r="22" stroke="var(--border)" strokeWidth="2" fill="none" />
                <path d="M14 10 C20 16 28 16 34 10" stroke="var(--cyan)" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
                <path d="M14 18 C20 24 28 24 34 18" stroke="var(--cyan)" strokeWidth="2.5" fill="none" strokeLinecap="round" opacity="0.7"/>
                <path d="M14 26 C20 32 28 32 34 26" stroke="var(--green)" strokeWidth="2.5" fill="none" strokeLinecap="round" opacity="0.7"/>
                <path d="M14 34 C20 40 28 40 34 34" stroke="var(--green)" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
                <line x1="14" y1="10" x2="14" y2="34" stroke="rgba(6,182,212,0.3)" strokeWidth="1.5"/>
                <line x1="34" y1="10" x2="34" y2="34" stroke="rgba(16,185,129,0.3)" strokeWidth="1.5"/>
              </svg>
            </div>
            <p style={{ color: "var(--text-2)", fontSize: 15, fontWeight: 600, marginBottom: 6 }}>
              Scanning 2.67M synergy edges…
            </p>
            <p style={{ color: "var(--text-3)", fontSize: 13 }}>Including Ayurvedic compound synergies</p>
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div style={{ background: "var(--red-dim)", border: "1px solid rgba(244,63,94,0.3)", borderRadius: 12, padding: "14px 18px" }}>
            <p style={{ color: "#fca5a5", fontSize: 14 }}>⚠ {error}</p>
          </div>
        )}

        {/* Result */}
        {result && !loading && (
          <div style={{ background: "var(--surface)", border: "1px solid rgba(6,182,212,0.25)", borderRadius: 16, padding: 24 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <p className="section-label">Synergy Analysis</p>
                <span style={{ fontSize: 14, fontFamily: "monospace", fontWeight: 800, color: "var(--cyan)" }}>
                  {result.drug}
                </span>
              </div>
              <span style={{ fontSize: 11, color: "var(--text-3)", fontFamily: "monospace" }}>
                PrimeKG · IMPPAT · DrugBank
              </span>
            </div>
            <div className="analysis-text">{result.answer}</div>
          </div>
        )}
      </div>
    </main>
  );
}
