"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth";

// ── India PGx variants (matches the 7-rule curated set in api/patient.py) ──
const INDIA_PGX_VARIANTS = [
  { rsid: "rs4244285", gene: "CYP2C19", star: "*2",  af: "23%", note: "Clopidogrel reduced efficacy (S. Asians)" },
  { rsid: "rs1057910", gene: "CYP2C9",  star: "*3",  af: "8%",  note: "Warfarin sensitivity, bleeding risk" },
  { rsid: "rs1050828", gene: "G6PD",    star: "Med", af: "9%",  note: "Primaquine haemolysis (malaria-endemic states)" },
  { rsid: "rs1142345", gene: "TPMT",    star: "*3C", af: "4%",  note: "Azathioprine myelosuppression risk" },
  { rsid: "rs1065852", gene: "CYP2D6",  star: "*10", af: "38%", note: "Codeine inadequate analgesia" },
  { rsid: "rs4149056", gene: "SLCO1B1", star: "*5",  af: "12%", note: "Simvastatin myopathy risk" },
  { rsid: "rs8175347", gene: "UGT1A1",  star: "*28", af: "15%", note: "Irinotecan toxicity in homozygotes" },
];

const INDIA_HIGH_BURDEN_STATES = [
  "Bihar", "Jharkhand", "Odisha", "Assam", "Chhattisgarh",
  "Maharashtra", "Tamil Nadu", "Kerala", "Rajasthan", "West Bengal",
  "Karnataka", "Gujarat", "Uttar Pradesh", "Punjab",
];

const ETHNIC_GROUPS = [
  "Indo-Aryan", "Dravidian", "Tibeto-Burman", "Austro-Asiatic",
  "Andamanese", "Iranian-Plateau", "Mixed",
];

const COMMON_DRUGS = [
  "Clopidogrel", "Warfarin", "Metformin", "Atorvastatin", "Simvastatin",
  "Aspirin", "Omeprazole", "Codeine", "Tramadol", "Azathioprine",
  "Primaquine", "Isoniazid", "Rifampicin", "Tamoxifen",
];

const COMMON_CONDITIONS = [
  "type 2 diabetes mellitus", "tuberculosis", "MDR-TB",
  "hypertension", "coronary artery disease", "diabetic retinopathy",
  "kala-azar", "malaria", "dengue", "chronic kidney disease",
];

interface PgxAlert {
  severity: "HIGH" | "MODERATE" | "LOW" | "INFO";
  variant: string;
  gene: string;
  star: string;
  affected_drugs: string[];
  af_india: number;
  af_global: number;
  action: string;
  category: "active" | "carrier";
}

interface PatientProfile {
  id: string;
  age: number;
  sex: string;
  state: string;
  ethnicity: string;
  variants: any[];
  medications: any[];
  conditions: any[];
}

interface RiskResponse {
  patient: PatientProfile;
  risk: {
    pgx_alerts: PgxAlert[];
    endemic_risks: string[];
    active_meds: string[];
    variant_count: number;
  };
}

export default function TwinPage() {
  const { fetchWithAuth } = useAuth();
  // ── form state ──
  const [age, setAge] = useState(52);
  const [sex, setSex] = useState<"M" | "F" | "Other">("M");
  const [state, setState] = useState("Bihar");
  const [ethnicity, setEthnicity] = useState("Indo-Aryan");
  const [variants, setVariants] = useState<Set<string>>(new Set(["rs4244285"]));
  const [meds, setMeds] = useState<Set<string>>(new Set(["Clopidogrel", "Metformin"]));
  const [conds, setConds] = useState<Set<string>>(new Set(["type 2 diabetes mellitus"]));
  const [customMed, setCustomMed] = useState("");
  const [customCond, setCustomCond] = useState("");

  // ── ui state ──
  const [creating, setCreating] = useState(false);
  const [risk, setRisk] = useState<RiskResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [question, setQuestion] = useState("Should we switch this patient off clopidogrel? What alternatives are safer given their PGx profile?");
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<any>(null);

  const toggle = (set: Set<string>, val: string, setter: (s: Set<string>) => void) => {
    const next = new Set(set);
    if (next.has(val)) next.delete(val);
    else next.add(val);
    setter(next);
  };

  const createTwin = async () => {
    if (creating) return;
    setCreating(true);
    setError(null);
    setRisk(null);
    setAnalysis(null);

    try {
      const create = await fetchWithAuth("/api/patient", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          age, sex, state, ethnicity,
          variants: Array.from(variants),
          medications: Array.from(meds),
          conditions: Array.from(conds),
        }),
      });
      const created = await create.json();
      if (!create.ok) {
        setError(created.error || "Failed to create twin");
        return;
      }
      const ptid = created.patient_id;

      const riskRes = await fetchWithAuth(`/api/patient/${ptid}/risk`);
      const riskData = await riskRes.json();
      if (!riskRes.ok) {
        setError(riskData.error || "Risk dashboard failed");
        return;
      }
      setRisk(riskData);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setCreating(false);
    }
  };

  const analyze = async () => {
    if (!risk?.patient.id || !question.trim() || analyzing) return;
    setAnalyzing(true);
    setAnalysis(null);

    try {
      const res = await fetchWithAuth(`/api/patient/${risk.patient.id}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, max_hops: 3 }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Analysis failed");
        return;
      }
      setAnalysis(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "40px 24px" }}>

        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
            <span className="badge" style={{ color: "var(--cyan)", background: "var(--cyan-dim)", borderColor: "rgba(6,182,212,0.4)" }}>
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--cyan)", display: "inline-block", animation: "pulse-glow 1.5s infinite" }} />
              NEW · Patient Digital Twin
            </span>
            <span className="badge badge-purple">India-Calibrated</span>
            <span style={{ color: "var(--text-3)", fontSize: 12 }}>IndiGen + IMPPAT + CTRI overlay · Persistent KG node</span>
          </div>
          <h1 style={{ fontSize: 36, fontWeight: 900, letterSpacing: "-0.03em", marginBottom: 10 }}>
            Indian Patient{" "}
            <span style={{ color: "var(--cyan)" }}>Digital Twin</span>
          </h1>
          <p style={{ color: "var(--text-2)", fontSize: 15, maxWidth: 720, lineHeight: 1.7 }}>
            Build a persistent patient object in the knowledge graph. Demographics, variants, medications, comorbidities — all overlaid against IndiGen population frequencies and India-endemic disease risk. Every drug query becomes patient-aware.
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(360px, 380px) 1fr", gap: 20 }}>

          {/* ── Profile Builder ─────────────────────────────────────── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

            {/* Demographics */}
            <div className="card" style={{ padding: 20 }}>
              <p className="section-label" style={{ marginBottom: 14 }}>Demographics</p>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
                <div>
                  <label style={{ fontSize: 11, color: "var(--text-3)", display: "block", marginBottom: 4 }}>Age</label>
                  <input
                    type="number"
                    value={age}
                    onChange={(e) => setAge(parseInt(e.target.value) || 0)}
                    className="input-bio"
                    style={{ width: "100%", padding: "8px 12px", fontSize: 14 }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: "var(--text-3)", display: "block", marginBottom: 4 }}>Sex</label>
                  <select
                    value={sex}
                    onChange={(e) => setSex(e.target.value as any)}
                    style={{
                      width: "100%", padding: "8px 12px", fontSize: 14,
                      background: "var(--surface-2)", border: "1px solid var(--border)",
                      borderRadius: 10, color: "var(--text-1)", outline: "none",
                    }}
                  >
                    <option>M</option><option>F</option><option>Other</option>
                  </select>
                </div>
              </div>

              <label style={{ fontSize: 11, color: "var(--text-3)", display: "block", marginBottom: 4 }}>State of origin</label>
              <select
                value={state}
                onChange={(e) => setState(e.target.value)}
                style={{
                  width: "100%", padding: "8px 12px", fontSize: 14, marginBottom: 12,
                  background: "var(--surface-2)", border: "1px solid var(--border)",
                  borderRadius: 10, color: "var(--text-1)", outline: "none",
                }}
              >
                {INDIA_HIGH_BURDEN_STATES.map((s) => <option key={s}>{s}</option>)}
              </select>

              <label style={{ fontSize: 11, color: "var(--text-3)", display: "block", marginBottom: 4 }}>Ethnic ancestry</label>
              <select
                value={ethnicity}
                onChange={(e) => setEthnicity(e.target.value)}
                style={{
                  width: "100%", padding: "8px 12px", fontSize: 14,
                  background: "var(--surface-2)", border: "1px solid var(--border)",
                  borderRadius: 10, color: "var(--text-1)", outline: "none",
                }}
              >
                {ETHNIC_GROUPS.map((e) => <option key={e}>{e}</option>)}
              </select>
            </div>

            {/* Variants */}
            <div className="card" style={{ padding: 20 }}>
              <p className="section-label" style={{ marginBottom: 14 }}>India-Specific PGx Variants</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {INDIA_PGX_VARIANTS.map((v) => {
                  const checked = variants.has(v.rsid);
                  return (
                    <button
                      key={v.rsid}
                      onClick={() => toggle(variants, v.rsid, setVariants)}
                      style={{
                        display: "flex", alignItems: "flex-start", gap: 10,
                        padding: "8px 10px", borderRadius: 8,
                        border: checked ? "1px solid var(--purple)" : "1px solid var(--border)",
                        background: checked ? "var(--purple-dim)" : "var(--surface-2)",
                        cursor: "pointer", textAlign: "left", transition: "all 0.15s",
                      }}
                    >
                      <span style={{
                        width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                        marginTop: 1,
                        background: checked ? "var(--purple)" : "var(--surface-3)",
                        border: "1px solid var(--border)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        color: "#fff", fontSize: 11, fontWeight: 800,
                      }}>{checked ? "✓" : ""}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontFamily: "monospace", fontWeight: 700, color: checked ? "var(--purple)" : "var(--text-2)" }}>
                          {v.gene}{v.star} <span style={{ opacity: 0.6 }}>· {v.rsid}</span>
                          <span style={{ marginLeft: 8, color: "var(--amber)", fontWeight: 700 }}>{v.af} India</span>
                        </div>
                        <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>{v.note}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Medications */}
            <div className="card" style={{ padding: 20 }}>
              <p className="section-label" style={{ marginBottom: 14 }}>Current Medications</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                {[...COMMON_DRUGS, ...Array.from(meds).filter((m) => !COMMON_DRUGS.includes(m))].map((d) => {
                  const on = meds.has(d);
                  return (
                    <button
                      key={d}
                      onClick={() => toggle(meds, d, setMeds)}
                      style={{
                        fontSize: 11, padding: "4px 10px", borderRadius: 7,
                        cursor: "pointer", fontWeight: 600,
                        background: on ? "var(--green-dim)" : "var(--surface-2)",
                        color: on ? "var(--green)" : "var(--text-3)",
                        border: on ? "1px solid rgba(16,185,129,0.4)" : "1px solid var(--border)",
                      }}
                    >
                      {d}
                    </button>
                  );
                })}
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <input
                  value={customMed}
                  onChange={(e) => setCustomMed(e.target.value)}
                  placeholder="Add custom drug…"
                  className="input-bio"
                  style={{ flex: 1, padding: "6px 10px", fontSize: 12 }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && customMed.trim()) {
                      const next = new Set(meds); next.add(customMed.trim()); setMeds(next); setCustomMed("");
                    }
                  }}
                />
              </div>
            </div>

            {/* Conditions */}
            <div className="card" style={{ padding: 20 }}>
              <p className="section-label" style={{ marginBottom: 14 }}>Diagnosed Conditions</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                {[...COMMON_CONDITIONS, ...Array.from(conds).filter((c) => !COMMON_CONDITIONS.includes(c))].map((c) => {
                  const on = conds.has(c);
                  return (
                    <button
                      key={c}
                      onClick={() => toggle(conds, c, setConds)}
                      style={{
                        fontSize: 11, padding: "4px 10px", borderRadius: 7,
                        cursor: "pointer", fontWeight: 600,
                        background: on ? "var(--red-dim)" : "var(--surface-2)",
                        color: on ? "var(--red)" : "var(--text-3)",
                        border: on ? "1px solid rgba(244,63,94,0.4)" : "1px solid var(--border)",
                      }}
                    >
                      {c}
                    </button>
                  );
                })}
              </div>
              <input
                value={customCond}
                onChange={(e) => setCustomCond(e.target.value)}
                placeholder="Add custom condition…"
                className="input-bio"
                style={{ width: "100%", padding: "6px 10px", fontSize: 12 }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && customCond.trim()) {
                    const next = new Set(conds); next.add(customCond.trim()); setConds(next); setCustomCond("");
                  }
                }}
              />
            </div>

            {/* Build button */}
            <button
              onClick={createTwin}
              disabled={creating}
              className="btn-primary"
              style={{ padding: "12px 24px", fontSize: 14 }}
            >
              {creating ? "Building twin…" : "Build Digital Twin →"}
            </button>
          </div>

          {/* ── Right: dashboard ────────────────────────────────────── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

            {error && (
              <div style={{ background: "var(--red-dim)", border: "1px solid rgba(244,63,94,0.3)", borderRadius: 12, padding: "14px 18px" }}>
                <p style={{ color: "#fca5a5", fontSize: 14 }}>⚠ {error}</p>
              </div>
            )}

            {!risk && !creating && (
              <div className="card" style={{ padding: "64px 32px", textAlign: "center" }}>
                <div style={{ fontSize: 44, marginBottom: 16 }}>🧬</div>
                <p style={{ color: "var(--text-2)", fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
                  No patient twin built yet
                </p>
                <p style={{ color: "var(--text-3)", fontSize: 13, maxWidth: 480, margin: "0 auto", lineHeight: 1.6 }}>
                  Configure demographics, select known PGx variants, current medications, and diagnosed conditions on the left. Click <strong style={{ color: "var(--text-2)" }}>Build Digital Twin</strong> to create a persistent patient node and run the India-calibrated risk pipeline.
                </p>
              </div>
            )}

            {creating && (
              <div className="card" style={{ padding: "48px 24px", textAlign: "center" }}>
                <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
                  <svg width="48" height="48" viewBox="0 0 48 48" style={{ animation: "rotate-slow 2s linear infinite" }}>
                    <circle cx="24" cy="24" r="22" stroke="var(--border)" strokeWidth="2" fill="none" />
                    <path d="M14 10 C20 16 28 16 34 10" stroke="var(--cyan)" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
                    <path d="M14 22 C20 28 28 28 34 22" stroke="var(--cyan)" strokeWidth="2.5" fill="none" strokeLinecap="round" opacity="0.7"/>
                    <path d="M14 34 C20 40 28 40 34 34" stroke="var(--purple)" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
                    <line x1="14" y1="10" x2="14" y2="34" stroke="rgba(6,182,212,0.3)" strokeWidth="1.5"/>
                    <line x1="34" y1="10" x2="34" y2="34" stroke="rgba(139,92,246,0.3)" strokeWidth="1.5"/>
                  </svg>
                </div>
                <p style={{ color: "var(--text-2)", fontSize: 14, fontWeight: 600 }}>Persisting patient node + computing risk…</p>
              </div>
            )}

            {risk && (
              <>
                {/* Patient summary card */}
                <div style={{ background: "var(--surface)", border: "1px solid rgba(6,182,212,0.3)", borderRadius: 16, padding: 24 }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14 }}>
                    <div>
                      <p className="section-label" style={{ color: "var(--cyan)", marginBottom: 8 }}>Active Twin</p>
                      <h2 style={{ fontSize: 22, fontWeight: 800, color: "var(--text-1)", letterSpacing: "-0.02em" }}>
                        {risk.patient.age}-year-old {risk.patient.sex} from {risk.patient.state}
                      </h2>
                      <p style={{ fontSize: 12, color: "var(--text-3)", marginTop: 4, fontFamily: "monospace" }}>
                        {risk.patient.id} · {risk.patient.ethnicity}
                      </p>
                    </div>
                    <div style={{ display: "flex", gap: 16, fontSize: 11, color: "var(--text-3)" }}>
                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: 20, fontWeight: 800, color: "var(--purple)" }}>{risk.risk.variant_count}</div>
                        <div>variants</div>
                      </div>
                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: 20, fontWeight: 800, color: "var(--green)" }}>{risk.patient.medications.length}</div>
                        <div>meds</div>
                      </div>
                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: 20, fontWeight: 800, color: "var(--red)" }}>{risk.patient.conditions.length}</div>
                        <div>conditions</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* PGx alerts */}
                {risk.risk.pgx_alerts.length > 0 && (
                  <div className="card" style={{ padding: 20 }}>
                    <p className="section-label" style={{ marginBottom: 14 }}>
                      PGx Alerts for this Patient ({risk.risk.pgx_alerts.length})
                    </p>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {risk.risk.pgx_alerts.map((a, i) => {
                        const sevColor =
                          a.severity === "HIGH" ? "var(--red)" :
                          a.severity === "MODERATE" ? "var(--amber)" :
                          a.severity === "INFO" ? "var(--text-3)" : "var(--blue)";
                        const isActive = a.category === "active";
                        return (
                          <div
                            key={i}
                            style={{
                              border: `1px solid ${isActive ? sevColor + "60" : "var(--border)"}`,
                              background: isActive ? `${sevColor}10` : "var(--surface-2)",
                              borderRadius: 10, padding: 14,
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                              <span style={{
                                fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 99,
                                color: sevColor, background: `${sevColor}20`,
                                border: `1px solid ${sevColor}40`,
                              }}>
                                {a.severity}
                              </span>
                              <span style={{ fontSize: 13, fontFamily: "monospace", fontWeight: 700, color: "var(--text-1)" }}>
                                {a.gene}{a.star}
                              </span>
                              <span style={{ fontSize: 11, color: "var(--text-3)", fontFamily: "monospace" }}>
                                {a.variant}
                              </span>
                              <span style={{ fontSize: 11, color: "var(--amber)", marginLeft: "auto", fontWeight: 700 }}>
                                {(a.af_india * 100).toFixed(0)}% India · {(a.af_global * 100).toFixed(0)}% global
                              </span>
                            </div>
                            {isActive && a.affected_drugs.length > 0 && (
                              <div style={{ marginBottom: 6, fontSize: 12 }}>
                                <span style={{ color: "var(--text-3)" }}>Active drug(s) affected: </span>
                                <span style={{ color: sevColor, fontWeight: 700 }}>
                                  {a.affected_drugs.join(", ")}
                                </span>
                              </div>
                            )}
                            <p style={{ fontSize: 12, color: "var(--text-2)", lineHeight: 1.6 }}>{a.action}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Endemic risks */}
                {risk.risk.endemic_risks.length > 0 && (
                  <div className="card" style={{ padding: 20 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                      <p className="section-label">Endemic disease risks for {risk.patient.state}</p>
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {risk.risk.endemic_risks.map((d) => (
                        <span key={d} className="badge badge-amber" style={{ fontSize: 11 }}>
                          {d}
                        </span>
                      ))}
                    </div>
                    <p style={{ fontSize: 11, color: "var(--text-3)", marginTop: 10, lineHeight: 1.5 }}>
                      Source: NVBDCP / WHO India · {risk.patient.state}-specific endemic burden. Considered when generating drug recommendations.
                    </p>
                  </div>
                )}

                {/* Patient-aware reasoning */}
                <div className="card" style={{ padding: 20 }}>
                  <p className="section-label" style={{ marginBottom: 14 }}>Patient-Aware Reasoning</p>
                  <p style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 12, lineHeight: 1.6 }}>
                    Ask any clinical question — the LLM will answer with this patient&apos;s variants, current meds, conditions, and state-of-origin context baked into every Cypher step.
                  </p>
                  <textarea
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    rows={3}
                    className="input-bio"
                    style={{ width: "100%", padding: "10px 14px", fontSize: 13, resize: "vertical", marginBottom: 10 }}
                  />
                  <button
                    onClick={analyze}
                    disabled={analyzing || !question.trim()}
                    className="btn-primary"
                    style={{ padding: "9px 20px", fontSize: 13 }}
                  >
                    {analyzing ? "Reasoning…" : "Analyse for this Patient →"}
                  </button>
                </div>

                {/* Analysis result */}
                {analyzing && (
                  <div className="card" style={{ padding: "32px 20px", textAlign: "center" }}>
                    <div style={{ display: "flex", justifyContent: "center", gap: 6 }}>
                      {[0, 150, 300].map((d) => (
                        <div key={d} style={{
                          width: 8, height: 8, borderRadius: "50%",
                          background: "var(--cyan)",
                          animation: "bounce-subtle 1s ease-in-out infinite",
                          animationDelay: `${d}ms`,
                        }} />
                      ))}
                    </div>
                    <p style={{ color: "var(--text-3)", fontSize: 12, marginTop: 12 }}>
                      Multi-hop reasoning with patient context…
                    </p>
                  </div>
                )}

                {analysis && !analyzing && (
                  <div className="card" style={{ padding: 24 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                      <p className="section-label">Personalised Analysis</p>
                      <span style={{ fontSize: 11, color: "var(--text-3)", fontFamily: "monospace" }}>
                        {analysis.cypher_steps?.length ?? 0} queries · {analysis.paths?.length ?? 0} paths
                      </span>
                    </div>
                    <div className="analysis-text">{analysis.answer}</div>

                    {analysis.cypher_steps && analysis.cypher_steps.length > 0 && (
                      <details style={{ marginTop: 16 }}>
                        <summary style={{ cursor: "pointer", fontSize: 11, color: "var(--text-3)", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 700 }}>
                          Cypher steps ({analysis.cypher_steps.length})
                        </summary>
                        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                          {analysis.cypher_steps.map((s: any, i: number) => (
                            <div key={i} style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
                              <div style={{ padding: "6px 12px", background: "var(--surface-2)", fontSize: 11, color: "var(--text-2)" }}>
                                {i + 1}. {s.step}
                              </div>
                              <pre style={{ padding: "8px 12px", fontSize: 11, color: "var(--cyan)", fontFamily: "monospace", overflowX: "auto", margin: 0 }}>
                                {s.cypher}
                              </pre>
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
