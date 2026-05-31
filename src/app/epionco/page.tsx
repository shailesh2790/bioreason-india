"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { exportEpioncoPdf, TASResponse } from "@/lib/exportEpioncoPdf";

const CANCER_PRESETS = [
  { code: "OSCC",  label: "Oral squamous cell carcinoma" },
  { code: "HNC",   label: "Head & neck (oropharyngeal)" },
  { code: "PDAC",  label: "Pancreatic ductal adenocarcinoma" },
  { code: "AML",   label: "Acute myeloid leukemia" },
  { code: "DLBCL", label: "Diffuse large B-cell lymphoma" },
  { code: "BREAST",label: "Breast cancer" },
  { code: "PROSTATE",label: "Prostate cancer" },
  { code: "LUNG",  label: "Lung cancer (NSCLC)" },
  { code: "B-ALL", label: "B-cell acute lymphoblastic leukemia" },
  { code: "BLADDER",label: "Bladder cancer" },
];

const GENE_PRESETS = [
  "EZH2", "DNMT3A", "DNMT1", "DOT1L", "BRD4", "KDM6A", "ARID1A", "SMARCA4",
  "TET2", "TP53", "MYC", "SPI1", "RUNX1", "FOXA1",
];

interface Signature {
  signature_id: string; cancer_type: string; population: string;
  summary: string; pmid: string;
}

export default function EpioncoPage() {
  const { fetchWithAuth } = useAuth();
  const [cancer, setCancer] = useState("Oral squamous cell carcinoma");
  const [gene, setGene] = useState("");
  const [population, setPopulation] = useState("Indian");
  const [patientLabel, setPatientLabel] = useState("");
  const [clinician, setClinician] = useState("");
  const [institution, setInstitution] = useState("");
  const [result, setResult] = useState<TASResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [allSignatures, setAllSignatures] = useState<Signature[]>([]);

  useEffect(() => {
    fetch("/api/epionco/signatures").then(r => r.json()).then(d => setAllSignatures(d.signatures ?? [])).catch(() => {});
  }, []);

  const run = async () => {
    if (!cancer.trim() || loading) return;
    setLoading(true); setResult(null); setError(null);
    try {
      const res = await fetchWithAuth("/api/epionco/tas", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gene: gene.trim() || null, cancer_type: cancer.trim(), population,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) setError(data.error ?? `Error ${res.status}`);
      else setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally { setLoading(false); }
  };

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "40px 24px" }}>

        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
            <span className="badge badge-purple">Module · EpiOnco</span>
            <span className="badge badge-amber">v0 · 50 curated epifactors · 3 India signatures</span>
            <span style={{ color: "var(--text-3)", fontSize: 12 }}>Epigenetics + Tumour Ability + Indian population overlay</span>
          </div>
          <h1 style={{ fontSize: 34, fontWeight: 900, letterSpacing: "-0.03em", marginBottom: 10 }}>
            Epi<span style={{ color: "var(--purple)" }}>Onco</span>
          </h1>
          <p style={{ color: "var(--text-2)", fontSize: 15, maxWidth: 880, lineHeight: 1.7 }}>
            Indian cancer epigenomics differs from TCGA. Indian oral squamous cell carcinoma has unique hypomethylated
            immune-gene promoters not present in 312 TCGA HNSCC samples
            (<a href="https://pubmed.ncbi.nlm.nih.gov/17139279/" target="_blank" rel="noreferrer" style={{ color: "var(--purple)" }}>PMID:17139279</a>).
            North-East India oropharyngeal cancer is HPV-negative with SPI1+RUNX1 epigenetic dysregulation
            (<a href="https://pubmed.ncbi.nlm.nih.gov/33033692/" target="_blank" rel="noreferrer" style={{ color: "var(--purple)" }}>PMID:33033692</a>).
            Indian pancreatic cancer carries NPY+FAIM2 hypermethylation absent from TCGA PDAC
            (<a href="https://pubmed.ncbi.nlm.nih.gov/36059159/" target="_blank" rel="noreferrer" style={{ color: "var(--purple)" }}>PMID:36059159</a>).
            EpiOnco computes a <strong style={{ color: "var(--text-1)" }}>Tumour Ability Score with Indian-specific delta</strong> — the score TCGA-trained tools cannot produce.
          </p>
        </div>

        {/* Available signatures banner */}
        {allSignatures.length > 0 && (
          <div className="card" style={{ padding: 14, marginBottom: 16, background: "rgba(109,40,217,0.05)", borderLeft: "3px solid var(--purple)" }}>
            <p style={{ fontSize: 11, color: "var(--purple)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700, marginBottom: 6 }}>
              {allSignatures.length} documented Indian-specific signatures available in v0
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {allSignatures.map(s => (
                <span key={s.signature_id} style={{
                  padding: "3px 10px", borderRadius: 99, background: "rgba(109,40,217,0.12)",
                  color: "var(--purple)", fontSize: 11.5, fontWeight: 700, fontFamily: "monospace",
                  border: "1px solid rgba(109,40,217,0.3)",
                }}>{s.signature_id} · PMID:{s.pmid}</span>
              ))}
            </div>
          </div>
        )}

        {/* Inputs */}
        <div className="card" style={{ padding: 22, marginBottom: 22 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 14 }}>
            <div>
              <p style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 6, letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 700 }}>Cancer type</p>
              <input value={cancer} onChange={(e) => setCancer(e.target.value)} className="input-bio" style={{ width: "100%", padding: "10px 12px", fontSize: 13 }} />
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
                {CANCER_PRESETS.map((c) => (
                  <button key={c.code} onClick={() => setCancer(c.label)} style={{
                    fontSize: 10.5, padding: "3px 8px", borderRadius: 6, background: "var(--surface-2)",
                    color: "var(--text-3)", border: "1px solid var(--border)", cursor: "pointer", fontFamily: "monospace",
                  }}>{c.code}</button>
                ))}
              </div>
            </div>
            <div>
              <p style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 6, letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 700 }}>Gene (optional · epifactor / driver)</p>
              <input value={gene} onChange={(e) => setGene(e.target.value)} placeholder="e.g. EZH2" className="input-bio" style={{ width: "100%", padding: "10px 12px", fontSize: 13, fontFamily: "monospace" }} />
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
                {GENE_PRESETS.map((g) => (
                  <button key={g} onClick={() => setGene(g)} style={{
                    fontSize: 10.5, padding: "3px 8px", borderRadius: 6, background: "var(--surface-2)",
                    color: "var(--text-3)", border: "1px solid var(--border)", cursor: "pointer", fontFamily: "monospace",
                  }}>{g}</button>
                ))}
              </div>
            </div>
            <div>
              <p style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 6, letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 700 }}>Population</p>
              <select value={population} onChange={(e) => setPopulation(e.target.value)} className="input-bio" style={{ width: "100%", padding: "10px 12px", fontSize: 13 }}>
                <option value="Indian">Indian</option>
                <option value="Global">Global (TCGA-trained)</option>
              </select>
              <p style={{ fontSize: 10.5, color: "var(--text-3)", marginTop: 6 }}>Indian population triggers L4 overlay if a signature matches.</p>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
            <input value={patientLabel} onChange={(e) => setPatientLabel(e.target.value)} placeholder="Patient label" className="input-bio" style={{ padding: "9px 12px", fontSize: 12.5 }} />
            <input value={clinician} onChange={(e) => setClinician(e.target.value)} placeholder="Clinician" className="input-bio" style={{ padding: "9px 12px", fontSize: 12.5 }} />
            <input value={institution} onChange={(e) => setInstitution(e.target.value)} placeholder="Institution" className="input-bio" style={{ padding: "9px 12px", fontSize: 12.5 }} />
          </div>

          <button onClick={run} disabled={!cancer.trim() || loading} className="btn-primary" style={{ padding: "11px 28px", fontSize: 14 }}>
            {loading ? "Computing TAS…" : "Compute Tumour Ability Score →"}
          </button>
        </div>

        {error && !loading && (
          <div style={{ background: "var(--red-dim)", border: "1px solid rgba(244,63,94,0.3)", borderRadius: 12, padding: "14px 18px", marginBottom: 16 }}>
            <p style={{ color: "#fca5a5", fontSize: 14 }}>⚠ {error}</p>
          </div>
        )}

        {result && !loading && (
          <>
            {/* TAS card */}
            <div className="card" style={{ padding: 24, marginBottom: 16, background: result.delta_tas >= 0.1 ? "linear-gradient(135deg, rgba(109,40,217,0.08), var(--surface))" : "var(--surface)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16, marginBottom: 16 }}>
                <div>
                  <p className="section-label" style={{ marginBottom: 4 }}>Tumour Ability Score</p>
                  <h2 style={{ fontSize: 22, fontWeight: 900, color: "var(--text-1)" }}>{result.gene ? result.gene + " · " : ""}{result.cancer_type}</h2>
                  <p style={{ color: "var(--text-3)", fontSize: 12, marginTop: 4 }}>population: <strong style={{ color: "var(--purple)" }}>{result.population}</strong> · confidence {(result.confidence * 100).toFixed(0)}%</p>
                </div>
                <button onClick={() => exportEpioncoPdf(result, {
                  patient_label: patientLabel || undefined, clinician: clinician || undefined, institution: institution || undefined,
                })} style={{
                  padding: "10px 20px", borderRadius: 10, border: "1px solid var(--green)",
                  background: "var(--green)", color: "#032018", fontWeight: 800, fontSize: 13, cursor: "pointer",
                }}>↓ EpiOnco Brief PDF</button>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                <ScoreCard label="TAS · India" value={result.tas_india.toFixed(2)} color="var(--purple)" big />
                <ScoreCard label="TAS · Global (TCGA)" value={result.tas_global.toFixed(2)} color="var(--text-2)" />
                <ScoreCard label="Δ India shift" value={`${result.delta_tas >= 0 ? "+" : ""}${result.delta_tas.toFixed(2)}`} color={result.delta_tas >= 0.1 ? "#10B981" : result.delta_tas >= 0 ? "var(--amber)" : "#F43F5E"} />
              </div>

              {result.delta_tas >= 0.1 && (
                <p style={{ marginTop: 14, fontSize: 12.5, color: "var(--purple)", padding: "10px 12px", background: "rgba(109,40,217,0.06)", borderLeft: "3px solid var(--purple)", borderRadius: 6 }}>
                  📍 The Indian-population overlay shifts the predicted tumour ability by {`${result.delta_tas >= 0 ? "+" : ""}${result.delta_tas.toFixed(2)}`} — a clinically meaningful delta that TCGA-trained models cannot produce.
                </p>
              )}
            </div>

            {/* Indian signature match */}
            {result.indian_signature_match && (
              <div className="card" style={{ padding: 20, marginBottom: 14, background: "rgba(109,40,217,0.04)", borderLeft: "4px solid var(--purple)" }}>
                <p style={{ fontSize: 11, color: "var(--purple)", letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 700, marginBottom: 8 }}>
                  India-specific signature match · {result.indian_signature_match.signature_id}
                  <a href={`https://pubmed.ncbi.nlm.nih.gov/${result.indian_signature_match.pmid}/`} target="_blank" rel="noreferrer" style={{ marginLeft: 8, color: "var(--purple)", fontFamily: "monospace" }}>
                    PMID:{result.indian_signature_match.pmid} ↗
                  </a>
                </p>
                <p style={{ fontSize: 13.5, color: "var(--text-1)", lineHeight: 1.6, marginBottom: 10 }}>{result.indian_signature_match.summary}</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  <Chip label={`Key genes: ${result.indian_signature_match.key_genes.join(", ")}`} color="#6D28D9" />
                  <Chip label={`Prognosis: ${result.indian_signature_match.prognosis}`} color="#F59E0B" />
                </div>
                <p style={{ marginTop: 10, fontSize: 11.5, color: "var(--text-3)", fontStyle: "italic" }}>
                  Distinctive from TCGA: {result.indian_signature_match.distinctive_from_tcga}
                </p>
              </div>
            )}

            {/* Score components */}
            <div className="card" style={{ padding: 22, marginBottom: 14 }}>
              <p className="section-label" style={{ marginBottom: 12 }}>Score components</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {result.components.map((c, i) => (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 70px 60px 2fr", gap: 12, alignItems: "center", padding: "10px 12px", background: "var(--surface-2)", borderRadius: 8 }}>
                    <span style={{ fontSize: 12.5, color: "var(--text-1)", fontWeight: 600 }}>{c.layer}</span>
                    <span style={{ fontSize: 13, color: "var(--text-1)", fontWeight: 800, textAlign: "right", fontFamily: "monospace" }}>{c.score.toFixed(2)}</span>
                    <span style={{ fontSize: 11, color: "var(--text-3)", textAlign: "right" }}>w={c.weight.toFixed(2)}</span>
                    <span style={{ fontSize: 12, color: "var(--text-3)" }}>{c.contributors.slice(0, 4).join(" · ") || "—"}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Hallmarks active */}
            {result.hallmarks_active.length > 0 && (
              <div className="card" style={{ padding: 22, marginBottom: 14 }}>
                <p className="section-label" style={{ marginBottom: 10 }}>Hanahan-Weinberg hallmarks active ({result.hallmarks_active.length} of 14)</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {result.hallmarks_active.map(h => (
                    <span key={h} style={{ padding: "4px 11px", borderRadius: 99, background: "rgba(245,158,11,0.12)", color: "var(--amber)", fontSize: 11, fontWeight: 700, border: "1px solid rgba(245,158,11,0.3)" }}>{h}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Targetable epifactors */}
            {result.top_targetable_epifactors.length > 0 && (
              <div className="card" style={{ padding: 22, marginBottom: 14 }}>
                <p className="section-label" style={{ marginBottom: 12 }}>Druggable epifactors ({result.top_targetable_epifactors.length})</p>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border)" }}>
                      <Th>Epifactor</Th><Th>Role</Th><Th>Mark</Th><Th>Top drug</Th><Th>PMID</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.top_targetable_epifactors.map((e) => (
                      <tr key={e.epifactor} style={{ borderBottom: "1px solid var(--border)" }}>
                        <Td bold><span style={{ fontFamily: "monospace", color: "var(--purple)" }}>{e.epifactor}</span></Td>
                        <Td>{e.role}</Td>
                        <Td><span style={{ fontFamily: "monospace", color: "var(--text-3)", fontSize: 11 }}>{e.mark}</span></Td>
                        <Td>{e.top_drug || "—"}</Td>
                        <Td><a href={`https://pubmed.ncbi.nlm.nih.gov/${e.pmid}/`} target="_blank" rel="noreferrer" style={{ color: "var(--cyan)", fontFamily: "monospace", fontSize: 11 }}>{e.pmid}↗</a></Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Immunotherapy + note */}
            <div className="card" style={{ padding: 22, marginBottom: 14, borderLeft: `4px solid ${result.immunotherapy_response.toLowerCase().includes("respons") ? "#10B981" : result.immunotherapy_response.toLowerCase().includes("resistant") ? "#F43F5E" : "#F59E0B"}` }}>
              <p className="section-label" style={{ marginBottom: 6 }}>Predicted immunotherapy response · India-aware</p>
              <p style={{ fontSize: 15, color: "var(--text-1)", fontWeight: 600 }}>{result.immunotherapy_response}</p>
            </div>

            <div className="card" style={{ padding: 18, marginBottom: 14 }}>
              <p className="section-label" style={{ marginBottom: 6 }}>Evidence citations</p>
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {result.evidence_citations.map((c, i) => (
                  <li key={i} style={{ fontSize: 11.5, color: "var(--text-3)", lineHeight: 1.7 }}>· {c}</li>
                ))}
              </ul>
            </div>

            <p style={{ fontSize: 11, color: "var(--text-3)", fontStyle: "italic", lineHeight: 1.7 }}>
              {result.note} Decision support only.
            </p>
          </>
        )}
      </div>
    </main>
  );
}

function ScoreCard({ label, value, color, big }: { label: string; value: string; color?: string; big?: boolean }) {
  return (
    <div style={{ padding: 14, background: "var(--surface-2)", borderRadius: 10, textAlign: "center", border: big ? `2px solid ${color}` : "1px solid var(--border)" }}>
      <p style={{ fontSize: 10, color: "var(--text-3)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 6 }}>{label}</p>
      <p style={{ fontSize: big ? 32 : 22, fontWeight: 900, color: color ?? "var(--text-1)", fontFamily: "monospace" }}>{value}</p>
    </div>
  );
}

function Chip({ label, color }: { label: string; color: string }) {
  return (
    <span style={{ padding: "3px 11px", borderRadius: 99, background: `${color}1a`, color, fontSize: 11, fontWeight: 700, border: `1px solid ${color}40` }}>{label}</span>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th style={{ textAlign: "left", padding: "8px 10px", fontSize: 10.5, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-3)" }}>{children}</th>;
}
function Td({ children, bold }: { children: React.ReactNode; bold?: boolean }) {
  return <td style={{ padding: "8px 10px", color: "var(--text-1)", fontWeight: bold ? 700 : 400, verticalAlign: "top", fontSize: 12.5 }}>{children}</td>;
}
