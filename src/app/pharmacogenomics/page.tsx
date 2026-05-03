"use client";

import { useState } from "react";
import PathGraph, { PathData } from "@/components/PathGraph";

const PGX_GENES = [
  { gene: "CYP2C19", note: "Clopidogrel, PPIs, SSRIs — *2 variant 20–25% in S.Asia" },
  { gene: "CYP2D6",  note: "Codeine, tamoxifen, antipsychotics — PM ~7% India" },
  { gene: "CYP3A4",  note: "Statins, immunosuppressants — major metaboliser" },
  { gene: "CYP2C9",  note: "Warfarin, phenytoin — *2/*3 10–15% India" },
  { gene: "TPMT",    note: "Azathioprine, 6-MP — *3C common in South Asia" },
  { gene: "G6PD",    note: "Primaquine, rasburicase — Mediterranean variant India" },
  { gene: "SLCO1B1", note: "Statin-induced myopathy — *5 variant" },
  { gene: "DPYD",    note: "Fluorouracil toxicity — *2A rare but severe" },
  { gene: "UGT1A1",  note: "Irinotecan, atazanavir — *28 15% India" },
  { gene: "NUDT15",  note: "Thiopurine toxicity — *3 variant common SE Asia" },
];

const INDIA_STATS = [
  { label: "CYP2C19*2", value: "20–25%", note: "Across subpopulations", color: "var(--red)" },
  { label: "G6PD deficiency", value: "5–15%", note: "Malaria-endemic states", color: "var(--amber)" },
  { label: "CYP2C9 *2/*3", value: "10–15%", note: "Combined frequency", color: "var(--purple)" },
  { label: "UGT1A1*28", value: "~15%", note: "Indian ancestry", color: "var(--cyan)" },
];

interface ReasonResponse {
  answer: string;
  paths: PathData[];
  cypher_steps: { step: string; cypher: string }[];
  error?: string;
}

export default function PharmacogenomicsPage() {
  const [gene, setGene] = useState("");
  const [drug, setDrug] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ReasonResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"gene" | "drug">("gene");

  const run = async () => {
    const target = mode === "gene" ? gene.trim() : drug.trim();
    if (!target || loading) return;
    setLoading(true);
    setResult(null);
    setError(null);

    const question =
      mode === "gene"
        ? `Pharmacogenomics analysis for gene ${target} in the Indian population context.
Find: 1) Which drugs target or are metabolised by ${target}?
2) Which diseases are treated by those drugs?
3) What are the known adverse effects or efficacy changes when ${target} is mutated (loss/gain of function)?
4) Are there IMPPAT phytochemicals that also interact with ${target} or its downstream pathway?
Apply Indian population context: reference IndiGen/GenomeIndia allele frequencies where relevant.
Rank drugs by strength of mechanistic evidence. Flag any drugs with narrow therapeutic index.`
        : `Pharmacogenomics analysis for drug ${target} — focus on genetic factors affecting response.
Find: 1) Which genes does ${target} target, and which genes metabolise/transport it?
2) What variants in those genes are known to affect ${target} efficacy or toxicity?
3) Are those variants enriched in Indian population groups (IndiGen/GenomeIndia data)?
4) Are there safer alternatives or dose-adjustment recommendations for Indian patients?
5) Do any IMPPAT phytochemicals interact with the same gene targets as ${target}?
Focus on actionable clinical pharmacogenomics.`;

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
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <span className="badge badge-purple">Module C · PGx</span>
            <span className="badge badge-amber">India-calibrated</span>
            <span style={{ color: "var(--text-3)", fontSize: 12 }}>IndiGen · GenomeIndia · PharmGKB</span>
          </div>
          <h1 style={{ fontSize: 36, fontWeight: 900, letterSpacing: "-0.03em", marginBottom: 10 }}>
            Indian{" "}
            <span style={{ color: "var(--purple)" }}>Pharmacogenomics</span>{" "}
            Explorer
          </h1>
          <p style={{ color: "var(--text-2)", fontSize: 15, maxWidth: 640, lineHeight: 1.7 }}>
            Explore how genetic variants — particularly those enriched in Indian subpopulations —
            affect drug metabolism, efficacy, and toxicity. 1.4 billion patients deserve precision medicine.
          </p>
        </div>

        {/* India PGx stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 24 }}>
          {INDIA_STATS.map((s) => (
            <div key={s.label} className="metric-card">
              <div style={{ fontSize: 22, fontWeight: 800, color: s.color, letterSpacing: "-0.02em" }}>{s.value}</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-2)", marginTop: 4 }}>{s.label}</div>
              <div style={{ fontSize: 10, color: "var(--text-3)", marginTop: 2 }}>{s.note}</div>
            </div>
          ))}
        </div>

        {/* Mode toggle + input */}
        <div className="card" style={{ padding: 24, marginBottom: 24 }}>
          {/* Mode tabs */}
          <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
            {(["gene", "drug"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                style={{
                  padding: "8px 20px",
                  borderRadius: 9,
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                  transition: "all 0.15s",
                  background: mode === m ? "var(--purple-dim)" : "var(--surface-2)",
                  color: mode === m ? "var(--purple)" : "var(--text-3)",
                  border: mode === m ? "1px solid rgba(139,92,246,0.4)" : "1px solid var(--border)",
                }}
              >
                Search by {m.charAt(0).toUpperCase() + m.slice(1)}
              </button>
            ))}
          </div>

          {mode === "gene" && (
            <>
              <label className="section-label" style={{ display: "block", marginBottom: 12 }}>
                Pharmacogenomically Relevant Genes (India-specific frequencies)
              </label>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
                {PGX_GENES.map(({ gene: g, note }) => (
                  <button
                    key={g}
                    onClick={() => setGene(g)}
                    style={{
                      display: "flex", alignItems: "center", gap: 12,
                      padding: "10px 14px",
                      borderRadius: 9,
                      border: gene === g ? "1px solid var(--purple)" : "1px solid var(--border)",
                      background: gene === g ? "var(--purple-dim)" : "var(--surface-2)",
                      cursor: "pointer",
                      textAlign: "left",
                      transition: "all 0.15s",
                    }}
                  >
                    <span style={{ fontFamily: "monospace", fontWeight: 800, fontSize: 12, width: 64, flexShrink: 0, color: gene === g ? "var(--purple)" : "var(--text-2)" }}>{g}</span>
                    <span style={{ fontSize: 12, color: "var(--text-3)" }}>{note}</span>
                  </button>
                ))}
              </div>
              <div style={{ display: "flex", gap: 12 }}>
                <input
                  value={gene}
                  onChange={(e) => setGene(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && run()}
                  placeholder="Or type any gene symbol…"
                  className="input-bio"
                  style={{ flex: 1, padding: "11px 16px", fontSize: 14 }}
                />
                <button
                  onClick={run}
                  disabled={!gene.trim() || loading}
                  style={{
                    padding: "11px 24px",
                    background: gene.trim() && !loading ? "var(--purple)" : "var(--surface-3)",
                    color: gene.trim() && !loading ? "#fff" : "var(--text-3)",
                    border: "none", borderRadius: 10, fontWeight: 700, fontSize: 14,
                    cursor: gene.trim() && !loading ? "pointer" : "not-allowed",
                    transition: "all 0.2s",
                  }}
                >
                  {loading ? "Analysing…" : "Analyse Gene →"}
                </button>
              </div>
            </>
          )}

          {mode === "drug" && (
            <>
              <label className="section-label" style={{ display: "block", marginBottom: 12 }}>
                Drug name (e.g. Warfarin, Clopidogrel, Metformin, Isoniazid)
              </label>
              <div style={{ display: "flex", gap: 12 }}>
                <input
                  value={drug}
                  onChange={(e) => setDrug(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && run()}
                  placeholder="Enter drug name…"
                  className="input-bio"
                  style={{ flex: 1, padding: "11px 16px", fontSize: 14 }}
                />
                <button
                  onClick={run}
                  disabled={!drug.trim() || loading}
                  style={{
                    padding: "11px 24px",
                    background: drug.trim() && !loading ? "var(--purple)" : "var(--surface-3)",
                    color: drug.trim() && !loading ? "#fff" : "var(--text-3)",
                    border: "none", borderRadius: 10, fontWeight: 700, fontSize: 14,
                    cursor: drug.trim() && !loading ? "pointer" : "not-allowed",
                    transition: "all 0.2s",
                  }}
                >
                  {loading ? "Analysing…" : "Analyse Drug →"}
                </button>
              </div>
            </>
          )}
        </div>

        {/* Loading */}
        {loading && (
          <div className="card" style={{ padding: "48px 24px", textAlign: "center" }}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
              <svg width="48" height="48" viewBox="0 0 48 48" style={{ animation: "rotate-slow 2s linear infinite" }}>
                <circle cx="24" cy="24" r="22" stroke="var(--border)" strokeWidth="2" fill="none" />
                <path d="M14 10 C20 16 28 16 34 10" stroke="var(--purple)" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
                <path d="M14 18 C20 24 28 24 34 18" stroke="var(--purple)" strokeWidth="2.5" fill="none" strokeLinecap="round" opacity="0.7"/>
                <path d="M14 26 C20 32 28 32 34 26" stroke="var(--cyan)" strokeWidth="2.5" fill="none" strokeLinecap="round" opacity="0.7"/>
                <path d="M14 34 C20 40 28 40 34 34" stroke="var(--cyan)" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
                <line x1="14" y1="10" x2="14" y2="34" stroke="rgba(139,92,246,0.3)" strokeWidth="1.5"/>
                <line x1="34" y1="10" x2="34" y2="34" stroke="rgba(6,182,212,0.3)" strokeWidth="1.5"/>
              </svg>
            </div>
            <p style={{ color: "var(--text-2)", fontSize: 15, fontWeight: 600, marginBottom: 6 }}>
              Tracing gene → drug → disease → Indian variant paths…
            </p>
            <p style={{ color: "var(--text-3)", fontSize: 13 }}>Applying IndiGen population frequencies</p>
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

            <div style={{ background: "var(--surface)", border: "1px solid rgba(139,92,246,0.3)", borderRadius: 16, padding: 24 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, paddingBottom: 16, borderBottom: "1px solid var(--border)" }}>
                <div>
                  <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--purple)", marginBottom: 6 }}>
                    PGx Analysis Report
                  </p>
                  <h2 style={{ fontSize: 22, fontWeight: 800, fontFamily: "monospace", color: "var(--text-1)" }}>
                    {mode === "gene" ? gene : drug}
                  </h2>
                </div>
                <div style={{ textAlign: "right", fontSize: 11 }}>
                  <div style={{ color: "var(--text-3)", marginBottom: 4 }}>Sources</div>
                  <div style={{ color: "var(--purple)", fontFamily: "monospace" }}>
                    PrimeKG · PharmGKB · IndiGen · UniProt
                  </div>
                </div>
              </div>
              <div className="analysis-text">{result.answer}</div>
            </div>

            {result.paths.length > 0 && (
              <div className="card" style={{ padding: 24 }}>
                <p className="section-label" style={{ marginBottom: 16 }}>Gene–Drug–Disease Paths ({result.paths.length})</p>
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
                      <pre style={{ padding: "10px 14px", fontSize: 12, color: "var(--purple)", fontFamily: "monospace", overflowX: "auto", margin: 0, lineHeight: 1.6 }}>
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
