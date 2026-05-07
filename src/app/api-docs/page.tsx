"use client";

import { useState } from "react";

const BASE = "http://localhost:8000";

const ENDPOINTS = [
  {
    method: "POST",
    path: "/reason",
    desc: "Natural language → multi-hop graph reasoning → synthesised answer",
    body: JSON.stringify({ question: "What genes does Metformin target and what diseases are they associated with?", max_hops: 3, india_context: true }, null, 2),
    response: `{
  "answer": "Metformin targets GPD1, PRKAB1, and ETFDH...",
  "paths": [{ "nodes": [...], "edges": [...], "confidence": "HIGH" }],
  "cypher_steps": [{ "step": "...", "cypher": "MATCH ..." }]
}`,
  },
  {
    method: "POST",
    path: "/cypher",
    desc: "Execute a read-only Cypher query directly against the Neo4j graph",
    body: JSON.stringify({ cypher: "MATCH (d:Drug)-[:TARGETS]->(g:Gene)-[:ASSOCIATED_WITH]->(dis:Disease) WHERE toLower(d.name) CONTAINS 'metformin' RETURN d.name, g.name, dis.name LIMIT 10" }, null, 2),
    response: `{
  "results": [
    { "d.name": "Metformin", "g.name": "GPD1", "dis.name": "hypertriglyceridemia" },
    ...
  ]
}`,
  },
  {
    method: "GET",
    path: "/health",
    desc: "Check API health, Neo4j connectivity, and active LLM provider",
    body: null,
    response: `{
  "status": "ok",
  "neo4j": "connected",
  "node_count": 90408,
  "llm_provider": "groq",
  "llm_model": "llama-3.3-70b-versatile"
}`,
  },
  {
    method: "GET",
    path: "/stats",
    desc: "Full graph statistics — node counts by label, edge counts by type",
    body: null,
    response: `{
  "nodes": [{ "label": "Gene", "count": 26973 }, ...],
  "edges": [{ "type": "SYNERGISTIC_WITH", "count": 2672628 }, ...]
}`,
  },
];

const SCHEMA = `Node labels:
  Drug           — 7,951 nodes (DrugBank)
  Disease        — 11,783 nodes (OMIM, MONDO)
  Gene           — 26,973 nodes (UniProt, NCBI)
  Pathway        — 2,516 nodes (Reactome, KEGG)
  Phenotype      — 6,465 nodes (HPO)
  Phytochemical  — 16 nodes (IMPPAT 2.0)
  Anatomy        — 4,861 nodes (Uberon)
  BiologicalProcess — 19,755 nodes (GO)
  Variant        — 14 nodes (IndiGen/PharmGKB)

Key relationships:
  Drug -[:TARGETS]-> Gene                  (16,258 edges)
  Drug -[:INDICATED_FOR]-> Disease         (4,153 edges)
  Drug -[:CONTRAINDICATED_FOR]-> Disease   (12,400 edges)
  Drug -[:SYNERGISTIC_WITH]-> Drug         (2,672,628 edges)
  Gene -[:ASSOCIATED_WITH]-> Disease       (46,205 edges)
  Gene -[:EXPRESSED_IN]-> Anatomy          (223,632 edges)
  Gene -[:PROTEIN_PROTEIN_INTERACTION]-> Gene (640,708 edges)
  Phytochemical -[:HAS_TRADITIONAL_USE]-> Disease (39 edges)
  Variant -[:AFFECTS_RESPONSE]-> Drug      (52 edges)

All nodes: id (string), name (string), source (string)`;

const CODE_EXAMPLES: Record<string, string> = {
  python: `import requests

# Drug repurposing query
response = requests.post("http://localhost:8000/reason", json={
    "question": "Which drugs could be repurposed for MDR-Tuberculosis?",
    "max_hops": 3,
    "india_context": True
})
data = response.json()

print(data["answer"])
for path in data["paths"]:
    nodes = " → ".join(n["name"] for n in path["nodes"])
    print(f"[{path['confidence']}] {nodes}")`,

  curl: `curl -X POST http://localhost:8000/reason \\
  -H "Content-Type: application/json" \\
  -d '{
    "question": "What genes does Metformin target?",
    "max_hops": 3,
    "india_context": true
  }'`,

  javascript: `const response = await fetch("http://localhost:8000/reason", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    question: "Validate the mechanistic basis for Curcumin",
    max_hops: 3,
    india_context: true
  })
});
const data = await response.json();
console.log(data.answer);`,

  cypher: `// Direct graph queries via /cypher endpoint
// Drug repurposing — 3-hop path
MATCH (d:Drug)-[:TARGETS]->(g:Gene)-[:ASSOCIATED_WITH]->(dis:Disease)
WHERE toLower(dis.name) CONTAINS "tuberculosis"
RETURN d.name AS drug, g.name AS gene, dis.name AS disease
LIMIT 20

// Phytochemical → disease traditional use
MATCH (p:Phytochemical)-[:HAS_TRADITIONAL_USE]->(dis:Disease)
RETURN p.name, dis.name LIMIT 20

// PGx variants affecting a drug
MATCH (v:Variant)-[:AFFECTS_RESPONSE]->(d:Drug)
WHERE toLower(d.name) CONTAINS "warfarin"
RETURN v.name, v.af_india, v.clinical_note`,
};

type Lang = keyof typeof CODE_EXAMPLES;

export default function ApiDocsPage() {
  const [activeLang, setActiveLang] = useState<Lang>("python");
  const [tryResult, setTryResult] = useState<string>("");
  const [tryLoading, setTryLoading] = useState(false);

  const runTrial = async (endpoint: typeof ENDPOINTS[0]) => {
    setTryLoading(true);
    setTryResult("");
    try {
      const opts: RequestInit = endpoint.method === "POST"
        ? { method: "POST", headers: { "Content-Type": "application/json" }, body: endpoint.body ?? undefined }
        : { method: "GET" };
      const r = await fetch(`/api/proxy?path=${encodeURIComponent(endpoint.path)}`, opts);
      const data = await r.json();
      setTryResult(JSON.stringify(data, null, 2).slice(0, 1200));
    } catch (e) {
      setTryResult(String(e));
    } finally {
      setTryLoading(false);
    }
  };

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <div style={{ maxWidth: 1000, margin: "0 auto", padding: "40px 24px" }}>

        <div style={{ marginBottom: 36 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <span className="badge badge-green">REST API</span>
            <span style={{ fontSize: 12, color: "var(--text-3)", fontFamily: "monospace" }}>{BASE}</span>
          </div>
          <h1 style={{ fontSize: 36, fontWeight: 900, letterSpacing: "-0.03em", marginBottom: 10 }}>
            API <span style={{ color: "var(--green)" }}>Reference</span>
          </h1>
          <p style={{ color: "var(--text-2)", fontSize: 15, lineHeight: 1.6 }}>
            Integrate PetriDish&apos;s knowledge graph reasoning into your research pipeline.
            No authentication required during beta.
          </p>
        </div>

        {/* Endpoints */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 40 }}>
          {ENDPOINTS.map((ep) => (
            <div key={ep.path} className="card" style={{ overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 20px", borderBottom: "1px solid var(--border)" }}>
                <span style={{
                  fontSize: 11, fontFamily: "monospace", fontWeight: 800, padding: "2px 8px", borderRadius: 5,
                  background: ep.method === "POST" ? "var(--blue-dim)" : "var(--green-dim)",
                  color: ep.method === "POST" ? "var(--blue)" : "var(--green)",
                  border: ep.method === "POST" ? "1px solid rgba(59,130,246,0.3)" : "1px solid rgba(16,185,129,0.3)",
                }}>
                  {ep.method}
                </span>
                <span style={{ fontFamily: "monospace", color: "var(--text-1)", fontSize: 14 }}>{ep.path}</span>
                <span style={{ fontSize: 12, color: "var(--text-3)", marginLeft: 4 }}>{ep.desc}</span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderTop: "none" }}>
                <div style={{ padding: 20, borderRight: "1px solid var(--border)" }}>
                  <p className="section-label" style={{ marginBottom: 10 }}>
                    {ep.body ? "Request body" : "No body"}
                  </p>
                  {ep.body && (
                    <pre style={{ fontSize: 11, color: "var(--text-2)", fontFamily: "monospace", overflowX: "auto", lineHeight: 1.65, margin: 0 }}>
                      {ep.body}
                    </pre>
                  )}
                </div>
                <div style={{ padding: 20 }}>
                  <p className="section-label" style={{ marginBottom: 10 }}>Response</p>
                  <pre style={{ fontSize: 11, color: "var(--green)", fontFamily: "monospace", overflowX: "auto", lineHeight: 1.65, margin: 0 }}>
                    {ep.response}
                  </pre>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Graph schema */}
        <div className="card" style={{ overflow: "hidden", marginBottom: 40 }}>
          <div style={{ padding: "12px 20px", borderBottom: "1px solid var(--border)" }}>
            <p className="section-label">Graph Schema</p>
          </div>
          <pre style={{ padding: 20, fontSize: 12, color: "var(--text-2)", fontFamily: "monospace", lineHeight: 1.65, overflowX: "auto", margin: 0 }}>
            {SCHEMA}
          </pre>
        </div>

        {/* Code examples */}
        <div className="card" style={{ overflow: "hidden", marginBottom: 40 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "12px 20px", borderBottom: "1px solid var(--border)" }}>
            <p className="section-label" style={{ marginRight: 12 }}>Code Examples</p>
            {(Object.keys(CODE_EXAMPLES) as Lang[]).map((lang) => (
              <button
                key={lang}
                onClick={() => setActiveLang(lang)}
                style={{
                  padding: "3px 12px", borderRadius: 7, fontSize: 12, fontFamily: "monospace",
                  cursor: "pointer", fontWeight: 700, transition: "all 0.15s",
                  background: activeLang === lang ? "var(--green-dim)" : "transparent",
                  color: activeLang === lang ? "var(--green)" : "var(--text-3)",
                  border: activeLang === lang ? "1px solid rgba(16,185,129,0.3)" : "1px solid transparent",
                }}
              >
                {lang}
              </button>
            ))}
          </div>
          <pre style={{ padding: 20, fontSize: 12, color: "var(--text-2)", fontFamily: "monospace", lineHeight: 1.7, overflowX: "auto", margin: 0 }}>
            {CODE_EXAMPLES[activeLang]}
          </pre>
        </div>

        {/* Rate limits */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          {[
            { label: "Auth required", value: "None (beta)", color: "var(--green)" },
            { label: "Rate limit", value: "Groq free tier", color: "var(--amber)" },
            { label: "Graph size", value: "4.3M edges · 90K nodes", color: "var(--blue)" },
          ].map((s) => (
            <div key={s.label} className="metric-card">
              <div style={{ fontSize: 16, fontWeight: 800, color: s.color, marginBottom: 4 }}>{s.value}</div>
              <div style={{ fontSize: 11, color: "var(--text-3)" }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
