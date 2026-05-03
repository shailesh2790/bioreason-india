"use client";

import { useState } from "react";
import PathGraph, { PathData } from "@/components/PathGraph";
import { exportReportPdf } from "@/lib/exportPdf";

const IMPPAT_COMPOUNDS = [
  "Curcumin", "Quercetin", "Berberine", "Piperine", "Withaferin A",
  "Andrographolide", "Boswellic acid", "Bacosides", "Galantamine", "Arteannuin B",
];

interface ReasonResponse {
  answer: string;
  paths: PathData[];
  cypher_steps: { step: string; cypher: string }[];
  error?: string;
}

export default function ValidatePage() {
  const [compound, setCompound] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ReasonResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (!compound.trim() || loading) return;
    setLoading(true);
    setResult(null);
    setError(null);

    const question = `Validate the mechanistic basis for ${compound} (an Ayurvedic/IMPPAT compound).
Find: 1) Which proteins does ${compound} target or bind to in the graph?
2) Which biological pathways do those proteins participate in?
3) Which diseases are those pathways associated with?
4) Do the diseases match the traditional therapeutic uses of ${compound}?
Generate a mechanism confidence assessment suitable for regulatory submission.`;

    try {
      const res = await fetch("/api/reason", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, max_hops: 3, india_context: true }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? `Error ${res.status}`);
      else setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setLoading(false);
    }
  };

  const today = new Date().toLocaleDateString("en-IN", {
    year: "numeric", month: "long", day: "numeric",
  });

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "40px 24px" }}>

        {/* Header */}
        <div style={{ marginBottom: 36 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <span className="badge badge-amber">Module B · Ayurveda</span>
            <span className="badge badge-green">IMPPAT 2.0</span>
            <span style={{ color: "var(--text-3)", fontSize: 12 }}>17,967 phytochemicals · Regulatory grade</span>
          </div>
          <h1 style={{ fontSize: 36, fontWeight: 900, letterSpacing: "-0.03em", marginBottom: 10 }}>
            Traditional Medicine{" "}
            <span style={{ color: "var(--amber)" }}>Validation Engine</span>
          </h1>
          <p style={{ color: "var(--text-2)", fontSize: 15, maxWidth: 640, lineHeight: 1.7 }}>
            Generate computational mechanism certificates for Ayurvedic compounds —
            protein binding → pathway → disease evidence for regulatory submission.
            India's bridge between traditional medicine and modern biology.
          </p>
        </div>

        {/* Compound selector */}
        <div className="card" style={{ padding: 24, marginBottom: 24 }}>
          <label className="section-label" style={{ display: "block", marginBottom: 14 }}>
            IMPPAT Compound / Ayurvedic Formulation
          </label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 18 }}>
            {IMPPAT_COMPOUNDS.map((c) => (
              <button
                key={c}
                onClick={() => setCompound(c)}
                style={{
                  fontSize: 12,
                  padding: "6px 14px",
                  borderRadius: 8,
                  cursor: "pointer",
                  fontWeight: 600,
                  transition: "all 0.15s",
                  background: compound === c ? "var(--amber-dim)" : "var(--surface-2)",
                  color: compound === c ? "var(--amber)" : "var(--text-3)",
                  border: compound === c ? "1px solid rgba(245,158,11,0.4)" : "1px solid var(--border)",
                }}
              >
                {c}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <input
              value={compound}
              onChange={(e) => setCompound(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && run()}
              placeholder="Or type any compound name…"
              className="input-bio"
              style={{ flex: 1, padding: "11px 16px", fontSize: 14 }}
            />
            <button
              onClick={run}
              disabled={!compound.trim() || loading}
              style={{
                padding: "11px 28px",
                background: loading || !compound.trim() ? "var(--surface-3)" : "var(--amber)",
                color: loading || !compound.trim() ? "var(--text-3)" : "#030B14",
                border: "none",
                borderRadius: 10,
                fontWeight: 700,
                fontSize: 14,
                cursor: compound.trim() && !loading ? "pointer" : "not-allowed",
                transition: "all 0.2s",
              }}
            >
              {loading ? "Validating…" : "Validate →"}
            </button>
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="card" style={{ padding: "48px 24px", textAlign: "center" }}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
              <svg width="48" height="48" viewBox="0 0 48 48" style={{ animation: "rotate-slow 2.5s linear infinite" }}>
                <circle cx="24" cy="24" r="22" stroke="var(--border)" strokeWidth="2" fill="none" />
                <path d="M14 10 C20 16 28 16 34 10" stroke="var(--amber)" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
                <path d="M14 18 C20 24 28 24 34 18" stroke="var(--amber)" strokeWidth="2.5" fill="none" strokeLinecap="round" opacity="0.7"/>
                <path d="M14 26 C20 32 28 32 34 26" stroke="var(--green)" strokeWidth="2.5" fill="none" strokeLinecap="round" opacity="0.7"/>
                <path d="M14 34 C20 40 28 40 34 34" stroke="var(--green)" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
                <line x1="14" y1="10" x2="14" y2="34" stroke="rgba(245,158,11,0.3)" strokeWidth="1.5"/>
                <line x1="34" y1="10" x2="34" y2="34" stroke="rgba(16,185,129,0.3)" strokeWidth="1.5"/>
              </svg>
            </div>
            <p style={{ color: "var(--text-2)", fontSize: 15, fontWeight: 600, marginBottom: 6 }}>
              Tracing compound → protein → pathway → disease…
            </p>
            <p style={{ color: "var(--text-3)", fontSize: 13 }}>Generating mechanism certificate</p>
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div style={{ background: "var(--red-dim)", border: "1px solid rgba(244,63,94,0.3)", borderRadius: 12, padding: "14px 18px", marginBottom: 16 }}>
            <p style={{ color: "#fca5a5", fontSize: 14 }}>⚠ {error}</p>
          </div>
        )}

        {/* Results */}
        {result && !loading && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

            {/* Mechanism Certificate */}
            <div style={{
              background: "var(--surface)",
              border: "1px solid rgba(245,158,11,0.3)",
              borderRadius: 16,
              padding: 24,
            }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16, paddingBottom: 16, borderBottom: "1px solid var(--border)" }}>
                <div>
                  <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--amber)", marginBottom: 6 }}>
                    Mechanism Certificate
                  </p>
                  <h2 style={{ fontSize: 22, fontWeight: 800, color: "var(--text-1)", marginBottom: 4 }}>{compound}</h2>
                  <p style={{ fontSize: 12, color: "var(--text-3)" }}>
                    BioReason · IMPPAT 2.0 · PrimeKG · Generated {today}
                  </p>
                </div>
                <div style={{ textAlign: "right" }}>
                  <p style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 6 }}>Data sources</p>
                  <p style={{ fontSize: 11, color: "var(--amber)", fontFamily: "monospace", marginBottom: 12 }}>
                    IMPPAT · PrimeKG · UniProt · Reactome
                  </p>
                  <button
                    onClick={() => exportReportPdf({
                      title: "Traditional Medicine Validation",
                      subtitle: "Mechanism Certificate",
                      query: `Mechanistic validation for ${compound} (Ayurvedic/IMPPAT compound)`,
                      answer: result.answer,
                      paths: result.paths,
                      cypher_steps: result.cypher_steps,
                      module: "validate",
                      subject: compound,
                    })}
                    style={{
                      background: "var(--amber-dim)",
                      color: "var(--amber)",
                      border: "1px solid rgba(245,158,11,0.3)",
                      borderRadius: 8,
                      padding: "7px 16px",
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    ↓ Export Certificate PDF
                  </button>
                </div>
              </div>
              <div className="analysis-text">{result.answer}</div>
            </div>

            {/* Paths */}
            {result.paths.length > 0 && (
              <div className="card" style={{ padding: 24 }}>
                <p className="section-label" style={{ marginBottom: 16 }}>
                  Mechanistic Evidence Paths ({result.paths.length})
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {result.paths.map((path, i) => (
                    <div key={i} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 16, background: "var(--surface-2)" }}>
                      <p style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 10 }}>{path.description}</p>
                      <PathGraph path={path} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Cypher */}
            {result.cypher_steps.length > 0 && (
              <details className="card" style={{ overflow: "hidden" }}>
                <summary style={{ padding: "16px 24px", cursor: "pointer", fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-3)" }}>
                  Graph Query Steps ({result.cypher_steps.length})
                </summary>
                <div style={{ padding: "0 24px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
                  {result.cypher_steps.map((step, i) => (
                    <div key={i} style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
                      <div style={{ padding: "8px 14px", background: "var(--surface-2)", borderBottom: "1px solid var(--border)" }}>
                        <span style={{ fontSize: 12, color: "var(--text-2)" }}>Step {i + 1}: {step.step}</span>
                      </div>
                      <pre style={{ padding: "10px 14px", fontSize: 12, color: "var(--amber)", fontFamily: "monospace", overflowX: "auto", margin: 0, lineHeight: 1.6 }}>
                        {step.cypher}
                      </pre>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
