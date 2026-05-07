"use client";

import { useRef, useState } from "react";
import PathGraph from "@/components/PathGraph";
import NetworkGraph, { GraphData } from "@/components/NetworkGraph";
import { exportReportPdf } from "@/lib/exportPdf";

interface PathResult {
  nodes: Array<{ id: string; name: string; labels?: string[] }>;
  edges: Array<{ type: string; source: string }>;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  description: string;
}

interface CypherStep {
  step: string;
  cypher: string;
}

interface ReasonResponse {
  answer: string;
  paths: PathResult[];
  cypher_steps: CypherStep[];
  error?: string;
}

const EXAMPLES = [
  "Which FDA-approved drugs might work for MDR-TB by targeting pathways current anti-TB drugs miss?",
  "Does Quercetin have a mechanistic basis for its claimed anti-diabetic effects?",
  "What is the multi-hop path connecting Metformin to Alzheimer's disease?",
  "Which Indian patients on Metformin are at highest genetic risk for lactic acidosis?",
  "What approved drugs could be repurposed for diabetic TB?",
  "Which Ayurvedic compounds have the strongest multi-hop connection to Alzheimer's disease?",
];

function buildGraphData(paths: PathResult[]): GraphData {
  const nodeMap = new Map<string, any>();
  const edges: any[] = [];
  paths.forEach((path) => {
    path.nodes.forEach((n) => {
      if (!nodeMap.has(n.id)) nodeMap.set(n.id, { id: n.id, name: n.name, label: n.labels?.[0] ?? "Unknown" });
    });
    path.edges.forEach((e, i) => {
      const src = path.nodes[i]; const tgt = path.nodes[i + 1];
      if (src && tgt) edges.push({ source: src.id, target: tgt.id, type: e.type });
    });
  });
  return { nodes: Array.from(nodeMap.values()), edges };
}

const CONF_CLASS: Record<string, string> = {
  HIGH: "conf-high",
  MEDIUM: "conf-medium",
  LOW: "conf-low",
};

export default function QueryInterface() {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ReasonResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCypher, setShowCypher] = useState(false);
  const [showPaths, setShowPaths] = useState(true);
  const [vizMode, setVizMode] = useState<"network" | "linear">("network");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const submit = async () => {
    if (!question.trim() || loading) return;
    setLoading(true);
    setResult(null);
    setError(null);

    try {
      const res = await fetch("/api/reason", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, max_hops: 3, india_context: true }),
      });
      const data: ReasonResponse = await res.json();
      if (!res.ok) {
        setError(data.error ?? `Error ${res.status}`);
      } else {
        setResult(data);
        setShowPaths(true);
        setShowCypher(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* Example chips */}
      <div>
        <p className="section-label" style={{ marginBottom: 12 }}>Example queries — click to load</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {EXAMPLES.map((q, i) => (
            <button
              key={i}
              onClick={() => { setQuestion(q); textareaRef.current?.focus(); }}
              style={{
                fontSize: 12,
                padding: "6px 12px",
                borderRadius: 8,
                background: "var(--surface-2)",
                color: "var(--text-3)",
                border: "1px solid var(--border)",
                cursor: "pointer",
                textAlign: "left",
                transition: "all 0.15s",
                maxWidth: 320,
              }}
              className="hover:border-[var(--border-2)] hover:text-[var(--text-2)]"
            >
              {q.length > 68 ? q.slice(0, 65) + "…" : q}
            </button>
          ))}
        </div>
      </div>

      {/* Input box */}
      <div style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 16,
        padding: 20,
        transition: "border-color 0.2s",
      }}>
        <textarea
          ref={textareaRef}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Ask a biomedical question about drugs, diseases, genes, pathways, or Ayurvedic compounds…"
          rows={4}
          className="input-bio"
          style={{ width: "100%", padding: "12px 0", fontSize: 15, resize: "none", border: "none", boxShadow: "none", background: "transparent", borderBottom: "1px solid var(--border)" }}
        />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 14 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <span className="badge badge-green" style={{ fontSize: 10 }}>India Context</span>
            <span className="badge badge-amber" style={{ fontSize: 10 }}>3-hop Reasoning</span>
            <span className="badge badge-cyan" style={{ fontSize: 10 }}>PGx Aware</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 11, color: "var(--text-3)" }}>⌘ Enter</span>
            <button
              onClick={submit}
              disabled={!question.trim() || loading}
              className="btn-primary"
              style={{ padding: "10px 24px", fontSize: 14 }}
            >
              {loading ? "Reasoning…" : "Traverse Graph →"}
            </button>
          </div>
        </div>
      </div>

      {/* Loading state — DNA helix animation */}
      {loading && (
        <div style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 16,
          padding: "48px 24px",
          textAlign: "center",
        }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
            <svg width="48" height="48" viewBox="0 0 48 48" style={{ animation: "rotate-slow 2s linear infinite" }}>
              <circle cx="24" cy="24" r="22" stroke="var(--border)" strokeWidth="2" fill="none" />
              <path d="M14 10 C20 16 28 16 34 10" stroke="var(--green)" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
              <path d="M14 18 C20 24 28 24 34 18" stroke="var(--green)" strokeWidth="2.5" fill="none" strokeLinecap="round" opacity="0.7"/>
              <path d="M14 26 C20 32 28 32 34 26" stroke="var(--amber)" strokeWidth="2.5" fill="none" strokeLinecap="round" opacity="0.7"/>
              <path d="M14 34 C20 40 28 40 34 34" stroke="var(--amber)" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
              <line x1="14" y1="10" x2="14" y2="34" stroke="rgba(16,185,129,0.3)" strokeWidth="1.5"/>
              <line x1="34" y1="10" x2="34" y2="34" stroke="rgba(245,158,11,0.3)" strokeWidth="1.5"/>
            </svg>
          </div>
          <p style={{ color: "var(--text-2)", fontSize: 15, fontWeight: 600, marginBottom: 6 }}>
            Traversing the knowledge graph…
          </p>
          <p style={{ color: "var(--text-3)", fontSize: 13 }}>
            Multi-hop reasoning across 4.3M biomedical relationships
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
          display: "flex",
          alignItems: "flex-start",
          gap: 10,
        }}>
          <span style={{ color: "var(--red)", fontSize: 16, flexShrink: 0 }}>⚠</span>
          <p style={{ color: "#fca5a5", fontSize: 14 }}>{error}</p>
        </div>
      )}

      {/* Results */}
      {result && !loading && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

          {/* Answer card */}
          <div className="card" style={{ padding: 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
              <p className="section-label">Analysis</p>
              <span style={{
                width: 8, height: 8, borderRadius: "50%",
                background: "var(--green)",
                display: "inline-block",
                boxShadow: "0 0 8px var(--green-glow)",
              }} />
            </div>
            <div className="analysis-text">{result.answer}</div>
          </div>

          {/* Paths */}
          {result.paths.length > 0 && (
            <div className="card" style={{ overflow: "hidden" }}>
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "16px 24px",
                borderBottom: showPaths ? "1px solid var(--border)" : "none",
              }}>
                <button
                  onClick={() => setShowPaths(!showPaths)}
                  style={{ display: "flex", alignItems: "center", gap: 10, background: "none", border: "none", cursor: "pointer" }}
                >
                  <p className="section-label">Reasoning Paths ({result.paths.length})</p>
                  <span style={{ color: "var(--text-3)", fontSize: 11 }}>{showPaths ? "▲" : "▼"}</span>
                </button>
                {showPaths && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {(["network", "linear"] as const).map((m) => (
                      <button key={m} onClick={() => setVizMode(m)}
                        style={{
                          padding: "4px 12px", borderRadius: 7, fontSize: 12, cursor: "pointer",
                          fontWeight: 600, transition: "all 0.15s",
                          background: vizMode === m ? "var(--green-dim)" : "transparent",
                          color: vizMode === m ? "var(--green)" : "var(--text-3)",
                          border: vizMode === m ? "1px solid rgba(16,185,129,0.3)" : "1px solid transparent",
                        }}>
                        {m === "network" ? "⬡ Network" : "▶ Linear"}
                      </button>
                    ))}
                    <button
                      onClick={() => exportReportPdf({
                        title: "PetriDish Query", subtitle: "Analysis Report",
                        query: question, answer: result.answer,
                        paths: result.paths, cypher_steps: result.cypher_steps,
                        module: "query", subject: question.slice(0, 40),
                      })}
                      className="btn-ghost"
                      style={{ padding: "4px 12px", fontSize: 12 }}
                    >
                      ↓ PDF
                    </button>
                  </div>
                )}
              </div>

              {showPaths && vizMode === "network" && (
                <div style={{ padding: "16px 24px 20px" }}>
                  <NetworkGraph data={buildGraphData(result.paths)} height={400} />
                </div>
              )}

              {showPaths && vizMode === "linear" && (
                <div style={{ padding: "16px 24px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
                  {result.paths.map((path, i) => (
                    <div key={i} style={{
                      border: "1px solid var(--border)",
                      borderRadius: 10,
                      padding: 16,
                      background: "var(--surface-2)",
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                        <span style={{ fontSize: 11, color: "var(--text-3)" }}>Path {i + 1}</span>
                        <span className={`badge ${CONF_CLASS[path.confidence]}`} style={{ fontSize: 10 }}>
                          {path.confidence}
                        </span>
                      </div>
                      <p style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 8 }}>{path.description}</p>
                      <PathGraph path={path} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Cypher steps */}
          {result.cypher_steps.length > 0 && (
            <div className="card" style={{ overflow: "hidden" }}>
              <button
                onClick={() => setShowCypher(!showCypher)}
                style={{
                  width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "16px 24px", background: "none", border: "none", cursor: "pointer",
                  borderBottom: showCypher ? "1px solid var(--border)" : "none",
                }}
                className="hover:bg-[var(--surface-2)]"
              >
                <p className="section-label">Cypher Steps ({result.cypher_steps.length})</p>
                <span style={{ color: "var(--text-3)", fontSize: 11 }}>{showCypher ? "▲" : "▼"}</span>
              </button>

              {showCypher && (
                <div style={{ padding: "16px 24px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
                  {result.cypher_steps.map((step, i) => (
                    <div key={i} style={{
                      border: "1px solid var(--border)",
                      borderRadius: 10,
                      overflow: "hidden",
                    }}>
                      <div style={{
                        padding: "8px 14px",
                        background: "var(--surface-2)",
                        borderBottom: "1px solid var(--border)",
                      }}>
                        <span style={{ fontSize: 12, color: "var(--text-2)", fontWeight: 600 }}>
                          Step {i + 1}: {step.step}
                        </span>
                      </div>
                      <pre style={{
                        padding: "10px 14px",
                        fontSize: 12,
                        color: "var(--green)",
                        fontFamily: "monospace",
                        overflowX: "auto",
                        lineHeight: 1.6,
                        margin: 0,
                      }}>
                        {step.cypher}
                      </pre>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>
      )}
    </div>
  );
}
