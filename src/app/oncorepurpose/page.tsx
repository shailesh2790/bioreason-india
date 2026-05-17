"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useAuth } from "@/lib/auth";
import { exportOncoRepurposePdf, OncoRepurposeResponse } from "@/lib/exportOncoRepurposePdf";

const StructureViewer = dynamic(() => import("@/components/StructureViewer"), { ssr: false });

const CANCER_INDICATIONS = [
  "Acute lymphoblastic leukemia", "Acute myeloid leukemia", "Chronic myeloid leukemia",
  "Breast cancer", "Lung cancer (NSCLC)", "Hepatocellular carcinoma",
  "Glioblastoma", "Colorectal cancer", "Ovarian cancer", "Melanoma",
];
const DRIVER_MUTATIONS = [
  "BCR-ABL", "EGFR T790M", "KRAS G12C", "BRAF V600E",
  "ALK", "HER2", "PIK3CA", "TP53", "FLT3 ITD", "NOTCH1",
];
const PGX_GENE_OPTIONS: Record<string, { label: string; value: string }[]> = {
  NUDT15:  [{ label: "*1/*1 (normal)", value: "*1/*1" }, { label: "*1/*3 (het)", value: "*1/*3" }, { label: "*3/*3 (poor)", value: "*3/*3" }],
  TPMT:    [{ label: "*1/*1 (normal)", value: "*1/*1" }, { label: "*1/*3C (het)", value: "*1/*3C" }, { label: "*3A/*3C (poor)", value: "*3A/*3C" }],
  MTHFR:   [{ label: "677CC", value: "677CC" }, { label: "677CT", value: "677CT" }, { label: "677TT", value: "677TT" }],
  CYP3A5:  [{ label: "*1/*1 (expressor)", value: "*1/*1" }, { label: "*3/*3 (non-expressor)", value: "*3/*3" }],
  CYP2C19: [{ label: "*1/*1 (extensive)", value: "*1/*1" }, { label: "*1/*2 (IM)", value: "*1/*2" }, { label: "*2/*2 (poor)", value: "*2/*2" }],
};

const RISK_BG: Record<string, string> = {
  GREEN: "rgba(16,185,129,0.12)", YELLOW: "rgba(245,158,11,0.14)",
  RED: "rgba(244,63,94,0.14)", UNKNOWN: "var(--surface-2)",
};
const RISK_FG: Record<string, string> = {
  GREEN: "#10B981", YELLOW: "#F59E0B", RED: "#F43F5E", UNKNOWN: "var(--text-3)",
};
const CONF_FG: Record<string, string> = {
  HIGH: "#10B981", MEDIUM: "#F59E0B", LOW: "#F43F5E",
};

interface PgxRow { gene: string; diplotype: string }

export default function OncoRepurposePage() {
  const { fetchWithAuth } = useAuth();
  const [indication, setIndication] = useState("");
  const [driver, setDriver] = useState("");
  const [pgx, setPgx] = useState<PgxRow[]>([]);
  const [includePhyto, setIncludePhyto] = useState(true);
  const [enableSynth, setEnableSynth] = useState(true);
  const [patientLabel, setPatientLabel] = useState("");
  const [clinician, setClinician] = useState("");
  const [institution, setInstitution] = useState("");
  const [result, setResult] = useState<OncoRepurposeResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedCyp, setExpandedCyp] = useState<string | null>(null);

  const addPgx = () => {
    const existing = new Set(pgx.map(g => g.gene));
    const next = Object.keys(PGX_GENE_OPTIONS).find(g => !existing.has(g));
    if (next) setPgx([...pgx, { gene: next, diplotype: PGX_GENE_OPTIONS[next][0].value }]);
  };
  const updatePgx = (i: number, patch: Partial<PgxRow>) =>
    setPgx(pgx.map((g, idx) => idx === i ? { ...g, ...patch } : g));
  const removePgx = (i: number) => setPgx(pgx.filter((_, idx) => idx !== i));

  const run = async () => {
    if (!indication.trim() || loading) return;
    setLoading(true); setResult(null); setError(null);
    try {
      const res = await fetchWithAuth("/api/oncorepurpose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cancer_indication: indication.trim(),
          driver_mutation: driver.trim() || null,
          patient_pgx: pgx,
          include_phytochemicals: includePhyto,
          enable_synthesis: enableSynth,
          limit: 10,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) setError(data.error ?? `Error ${res.status}`);
      else setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally { setLoading(false); }
  };

  const s = result?.summary;

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "40px 24px" }}>

        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
            <span className="badge badge-purple">Module · OncoRepurpose</span>
            <span className="badge badge-green">v1 · KG + MAMMAL + PGx</span>
            <span style={{ color: "var(--text-3)", fontSize: 12 }}>Cancer drug repurposing · multi-layer evidence</span>
          </div>
          <h1 style={{ fontSize: 34, fontWeight: 900, letterSpacing: "-0.03em", marginBottom: 10 }}>
            Onco<span style={{ color: "var(--purple)" }}>Repurpose</span>
          </h1>
          <p style={{ color: "var(--text-2)", fontSize: 15, maxWidth: 820, lineHeight: 1.7 }}>
            Multi-layer cancer drug repurposing: KG topology (PrimeKG + IMPPAT + IndiGen + CTRI)
            re-ranked by <strong style={{ color: "var(--text-1)" }}>MAMMAL DTI</strong> predicted binding,
            boosted by cancer-pathway enrichment, filtered by per-patient PGx toxicity, synthesised by
            a grounded Llama layer. <strong style={{ color: "var(--text-1)" }}>No global platform produces this combination for Indian patients.</strong>
          </p>
        </div>

        {/* Inputs */}
        <div className="card" style={{ padding: 22, marginBottom: 22 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
            <div>
              <p style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 6, letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 700 }}>Cancer indication</p>
              <input value={indication} onChange={(e) => setIndication(e.target.value)} placeholder="e.g. Acute lymphoblastic leukemia" className="input-bio" style={{ width: "100%", padding: "10px 12px", fontSize: 13 }} />
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
                {CANCER_INDICATIONS.map((c) => (
                  <button key={c} onClick={() => setIndication(c)} style={{
                    fontSize: 11, padding: "3px 9px", borderRadius: 6, background: "var(--surface-2)",
                    color: "var(--text-3)", border: "1px solid var(--border)", cursor: "pointer",
                  }}>{c}</button>
                ))}
              </div>
            </div>
            <div>
              <p style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 6, letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 700 }}>Driver mutation (optional)</p>
              <input value={driver} onChange={(e) => setDriver(e.target.value)} placeholder="e.g. BCR-ABL, EGFR T790M" className="input-bio" style={{ width: "100%", padding: "10px 12px", fontSize: 13 }} />
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
                {DRIVER_MUTATIONS.map((c) => (
                  <button key={c} onClick={() => setDriver(c)} style={{
                    fontSize: 11, padding: "3px 9px", borderRadius: 6, background: "var(--surface-2)",
                    color: "var(--text-3)", border: "1px solid var(--border)", cursor: "pointer", fontFamily: "monospace",
                  }}>{c}</button>
                ))}
              </div>
            </div>
          </div>

          {/* PGx genotypes */}
          <p style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 8, letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 700 }}>Patient PGx (optional · filters toxic candidates)</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
            {pgx.map((g, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "140px 1fr auto", gap: 10, alignItems: "center" }}>
                <select value={g.gene} onChange={(e) => updatePgx(i, { gene: e.target.value, diplotype: PGX_GENE_OPTIONS[e.target.value][0].value })}
                  className="input-bio" style={{ padding: "7px 10px", fontSize: 12.5 }}>
                  {Object.keys(PGX_GENE_OPTIONS).map((k) => <option key={k} value={k}>{k}</option>)}
                </select>
                <select value={g.diplotype} onChange={(e) => updatePgx(i, { diplotype: e.target.value })}
                  className="input-bio" style={{ padding: "7px 10px", fontSize: 12.5 }}>
                  {PGX_GENE_OPTIONS[g.gene]?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <button onClick={() => removePgx(i)} style={{ padding: "5px 9px", fontSize: 11, background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text-3)", cursor: "pointer" }}>×</button>
              </div>
            ))}
            {pgx.length < 5 && (
              <button onClick={addPgx} style={{ padding: "6px 12px", fontSize: 11.5, background: "var(--surface-2)", border: "1px dashed var(--border)", borderRadius: 6, color: "var(--text-2)", cursor: "pointer", fontWeight: 600, alignSelf: "flex-start" }}>+ Add PGx gene</button>
            )}
          </div>

          {/* Toggles + meta */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 14 }}>
            <input value={patientLabel} onChange={(e) => setPatientLabel(e.target.value)} placeholder="Patient label (MRN)" className="input-bio" style={{ padding: "9px 12px", fontSize: 12.5 }} />
            <input value={clinician} onChange={(e) => setClinician(e.target.value)} placeholder="Clinician name" className="input-bio" style={{ padding: "9px 12px", fontSize: 12.5 }} />
            <input value={institution} onChange={(e) => setInstitution(e.target.value)} placeholder="Institution" className="input-bio" style={{ padding: "9px 12px", fontSize: 12.5 }} />
          </div>

          <div style={{ display: "flex", gap: 18, marginBottom: 14, alignItems: "center", flexWrap: "wrap" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-2)" }}>
              <input type="checkbox" checked={includePhyto} onChange={(e) => setIncludePhyto(e.target.checked)} />
              Include IMPPAT phytochemicals
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-2)" }}>
              <input type="checkbox" checked={enableSynth} onChange={(e) => setEnableSynth(e.target.checked)} />
              Grounded AI rationale (Llama)
            </label>
          </div>

          <button onClick={run} disabled={!indication.trim() || loading} className="btn-primary" style={{ padding: "11px 28px", fontSize: 14, cursor: indication.trim() && !loading ? "pointer" : "not-allowed" }}>
            {loading ? "Running multi-layer pipeline…" : "Run OncoRepurpose →"}
          </button>
        </div>

        {loading && (
          <div className="card" style={{ padding: 32, textAlign: "center", color: "var(--text-3)" }}>
            <p style={{ fontSize: 14, fontWeight: 600 }}>Querying KG → re-ranking with MAMMAL → filtering by PGx → synthesising rationale…</p>
          </div>
        )}

        {error && !loading && (
          <div style={{ background: "var(--red-dim)", border: "1px solid rgba(244,63,94,0.3)", borderRadius: 12, padding: "14px 18px", marginBottom: 16 }}>
            <p style={{ color: "#fca5a5", fontSize: 14 }}>⚠ {error}</p>
          </div>
        )}

        {result && s && !loading && (
          <>
            {/* Summary card */}
            <div className="card" style={{ padding: 22, marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 14, marginBottom: 14 }}>
                <div>
                  <p className="section-label" style={{ marginBottom: 4 }}>Repurposing brief</p>
                  <h2 style={{ fontSize: 20, fontWeight: 800, color: "var(--text-1)" }}>{result.cancer_indication}</h2>
                  {result.driver_mutation_resolved?.length ? (
                    <p style={{ fontSize: 12, color: "var(--purple)", fontFamily: "monospace", marginTop: 4 }}>
                      driver targets: {result.driver_mutation_resolved.join(", ")}
                    </p>
                  ) : null}
                </div>
                <button onClick={() => exportOncoRepurposePdf(result, {
                  patient_label: patientLabel || undefined, clinician: clinician || undefined,
                  institution: institution || undefined, driver_mutation: driver || undefined,
                  patient_pgx: pgx,
                })} style={{
                  padding: "10px 20px", borderRadius: 10, border: "1px solid var(--green)",
                  background: "var(--green)", color: "#032018", fontWeight: 800, fontSize: 13, cursor: "pointer",
                }}>↓ Oncology Brief PDF</button>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10 }}>
                <Stat label="Candidates" value={String(s.candidate_count)} />
                <Stat label="Top confidence" value={s.highest_confidence} color={CONF_FG[s.highest_confidence]} />
                <Stat label="MAMMAL evidence" value={String(s.with_mammal_evidence)} color="#6D28D9" />
                <Stat label="Driver match" value={String(s.with_driver_match)} />
                <Stat label="Indian trial" value={String(s.with_indian_trial)} color="#10B981" />
                <Stat label="PGx RED" value={String(s.pgx_red_flags)} color="#F43F5E" />
              </div>
            </div>

            {/* Candidate cards */}
            {result.candidates.length === 0 ? (
              <div className="card" style={{ padding: 24, textAlign: "center" }}>
                <p style={{ color: "var(--text-2)", fontSize: 14 }}>No candidates surfaced. Try a broader indication keyword.</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {result.candidates.map((c, i) => (
                  <div key={c.drug} className="card" style={{ padding: 0, overflow: "hidden", borderLeft: `4px solid ${RISK_FG[c.pgx_verdict.risk_tier]}` }}>
                    <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
                      <div>
                        <p style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 4, fontWeight: 700 }}>RANK {i + 1}</p>
                        <h3 style={{ fontSize: 17, fontWeight: 800, color: "var(--text-1)" }}>{c.drug}</h3>
                        <p style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>
                          targets: {c.targets.slice(0, 4).join(", ") || "—"}
                          {c.via_genes.length > 0 && <span> · via {c.via_genes.slice(0, 3).join(", ")}</span>}
                        </p>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                        <span style={{ padding: "3px 12px", borderRadius: 99, background: c.confidence === "HIGH" ? "rgba(16,185,129,0.12)" : c.confidence === "MEDIUM" ? "rgba(245,158,11,0.14)" : "rgba(244,63,94,0.12)", color: CONF_FG[c.confidence], fontSize: 11, fontWeight: 800, letterSpacing: "0.06em" }}>{c.confidence}</span>
                        <span style={{ fontSize: 10, color: "var(--text-3)" }}>score {c.score}</span>
                      </div>
                    </div>

                    {/* Evidence chips */}
                    <div style={{ padding: "10px 18px", display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {c.evidence_layers.kg_path && <Chip color="#3B82F6" label="KG direct" />}
                      {c.evidence_layers.ppi_proximity && <Chip color="#06B6D4" label="PPI" />}
                      {c.evidence_layers.mammal_dti && <Chip color="#6D28D9" label={`MAMMAL pKd ${c.evidence_layers.mammal_dti.pkd?.toFixed(2)} · rank ${c.evidence_layers.mammal_dti.rank ?? "—"}/24 @ ${c.evidence_layers.mammal_dti.gene}`} />}
                      {c.evidence_layers.driver_match.map((g) => <Chip key={g} color="#F43F5E" label={`driver: ${g}`} />)}
                      {c.evidence_layers.cancer_pathway_hits.map((p) => <Chip key={p} color="#F59E0B" label={p} />)}
                      {c.evidence_layers.indian_trial && <Chip color="#10B981" label={`India trial: ${c.evidence_layers.indian_trial.nct_id ?? "—"} (${c.evidence_layers.indian_trial.status ?? "—"})`} />}
                    </div>

                    {/* Mechanism */}
                    <div style={{ padding: "0 18px 12px", fontSize: 12.5, color: "var(--text-2)", lineHeight: 1.65 }}>
                      {c.mechanism}
                    </div>

                    {/* Rationale synthesis */}
                    {c.rationale_synthesis && (
                      <div style={{ margin: "0 18px 12px", padding: "10px 12px", background: "rgba(109,40,217,0.06)", borderLeft: "3px solid #6D28D9", borderRadius: 6 }}>
                        <p style={{ fontSize: 10.5, color: "#6D28D9", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 4 }}>Grounded AI rationale</p>
                        <p style={{ fontSize: 12.5, color: "var(--text-2)", lineHeight: 1.55 }}>{c.rationale_synthesis}</p>
                      </div>
                    )}

                    {/* PGx verdict */}
                    {c.pgx_verdict.risk_tier !== "UNKNOWN" && c.pgx_verdict.risk_tier !== "GREEN" && (
                      <div style={{ margin: "0 18px 12px", padding: "10px 12px", background: RISK_BG[c.pgx_verdict.risk_tier], borderLeft: `3px solid ${RISK_FG[c.pgx_verdict.risk_tier]}`, borderRadius: 6 }}>
                        <p style={{ fontSize: 10.5, color: RISK_FG[c.pgx_verdict.risk_tier], fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 4 }}>
                          ⚠ PGx {c.pgx_verdict.risk_tier} for this patient
                          {c.pgx_verdict.triggering_gene && <span style={{ marginLeft: 6, fontFamily: "monospace", opacity: 0.7 }}>· {c.pgx_verdict.triggering_gene} {c.pgx_verdict.triggering_diplotype}</span>}
                        </p>
                        <p style={{ fontSize: 12, color: "var(--text-2)" }}>{c.pgx_verdict.flag}</p>
                      </div>
                    )}

                    {/* Structure viewer trigger */}
                    {c.evidence_layers.mammal_dti?.gene && (c.evidence_layers.mammal_dti.gene.startsWith("CYP")) && (
                      <div style={{ padding: "0 18px 14px" }}>
                        <button onClick={() => setExpandedCyp(expandedCyp === `${c.drug}-${c.evidence_layers.mammal_dti?.gene}` ? null : `${c.drug}-${c.evidence_layers.mammal_dti?.gene ?? ""}`)} style={{
                          padding: "5px 10px", fontSize: 11, background: "var(--surface-2)", color: "var(--text-2)",
                          border: "1px solid var(--border)", borderRadius: 6, cursor: "pointer", fontWeight: 600,
                        }}>
                          {expandedCyp === `${c.drug}-${c.evidence_layers.mammal_dti.gene}` ? "Hide" : "Show"} 3D structure of {c.evidence_layers.mammal_dti.gene}
                        </button>
                        {expandedCyp === `${c.drug}-${c.evidence_layers.mammal_dti.gene}` && (
                          <div style={{ marginTop: 10 }}>
                            <StructureViewer gene={c.evidence_layers.mammal_dti.gene} height={320} />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <p style={{ marginTop: 18, fontSize: 11, color: "var(--text-3)", lineHeight: 1.7 }}>
              Evidence chain: PrimeKG + IMPPAT + IndiGen + CTRI knowledge graph · MAMMAL 458M DTI predicted binding ·
              CPIC PGx rule engine · grounded Llama synthesis (entities restricted to result rows only). Decision support — does not replace clinician judgment.
            </p>
          </>
        )}
      </div>
    </main>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ padding: 12, background: "var(--surface-2)", borderRadius: 10, textAlign: "center" }}>
      <p style={{ fontSize: 10, color: "var(--text-3)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 4 }}>{label}</p>
      <p style={{ fontSize: 19, fontWeight: 800, color: color ?? "var(--text-1)" }}>{value}</p>
    </div>
  );
}

function Chip({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: "inline-block", padding: "3px 9px", borderRadius: 99, background: `${color}1a`, color, fontSize: 10.5, fontWeight: 700, letterSpacing: "0.03em", border: `1px solid ${color}40` }}>
      {label}
    </span>
  );
}
