"use client";

import { useEffect, useState } from "react";

interface NodeStat { label: string; count: number }
interface EdgeStat { type: string; count: number }
interface HealthInfo { status: string; neo4j: string; node_count: number }

interface StatsData {
  nodes: NodeStat[];
  edges: EdgeStat[];
  health: HealthInfo;
  error?: string;
}

const NODE_CSS_COLORS: Record<string, string> = {
  Drug: "var(--green)",
  Disease: "#f87171",
  Gene: "var(--blue)",
  Pathway: "var(--purple)",
  Phytochemical: "var(--amber)",
  Phenotype: "#fbbf24",
  Anatomy: "#34d399",
  BiologicalProcess: "#a78bfa",
  MolecularFunction: "var(--cyan)",
  CellularComponent: "#2dd4bf",
  Exposure: "#fb7185",
};

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div style={{ height: 4, background: "var(--surface-3)", borderRadius: 99, overflow: "hidden", marginTop: 4 }}>
      <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 99, transition: "width 0.6s ease" }} />
    </div>
  );
}

export default function GraphStatsPage() {
  const [data, setData] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/stats")
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch((e) => setData({ nodes: [], edges: [], health: { status: "error", neo4j: e.message, node_count: 0 }, error: e.message }))
      .finally(() => setLoading(false));
  }, []);

  const totalNodes = data?.nodes?.reduce((s, n) => s + (n.count ?? 0), 0) ?? 0;
  const totalEdges = data?.edges?.reduce((s, e) => s + (e.count ?? 0), 0) ?? 0;
  const maxNodeCount = Math.max(...(data?.nodes?.map((n) => n.count ?? 0) ?? [1]));
  const maxEdgeCount = Math.max(...(data?.edges?.map((e) => e.count ?? 0) ?? [1]));

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "40px 24px" }}>

        <div style={{ marginBottom: 32 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <span className="badge badge-purple">Knowledge Graph</span>
            <span style={{ color: "var(--text-3)", fontSize: 12 }}>Neo4j Community · Live stats</span>
          </div>
          <h1 style={{ fontSize: 36, fontWeight: 900, letterSpacing: "-0.03em", marginBottom: 10 }}>
            Graph{" "}
            <span style={{ color: "var(--purple)" }}>Statistics</span>
          </h1>
          <p style={{ color: "var(--text-2)", fontSize: 15 }}>
            Live statistics from the Neo4j PetriDish knowledge graph instance.
          </p>
        </div>

        {loading && (
          <div style={{ display: "flex", justifyContent: "center", gap: 8, padding: "64px 0" }}>
            <svg width="40" height="40" viewBox="0 0 48 48" style={{ animation: "rotate-slow 2s linear infinite" }}>
              <circle cx="24" cy="24" r="22" stroke="var(--border)" strokeWidth="2" fill="none" />
              <path d="M14 10 C20 16 28 16 34 10" stroke="var(--green)" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
              <path d="M14 22 C20 28 28 28 34 22" stroke="var(--green)" strokeWidth="2.5" fill="none" strokeLinecap="round" opacity="0.7"/>
              <path d="M14 34 C20 40 28 40 34 34" stroke="var(--amber)" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
            </svg>
          </div>
        )}

        {data?.error && !loading && (
          <div style={{ background: "var(--red-dim)", border: "1px solid rgba(244,63,94,0.3)", borderRadius: 12, padding: "14px 18px", marginBottom: 20 }}>
            <p style={{ color: "#fca5a5", fontSize: 14 }}>⚠ {data.error}</p>
            <p style={{ color: "rgba(244,63,94,0.6)", fontSize: 12, marginTop: 4 }}>
              Is the FastAPI server running? (uvicorn api.reason:app --port 8000)
            </p>
          </div>
        )}

        {data && !data.error && !loading && data.health && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

            {/* Health + totals */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
              <div className="metric-card">
                <p className="section-label" style={{ marginBottom: 8 }}>Neo4j Status</p>
                <div style={{ fontSize: 20, fontWeight: 800, color: data.health.status === "ok" ? "var(--green)" : "var(--red)" }}>
                  {data.health.status.toUpperCase()}
                </div>
                <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 4 }}>{data.health.neo4j}</div>
              </div>
              <div className="metric-card">
                <p className="section-label" style={{ marginBottom: 8 }}>Total Nodes</p>
                <div style={{ fontSize: 26, fontWeight: 800, color: "var(--green)", letterSpacing: "-0.02em" }}>{totalNodes.toLocaleString()}</div>
                <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 4 }}>target: ~27,000</div>
              </div>
              <div className="metric-card">
                <p className="section-label" style={{ marginBottom: 8 }}>Total Edges</p>
                <div style={{ fontSize: 26, fontWeight: 800, color: "var(--cyan)", letterSpacing: "-0.02em" }}>{totalEdges.toLocaleString()}</div>
                <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 4 }}>target: ~4,050,249</div>
              </div>
            </div>

            {/* Progress bars */}
            {totalNodes > 0 && (
              <div className="card" style={{ padding: 24 }}>
                <p className="section-label" style={{ marginBottom: 16 }}>Load Progress</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 6 }}>
                      <span style={{ color: "var(--text-2)" }}>Nodes</span>
                      <span style={{ color: "var(--text-3)", fontFamily: "monospace" }}>{totalNodes.toLocaleString()} / 27,000</span>
                    </div>
                    <div style={{ height: 6, background: "var(--surface-3)", borderRadius: 99, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${Math.min(100, (totalNodes / 27000) * 100)}%`, background: "linear-gradient(90deg, var(--green), #34D399)", borderRadius: 99, transition: "width 0.6s ease" }} />
                    </div>
                  </div>
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 6 }}>
                      <span style={{ color: "var(--text-2)" }}>Edges</span>
                      <span style={{ color: "var(--text-3)", fontFamily: "monospace" }}>{totalEdges.toLocaleString()} / 4,050,249</span>
                    </div>
                    <div style={{ height: 6, background: "var(--surface-3)", borderRadius: 99, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${Math.min(100, (totalEdges / 4050249) * 100)}%`, background: "linear-gradient(90deg, var(--blue), var(--cyan))", borderRadius: 99, transition: "width 0.6s ease" }} />
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

              {/* Node types */}
              <div className="card" style={{ padding: 24 }}>
                <p className="section-label" style={{ marginBottom: 16 }}>Nodes by Type</p>
                {data.nodes.length === 0 ? (
                  <p style={{ fontSize: 13, color: "var(--text-3)" }}>No data yet — PrimeKG still loading</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {data.nodes.map((n) => {
                      const color = NODE_CSS_COLORS[n.label] ?? "var(--text-3)";
                      return (
                        <div key={n.label}>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                            <span style={{ color }}>{n.label}</span>
                            <span style={{ color: "var(--text-3)", fontFamily: "monospace" }}>{n.count.toLocaleString()}</span>
                          </div>
                          <Bar value={n.count} max={maxNodeCount} color={color} />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Edge types */}
              <div className="card" style={{ padding: 24 }}>
                <p className="section-label" style={{ marginBottom: 16 }}>Top Edge Types</p>
                {data.edges.length === 0 ? (
                  <p style={{ fontSize: 13, color: "var(--text-3)" }}>No data yet — PrimeKG still loading</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {data.edges.slice(0, 15).map((e) => (
                      <div key={e.type}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                          <span style={{ color: "var(--cyan)", fontFamily: "monospace" }}>{e.type}</span>
                          <span style={{ color: "var(--text-3)" }}>{e.count.toLocaleString()}</span>
                        </div>
                        <Bar value={e.count} max={maxEdgeCount} color="var(--cyan)" />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Data sources */}
            <div className="card" style={{ padding: 24 }}>
              <p className="section-label" style={{ marginBottom: 14 }}>Data Sources</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {[
                  "PrimeKG (Harvard MIMS)", "IMPPAT 2.0", "IndiGen", "GenomeIndia",
                  "DrugBank", "UniProt", "Reactome", "KEGG", "OMIM", "MONDO",
                  "HPO", "PharmGKB", "GO", "Uberon", "NCBI Gene",
                ].map((src) => (
                  <span key={src} className="badge badge-green" style={{ fontSize: 10 }}>{src}</span>
                ))}
              </div>
            </div>

          </div>
        )}
      </div>
    </main>
  );
}
