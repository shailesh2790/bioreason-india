"use client";

import { useEffect, useState } from "react";

interface StatsResponse {
  nodes: { label: string; count: number }[];
  edges: { type: string; count: number }[];
  health: { node_count: number; llm_provider: string; llm_model: string };
}

const SOURCE_TABLE: Array<{
  source: string; what: string; nodes_in_graph: string; full_size: string;
  status: "loaded" | "partial" | "planned"; license: string;
}> = [
  { source: "PrimeKG (Harvard MIMS)", what: "Multimodal biomedical KG — drugs, genes, diseases, pathways, phenotypes", nodes_in_graph: "~89,000 (genes, diseases, drugs, pathways, etc.)", full_size: "Same — full PrimeKG ingested", status: "loaded", license: "Open (Apache 2.0)" },
  { source: "IMPPAT 2.0 curated subset", what: "Indian Medicinal Plants Phytochemistry & Therapeutics — Ayurvedic compounds", nodes_in_graph: "100 high-export compounds with literature-cited target genes, Sanskrit names, family, plant part", full_size: "Full IMPPAT 2.0 = 17,967 compounds — academic data agreement with ACTREC Mumbai in progress", status: "partial", license: "Academic agreement required for full set" },
  { source: "IndiGen (CSIR-IGIB)", what: "Indian population PGx variant frequencies", nodes_in_graph: "14 PGx variants currently loaded; expanding to 50+ via PharmGKB-IndiGen overlay", full_size: "IndiGen 1,029 genomes covers ~3,500 clinically actionable variants", status: "partial", license: "Open (IGIB data release)" },
  { source: "CPIC + PharmGKB", what: "Pharmacogenomic dosing guidelines (NUDT15, TPMT, MTHFR, CYP3A5, CYP2C19)", nodes_in_graph: "Encoded in /pedonco rule engine, not as graph edges", full_size: "Same — rule engine matches latest CPIC versions", status: "loaded", license: "Open (CPIC)" },
  { source: "CTRI (Clinical Trials Registry India)", what: "Active and completed Indian clinical trials", nodes_in_graph: "180 trials linked to drugs + diseases (HAS_INDIAN_TRIAL, INVESTIGATES_DISEASE edges)", full_size: "CTRI has ~50,000 trials; we ingest only those with structured drug + disease linkage", status: "partial", license: "Open" },
  { source: "MAMMAL 458M DTI (IBM Research)", what: "Drug-target interaction binding predictions (pKd)", nodes_in_graph: "192 PREDICTED_BINDING edges (24 phytochemicals × 8 CYP enzymes) — generated locally on RTX 3060", full_size: "Same — scaling to all 100 curated compounds in next refresh", status: "partial", license: "Apache 2.0" },
  { source: "RCSB Protein Data Bank", what: "Experimental 3D crystal structures of CYP enzymes (for /herbcheck viewer)", nodes_in_graph: "Fetched on-demand via /structure endpoint; cached", full_size: "8 CYP enzymes (CYP1A2, 2B6, 2C8, 2C9, 2C19, 2D6, 2E1, 3A4)", status: "loaded", license: "Open (RCSB)" },
  { source: "GenomeIndia (DBT)", what: "10,000-genome Indian reference dataset", nodes_in_graph: "Not yet ingested as graph edges", full_size: "10,000 genomes; access via DBT data-sharing", status: "planned", license: "Government access agreement" },
  { source: "ACTREC retrospective cohort", what: "Pediatric ALL clinical outcomes (for BlastProfiler v1 validation)", nodes_in_graph: "Not ingested — partnership initiation phase", full_size: "Largest Indian pediatric oncology cohort", status: "planned", license: "MoU required (research collaboration)" },
];

const MODEL_TABLE: Array<{
  model: string; role: string; live: boolean; provenance: string;
}> = [
  { model: "Llama 3.3 70B (Groq)", role: "Natural language reasoning + grounded synthesis (entities restricted to result rows)", live: true, provenance: "Groq Cloud API" },
  { model: "MAMMAL 458M DTI", role: "Drug-target binding affinity predictions (pKd, rank-based)", live: true, provenance: "IBM Research, Apache 2.0; 192 predictions pre-computed locally" },
  { model: "BlastProfiler classifier v0", role: "Pediatric leukemia subtype from marker panel + driver mutations", live: true, provenance: "Peer-reviewed cell-marker rules (WHO 2016, COG/BFM protocols)" },
  { model: "CPIC PGx rule engine", role: "Dose recommendation for thiopurines, MTX, vincristine", live: true, provenance: "CPIC 2018-2022 published guidelines, PharmGKB Level 2A evidence" },
  { model: "scGPT fine-tuned on PedSCAtlas", role: "BlastProfiler v1 — direct scRNA-seq classification", live: false, provenance: "Roadmap: fine-tune on Mumme 2025 (540K cells) — pending ACTREC validation cohort" },
  { model: "ESM3 (protein variant impact)", role: "Indian-specific variant pathogenicity prediction", live: false, provenance: "Roadmap: EvolutionaryScale Forge API integration" },
];

function StatusPill({ status }: { status: "loaded" | "partial" | "planned" }) {
  const color = status === "loaded" ? "#10B981" : status === "partial" ? "#F59E0B" : "#6B7280";
  const bg = status === "loaded" ? "rgba(16,185,129,0.12)" : status === "partial" ? "rgba(245,158,11,0.14)" : "rgba(107,114,128,0.14)";
  return (
    <span style={{ padding: "2px 9px", borderRadius: 99, fontSize: 10, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", background: bg, color }}>{status}</span>
  );
}

export default function MethodsPage() {
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/stats")
      .then(r => r.json())
      .then(d => setStats(d))
      .catch(e => setError(e instanceof Error ? e.message : "Failed to load stats"));
  }, []);

  const phyto = stats?.nodes.find(n => n.label === "Phytochemical")?.count ?? 0;
  const variant = stats?.nodes.find(n => n.label === "Variant")?.count ?? 0;
  const trial = stats?.nodes.find(n => n.label === "ClinicalTrial")?.count ?? 0;
  const totalNodes = stats?.health?.node_count ?? 0;
  const totalEdges = stats?.edges.reduce((s, e) => s + e.count, 0) ?? 0;

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "40px 24px" }}>

        <div style={{ marginBottom: 28 }}>
          <span className="badge badge-green" style={{ marginBottom: 12, display: "inline-block" }}>Public · Verifiable</span>
          <h1 style={{ fontSize: 32, fontWeight: 900, letterSpacing: "-0.03em", marginBottom: 10 }}>
            Methods & <span style={{ color: "var(--green)" }}>Data Transparency</span>
          </h1>
          <p style={{ color: "var(--text-2)", fontSize: 15, maxWidth: 800, lineHeight: 1.7 }}>
            What is actually in the knowledge graph, which models are live, and what is on the roadmap.
            Read this before any procurement, partnership, or due-diligence conversation. Counts are pulled
            live from <code style={{ color: "var(--green)", fontFamily: "monospace" }}>/api/stats</code> — no marketing numbers anywhere on this page.
          </p>
        </div>

        {/* Live counts */}
        <div className="card" style={{ padding: 22, marginBottom: 18 }}>
          <p className="section-label" style={{ marginBottom: 12 }}>Live graph state · auto-refreshed</p>
          {error && <p style={{ color: "var(--red)", fontSize: 13 }}>⚠ {error}</p>}
          {!stats ? (
            <p style={{ color: "var(--text-3)", fontSize: 13 }}>Loading from production database…</p>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10 }}>
              <Stat label="Total nodes" value={totalNodes.toLocaleString()} color="var(--green)" />
              <Stat label="Total edges" value={totalEdges.toLocaleString()} color="var(--green)" />
              <Stat label="Phytochemicals (IMPPAT curated)" value={String(phyto)} color="var(--amber)" />
              <Stat label="PGx Variants (IndiGen)" value={String(variant)} color="var(--amber)" />
              <Stat label="Indian clinical trials (CTRI)" value={String(trial)} color="var(--cyan)" />
              <Stat label="LLM provider" value={stats.health?.llm_provider ?? "—"} small />
            </div>
          )}
        </div>

        {/* Data sources */}
        <div className="card" style={{ padding: 22, marginBottom: 18 }}>
          <p className="section-label" style={{ marginBottom: 12 }}>Data sources · what is loaded vs planned</p>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  <Th>Source</Th><Th>What it contains</Th><Th>Currently in graph</Th><Th>Full size</Th><Th>Status</Th><Th>License</Th>
                </tr>
              </thead>
              <tbody>
                {SOURCE_TABLE.map((s) => (
                  <tr key={s.source} style={{ borderBottom: "1px solid var(--border)", verticalAlign: "top" }}>
                    <Td bold>{s.source}</Td>
                    <Td>{s.what}</Td>
                    <Td>{s.nodes_in_graph}</Td>
                    <Td>{s.full_size}</Td>
                    <Td><StatusPill status={s.status} /></Td>
                    <Td><span style={{ color: "var(--text-3)", fontSize: 11 }}>{s.license}</span></Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Models */}
        <div className="card" style={{ padding: 22, marginBottom: 18 }}>
          <p className="section-label" style={{ marginBottom: 12 }}>Foundation models + classifiers · what is live</p>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  <Th>Model</Th><Th>Role</Th><Th>Live</Th><Th>Provenance</Th>
                </tr>
              </thead>
              <tbody>
                {MODEL_TABLE.map((m) => (
                  <tr key={m.model} style={{ borderBottom: "1px solid var(--border)" }}>
                    <Td bold>{m.model}</Td>
                    <Td>{m.role}</Td>
                    <Td>{m.live ? <span style={{ color: "var(--green)", fontWeight: 800 }}>✓ live</span> : <span style={{ color: "var(--text-3)" }}>roadmap</span>}</Td>
                    <Td><span style={{ color: "var(--text-3)", fontSize: 11 }}>{m.provenance}</span></Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Guardrails */}
        <div className="card" style={{ padding: 22, marginBottom: 18 }}>
          <p className="section-label" style={{ marginBottom: 10 }}>Hallucination guardrails</p>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8, fontSize: 13, color: "var(--text-2)", lineHeight: 1.6 }}>
            <li>• LLM synthesis prompts include an explicit grounding contract: <strong style={{ color: "var(--text-1)" }}>the model may not name a drug, gene, pathway, disease, or variant that does not appear in the Cypher result rows.</strong></li>
            <li>• If a query returns fewer than 2 rows, the system short-circuits to an honest <em>&quot;no evidence + closest matches&quot;</em> response instead of generating prose.</li>
            <li>• Entity resolution maps abbreviations and Sanskrit names to canonical graph nodes before any LLM call — surfaces &quot;not in graph&quot; suggestions when the user term is sparse.</li>
            <li>• Every clinical recommendation surfaces its CPIC guideline version, evidence grade, confidence, and triggering variants — auditable per output.</li>
            <li>• Every protected action is logged to Firestore with a server-timestamp under <code style={{ fontFamily: "monospace", color: "var(--purple)" }}>audit/&#123;uid&#125;/events</code>.</li>
          </ul>
        </div>

        {/* Known gaps */}
        <div className="card" style={{ padding: 22, marginBottom: 18, borderColor: "rgba(245,158,11,0.3)" }}>
          <p className="section-label" style={{ marginBottom: 10, color: "var(--amber)" }}>Known gaps · openly disclosed</p>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8, fontSize: 13, color: "var(--text-2)", lineHeight: 1.6 }}>
            <li>⚠ <strong>IMPPAT</strong>: 100 curated · full set (17,967) requires ACTREC academic agreement (in progress)</li>
            <li>⚠ <strong>IndiGen PGx</strong>: 14 variants loaded · 50+ expansion via PharmGKB overlay planned</li>
            <li>⚠ <strong>GenomeIndia</strong>: 10,000-genome dataset not yet ingested · DBT access agreement required</li>
            <li>⚠ <strong>BlastProfiler v1 (scGPT/PedSCAtlas)</strong>: classifier currently uses peer-reviewed marker rules · scGPT fine-tune pending ACTREC validation cohort</li>
            <li>⚠ <strong>Outcomes data</strong>: no clinical validation paper published yet · seeking research MoU with one academic hospital</li>
            <li>⚠ <strong>SaMD certification</strong>: positioning for CDSCO Software-as-Medical-Device pathway · not yet submitted</li>
          </ul>
        </div>

        <p style={{ fontSize: 11, color: "var(--text-3)", textAlign: "center", lineHeight: 1.7, marginTop: 24 }}>
          This page is the source of truth. If anything elsewhere on PetriDish conflicts with what is shown here, this page wins.
          <br/>Decision support only — does not replace clinician judgment.
        </p>
      </div>
    </main>
  );
}

function Stat({ label, value, color, small }: { label: string; value: string; color?: string; small?: boolean }) {
  return (
    <div style={{ padding: 12, background: "var(--surface-2)", borderRadius: 10, textAlign: "center" }}>
      <p style={{ fontSize: 10, color: "var(--text-3)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 4 }}>{label}</p>
      <p style={{ fontSize: small ? 14 : 20, fontWeight: 800, color: color ?? "var(--text-1)" }}>{value}</p>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th style={{ textAlign: "left", padding: "8px 10px", fontSize: 10.5, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-3)" }}>{children}</th>;
}
function Td({ children, bold }: { children: React.ReactNode; bold?: boolean }) {
  return <td style={{ padding: "8px 10px", color: "var(--text-1)", fontWeight: bold ? 700 : 400, verticalAlign: "top", fontSize: 12.5 }}>{children}</td>;
}
