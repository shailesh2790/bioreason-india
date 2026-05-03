"use client";

import { useEffect, useState } from "react";

interface Stat { label: string; count: number }

export default function LiveStats() {
  const [nodes, setNodes] = useState<Stat[]>([]);
  const [edges, setEdges] = useState<Stat[]>([]);
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");

  useEffect(() => {
    const load = () =>
      fetch("/api/stats")
        .then((r) => r.json())
        .then((d) => {
          if (d.error) { setStatus("error"); return; }
          setNodes(d.nodes ?? []);
          setEdges(d.edges ?? []);
          setStatus("ok");
        })
        .catch(() => setStatus("error"));

    load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, []);

  const totalNodes = nodes.reduce((s, n) => s + (n.count ?? 0), 0);
  const totalEdges = edges.reduce((s, e) => s + (e.count ?? 0), 0);
  const loadingGraph = totalEdges < 4000000;

  const stats = [
    { label: "KG Edges", value: status === "ok" ? totalEdges.toLocaleString() : "—", sub: "4M+ target", color: "var(--green)" },
    { label: "KG Nodes", value: status === "ok" ? totalNodes.toLocaleString() : "—", sub: "27K target", color: "var(--cyan)" },
    { label: "Phytochemicals", value: status === "ok" ? (nodes.find((n) => n.label === "Phytochemical")?.count ?? 0).toLocaleString() : "—", sub: "IMPPAT 2.0", color: "var(--amber)" },
    { label: "Data Sources", value: "20+", sub: "curated", color: "var(--purple)" },
  ];

  return (
    <div style={{ marginBottom: 32 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        {stats.map((s) => (
          <div key={s.label} className="metric-card">
            <div style={{ fontSize: 26, fontWeight: 800, color: s.color, letterSpacing: "-0.02em" }}>
              {s.value}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-2)", marginTop: 4, fontWeight: 600 }}>{s.label}</div>
            {status === "ok" && <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>{s.sub}</div>}
          </div>
        ))}
      </div>

      {status === "ok" && loadingGraph && (
        <div style={{
          marginTop: 12,
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          padding: "12px 16px",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 12, color: "var(--text-3)" }}>
              <span className="live-dot" style={{ width: 6, height: 6, marginRight: 6, display: "inline-block" }} />
              PrimeKG loading…
            </span>
            <span style={{ fontSize: 12, color: "var(--green)", fontFamily: "monospace", fontWeight: 700 }}>
              {((totalEdges / 4050249) * 100).toFixed(1)}%
            </span>
          </div>
          <div style={{ height: 4, background: "var(--surface-3)", borderRadius: 99, overflow: "hidden" }}>
            <div style={{
              height: "100%",
              width: `${Math.min(100, (totalEdges / 4050249) * 100)}%`,
              background: "linear-gradient(90deg, var(--green), #34D399)",
              borderRadius: 99,
              transition: "width 1s ease",
            }} />
          </div>
        </div>
      )}

      {status === "error" && (
        <div style={{
          marginTop: 12,
          background: "var(--red-dim)",
          border: "1px solid rgba(244,63,94,0.2)",
          borderRadius: 12,
          padding: "10px 16px",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}>
          <span style={{ color: "var(--red)", fontSize: 12 }}>⚠ API offline — start FastAPI: </span>
          <code style={{ fontSize: 11, color: "var(--text-2)", background: "var(--surface-2)", padding: "2px 8px", borderRadius: 6 }}>
            uvicorn api.reason:app --reload
          </code>
        </div>
      )}
    </div>
  );
}
