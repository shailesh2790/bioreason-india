"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { exportPedoncoPdf, PedoncoDoseResponse } from "@/lib/exportPedoncoPdf";

interface PedoncoIndex {
  drugs: string[];
  genes_with_dosing_impact: string[];
  guideline_version: string;
  module_version: string;
}

interface GenotypeRow {
  gene: string;
  diplotype: string;
}

const DRUG_DEFAULT = "6-Mercaptopurine";

// Curated diplotype options per gene (covers the v3 doc's 6 variants)
const DIPLOTYPE_OPTIONS: Record<string, { label: string; value: string; risk: string }[]> = {
  NUDT15: [
    { label: "*1/*1 (normal metabolizer · ~82% S.Asians)", value: "*1/*1", risk: "low" },
    { label: "*1/*3 (heterozygous · ~16% S.Asians)", value: "*1/*3", risk: "moderate" },
    { label: "*3/*3 (homozygous · ~1% S.Asians)", value: "*3/*3", risk: "high" },
  ],
  TPMT: [
    { label: "*1/*1 (normal metabolizer)", value: "*1/*1", risk: "low" },
    { label: "*1/*3C (heterozygous)", value: "*1/*3C", risk: "moderate" },
    { label: "*3A/*3C or *3A/*3A (poor metabolizer)", value: "*3A/*3C", risk: "high" },
  ],
  MTHFR: [
    { label: "677CC (wild type)", value: "677CC", risk: "low" },
    { label: "677CT (heterozygous · ~40% Indians)", value: "677CT", risk: "moderate" },
    { label: "677TT (homozygous · ~18% Indians)", value: "677TT", risk: "high" },
    { label: "1298CC (homozygous A1298C)", value: "1298CC", risk: "moderate" },
  ],
  CYP3A5: [
    { label: "*1/*1 (expressor)", value: "*1/*1", risk: "low" },
    { label: "*1/*3 (heterozygous expressor)", value: "*1/*3", risk: "low" },
    { label: "*3/*3 (non-expressor · ~66% S.Asians)", value: "*3/*3", risk: "moderate" },
  ],
  SLC19A1: [
    { label: "GG (wild type)", value: "GG", risk: "low" },
    { label: "AG (heterozygous)", value: "AG", risk: "low" },
    { label: "AA (homozygous variant)", value: "AA", risk: "moderate" },
  ],
};

const RISK_BG: Record<string, string> = {
  GREEN: "rgba(16,185,129,0.12)",
  YELLOW: "rgba(245,158,11,0.14)",
  RED: "rgba(244,63,94,0.14)",
};
const RISK_FG: Record<string, string> = {
  GREEN: "#10B981",
  YELLOW: "#F59E0B",
  RED: "#F43F5E",
};

export default function PedoncoPage() {
  const { fetchWithAuth } = useAuth();
  const [drugs, setDrugs] = useState<string[]>([]);
  const [drug, setDrug] = useState(DRUG_DEFAULT);
  const [age, setAge] = useState<number>(8);
  const [weight, setWeight] = useState<number>(25);
  const [bsa, setBsa] = useState<string>("");
  const [patientLabel, setPatientLabel] = useState<string>("");
  const [clinician, setClinician] = useState<string>("");
  const [institution, setInstitution] = useState<string>("");
  const [genotypes, setGenotypes] = useState<GenotypeRow[]>([
    { gene: "NUDT15", diplotype: "*1/*1" },
    { gene: "TPMT", diplotype: "*1/*1" },
  ]);
  const [result, setResult] = useState<PedoncoDoseResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/pedonco/index")
      .then((r) => r.json())
      .then((d: PedoncoIndex) => setDrugs(d.drugs ?? []))
      .catch(() => {});
  }, []);

  const addGenotype = () => {
    const existing = new Set(genotypes.map((g) => g.gene));
    const next = ["NUDT15", "TPMT", "MTHFR", "CYP3A5", "SLC19A1"].find((g) => !existing.has(g));
    if (next) {
      setGenotypes([...genotypes, { gene: next, diplotype: DIPLOTYPE_OPTIONS[next][0].value }]);
    }
  };
  const updateGenotype = (i: number, patch: Partial<GenotypeRow>) => {
    setGenotypes(genotypes.map((g, idx) => (idx === i ? { ...g, ...patch } : g)));
  };
  const removeGenotype = (i: number) => setGenotypes(genotypes.filter((_, idx) => idx !== i));

  const run = async () => {
    if (loading) return;
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const res = await fetchWithAuth("/api/pedonco/dose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          drug,
          weight_kg: weight,
          bsa_m2: bsa ? Number(bsa) : null,
          age_years: age,
          genotypes,
          indication: "Pediatric ALL",
          applicant_clinician: clinician || null,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) setError(data.error ?? `Error ${res.status}`);
      else setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setLoading(false);
    }
  };

  const r = result?.recommendation;

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "40px 24px" }}>

        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
            <span className="badge badge-red">Module · PediOncoPGx</span>
            <span className="badge badge-amber">v1 · CPIC-grounded</span>
            <span style={{ color: "var(--text-3)", fontSize: 12 }}>Pediatric ALL · Indian-frequency calibrated</span>
          </div>
          <h1 style={{ fontSize: 34, fontWeight: 900, letterSpacing: "-0.03em", marginBottom: 10 }}>
            Pediatric <span style={{ color: "var(--red)" }}>Onco-PGx</span> Dosing
          </h1>
          <p style={{ color: "var(--text-2)", fontSize: 15, maxWidth: 760, lineHeight: 1.7 }}>
            CPIC-grounded dosing decision support for pediatric blood cancer agents — 6-Mercaptopurine,
            Methotrexate, Vincristine — with NUDT15 / TPMT / MTHFR / CYP3A5 / SLC19A1 calibrated to Indian
            allele frequencies. <strong style={{ color: "var(--text-1)" }}>1 in 10 Indian children with ALL carries NUDT15*3</strong> —
            standard 6-MP dosing causes severe, sometimes fatal, myelosuppression in these patients.
          </p>
        </div>

        {/* Inputs */}
        <div className="card" style={{ padding: 22, marginBottom: 22 }}>
          <p className="section-label" style={{ marginBottom: 14 }}>Patient + drug</p>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
            <div>
              <p style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 6, letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 700 }}>Drug</p>
              <select value={drug} onChange={(e) => setDrug(e.target.value)} className="input-bio" style={{ width: "100%", padding: "10px 12px", fontSize: 13 }}>
                {(drugs.length ? drugs : [DRUG_DEFAULT]).map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <p style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 6, letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 700 }}>Indication</p>
              <input value="Pediatric ALL" disabled className="input-bio" style={{ width: "100%", padding: "10px 12px", fontSize: 13, opacity: 0.6 }} />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 14 }}>
            <div>
              <p style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 6, letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 700 }}>Age (years)</p>
              <input type="number" value={age} onChange={(e) => setAge(Number(e.target.value))} className="input-bio" style={{ width: "100%", padding: "10px 12px", fontSize: 13 }} min={0} max={18} />
            </div>
            <div>
              <p style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 6, letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 700 }}>Weight (kg)</p>
              <input type="number" value={weight} onChange={(e) => setWeight(Number(e.target.value))} className="input-bio" style={{ width: "100%", padding: "10px 12px", fontSize: 13 }} min={3} max={120} />
            </div>
            <div>
              <p style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 6, letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 700 }}>BSA (m², optional)</p>
              <input value={bsa} onChange={(e) => setBsa(e.target.value)} className="input-bio" style={{ width: "100%", padding: "10px 12px", fontSize: 13 }} placeholder="auto-estimated" />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 14 }}>
            <input value={patientLabel} onChange={(e) => setPatientLabel(e.target.value)} placeholder="Patient label (MRN / initials)" className="input-bio" style={{ padding: "10px 12px", fontSize: 13 }} />
            <input value={clinician} onChange={(e) => setClinician(e.target.value)} placeholder="Clinician name" className="input-bio" style={{ padding: "10px 12px", fontSize: 13 }} />
            <input value={institution} onChange={(e) => setInstitution(e.target.value)} placeholder="Institution (e.g. Tata Memorial)" className="input-bio" style={{ padding: "10px 12px", fontSize: 13 }} />
          </div>

          {/* Genotypes */}
          <p className="section-label" style={{ marginTop: 10, marginBottom: 10 }}>Patient genotypes</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
            {genotypes.map((g, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "140px 1fr auto", gap: 10, alignItems: "center" }}>
                <select value={g.gene} onChange={(e) => updateGenotype(i, { gene: e.target.value, diplotype: DIPLOTYPE_OPTIONS[e.target.value][0].value })}
                  className="input-bio" style={{ padding: "8px 10px", fontSize: 13 }}>
                  {Object.keys(DIPLOTYPE_OPTIONS).map((k) => <option key={k} value={k}>{k}</option>)}
                </select>
                <select value={g.diplotype} onChange={(e) => updateGenotype(i, { diplotype: e.target.value })}
                  className="input-bio" style={{ padding: "8px 10px", fontSize: 13 }}>
                  {DIPLOTYPE_OPTIONS[g.gene]?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <button onClick={() => removeGenotype(i)} style={{ padding: "6px 10px", fontSize: 12, background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text-3)", cursor: "pointer" }}>Remove</button>
              </div>
            ))}
            {genotypes.length < 5 && (
              <button onClick={addGenotype} style={{ padding: "8px 14px", fontSize: 12, background: "var(--surface-2)", border: "1px dashed var(--border)", borderRadius: 6, color: "var(--text-2)", cursor: "pointer", fontWeight: 600 }}>+ Add gene</button>
            )}
          </div>

          <button onClick={run} disabled={loading} className="btn-primary" style={{ padding: "11px 28px", fontSize: 14, cursor: loading ? "wait" : "pointer" }}>
            {loading ? "Computing recommendation…" : "Generate dose recommendation →"}
          </button>
        </div>

        {error && !loading && (
          <div style={{ background: "var(--red-dim)", border: "1px solid rgba(244,63,94,0.3)", borderRadius: 12, padding: "14px 18px", marginBottom: 16 }}>
            <p style={{ color: "#fca5a5", fontSize: 14 }}>⚠ {error}</p>
          </div>
        )}

        {result && r && !loading && (
          <>
            {/* Recommendation card */}
            <div className="card" style={{ padding: 0, marginBottom: 16, overflow: "hidden", borderLeft: `5px solid ${RISK_FG[r.risk_tier]}` }}>
              <div style={{ padding: "18px 22px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16, background: RISK_BG[r.risk_tier] }}>
                <div>
                  <p style={{ fontSize: 11, color: RISK_FG[r.risk_tier], fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>
                    Risk tier: {r.risk_tier} · {r.percent_of_standard}% of standard dose
                  </p>
                  <h2 style={{ fontSize: 24, fontWeight: 900, color: "var(--text-1)", letterSpacing: "-0.02em" }}>{result.drug}</h2>
                  <p style={{ color: "var(--text-3)", fontSize: 13, marginTop: 4 }}>{r.metabolizer_phenotype}</p>
                </div>
                <button onClick={() => exportPedoncoPdf(result, {
                  patient_label: patientLabel || undefined, weight_kg: weight, age_years: age,
                  clinician: clinician || undefined, institution: institution || undefined,
                  genotypes_input: genotypes,
                })} style={{
                  padding: "10px 20px", borderRadius: 10, border: "1px solid var(--green)",
                  background: "var(--green)", color: "#032018", fontWeight: 800, fontSize: 13,
                  cursor: "pointer", whiteSpace: "nowrap",
                }}>↓ Clinical PDF</button>
              </div>

              <div style={{ padding: "18px 22px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 10, marginBottom: 8 }}>
                  <p style={{ fontSize: 11, color: "var(--text-3)", fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase" }}>Standard</p>
                  <p style={{ fontSize: 13, color: "var(--text-2)" }}>{r.standard_dose_text}</p>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 10 }}>
                  <p style={{ fontSize: 11, color: "var(--text-3)", fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase" }}>Recommended</p>
                  <p style={{ fontSize: 14, color: "var(--text-1)", fontWeight: 700 }}>{r.recommended_dose_text}</p>
                </div>

                {result.bsa_used_m2 && result.standard_dose_mg && (
                  <p style={{ fontSize: 11, color: "var(--text-3)", marginTop: 8 }}>
                    Calculated using BSA {result.bsa_used_m2} m² (estimated from weight); standard equivalent {result.standard_dose_mg} mg/day
                  </p>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="card" style={{ padding: 22, marginBottom: 14 }}>
              <p className="section-label" style={{ marginBottom: 10 }}>Clinical actions ({r.actions.length})</p>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                {r.actions.map((a, i) => (
                  <li key={i} style={{ padding: "10px 14px", background: "var(--surface-2)", borderRadius: 8, fontSize: 13.5, color: "var(--text-1)", display: "flex", gap: 10 }}>
                    <span style={{ color: RISK_FG[r.risk_tier], fontWeight: 800 }}>{i + 1}.</span> {a}
                  </li>
                ))}
              </ul>
            </div>

            {/* Triggering variants + monitoring */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
              <div className="card" style={{ padding: 18 }}>
                <p className="section-label" style={{ marginBottom: 10 }}>Triggering variants</p>
                {r.triggering_variants.length === 0 ? (
                  <p style={{ color: "var(--text-3)", fontSize: 13 }}>No actionable variants in supplied genotype.</p>
                ) : r.triggering_variants.map((v, i) => (
                  <p key={i} style={{ fontSize: 12.5, color: "var(--text-2)", marginBottom: 4 }}>
                    <span style={{ color: "var(--amber)", fontFamily: "monospace", fontWeight: 700 }}>{String(v.gene)}</span>
                    {" "}{String(v.diplotype ?? v.variant ?? "")}
                  </p>
                ))}
              </div>
              <div className="card" style={{ padding: 18 }}>
                <p className="section-label" style={{ marginBottom: 10 }}>Monitoring plan</p>
                <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 5 }}>
                  {r.monitoring_plan.map((m, i) => (
                    <li key={i} style={{ fontSize: 12.5, color: "var(--text-2)" }}>· {m}</li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Indian context */}
            <div className="card" style={{ padding: 18, marginBottom: 14, background: "rgba(245,158,11,0.06)", borderLeft: "3px solid var(--amber)" }}>
              <p style={{ fontSize: 11, color: "var(--amber)", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 6 }}>Indian population context</p>
              <p style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.7 }}>{r.indian_frequency_context}</p>
              <p style={{ fontSize: 11, color: "var(--text-3)", marginTop: 8, fontStyle: "italic" }}>Guideline: {r.cpic_guideline} · confidence {(r.confidence * 100).toFixed(0)}%</p>
            </div>

            <p style={{ fontSize: 11, color: "var(--text-3)", lineHeight: 1.7, padding: "0 4px" }}>
              {result.disclaimer}
            </p>
          </>
        )}
      </div>
    </main>
  );
}
