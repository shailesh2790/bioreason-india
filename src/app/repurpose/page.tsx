"use client";

import { useState } from "react";
import PathGraph, { PathData } from "@/components/PathGraph";
import { exportReportPdf } from "@/lib/exportPdf";

const INDIA_DISEASES = [
  "Type 2 Diabetes",
  "MDR-Tuberculosis",
  "Kala-azar (Visceral Leishmaniasis)",
  "Dengue fever",
  "Diabetic TB",
  "Alzheimer's disease",
  "Malaria",
  "Japanese Encephalitis",
  "Chronic Kidney Disease",
  "Non-alcoholic fatty liver disease",
];

interface ReasonResponse {
  answer: string;
  paths: PathData[];
  cypher_steps: { step: string; cypher: string }[];
  error?: string;
}

export default function RepurposePage() {
  const [disease, setDisease] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ReasonResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (!disease.trim() || loading) return;
    setLoading(true);
    setResult(null);
    setError(null);

    const question = `Which FDA-approved drugs could be repurposed for ${disease}?
Find drugs NOT currently approved for this disease that: target proteins in pathways associated with ${disease}, or share gene targets with drugs that treat ${disease}.
Also check if any IMPPAT phytochemicals share targets with those pathways.
For each candidate, give the exact multi-hop biological mechanism path.
Rank by strength of mechanistic connection. India-prevalent disease context applies.`;

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

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "40px 24px" }}>

        {/* Header */}
        <div style={{ marginBottom: 36 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <span className="badge badge-blue">Module A</span>
            <span className="badge badge-green">India-First</span>
            <span style={{ color: "var(--text-3)", fontSize: 12 }}>4.3M edge traversal · PrimeKG</span>
          </div>
          <h1 style={{ fontSize: 36, fontWeight: 900, letterSpacing: "-0.03em", marginBottom: 10, color: "var(--text-1)" }}>
            Drug Repurposing{" "}
            <span style={{ color: "var(--blue)" }}>Scanner</span>
          </h1>
          <p style={{ color: "var(--text-2)", fontSize: 15, maxWidth: 620, lineHeight: 1.7 }}>
            Find FDA-approved drugs with mechanistic connections to any disease —
            multi-hop paths through proteins, pathways, and Indian genetic context.
            Augmented with 17,967 IMPPAT phytochemicals.
          </p>
        </div>

        {/* Disease selector */}
        <div className="card" style={{ padding: 24, marginBottom: 24 }}>
          <label className="section-label" style={{ marginBottom: 14, display: "block" }}>
            Target Disease — India Prevalent
          </label>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 18 }}>
            {INDIA_DISEASES.map((d) => (
              <button
                key={d}
                onClick={() => setDisease(d)}
                style={{
                  fontSize: 12,
                  padding: "6px 14px",
                  borderRadius: 8,
                  cursor: "pointer",
                  fontWeight: 600,
                  transition: "all 0.15s",
                  background: disease === d ? "var(--blue-dim)" : "var(--surface-2)",
                  color: disease === d ? "var(--blue)" : "var(--text-3)",
                  border: disease === d ? "1px solid rgba(59,130,246,0.4)" : "1px solid var(--border)",
                }}
              >
                {d}
              </button>
            ))}
          </div>

          <div style={{ display: "flex", gap: 12 }}>
            <input
              value={disease}
              onChange={(e) => setDisease(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && run()}
              placeholder="Or type any disease name…"
              className="input-bio"
              style={{ flex: 1, padding: "11px 16px", fontSize: 14 }}
            />
            <button
              onClick={run}
              disabled={!disease.trim() || loading}
              style={{
                padding: "11px 28px",
                background: loading || !disease.trim() ? "var(--surface-3)" : "var(--blue)",
                color: loading || !disease.trim() ? "var(--text-3)" : "#fff",
                border: "none",
                borderRadius: 10,
                fontWeight: 700,
                fontSize: 14,
                cursor: disease.trim() && !loading ? "pointer" : "not-allowed",
                transition: "all 0.2s",
              }}
            >
              {loading ? "Scanning…" : "Scan Graph →"}
            </button>
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="card" style={{ padding: "48px 24px", textAlign: "center" }}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
              <svg width="48" height="48" viewBox="0 0 48 48" style={{ animation: "rotate-slow 2s linear infinite" }}>
                <circle cx="24" cy="24" r="22" stroke="var(--border)" strokeWidth="2" fill="none" />
                <path d="M14 10 C20 16 28 16 34 10" stroke="var(--blue)" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
                <path d="M14 18 C20 24 28 24 34 18" stroke="var(--blue)" strokeWidth="2.5" fill="none" strokeLinecap="round" opacity="0.7"/>
                <path d="M14 26 C20 32 28 32 34 26" stroke="var(--cyan)" strokeWidth="2.5" fill="none" strokeLinecap="round" opacity="0.7"/>
                <path d="M14 34 C20 40 28 40 34 34" stroke="var(--cyan)" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
                <line x1="14" y1="10" x2="14" y2="34" stroke="rgba(59,130,246,0.3)" strokeWidth="1.5"/>
                <line x1="34" y1="10" x2="34" y2="34" stroke="rgba(6,182,212,0.3)" strokeWidth="1.5"/>
              </svg>
            </div>
            <p style={{ color: "var(--text-2)", fontSize: 15, fontWeight: 600, marginBottom: 6 }}>
              Traversing drug → protein → pathway → disease…
            </p>
            <p style={{ color: "var(--text-3)", fontSize: 13 }}>
              Checking mechanistic connections across 4.3M biomedical relationships
            </p>
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div style={{
            background: "var(--red-dim)",
            border: "1px solid rgba(244,63,94,0.3)",
            borderRadius: 12,
            padding: "14px 18px",
            marginBottom: 16,
          }}>
            <p style={{ color: "#fca5a5", fontSize: 14 }}>⚠ {error}</p>
          </div>
        )}

        {/* Results */}
        {result && !loading && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

            {/* Summary */}
            <div className="card" style={{ padding: 24 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <p className="section-label">Repurposing Analysis</p>
                  <span style={{ fontSize: 11, color: "var(--text-3)", fontFamily: "monospace" }}>
                    {result.cypher_steps.length} queries · {result.paths.length} paths
                  </span>
                </div>
                <button
                  onClick={() => exportReportPdf({
                    title: "Drug Repurposing Scanner",
                    subtitle: "Mechanistic Repurposing Report",
                    query: `Repurposing candidates for ${disease}`,
                    answer: result.answer,
                    paths: result.paths,
                    cypher_steps: result.cypher_steps,
                    module: "repurpose",
                    subject: disease,
                  })}
                  style={{
                    background: "var(--blue-dim)",
                    color: "var(--blue)",
                    border: "1px solid rgba(59,130,246,0.3)",
                    borderRadius: 8,
                    padding: "6px 14px",
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  ↓ Export PDF
                </button>
              </div>
              <div className="analysis-text">{result.answer}</div>
            </div>

            {/* Paths */}
            {result.paths.length > 0 && (
              <div className="card" style={{ padding: 24 }}>
                <p className="section-label" style={{ marginBottom: 16 }}>
                  Mechanistic Paths ({result.paths.length})
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {result.paths.map((path, i) => (
                    <div key={i} style={{
                      border: "1px solid var(--border)",
                      borderRadius: 10,
                      padding: 16,
                      background: "var(--surface-2)",
                    }}>
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
                <summary style={{
                  padding: "16px 24px",
                  cursor: "pointer",
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: "var(--text-3)",
                }}>
                  Graph Query Steps ({result.cypher_steps.length})
                </summary>
                <div style={{ padding: "0 24px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
                  {result.cypher_steps.map((step, i) => (
                    <div key={i} style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
                      <div style={{ padding: "8px 14px", background: "var(--surface-2)", borderBottom: "1px solid var(--border)" }}>
                        <span style={{ fontSize: 12, color: "var(--text-2)" }}>Step {i + 1}: {step.step}</span>
                      </div>
                      <pre style={{ padding: "10px 14px", fontSize: 12, color: "var(--blue)", fontFamily: "monospace", overflowX: "auto", margin: 0, lineHeight: 1.6 }}>
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
