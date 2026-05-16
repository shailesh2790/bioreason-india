"use client";

import { useState } from "react";
import dynamic from "next/dynamic";

import { useAuth } from "@/lib/auth";

const StructureViewer = dynamic(() => import("@/components/StructureViewer"), { ssr: false });

interface PgxFlag {
  variant?: string;
  af_india?: number | string;
  af_global?: number | string;
  note?: string;
  gene?: string;
}

interface Interaction {
  herb: string;
  herb_resolved_compound?: string;
  imppat_id?: string;
  drug: string;
  severity: "HIGH" | "MODERATE" | "LOW" | "NONE";
  shared_cyps: string[];
  mechanism: string;
  predicted_binding: {
    source: string;
    model?: string;
    note?: string;
    per_cyp?: Record<string, {
      pkd: number;
      ic50_nM?: number;
      binding_class?: string;
      rank_within_cyp?: number;
      rank_within_compound?: number;
      percentile_overall?: number;
      relative_strength?: string;
    }>;
  };
  indian_pgx_flags: PgxFlag[];
  evidence_grade: string;
  confidence: number;
  action: string;
}

interface HerbCheckResp {
  interactions: Interaction[];
  unresolved_herbs: string[];
  unresolved_drugs: string[];
  summary: {
    highest_severity: string;
    interaction_count: number;
    severity_counts: Record<string, number>;
    indian_specific_risk: boolean;
    evidence_grades: Record<string, number>;
  };
  cypher_steps: { step: string; cypher: string }[];
  error?: string;
}

const SEV_BG: Record<string, string> = {
  HIGH: "rgba(244,63,94,0.12)",
  MODERATE: "rgba(245,158,11,0.14)",
  LOW: "rgba(16,185,129,0.12)",
  NONE: "var(--surface-2)",
};
const SEV_FG: Record<string, string> = {
  HIGH: "#F43F5E",
  MODERATE: "#F59E0B",
  LOW: "#10B981",
  NONE: "var(--text-3)",
};

const EXAMPLE_HERBS = [
  "Ashwagandha", "Brahmi", "Curcumin", "Piperine", "Quercetin",
  "Resveratrol", "Andrographolide", "Boswellic acid", "Galantamine", "Glycyrrhizin",
];
const EXAMPLE_DRUGS = [
  "Warfarin", "Clopidogrel", "Atorvastatin", "Simvastatin", "Tacrolimus",
  "Cyclosporine", "Carbamazepine", "Phenytoin", "Metformin", "Tamoxifen",
];

function ChipInput({ label, value, setValue, examples, accent }: {
  label: string;
  value: string[];
  setValue: (next: string[]) => void;
  examples: string[];
  accent: string;
}) {
  const [draft, setDraft] = useState("");
  const add = (s: string) => {
    const v = s.trim();
    if (!v) return;
    if (value.includes(v)) return;
    setValue([...value, v]);
    setDraft("");
  };
  return (
    <div>
      <p style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 8, letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 700 }}>{label}</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
        {value.map((v) => (
          <button key={v} onClick={() => setValue(value.filter((x) => x !== v))} style={{
            fontSize: 12, padding: "5px 12px", borderRadius: 8,
            background: accent, color: "#fff", border: "none",
            fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6,
          }}>{v} <span style={{ opacity: 0.6 }}>×</span></button>
        ))}
      </div>
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(draft); }
        }}
        placeholder="Type a name and press Enter…"
        className="input-bio"
        style={{ width: "100%", padding: "9px 14px", fontSize: 13, marginBottom: 8 }}
      />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
        {examples.map((ex) => (
          <button key={ex} onClick={() => add(ex)} style={{
            fontSize: 11, padding: "3px 9px", borderRadius: 6,
            background: "var(--surface-2)", color: "var(--text-3)",
            border: "1px solid var(--border)", fontWeight: 500, cursor: "pointer",
          }}>{ex}</button>
        ))}
      </div>
    </div>
  );
}

export default function HerbCheckPage() {
  const { fetchWithAuth } = useAuth();
  const [herbs, setHerbs] = useState<string[]>([]);
  const [drugs, setDrugs] = useState<string[]>([]);
  const [cyp2c19, setCyp2c19] = useState("");
  const [cyp2d6, setCyp2d6] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<HerbCheckResp | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (!herbs.length || !drugs.length || loading) return;
    setLoading(true); setResult(null); setError(null);
    try {
      const res = await fetchWithAuth("/api/herbcheck", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          herbs, drugs,
          cyp2c19_genotype: cyp2c19 || null,
          cyp2d6_genotype: cyp2d6 || null,
          indian_population: true,
        }),
      });
      const data: HerbCheckResp = await res.json();
      if (!res.ok || data.error) setError(data.error ?? `Error ${res.status}`);
      else setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally { setLoading(false); }
  };

  const sm = result?.summary;

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "40px 24px" }}>

        <div style={{ marginBottom: 28 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <span className="badge badge-red">Module H · HerbCheck</span>
            <span className="badge badge-amber">v0.1 · KG-derived</span>
            <span style={{ color: "var(--text-3)", fontSize: 12 }}>Indian herb-drug interaction screen</span>
          </div>
          <h1 style={{ fontSize: 34, fontWeight: 900, letterSpacing: "-0.03em", marginBottom: 10 }}>
            Herb-Drug{" "}
            <span style={{ color: "var(--red)" }}>Interaction Engine</span>
          </h1>
          <p style={{ color: "var(--text-2)", fontSize: 15, maxWidth: 720, lineHeight: 1.7 }}>
            Screen any Ayurvedic compound or herb against any prescription drug for CYP-mediated
            metabolic interactions. Severity is calibrated to IndiGen variant frequencies and
            optional patient PGx genotype. Predicted binding affinity (MAMMAL pKd) upgrades to
            real model output in v0.2.
          </p>
        </div>

        {/* Inputs */}
        <div className="card" style={{ padding: 22, marginBottom: 22 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, marginBottom: 18 }}>
            <ChipInput label="Herbs / Phytochemicals" value={herbs} setValue={setHerbs} examples={EXAMPLE_HERBS} accent="#F59E0B" />
            <ChipInput label="Prescription drugs" value={drugs} setValue={setDrugs} examples={EXAMPLE_DRUGS} accent="#3B82F6" />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
            <div>
              <p style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 6, letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 700 }}>CYP2C19 genotype (optional)</p>
              <select value={cyp2c19} onChange={(e) => setCyp2c19(e.target.value)} className="input-bio" style={{ width: "100%", padding: "9px 12px", fontSize: 13 }}>
                <option value="">Unknown</option>
                <option value="extensive">Extensive metabolizer</option>
                <option value="intermediate">Intermediate</option>
                <option value="poor">Poor metabolizer (*2/*2)</option>
                <option value="rapid">Rapid</option>
                <option value="ultra-rapid">Ultra-rapid</option>
              </select>
            </div>
            <div>
              <p style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 6, letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 700 }}>CYP2D6 genotype (optional)</p>
              <select value={cyp2d6} onChange={(e) => setCyp2d6(e.target.value)} className="input-bio" style={{ width: "100%", padding: "9px 12px", fontSize: 13 }}>
                <option value="">Unknown</option>
                <option value="extensive">Extensive</option>
                <option value="intermediate">Intermediate</option>
                <option value="poor">Poor</option>
                <option value="ultra-rapid">Ultra-rapid</option>
              </select>
            </div>
            <div style={{ display: "flex", alignItems: "end" }}>
              <button onClick={run} disabled={!herbs.length || !drugs.length || loading} className="btn-primary"
                style={{ width: "100%", padding: "10px 16px", fontSize: 14, cursor: herbs.length && drugs.length && !loading ? "pointer" : "not-allowed" }}>
                {loading ? "Screening…" : `Screen ${herbs.length}×${drugs.length} pairs →`}
              </button>
            </div>
          </div>
        </div>

        {loading && (
          <div className="card" style={{ padding: "32px 24px", textAlign: "center" }}>
            <p style={{ color: "var(--text-2)", fontSize: 14, fontWeight: 600 }}>Resolving herbs → phytochemicals → shared CYPs → PGx context…</p>
          </div>
        )}

        {error && !loading && (
          <div style={{ background: "var(--red-dim)", border: "1px solid rgba(244,63,94,0.3)", borderRadius: 12, padding: "14px 18px", marginBottom: 16 }}>
            <p style={{ color: "#fca5a5", fontSize: 14 }}>⚠ {error}</p>
          </div>
        )}

        {result && sm && !loading && (
          <>
            {/* Summary */}
            <div className="card" style={{ padding: 22, marginBottom: 16, background: sm.highest_severity === "HIGH" ? "linear-gradient(135deg, rgba(244,63,94,0.06), var(--surface))" : sm.highest_severity === "MODERATE" ? "linear-gradient(135deg, rgba(245,158,11,0.06), var(--surface))" : "var(--surface)" }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
                <Stat label="Highest severity" value={sm.highest_severity} color={SEV_FG[sm.highest_severity] ?? "var(--text-1)"} />
                <Stat label="Interactions" value={String(sm.interaction_count)} />
                <Stat label="HIGH" value={String(sm.severity_counts.HIGH ?? 0)} color={SEV_FG.HIGH} />
                <Stat label="MODERATE" value={String(sm.severity_counts.MODERATE ?? 0)} color={SEV_FG.MODERATE} />
                <Stat label="Indian PGx flag" value={sm.indian_specific_risk ? "Yes" : "No"} color={sm.indian_specific_risk ? "#F43F5E" : "#10B981"} />
              </div>
            </div>

            {/* Unresolved */}
            {(result.unresolved_herbs.length > 0 || result.unresolved_drugs.length > 0) && (
              <div className="card" style={{ padding: 14, marginBottom: 16, borderColor: "rgba(245,158,11,0.3)" }}>
                <p style={{ color: "var(--amber)", fontSize: 12, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 6 }}>⚠ Not in graph</p>
                {result.unresolved_herbs.length > 0 && <p style={{ fontSize: 12, color: "var(--text-3)" }}>Herbs: {result.unresolved_herbs.join(", ")}</p>}
                {result.unresolved_drugs.length > 0 && <p style={{ fontSize: 12, color: "var(--text-3)" }}>Drugs: {result.unresolved_drugs.join(", ")}</p>}
              </div>
            )}

            {/* Interactions */}
            {result.interactions.length === 0 ? (
              <div className="card" style={{ padding: 24, textAlign: "center" }}>
                <p style={{ color: "var(--green)", fontSize: 14 }}>✓ No CYP-mediated interactions detected between the supplied herbs and drugs.</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {result.interactions.map((it, i) => (
                  <div key={i} className="card" style={{ padding: 0, overflow: "hidden", borderLeft: `4px solid ${SEV_FG[it.severity]}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "16px 20px", borderBottom: "1px solid var(--border)", flexWrap: "wrap", gap: 12 }}>
                      <div>
                        <p style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 4, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase" }}>
                          {it.herb} {it.herb_resolved_compound && it.herb_resolved_compound !== it.herb && (
                            <span style={{ color: "var(--text-2)" }}>→ {it.herb_resolved_compound}</span>
                          )} <span style={{ color: "var(--text-2)" }}>×</span> {it.drug}
                        </p>
                        <h3 style={{ fontSize: 14, color: "var(--text-1)", fontWeight: 700 }}>
                          Shared CYPs: {it.shared_cyps.map((c) => <span key={c} style={{
                            display: "inline-block", padding: "2px 9px", borderRadius: 99,
                            background: "var(--surface-2)", color: "var(--purple)", marginRight: 6, fontSize: 11, fontWeight: 700, fontFamily: "monospace",
                          }}>{c}</span>)}
                        </h3>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                        <span style={{
                          padding: "4px 14px", borderRadius: 99,
                          background: SEV_BG[it.severity], color: SEV_FG[it.severity],
                          fontSize: 12, fontWeight: 800, letterSpacing: "0.06em",
                          border: `1px solid ${SEV_FG[it.severity]}40`,
                        }}>{it.severity}</span>
                        <span style={{ fontSize: 10, color: "var(--text-3)" }}>
                          Evidence {it.evidence_grade} · confidence {Math.round(it.confidence * 100)}%
                        </span>
                      </div>
                    </div>
                    <div style={{ padding: "14px 20px", fontSize: 13, color: "var(--text-2)", lineHeight: 1.65 }}>
                      <p style={{ marginBottom: 10 }}>{it.mechanism}</p>
                      <p style={{ color: "var(--text-1)", fontWeight: 600, marginBottom: 4 }}>Recommended action</p>
                      <p style={{ fontSize: 12.5 }}>{it.action}</p>

                      {it.indian_pgx_flags.length > 0 && (
                        <div style={{ marginTop: 12, padding: "10px 12px", background: "rgba(245,158,11,0.06)", borderLeft: "3px solid var(--amber)", borderRadius: 6 }}>
                          <p style={{ fontSize: 11, color: "var(--amber)", fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 4 }}>Indian PGx flag</p>
                          {it.indian_pgx_flags.map((f, j) => (
                            <p key={j} style={{ fontSize: 12, color: "var(--text-2)" }}>
                              <span style={{ fontFamily: "monospace", color: "var(--amber)" }}>{f.variant}</span>
                              {f.gene && <span style={{ color: "var(--text-3)" }}>  ({f.gene})</span>}
                              {f.af_india != null && <span style={{ color: "var(--text-3)" }}>  · AF India: {f.af_india}</span>}
                              {f.note && <span style={{ color: "var(--text-3)" }}>  · {f.note}</span>}
                            </p>
                          ))}
                        </div>
                      )}

                      {it.predicted_binding.per_cyp && Object.keys(it.predicted_binding.per_cyp).length > 0 && (
                        <PerCypPanel cyps={it.predicted_binding.per_cyp} />
                      )}

                      <p style={{ marginTop: 10, fontSize: 10.5, color: "var(--text-3)", fontStyle: "italic" }}>
                        Predicted binding: {it.predicted_binding.source} ({it.predicted_binding.model}). {it.predicted_binding.note}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Cypher trail */}
            <details className="card" style={{ marginTop: 16, padding: 16, overflow: "hidden" }}>
              <summary style={{ cursor: "pointer", fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-3)" }}>
                Cypher audit trail ({result.cypher_steps.length})
              </summary>
              <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                {result.cypher_steps.map((s, i) => (
                  <div key={i} style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
                    <p style={{ padding: "6px 12px", background: "var(--surface-2)", fontSize: 11, color: "var(--text-2)", borderBottom: "1px solid var(--border)" }}>{s.step}</p>
                    <pre style={{ padding: "8px 12px", fontSize: 10.5, color: "var(--amber)", fontFamily: "monospace", overflowX: "auto", margin: 0 }}>{s.cypher}</pre>
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

type CypRecord = NonNullable<Interaction["predicted_binding"]["per_cyp"]>[string];

function PerCypPanel({ cyps }: { cyps: Record<string, CypRecord> }) {
  // Default to the top-ranked CYP
  const entries = Object.entries(cyps);
  const sorted = [...entries].sort((a, b) => (b[1].pkd ?? 0) - (a[1].pkd ?? 0));
  const [activeCyp, setActiveCyp] = useState<string | null>(null);

  return (
    <div style={{ marginTop: 12, padding: "10px 12px", background: "rgba(139,92,246,0.06)", borderLeft: "3px solid var(--purple)", borderRadius: 6 }}>
      <p style={{ fontSize: 11, color: "var(--purple)", fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 6 }}>
        MAMMAL DTI · per-CYP rank · click any tile for 3D structure
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8 }}>
        {sorted.map(([cyp, m]) => {
          const isActive = activeCyp === cyp;
          return (
            <button
              key={cyp}
              type="button"
              onClick={() => setActiveCyp(isActive ? null : cyp)}
              style={{
                textAlign: "left",
                padding: "6px 10px",
                background: isActive ? "rgba(139,92,246,0.16)" : "var(--surface-2)",
                border: isActive ? "1px solid var(--purple)" : "1px solid var(--border)",
                borderRadius: 6, fontSize: 11.5, cursor: "pointer", color: "inherit",
              }}
            >
              <p style={{ color: "var(--purple)", fontFamily: "monospace", fontWeight: 700, marginBottom: 2 }}>{cyp}</p>
              <p style={{ color: "var(--text-2)" }}>
                pKd <strong style={{ color: "var(--text-1)" }}>{m.pkd?.toFixed(2)}</strong>
                {m.rank_within_cyp != null && <span style={{ color: "var(--text-3)" }}> · rank <strong style={{ color: "var(--text-1)" }}>{m.rank_within_cyp}/24</strong></span>}
              </p>
              {m.percentile_overall != null && (
                <p style={{ color: "var(--text-3)", fontSize: 10.5 }}>
                  {m.percentile_overall.toFixed(0)}th percentile · {m.relative_strength?.replace("rel_", "").replace("_", " ")}
                </p>
              )}
            </button>
          );
        })}
      </div>
      {activeCyp && (
        <div style={{ marginTop: 10 }}>
          <StructureViewer gene={activeCyp} height={380} />
          <p style={{ fontSize: 11, color: "var(--text-3)", marginTop: 6, textAlign: "center" }}>
            Active-site residues highlighted in amber. Heme cofactor (catalytic Fe) shown as red sticks. Bound ligands (if any) shown as green sticks.
          </p>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ padding: 12, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, textAlign: "center" }}>
      <p style={{ fontSize: 10, color: "var(--text-3)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 4 }}>{label}</p>
      <p style={{ fontSize: 18, fontWeight: 800, color: color ?? "var(--text-1)" }}>{value}</p>
    </div>
  );
}
