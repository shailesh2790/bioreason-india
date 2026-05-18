"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { exportBlastProfilerPdf, BlastProfilerResponse } from "@/lib/exportBlastProfilerPdf";

const TIMEPOINTS = ["Diagnosis", "End of Induction", "Relapse"];
const DRIVER_OPTIONS = [
  "BCR-ABL", "ETV6-RUNX1", "TCF3-PBX1", "KMT2A-r", "IKZF1 del", "PAX5",
  "NOTCH1", "TAL1", "ETP",
  "FLT3 ITD", "NPM1", "RUNX1-RUNX1T1", "CBFB-MYH11", "PML-RARA (APL)",
];
const PGX_GENE_OPTIONS: Record<string, { label: string; value: string }[]> = {
  NUDT15:  [{ label: "*1/*1 (normal)", value: "*1/*1" }, { label: "*1/*3 (heterozygous · 16% S.Asians)", value: "*1/*3" }, { label: "*3/*3 (poor metabolizer)", value: "*3/*3" }],
  TPMT:    [{ label: "*1/*1 (normal)", value: "*1/*1" }, { label: "*1/*3C (heterozygous)", value: "*1/*3C" }, { label: "*3A/*3C (poor metabolizer)", value: "*3A/*3C" }],
  MTHFR:   [{ label: "677CC", value: "677CC" }, { label: "677CT", value: "677CT" }, { label: "677TT (~18% Indians)", value: "677TT" }],
  CYP3A5:  [{ label: "*1/*1 (expressor)", value: "*1/*1" }, { label: "*3/*3 (non-expressor · 66% S.Asians)", value: "*3/*3" }],
};

// Marker definitions with clinical hints
const MARKER_FIELDS: { key: string; label: string; lineage: string; hint: string }[] = [
  { key: "cd19_pct",  label: "CD19",  lineage: "B",  hint: "B-lineage defining" },
  { key: "cd22_pct",  label: "CD22",  lineage: "B",  hint: "B-lineage" },
  { key: "cd10_pct",  label: "CD10",  lineage: "B",  hint: "common B-ALL (CALLA)" },
  { key: "cd20_pct",  label: "CD20",  lineage: "B",  hint: "mature B" },
  { key: "cd3_pct",   label: "CD3",   lineage: "T",  hint: "T-lineage" },
  { key: "cd7_pct",   label: "CD7",   lineage: "T",  hint: "T-lineage (most specific)" },
  { key: "cd2_pct",   label: "CD2",   lineage: "T",  hint: "T-lineage" },
  { key: "cd13_pct",  label: "CD13",  lineage: "M",  hint: "myeloid" },
  { key: "cd33_pct",  label: "CD33",  lineage: "M",  hint: "myeloid" },
  { key: "mpo_pct",   label: "MPO",   lineage: "M",  hint: "myeloperoxidase — AML defining" },
  { key: "cd34_pct",  label: "CD34",  lineage: "S",  hint: "stem/progenitor" },
  { key: "cd117_pct", label: "CD117", lineage: "M",  hint: "KIT" },
  { key: "tdt_pct",   label: "TdT",   lineage: "L",  hint: "ALL (B or T)" },
  { key: "hla_dr_pct",label: "HLA-DR",lineage: "L",  hint: "" },
];

const LINEAGE_BG: Record<string, string> = {
  B: "rgba(59,130,246,0.08)", T: "rgba(244,63,94,0.08)",
  M: "rgba(245,158,11,0.08)", S: "rgba(139,92,246,0.08)", L: "rgba(16,185,129,0.08)",
};
const LINEAGE_FG: Record<string, string> = {
  B: "#3B82F6", T: "#F43F5E", M: "#F59E0B", S: "#8B5CF6", L: "#10B981",
};

const SEN_BG: Record<string, string> = {
  Sensitive: "rgba(16,185,129,0.12)", Intermediate: "rgba(245,158,11,0.14)",
  Resistant: "rgba(244,63,94,0.14)", "Not indicated": "var(--surface-2)",
};
const SEN_FG: Record<string, string> = {
  Sensitive: "#10B981", Intermediate: "#F59E0B", Resistant: "#F43F5E", "Not indicated": "var(--text-3)",
};

interface PgxRow { gene: string; diplotype: string }

const PRESETS: Record<string, { label: string; markers: Record<string, number>; blast: number; drivers: string[] }> = {
  "B-ALL": {
    label: "B-ALL (Ph+)",
    markers: { cd19_pct: 96, cd22_pct: 92, cd10_pct: 85, cd34_pct: 60, tdt_pct: 88, hla_dr_pct: 80 },
    blast: 78, drivers: ["BCR-ABL"],
  },
  "T-ALL": {
    label: "T-ALL (NOTCH1)",
    markers: { cd3_pct: 78, cd7_pct: 95, cd2_pct: 70, tdt_pct: 82 },
    blast: 65, drivers: ["NOTCH1"],
  },
  "AML": {
    label: "AML (FLT3 ITD)",
    markers: { mpo_pct: 85, cd33_pct: 90, cd13_pct: 82, cd34_pct: 70, cd117_pct: 75 },
    blast: 72, drivers: ["FLT3 ITD"],
  },
  "APL": {
    label: "APL (PML-RARA)",
    markers: { mpo_pct: 95, cd33_pct: 88, cd13_pct: 80, cd117_pct: 70, hla_dr_pct: 5 },
    blast: 80, drivers: ["PML-RARA (APL)"],
  },
};

export default function BlastProfilerPage() {
  const { fetchWithAuth } = useAuth();
  const [blastPct, setBlastPct] = useState<number>(60);
  const [markers, setMarkers] = useState<Record<string, string>>({});
  const [drivers, setDrivers] = useState<string[]>([]);
  const [timepoint, setTimepoint] = useState("Diagnosis");
  const [age, setAge] = useState<number>(8);
  const [weight, setWeight] = useState<number>(25);
  const [wbc, setWbc] = useState<string>("");
  const [pgx, setPgx] = useState<PgxRow[]>([]);
  const [patientLabel, setPatientLabel] = useState("");
  const [clinician, setClinician] = useState("");
  const [institution, setInstitution] = useState("");
  const [result, setResult] = useState<BlastProfilerResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setMarker = (k: string, v: string) => setMarkers((m) => ({ ...m, [k]: v }));
  const toggleDriver = (d: string) =>
    setDrivers(drivers.includes(d) ? drivers.filter(x => x !== d) : [...drivers, d]);

  const loadPreset = (p: string) => {
    const preset = PRESETS[p];
    setBlastPct(preset.blast);
    setMarkers(Object.fromEntries(Object.entries(preset.markers).map(([k, v]) => [k, String(v)])));
    setDrivers(preset.drivers);
  };

  const addPgx = () => {
    const ex = new Set(pgx.map(g => g.gene));
    const next = Object.keys(PGX_GENE_OPTIONS).find(g => !ex.has(g));
    if (next) setPgx([...pgx, { gene: next, diplotype: PGX_GENE_OPTIONS[next][0].value }]);
  };
  const updatePgx = (i: number, patch: Partial<PgxRow>) =>
    setPgx(pgx.map((g, idx) => idx === i ? { ...g, ...patch } : g));
  const removePgx = (i: number) => setPgx(pgx.filter((_, idx) => idx !== i));

  const run = async () => {
    if (loading) return;
    setLoading(true); setResult(null); setError(null);
    try {
      const markerNums: Record<string, number> = {};
      for (const [k, v] of Object.entries(markers)) {
        const n = parseFloat(v);
        if (!isNaN(n)) markerNums[k] = n;
      }
      const res = await fetchWithAuth("/api/blastprofiler/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patient_id: patientLabel || null,
          age_years: age, sex: null, weight_kg: weight,
          timepoint,
          wbc_x10_9_per_L: wbc ? parseFloat(wbc) : null,
          markers: { blast_percent: blastPct, ...markerNums },
          driver_mutations: drivers,
          patient_pgx: pgx,
          clinician: clinician || null, institution: institution || null,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) setError(data.error ?? `Error ${res.status}`);
      else setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally { setLoading(false); }
  };

  const markersSummary = () => {
    const expressed = MARKER_FIELDS
      .filter(m => markers[m.key] && parseFloat(markers[m.key]) >= 30)
      .map(m => `${m.label} ${markers[m.key]}%`)
      .join(", ");
    return `blasts ${blastPct}%${expressed ? " · " + expressed : ""}`;
  };

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "40px 24px" }}>

        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
            <span className="badge badge-blue">Module · BlastProfiler</span>
            <span className="badge badge-amber">v0 · marker + driver heuristic</span>
            <span style={{ color: "var(--text-3)", fontSize: 12 }}>Pediatric leukemia · subtype + MRD + drug sensitivity + India PGx</span>
          </div>
          <h1 style={{ fontSize: 34, fontWeight: 900, letterSpacing: "-0.03em", marginBottom: 10 }}>
            Blast<span style={{ color: "var(--blue)" }}>Profiler</span>
          </h1>
          <p style={{ color: "var(--text-2)", fontSize: 15, maxWidth: 820, lineHeight: 1.7 }}>
            Pediatric leukemia clinical workbench: flow-cytometry / IHC marker panel + driver mutation flags →
            blast subtype + MRD risk + drug sensitivity profile + Indian-calibrated PGx alerts + active CTRI trials.
            Built on the architecture from Mumme 2025 (PedSCAtlas, 540K cells) and Tsang 2025 (Foundation models for
            translational cancer biology). v1 swaps the heuristic classifier for scGPT fine-tuned on PedSCAtlas.
          </p>
        </div>

        {/* Quick presets */}
        <div className="card" style={{ padding: 14, marginBottom: 16 }}>
          <p style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 8, letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 700 }}>
            Demo presets (one-click)
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {Object.entries(PRESETS).map(([k, p]) => (
              <button key={k} onClick={() => loadPreset(k)} style={{
                padding: "5px 12px", fontSize: 12, background: "var(--surface-2)",
                color: "var(--text-2)", border: "1px solid var(--border)", borderRadius: 6,
                cursor: "pointer", fontWeight: 600,
              }}>{p.label}</button>
            ))}
          </div>
        </div>

        {/* Patient + timepoint */}
        <div className="card" style={{ padding: 22, marginBottom: 16 }}>
          <p className="section-label" style={{ marginBottom: 12 }}>Patient + timepoint</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div>
              <p style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 6, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>Timepoint</p>
              <select value={timepoint} onChange={(e) => setTimepoint(e.target.value)} className="input-bio" style={{ width: "100%", padding: "9px 10px", fontSize: 13 }}>
                {TIMEPOINTS.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <p style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 6, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>Age (yrs)</p>
              <input type="number" value={age} onChange={(e) => setAge(Number(e.target.value))} className="input-bio" style={{ width: "100%", padding: "9px 10px", fontSize: 13 }} />
            </div>
            <div>
              <p style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 6, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>Weight (kg)</p>
              <input type="number" value={weight} onChange={(e) => setWeight(Number(e.target.value))} className="input-bio" style={{ width: "100%", padding: "9px 10px", fontSize: 13 }} />
            </div>
            <div>
              <p style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 6, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>WBC ×10⁹/L</p>
              <input value={wbc} onChange={(e) => setWbc(e.target.value)} placeholder="diagnosis WBC" className="input-bio" style={{ width: "100%", padding: "9px 10px", fontSize: 13 }} />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <input value={patientLabel} onChange={(e) => setPatientLabel(e.target.value)} placeholder="Patient label / MRN" className="input-bio" style={{ padding: "9px 10px", fontSize: 12.5 }} />
            <input value={clinician} onChange={(e) => setClinician(e.target.value)} placeholder="Clinician name" className="input-bio" style={{ padding: "9px 10px", fontSize: 12.5 }} />
            <input value={institution} onChange={(e) => setInstitution(e.target.value)} placeholder="Institution" className="input-bio" style={{ padding: "9px 10px", fontSize: 12.5 }} />
          </div>
        </div>

        {/* Marker panel */}
        <div className="card" style={{ padding: 22, marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <p className="section-label">Flow cytometry / IHC marker panel</p>
            <span style={{ fontSize: 10.5, color: "var(--text-3)" }}>% positive in blast population</span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
            <div>
              <p style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 6, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Bone marrow blast % <span style={{ color: "var(--red)" }}>·</span>
              </p>
              <input type="number" value={blastPct} onChange={(e) => setBlastPct(Number(e.target.value))} className="input-bio" style={{ width: "100%", padding: "9px 10px", fontSize: 13 }} min={0} max={100} />
              <p style={{ fontSize: 10.5, color: "var(--text-3)", marginTop: 4 }}>≥20% blasts = leukemia per WHO. Healthy {"<5%"}.</p>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 8 }}>
            {MARKER_FIELDS.map(m => (
              <div key={m.key} style={{ padding: "8px 10px", background: LINEAGE_BG[m.lineage], borderRadius: 6, border: "1px solid var(--border)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: LINEAGE_FG[m.lineage], fontFamily: "monospace" }}>{m.label}</span>
                  <span style={{ fontSize: 9.5, color: "var(--text-3)" }}>{m.hint}</span>
                </div>
                <input type="number" value={markers[m.key] ?? ""} onChange={(e) => setMarker(m.key, e.target.value)} placeholder="%" min={0} max={100}
                  className="input-bio" style={{ width: "100%", padding: "5px 8px", fontSize: 12 }} />
              </div>
            ))}
          </div>
        </div>

        {/* Driver mutations */}
        <div className="card" style={{ padding: 22, marginBottom: 16 }}>
          <p className="section-label" style={{ marginBottom: 10 }}>Driver mutations / cytogenetics (optional)</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {DRIVER_OPTIONS.map(d => (
              <button key={d} onClick={() => toggleDriver(d)} style={{
                padding: "5px 11px", fontSize: 11.5, borderRadius: 6, cursor: "pointer", fontWeight: 600,
                background: drivers.includes(d) ? "rgba(139,92,246,0.16)" : "var(--surface-2)",
                color: drivers.includes(d) ? "var(--purple)" : "var(--text-3)",
                border: drivers.includes(d) ? "1px solid var(--purple)" : "1px solid var(--border)",
                fontFamily: "monospace",
              }}>{d}</button>
            ))}
          </div>
        </div>

        {/* PGx */}
        <div className="card" style={{ padding: 22, marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <p className="section-label">Patient PGx genotypes (optional)</p>
            <span style={{ fontSize: 10.5, color: "var(--text-3)" }}>flags toxic drugs for this patient</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {pgx.map((g, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "140px 1fr auto", gap: 10, alignItems: "center" }}>
                <select value={g.gene} onChange={(e) => updatePgx(i, { gene: e.target.value, diplotype: PGX_GENE_OPTIONS[e.target.value][0].value })}
                  className="input-bio" style={{ padding: "7px 10px", fontSize: 12.5 }}>
                  {Object.keys(PGX_GENE_OPTIONS).map(k => <option key={k} value={k}>{k}</option>)}
                </select>
                <select value={g.diplotype} onChange={(e) => updatePgx(i, { diplotype: e.target.value })}
                  className="input-bio" style={{ padding: "7px 10px", fontSize: 12.5 }}>
                  {PGX_GENE_OPTIONS[g.gene]?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <button onClick={() => removePgx(i)} style={{ padding: "5px 9px", fontSize: 11, background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text-3)", cursor: "pointer" }}>×</button>
              </div>
            ))}
            {pgx.length < 4 && (
              <button onClick={addPgx} style={{ padding: "6px 12px", fontSize: 11.5, background: "var(--surface-2)", border: "1px dashed var(--border)", borderRadius: 6, color: "var(--text-2)", cursor: "pointer", fontWeight: 600, alignSelf: "flex-start" }}>+ Add PGx gene</button>
            )}
          </div>
        </div>

        <button onClick={run} disabled={loading} className="btn-primary" style={{ padding: "12px 32px", fontSize: 14, marginBottom: 22, cursor: loading ? "wait" : "pointer" }}>
          {loading ? "Running BlastProfiler pipeline…" : "Analyze →"}
        </button>

        {error && !loading && (
          <div style={{ background: "var(--red-dim)", border: "1px solid rgba(244,63,94,0.3)", borderRadius: 12, padding: "14px 18px", marginBottom: 16 }}>
            <p style={{ color: "#fca5a5", fontSize: 14 }}>⚠ {error}</p>
          </div>
        )}

        {result && !loading && (
          <>
            {/* Subtype + MRD top card */}
            <div className="card" style={{ padding: 22, marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16, marginBottom: 16 }}>
                <div>
                  <p className="section-label" style={{ marginBottom: 4 }}>Primary classification</p>
                  <h2 style={{ fontSize: 26, fontWeight: 900, color: "var(--text-1)", letterSpacing: "-0.02em" }}>
                    {result.blast_subtype.label}
                  </h2>
                  {result.blast_subtype.subtype && (
                    <p style={{ color: "var(--purple)", fontSize: 13, fontWeight: 700, marginTop: 4 }}>
                      {result.blast_subtype.subtype}
                    </p>
                  )}
                  <p style={{ color: "var(--text-3)", fontSize: 11, marginTop: 4 }}>
                    confidence {(result.blast_subtype.confidence * 100).toFixed(0)}% · classifier {result.classifier_version}
                  </p>
                </div>
                <button onClick={() => exportBlastProfilerPdf(result, {
                  patient_label: patientLabel || undefined, clinician: clinician || undefined,
                  institution: institution || undefined, timepoint, age_years: age,
                  drivers, markers_summary: markersSummary(),
                })} style={{
                  padding: "10px 20px", borderRadius: 10, border: "1px solid var(--green)",
                  background: "var(--green)", color: "#032018", fontWeight: 800, fontSize: 13, cursor: "pointer",
                }}>↓ Clinical Report PDF</button>
              </div>

              {/* Differential */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8 }}>
                {Object.entries(result.blast_subtype.differential).map(([k, v]) => (
                  <div key={k} style={{
                    padding: 10, background: "var(--surface-2)", borderRadius: 8, textAlign: "center",
                    borderTop: k === result.blast_subtype.label ? "3px solid var(--blue)" : "3px solid transparent",
                  }}>
                    <p style={{ fontSize: 10, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.04em" }}>{k}</p>
                    <p style={{ fontSize: 18, fontWeight: 800, color: "var(--text-1)" }}>{(v * 100).toFixed(0)}%</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Disease state */}
            <div className="card" style={{ padding: 22, marginBottom: 14, background: result.disease_state.mrd_risk_score >= 0.6 ? "rgba(244,63,94,0.06)" : result.disease_state.mrd_risk_score >= 0.3 ? "rgba(245,158,11,0.06)" : "var(--surface)" }}>
              <p className="section-label" style={{ marginBottom: 8 }}>Disease state · MRD risk</p>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <h3 style={{ fontSize: 18, fontWeight: 800, color: "var(--text-1)" }}>{result.disease_state.label}</h3>
                <div style={{ display: "flex", gap: 14 }}>
                  <Stat label="MRD risk" value={`${(result.disease_state.mrd_risk_score * 100).toFixed(0)}%`} color={result.disease_state.mrd_risk_score >= 0.6 ? "#F43F5E" : result.disease_state.mrd_risk_score >= 0.3 ? "#F59E0B" : "#10B981"} />
                  <Stat label="Relapse-similarity" value={`${(result.disease_state.relapse_similarity * 100).toFixed(0)}%`} />
                </div>
              </div>
              {result.disease_state.drivers_of_risk.length > 0 && (
                <p style={{ fontSize: 12, color: "var(--text-3)", lineHeight: 1.6 }}>
                  Risk drivers: {result.disease_state.drivers_of_risk.join(" · ")}
                </p>
              )}
            </div>

            {/* Drug sensitivity */}
            <div className="card" style={{ padding: 22, marginBottom: 14 }}>
              <p className="section-label" style={{ marginBottom: 12 }}>Drug sensitivity profile</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {result.drug_sensitivity.map((ds) => (
                  <div key={ds.drug} style={{ display: "grid", gridTemplateColumns: "160px 110px 60px 1fr", gap: 12, alignItems: "center", padding: "9px 12px", background: "var(--surface-2)", borderRadius: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-1)" }}>{ds.drug}</span>
                    <span style={{ padding: "2px 10px", borderRadius: 99, fontSize: 11, fontWeight: 800, letterSpacing: "0.04em", background: SEN_BG[ds.prediction], color: SEN_FG[ds.prediction], textAlign: "center" }}>
                      {ds.prediction}
                    </span>
                    <span style={{ fontSize: 11, color: "var(--text-3)", textAlign: "right" }}>{Math.round(ds.confidence * 100)}%</span>
                    <span style={{ fontSize: 12, color: "var(--text-2)" }}>{ds.rationale}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* PGx alerts */}
            {result.pgx_alerts.length > 0 && (
              <div className="card" style={{ padding: 22, marginBottom: 14 }}>
                <p className="section-label" style={{ marginBottom: 12 }}>Indian PGx alerts</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {result.pgx_alerts.map((a, i) => (
                    <div key={i} style={{ padding: "12px 14px", background: a.status.includes("poor") ? "rgba(244,63,94,0.08)" : "rgba(245,158,11,0.08)", borderLeft: `3px solid ${a.status.includes("poor") ? "#F43F5E" : "#F59E0B"}`, borderRadius: 6 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8, marginBottom: 6 }}>
                        <div>
                          <p style={{ fontSize: 13, fontWeight: 800, color: "var(--text-1)", fontFamily: "monospace" }}>{a.gene}{a.variant && <span style={{ fontWeight: 400, marginLeft: 6 }}>{a.variant}</span>}</p>
                          <p style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 2 }}>Drug affected: <strong style={{ color: "var(--text-2)" }}>{a.drug_affected}</strong></p>
                        </div>
                        <span style={{ padding: "2px 10px", borderRadius: 99, fontSize: 10.5, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase", background: a.status.includes("poor") ? "rgba(244,63,94,0.16)" : "rgba(245,158,11,0.16)", color: a.status.includes("poor") ? "#F43F5E" : "#F59E0B" }}>
                          {a.status.replace(/_/g, " ")}
                        </span>
                      </div>
                      <p style={{ fontSize: 12.5, color: "var(--text-2)", lineHeight: 1.55 }}>{a.action}</p>
                      <p style={{ fontSize: 11, color: "var(--text-3)", marginTop: 6, fontStyle: "italic" }}>{a.population_risk}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* KG trace + trials */}
            <div className="card" style={{ padding: 22, marginBottom: 14 }}>
              <p className="section-label" style={{ marginBottom: 10 }}>Knowledge graph multi-hop ({result.knowledge_graph.hops} hops)</p>
              <p style={{ fontSize: 13, color: "var(--cyan)", fontFamily: "monospace", marginBottom: 14 }}>
                {result.knowledge_graph.path.join("  →  ")}
              </p>
              {result.knowledge_graph.indian_trials.length > 0 ? (
                <>
                  <p style={{ fontSize: 11, color: "var(--text-3)", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.06em", marginBottom: 6 }}>
                    Active Indian trials ({result.knowledge_graph.indian_trials.length})
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {result.knowledge_graph.indian_trials.map((t, i) => (
                      <div key={i} style={{ padding: "8px 12px", background: "var(--surface-2)", borderRadius: 6, fontSize: 12 }}>
                        <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 2 }}>
                          <span style={{ fontFamily: "monospace", color: "var(--green)", fontWeight: 700 }}>{t.ctri_id ?? "—"}</span>
                          {t.drug && <span style={{ color: "var(--blue)", fontWeight: 600 }}>{t.drug}</span>}
                          {t.phase && <span style={{ color: "var(--text-3)" }}>· {t.phase}</span>}
                          {t.status && <span style={{ marginLeft: "auto", color: "var(--text-3)" }}>{t.status}</span>}
                        </div>
                        <p style={{ color: "var(--text-2)" }}>{t.title}</p>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p style={{ fontSize: 12, color: "var(--text-3)" }}>No active Indian trials linked to this subtype keyword in the graph.</p>
              )}
            </div>

            {/* Evidence citations */}
            <div className="card" style={{ padding: 18, marginBottom: 14 }}>
              <p className="section-label" style={{ marginBottom: 8 }}>Evidence citations</p>
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {result.evidence_citations.map((c, i) => (
                  <li key={i} style={{ fontSize: 11.5, color: "var(--text-3)", lineHeight: 1.7 }}>· {c}</li>
                ))}
              </ul>
            </div>

            <p style={{ fontSize: 11, color: "var(--text-3)", lineHeight: 1.7 }}>
              Decision support only. Does not replace clinician judgment. v0 uses peer-reviewed marker rules (WHO + COG/BFM); v1 in development swaps in scGPT fine-tuned on PedSCAtlas (Mumme 2025) for direct scRNA-seq classification.
            </p>
          </>
        )}
      </div>
    </main>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ padding: "8px 14px", background: "var(--surface-2)", borderRadius: 8, textAlign: "right" }}>
      <p style={{ fontSize: 10, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</p>
      <p style={{ fontSize: 16, fontWeight: 800, color: color ?? "var(--text-1)" }}>{value}</p>
    </div>
  );
}
