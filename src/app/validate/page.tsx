"use client";

import { useState } from "react";
import { exportDossierPdf, DossierResponse } from "@/lib/exportDossierPdf";

const IMPPAT_COMPOUNDS = [
  "Curcumin", "Withaferin A", "Andrographolide", "Boswellic acid", "Berberine",
  "Piperine", "Quercetin", "Bacosides", "Capsaicin", "Eugenol",
  "EGCG", "Resveratrol", "Galantamine", "Glycyrrhizin", "Mangiferin",
  "Asiaticoside", "Picroside", "Forskolin", "Allicin", "Gingerol",
  "Apigenin", "Luteolin", "Genistein", "Trigonelline", "Crocin",
  "Cinnamaldehyde", "Carvacrol", "Ellagic acid", "Thymoquinone", "Tinosporin",
];

interface DossierResponseWithError extends DossierResponse {
  error?: string;
}

const STRENGTH_BG: Record<string, string> = {
  HIGH: "rgba(16,185,129,0.14)",
  MODERATE: "rgba(245,158,11,0.16)",
  LOW: "rgba(244,63,94,0.14)",
};
const STRENGTH_FG: Record<string, string> = {
  HIGH: "#10B981",
  MODERATE: "#F59E0B",
  LOW: "#F43F5E",
};

function StrengthBadge({ value }: { value: string }) {
  const v = (value || "").toUpperCase();
  return (
    <span style={{
      display: "inline-block",
      padding: "2px 10px",
      borderRadius: 99,
      fontSize: 10.5,
      fontWeight: 800,
      letterSpacing: "0.06em",
      textTransform: "uppercase",
      background: STRENGTH_BG[v] ?? "var(--surface-3)",
      color: STRENGTH_FG[v] ?? "var(--text-2)",
      border: `1px solid ${STRENGTH_FG[v] ?? "var(--border-2)"}30`,
    }}>{v || "—"}</span>
  );
}

function SectionCard({ num, title, subtitle, children }: { num: string; title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="card" style={{ padding: 22, marginBottom: 14 }}>
      <header style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 12, paddingBottom: 12, borderBottom: "1px solid var(--border)" }}>
        <span style={{
          background: "var(--green)", color: "#032018",
          fontWeight: 800, fontSize: 11, padding: "3px 8px", borderRadius: 6,
          letterSpacing: "0.04em",
        }}>{num}</span>
        <h3 style={{ fontSize: 16, fontWeight: 800, color: "var(--text-1)", letterSpacing: "-0.01em", flex: 1 }}>{title}</h3>
        {subtitle && <span style={{ fontSize: 11, color: "var(--text-3)" }}>{subtitle}</span>}
      </header>
      {children}
    </section>
  );
}

function KV({ k, v }: { k: string; v: string | null | undefined }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: 12, padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
      <span style={{ color: "var(--text-3)", fontSize: 12, fontWeight: 600 }}>{k}</span>
      <span style={{ color: "var(--text-1)", fontSize: 13 }}>{v && v.trim() ? v : <em style={{ color: "var(--text-3)" }}>—</em>}</span>
    </div>
  );
}

export default function ValidatePage() {
  const [compound, setCompound] = useState("");
  const [applicantFirm, setApplicantFirm] = useState("");
  const [claimedIndication, setClaimedIndication] = useState("");
  const [dose, setDose] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DossierResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (!compound.trim() || loading) return;
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const res = await fetch("/api/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          compound: compound.trim(),
          applicant_firm: applicantFirm.trim() || null,
          claimed_indication: claimedIndication.trim() || null,
          dose: dose.trim() || null,
        }),
      });
      const data: DossierResponseWithError = await res.json();
      if (!res.ok || data.error) setError(data.error ?? `Error ${res.status}`);
      else setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setLoading(false);
    }
  };

  const cs = result?.cdsco_summary;

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "40px 24px" }}>

        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <span className="badge badge-amber">Module B · Ayurveda</span>
            <span className="badge badge-green">IMPPAT 2.0</span>
            <span style={{ color: "var(--text-3)", fontSize: 12 }}>CDSCO Form 44 · GSR 918E aligned</span>
          </div>
          <h1 style={{ fontSize: 34, fontWeight: 900, letterSpacing: "-0.03em", marginBottom: 10 }}>
            Phytopharmaceutical{" "}
            <span style={{ color: "var(--amber)" }}>Dossier Generator</span>
          </h1>
          <p style={{ color: "var(--text-2)", fontSize: 15, maxWidth: 720, lineHeight: 1.7 }}>
            Generate a regulatory-grade computational evidence dossier for any IMPPAT-curated
            Ayurvedic compound. Sections 1, 3-9 are populated from the PetriDish knowledge graph
            with per-edge provenance; sections 2 and 6 (efficacy) are flagged as applicant-supplied
            per CDSCO Schedule Y modified for phytopharmaceuticals.
          </p>
        </div>

        {/* Inputs */}
        <div className="card" style={{ padding: 22, marginBottom: 22 }}>
          <p className="section-label" style={{ marginBottom: 14 }}>Submission inputs</p>

          <p style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 8 }}>Compound (curated IMPPAT entries)</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
            {IMPPAT_COMPOUNDS.map((c) => (
              <button key={c} onClick={() => setCompound(c)} style={{
                fontSize: 11.5, padding: "5px 12px", borderRadius: 8,
                cursor: "pointer", fontWeight: 600, transition: "all 0.15s",
                background: compound === c ? "var(--amber-dim)" : "var(--surface-2)",
                color: compound === c ? "var(--amber)" : "var(--text-3)",
                border: compound === c ? "1px solid rgba(245,158,11,0.4)" : "1px solid var(--border)",
              }}>{c}</button>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <input value={compound} onChange={(e) => setCompound(e.target.value)}
              placeholder="Compound name (e.g. Curcumin)"
              className="input-bio" style={{ padding: "10px 14px", fontSize: 13 }} />
            <input value={applicantFirm} onChange={(e) => setApplicantFirm(e.target.value)}
              placeholder="Applicant firm (e.g. Himalaya Wellness Pvt Ltd)"
              className="input-bio" style={{ padding: "10px 14px", fontSize: 13 }} />
            <input value={claimedIndication} onChange={(e) => setClaimedIndication(e.target.value)}
              placeholder="Claimed indication (e.g. chronic inflammatory disorders)"
              className="input-bio" style={{ padding: "10px 14px", fontSize: 13 }} />
            <input value={dose} onChange={(e) => setDose(e.target.value)}
              placeholder="Dose (e.g. 500 mg BID PO)"
              className="input-bio" style={{ padding: "10px 14px", fontSize: 13 }} />
          </div>

          <button onClick={run} disabled={!compound.trim() || loading} className="btn-primary"
            style={{ padding: "11px 28px", fontSize: 14, cursor: compound.trim() && !loading ? "pointer" : "not-allowed" }}>
            {loading ? "Generating dossier…" : "Generate dossier →"}
          </button>
        </div>

        {/* Loading */}
        {loading && (
          <div className="card" style={{ padding: "48px 24px", textAlign: "center" }}>
            <svg width="44" height="44" viewBox="0 0 48 48" style={{ animation: "rotate-slow 2.5s linear infinite", marginBottom: 12 }}>
              <circle cx="24" cy="24" r="22" stroke="var(--border)" strokeWidth="2" fill="none" />
              <path d="M14 14 C20 20 28 20 34 14" stroke="var(--amber)" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
              <path d="M14 26 C20 32 28 32 34 26" stroke="var(--amber)" strokeWidth="2.5" fill="none" strokeLinecap="round" opacity="0.6"/>
              <path d="M14 38 C20 44 28 44 34 38" stroke="var(--green)" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
            </svg>
            <p style={{ color: "var(--text-2)", fontSize: 14, fontWeight: 600 }}>Tracing compound → target → pathway → disease…</p>
            <p style={{ color: "var(--text-3)", fontSize: 12, marginTop: 4 }}>Building 10-section CDSCO dossier</p>
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div style={{ background: "var(--red-dim)", border: "1px solid rgba(244,63,94,0.3)", borderRadius: 12, padding: "14px 18px", marginBottom: 16 }}>
            <p style={{ color: "#fca5a5", fontSize: 14 }}>⚠ {error}</p>
          </div>
        )}

        {/* Dossier */}
        {result && cs && !loading && (
          <>
            {/* CDSCO summary card */}
            <div className="card" style={{ padding: 24, marginBottom: 18, background: "linear-gradient(135deg, rgba(245,158,11,0.06), var(--surface))" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
                <div style={{ flex: "1 1 auto", minWidth: 280 }}>
                  <p className="section-label" style={{ marginBottom: 6 }}>Computational Evidence Summary</p>
                  <h2 style={{ fontSize: 26, fontWeight: 900, color: "var(--text-1)", marginBottom: 4, letterSpacing: "-0.02em" }}>
                    {result.compound}
                    {result.identity.sanskrit_name && (
                      <span style={{ marginLeft: 12, fontSize: 16, color: "var(--amber)", fontStyle: "italic", fontWeight: 600 }}>
                        ({result.identity.sanskrit_name})
                      </span>
                    )}
                  </h2>
                  <p style={{ color: "var(--text-3)", fontSize: 12 }}>
                    {result.identity.botanical_source ?? "Botanical source not curated"}
                    {result.applicant_firm ? `  ·  ${result.applicant_firm}` : ""}
                  </p>
                </div>
                <button onClick={() => exportDossierPdf(result)} style={{
                  padding: "10px 20px", borderRadius: 10, border: "1px solid var(--green)",
                  background: "var(--green)", color: "#032018", fontWeight: 800, fontSize: 13,
                  cursor: "pointer", whiteSpace: "nowrap",
                }}>↓ Download Dossier PDF</button>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 10, marginTop: 18 }}>
                <Stat label="Overall Evidence" value={cs.overall_evidence_strength} accent />
                <Stat label="Curated Targets" value={String(cs.targets_with_curated_evidence)} />
                <Stat label="Disease Links" value={String(cs.diseases_with_mechanism)} />
                <Stat label="PK Signals" value={String(cs.pk_signals)} />
                <Stat label="DDI Flags" value={String(cs.ddi_signals)} />
                <Stat label="Safety Findings" value={String(cs.safety_findings)} />
              </div>

              <p style={{ marginTop: 14, fontSize: 12, color: cs.ready_for_submission ? "var(--green)" : "var(--amber)" }}>
                {cs.ready_for_submission
                  ? "✓ Ready for inclusion in CDSCO submission. Pharmacy QC + clinical efficacy data must accompany."
                  : "⚠ Below regulatory threshold. Expand curated mechanism evidence before submission."}
              </p>
            </div>

            {/* Section 1 — Identity */}
            <SectionCard num="1" title="Identity & Botanical Source">
              <KV k="Compound name" v={result.identity.compound_name} />
              <KV k="Sanskrit name" v={result.identity.sanskrit_name} />
              <KV k="Botanical source" v={result.identity.botanical_source} />
              <KV k="Family" v={result.identity.family} />
              <KV k="Plant part used" v={result.identity.plant_part} />
              <KV k="Marker compound" v={result.identity.marker_compound} />
              <KV k="CAS number" v={result.identity.cas_number} />
              <KV k="Molecular formula" v={result.identity.molecular_formula} />
              <KV k="Molecular weight" v={result.identity.molecular_weight} />
              <KV k="IMPPAT identifier" v={result.identity.imppat_id} />
            </SectionCard>

            {/* Section 2 — QC */}
            <SectionCard num="2" title="Quality Control & Standardisation" subtitle="Applicant-supplied">
              <p style={{ color: "var(--text-2)", fontSize: 13, lineHeight: 1.7 }}>
                HPLC/HPTLC fingerprint, marker assay, heavy-metals (Pb, As, Hg, Cd) per IP/USP limits,
                microbial limits, residual solvents, and stability data are out of scope of this
                computational evidence dossier and must be supplied by the applicant pharmacy
                per CDSCO Schedule Y modified for phytopharmaceuticals (GSR 918E, 2015).
              </p>
            </SectionCard>

            {/* Section 3 — Molecular targets */}
            <SectionCard num="3" title="Molecular Targets" subtitle={`${result.molecular_targets.length} target(s)`}>
              {result.molecular_targets.length === 0 ? (
                <p style={{ color: "var(--text-3)", fontSize: 13 }}>No curated molecular target edges available.</p>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--border)" }}>
                        <Th>Gene</Th><Th>Source</Th><Th>Evidence</Th><Th>Associated diseases (graph)</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.molecular_targets.map((t) => (
                        <tr key={t.gene_symbol} style={{ borderBottom: "1px solid var(--border)" }}>
                          <Td bold>{t.gene_symbol}</Td>
                          <Td>{t.source}</Td>
                          <Td><span style={{ fontSize: 10.5, fontFamily: "monospace", color: "var(--text-3)" }}>{t.evidence_level}</span></Td>
                          <Td><span style={{ color: "var(--text-3)", fontSize: 11.5 }}>{t.associated_diseases.slice(0, 3).join("; ") || "—"}</span></Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>

            {/* Section 4 — Mechanism */}
            <SectionCard num="4" title="Mechanism of Action — Recommended Form 44 Text">
              <div style={{
                background: "var(--surface-2)", borderLeft: "3px solid var(--amber)",
                padding: "14px 16px", borderRadius: 8, color: "var(--text-2)",
                fontSize: 13, lineHeight: 1.75, whiteSpace: "pre-wrap",
              }}>{cs.recommended_section_4_text}</div>

              {result.pathways.length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <p className="section-label" style={{ marginBottom: 8 }}>Pathways enriched</p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {result.pathways.map((p) => (
                      <span key={p.name} className="badge badge-amber" style={{ fontSize: 11 }}>
                        {p.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </SectionCard>

            {/* Section 5 — Disease associations */}
            <SectionCard num="5" title="Disease Associations" subtitle={`${result.disease_associations.length} association(s)`}>
              {result.disease_associations.length === 0 ? (
                <p style={{ color: "var(--text-3)", fontSize: 13 }}>No graph-validated disease associations.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {result.disease_associations.map((da, i) => (
                    <div key={i} style={{
                      display: "grid", gridTemplateColumns: "1fr auto", gap: 12,
                      alignItems: "center", padding: "10px 12px",
                      background: "var(--surface-2)", borderRadius: 8, border: "1px solid var(--border)",
                    }}>
                      <div>
                        <p style={{ color: "var(--text-1)", fontSize: 13, fontWeight: 700 }}>{da.disease}</p>
                        <p style={{ color: "var(--text-3)", fontSize: 11.5, marginTop: 2 }}>{da.mechanism_path}</p>
                      </div>
                      <StrengthBadge value={da.evidence_strength} />
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>

            {/* Section 6 — Traditional use */}
            <SectionCard num="6" title="Traditional Use ↔ Modern Indication" subtitle={`${result.traditional_use_alignment.length} mapping(s)`}>
              {result.traditional_use_alignment.length === 0 ? (
                <p style={{ color: "var(--text-3)", fontSize: 13 }}>No traditional-use mapping recorded.</p>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border)" }}>
                      <Th>Traditional use (IMPPAT)</Th><Th>Modern indication</Th><Th>Match</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.traditional_use_alignment.map((t, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                        <Td>{t.traditional_use}</Td>
                        <Td>{t.modern_indication}</Td>
                        <Td><StrengthBadge value={t.match_strength} /></Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </SectionCard>

            {/* Section 7 — PK */}
            <SectionCard num="7" title="Pharmacokinetics — CYP / Metabolism" subtitle={`${result.pk_metabolism.length} CYP edge(s)`}>
              {result.pk_metabolism.length === 0 ? (
                <p style={{ color: "var(--text-3)", fontSize: 13 }}>No CYP edges curated. Applicant must supply human PK or in-vitro hepatocyte study data.</p>
              ) : (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {result.pk_metabolism.map((pk) => (
                    <span key={pk.enzyme} className="badge badge-purple" style={{ fontSize: 11.5 }}>
                      {pk.enzyme} <span style={{ opacity: 0.6, marginLeft: 4 }}>· {pk.role}</span>
                    </span>
                  ))}
                </div>
              )}
            </SectionCard>

            {/* Section 8 — DDI */}
            <SectionCard num="8" title="Drug-Drug Interactions" subtitle={`${result.drug_interactions.length} flag(s)`}>
              {result.drug_interactions.length === 0 ? (
                <p style={{ color: "var(--text-3)", fontSize: 13 }}>No DDI signals curated.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {result.drug_interactions.map((ddi, i) => (
                    <div key={i} style={{ padding: "8px 12px", background: "var(--surface-2)", borderRadius: 6, fontSize: 12.5 }}>
                      <strong style={{ color: "var(--text-1)" }}>{ddi.drug}</strong>
                      <span style={{ color: "var(--text-3)", marginLeft: 8 }}>{ddi.note}</span>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>

            {/* Section 9 — Safety */}
            <SectionCard num="9" title="Safety Signals" subtitle={`${result.safety_signals.length} finding(s)`}>
              {result.safety_signals.length === 0 ? (
                <p style={{ color: "var(--text-3)", fontSize: 13 }}>No curated safety signals.</p>
              ) : (
                <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                  {result.safety_signals.map((s, i) => (
                    <li key={i} style={{ padding: "8px 12px", background: "rgba(244,63,94,0.06)", borderLeft: "3px solid var(--red)", borderRadius: 6, fontSize: 12.5 }}>
                      <span style={{ color: "var(--text-1)" }}>{s.finding}</span>
                      <span style={{ color: "var(--text-3)", fontSize: 11, marginLeft: 8 }}>· {s.source}</span>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>

            {/* Section 10 — Data gaps */}
            <SectionCard num="10" title="Data Gaps — Applicant Must Supply" subtitle={`${result.data_gaps.length} item(s)`}>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {result.data_gaps.map((g, i) => (
                  <div key={i} style={{
                    padding: "10px 14px", background: "rgba(245,158,11,0.08)",
                    borderLeft: "3px solid var(--amber)", borderRadius: 6,
                  }}>
                    <p style={{ color: "var(--amber)", fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 4 }}>{g.section}</p>
                    <p style={{ color: "var(--text-2)", fontSize: 12.5, lineHeight: 1.6 }}>{g.description}</p>
                  </div>
                ))}
              </div>
            </SectionCard>

            {/* Cypher audit trail */}
            <details className="card" style={{ padding: 22, marginBottom: 14, overflow: "hidden" }}>
              <summary style={{ cursor: "pointer", fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-3)" }}>
                Appendix · Cypher audit trail ({result.cypher_steps.length} queries)
              </summary>
              <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
                {result.cypher_steps.map((step, i) => (
                  <div key={i} style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
                    <div style={{ padding: "8px 14px", background: "var(--surface-2)", borderBottom: "1px solid var(--border)", fontSize: 12, color: "var(--text-2)" }}>
                      A.{i + 1} · {step.step}
                    </div>
                    <pre style={{ padding: "10px 14px", fontSize: 11.5, color: "var(--amber)", fontFamily: "monospace", overflowX: "auto", margin: 0, lineHeight: 1.6 }}>
                      {step.cypher}
                    </pre>
                  </div>
                ))}
              </div>
            </details>
          </>
        )}
      </div>
    </main>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={{
      padding: 12, background: "var(--surface)", border: "1px solid var(--border)",
      borderRadius: 10, textAlign: "center",
    }}>
      <p style={{ fontSize: 10, color: "var(--text-3)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 4 }}>{label}</p>
      <p style={{
        fontSize: accent ? 18 : 22, fontWeight: 800,
        color: accent ? STRENGTH_FG[value] ?? "var(--text-1)" : "var(--text-1)",
      }}>{value}</p>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th style={{ textAlign: "left", padding: "8px 10px", fontSize: 10.5, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-3)" }}>{children}</th>;
}

function Td({ children, bold }: { children: React.ReactNode; bold?: boolean }) {
  return <td style={{ padding: "8px 10px", color: "var(--text-1)", fontWeight: bold ? 700 : 400, verticalAlign: "top" }}>{children}</td>;
}
