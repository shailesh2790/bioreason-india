"use client";

import { useState } from "react";
import NetworkGraph, { GraphData } from "@/components/NetworkGraph";
import { exportReportPdf } from "@/lib/exportPdf";
import { useAuth } from "@/lib/auth";

const EXAMPLES = [
  { a: "Curcumin",     b: "Alzheimer",        label: "Ayurveda → Neurodegeneration" },
  { a: "Metformin",    b: "tuberculosis",      label: "Diabetes drug → TB" },
  { a: "Berberine",    b: "diabetes mellitus", label: "Plant compound → Diabetes" },
  { a: "Quercetin",    b: "cancer",            label: "Flavonoid → Cancer" },
  { a: "Warfarin",     b: "CYP2C9",           label: "Drug → Metabolising gene" },
  { a: "Withaferin A", b: "leishmania",        label: "Ashwagandha → Kala-azar" },
];

interface ReasonResponse {
  answer: string;
  paths: any[];
  cypher_steps: any[];
  error?: string;
}

function buildGraphFromPaths(paths: any[]): GraphData {
  const nodeMap = new Map<string, any>();
  const edges: any[] = [];
  paths.forEach((path) => {
    path.nodes?.forEach((n: any) => {
      if (!nodeMap.has(n.id)) nodeMap.set(n.id, { id: n.id, name: n.name, label: n.labels?.[0] ?? "Unknown" });
    });
    path.edges?.forEach((e: any, i: number) => {
      const src = path.nodes?.[i];
      const tgt = path.nodes?.[i + 1];
      if (src && tgt) edges.push({ source: src.id, target: tgt.id, type: e.type });
    });
  });
  return { nodes: Array.from(nodeMap.values()), edges };
}

export default function HypothesisPage() {
  const { fetchWithAuth } = useAuth();
  const [entityA, setEntityA] = useState("");
  const [entityB, setEntityB] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ReasonResponse | null>(null);
  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], edges: [] });
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"graph" | "paths">("graph");

  const run = async (a = entityA, b = entityB) => {
    if (!a.trim() || !b.trim() || loading) return;
    setLoading(true);
    setResult(null);
    setError(null);
    setGraphData({ nodes: [], edges: [] });

    const question = `Find the mechanistic connection between "${a}" and "${b}".
Step 1: Find ${a} in the graph (could be a Drug, Phytochemical, Gene, or Disease).
Step 2: Find ${b} in the graph (could be a Disease, Gene, Pathway, or Drug).
Step 3: Find multi-hop paths connecting them — through shared gene targets, biological pathways, or disease associations.
For each path found, describe the full mechanistic chain.
What is the biological plausibility of this connection? Rate confidence as HIGH/MEDIUM/LOW with reasoning.`;

    try {
      const res = await fetchWithAuth("/api/reason", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, max_hops: 3, india_context: true }),
      });
      const data = await res.json();
      if (data.error) { setError(data.error); return; }
      setResult(data);
      setGraphData(buildGraphFromPaths(data.paths ?? []));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "40px 24px" }}>

        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <span className="badge badge-amber">Hypothesis Engine</span>
            <span style={{ color: "var(--text-3)", fontSize: 12 }}>Entity A → Entity B · 4.3M relationship bridge</span>
          </div>
          <h1 style={{ fontSize: 36, fontWeight: 900, letterSpacing: "-0.03em", marginBottom: 10 }}>
            Mechanistic{" "}
            <span style={{ color: "var(--amber)" }}>Hypothesis Builder</span>
          </h1>
          <p style={{ color: "var(--text-2)", fontSize: 15, maxWidth: 640, lineHeight: 1.7 }}>
            Discover the biological bridge between any two biomedical entities.
            Drug → Disease, Compound → Gene, Pathway → Phenotype — across 4.3M relationships
            including Indian population variants and Ayurvedic data.
          </p>
        </div>

        {/* Example chips */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 24 }}>
          {EXAMPLES.map((ex) => (
            <button
              key={ex.label}
              onClick={() => { setEntityA(ex.a); setEntityB(ex.b); }}
              style={{
                fontSize: 12,
                padding: "6px 14px",
                borderRadius: 8,
                cursor: "pointer",
                fontWeight: 600,
                transition: "all 0.15s",
                background: "var(--surface-2)",
                color: "var(--text-3)",
                border: "1px solid var(--border)",
              }}
              className="hover:border-[var(--amber)] hover:text-[var(--amber)] hover:bg-[var(--amber-dim)]"
            >
              {ex.label}
            </button>
          ))}
        </div>

        {/* Input */}
        <div className="card" style={{ padding: 24, marginBottom: 24 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 48px 1fr", gap: 16, alignItems: "end", marginBottom: 16 }}>
            <div>
              <label className="section-label" style={{ display: "block", marginBottom: 8 }}>
                Entity A — drug, compound, gene
              </label>
              <input
                value={entityA}
                onChange={(e) => setEntityA(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && run()}
                placeholder="e.g. Curcumin, Metformin, CYP2C19"
                className="input-bio"
                style={{ width: "100%", padding: "11px 16px", fontSize: 14 }}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "center", paddingBottom: 2 }}>
              <div style={{
                width: 44, height: 44,
                borderRadius: "50%",
                background: "var(--amber-dim)",
                border: "1px solid rgba(245,158,11,0.4)",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "var(--amber)",
                fontSize: 18,
                fontWeight: 800,
              }}>
                →
              </div>
            </div>

            <div>
              <label className="section-label" style={{ display: "block", marginBottom: 8 }}>
                Entity B — disease, pathway, gene
              </label>
              <input
                value={entityB}
                onChange={(e) => setEntityB(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && run()}
                placeholder="e.g. Alzheimer, diabetes mellitus, tuberculosis"
                className="input-bio"
                style={{ width: "100%", padding: "11px 16px", fontSize: 14 }}
              />
            </div>
          </div>

          <div style={{ display: "flex", gap: 12 }}>
            <button
              onClick={() => run()}
              disabled={!entityA.trim() || !entityB.trim() || loading}
              style={{
                padding: "11px 28px",
                background: loading || !entityA.trim() || !entityB.trim() ? "var(--surface-3)" : "var(--amber)",
                color: loading || !entityA.trim() || !entityB.trim() ? "var(--text-3)" : "#030B14",
                border: "none",
                borderRadius: 10,
                fontWeight: 800,
                fontSize: 14,
                cursor: entityA.trim() && entityB.trim() && !loading ? "pointer" : "not-allowed",
                transition: "all 0.2s",
              }}
            >
              {loading ? "Traversing graph…" : "Find Connection →"}
            </button>
            {result && (
              <button
                onClick={() => exportReportPdf({
                  title: "Hypothesis Builder",
                  subtitle: `${entityA} → ${entityB}`,
                  query: `Mechanistic connection between ${entityA} and ${entityB}`,
                  answer: result.answer,
                  paths: result.paths,
                  cypher_steps: result.cypher_steps,
                  module: "query",
                  subject: `${entityA} → ${entityB}`,
                })}
                className="btn-ghost"
                style={{ padding: "11px 20px", fontSize: 13 }}
              >
                ↓ Export PDF
              </button>
            )}
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="card" style={{ padding: "48px 24px", textAlign: "center", marginBottom: 24 }}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
              <svg width="48" height="48" viewBox="0 0 48 48" style={{ animation: "rotate-slow 2s linear infinite" }}>
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
              Traversing 4.3M relationships…
            </p>
            <p style={{ color: "var(--text-3)", fontSize: 13 }}>
              Connecting{" "}
              <span style={{ color: "var(--amber)", fontFamily: "monospace" }}>{entityA}</span>
              {" "}→{" "}
              <span style={{ color: "var(--amber)", fontFamily: "monospace" }}>{entityB}</span>
            </p>
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div style={{ background: "var(--red-dim)", border: "1px solid rgba(244,63,94,0.3)", borderRadius: 12, padding: "14px 18px", marginBottom: 20 }}>
            <p style={{ color: "#fca5a5", fontSize: 14 }}>⚠ {error}</p>
          </div>
        )}

        {/* Results */}
        {result && !loading && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

            {/* Hypothesis verdict */}
            <div style={{ background: "var(--surface)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 16, padding: 24 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontFamily: "monospace", color: "var(--amber)", fontWeight: 800, fontSize: 15 }}>{entityA}</span>
                  <span style={{ color: "var(--text-3)", fontSize: 18 }}>→</span>
                  <span style={{ fontFamily: "monospace", color: "var(--amber)", fontWeight: 800, fontSize: 15 }}>{entityB}</span>
                </div>
                <span style={{ fontSize: 12, color: "var(--text-3)", fontFamily: "monospace" }}>
                  {result.paths.length} mechanistic paths
                </span>
              </div>
              <div className="analysis-text">{result.answer}</div>
            </div>

            {/* Network / Paths toggle */}
            {result.paths.length > 0 && (
              <div className="card" style={{ overflow: "hidden" }}>
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "14px 24px",
                  borderBottom: "1px solid var(--border)",
                }}>
                  <span style={{ fontSize: 12, color: "var(--text-3)", fontFamily: "monospace" }}>
                    {graphData.nodes.length} nodes · {graphData.edges.length} edges
                  </span>
                  <div style={{ display: "flex", gap: 6 }}>
                    {(["graph", "paths"] as const).map((v) => (
                      <button
                        key={v}
                        onClick={() => setView(v)}
                        style={{
                          padding: "4px 12px", borderRadius: 7, fontSize: 12, cursor: "pointer",
                          fontWeight: 600, transition: "all 0.15s",
                          background: view === v ? "var(--amber-dim)" : "transparent",
                          color: view === v ? "var(--amber)" : "var(--text-3)",
                          border: view === v ? "1px solid rgba(245,158,11,0.3)" : "1px solid transparent",
                        }}
                      >
                        {v === "graph" ? "⬡ Network" : "▶ Paths"}
                      </button>
                    ))}
                  </div>
                </div>

                {view === "graph" && (
                  <div style={{ padding: "16px 24px 20px" }}>
                    <NetworkGraph data={graphData} height={440} />
                  </div>
                )}

                {view === "paths" && (
                  <div style={{ padding: "16px 24px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
                    {result.paths.slice(0, 10).map((path, i) => (
                      <div key={i} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 14, background: "var(--surface-2)" }}>
                        <p style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 10 }}>{path.description}</p>
                        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, fontSize: 12, fontFamily: "monospace" }}>
                          {path.nodes?.map((n: any, ni: number) => (
                            <span key={ni} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{ padding: "2px 8px", borderRadius: 6, border: "1px solid var(--border)", color: "var(--text-2)", background: "var(--surface-3)" }}>{n.name}</span>
                              {path.edges?.[ni] && (
                                <span style={{ color: "var(--green)" }}>→[{path.edges[ni].type}]→</span>
                              )}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
