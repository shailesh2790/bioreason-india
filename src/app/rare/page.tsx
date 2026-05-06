"use client";

import { useEffect, useRef, useState } from "react";

const INDIA_STATES = [
  "Andhra Pradesh", "Bihar", "Delhi", "Gujarat", "Haryana", "Karnataka", "Kerala",
  "Maharashtra", "Odisha", "Punjab", "Rajasthan", "Tamil Nadu", "Telangana",
  "Uttar Pradesh", "West Bengal", "Other / Unspecified",
];

interface Phenotype {
  id: string;
  name: string;
}

interface Diagnosis {
  disease_id: string;
  disease_name: string;
  score: number;
  matched_phenotypes: string[];
  associated_genes: string[];
  confidence: "HIGH" | "MEDIUM" | "LOW";
  rationale: string;
}

interface DiagnoseResponse {
  matched_phenotypes: Phenotype[];
  differential: Diagnosis[];
  recommended_gene_panel: string[];
  next_steps: string[];
  indian_specific_notes: string[];
  referral_hints: string[];
}

const SAMPLE_CASES = [
  {
    label: "Paediatric — 4yo, growth delay",
    description: "4-year-old boy with short stature, microcephaly, intellectual disability, recurrent infections, low-set ears, parents are first cousins",
    consanguinity: true,
  },
  {
    label: "Hunter-like presentation",
    description: "9-year-old male with progressive coarse facies, hepatosplenomegaly, joint stiffness, hearing loss and developmental regression after age 4",
    consanguinity: false,
  },
  {
    label: "Neuro — adolescent",
    description: "13-year-old with refractory seizures, cerebellar ataxia, dysarthria and brain MRI showing cerebellar atrophy. Healthy parents.",
    consanguinity: false,
  },
];

export default function RarePage() {
  const [description, setDescription] = useState("");
  const [chips, setChips] = useState<Phenotype[]>([]);
  const [search, setSearch] = useState("");
  const [searchHits, setSearchHits] = useState<Phenotype[]>([]);
  const [age, setAge] = useState<string>("");
  const [sex, setSex] = useState<"M" | "F" | "Other">("M");
  const [state, setState] = useState("Bihar");
  const [consanguinity, setConsanguinity] = useState(false);
  const [familyHistory, setFamilyHistory] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DiagnoseResponse | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (search.trim().length < 2) { setSearchHits([]); return; }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/rare/phenotypes?q=${encodeURIComponent(search)}`);
        const data = await res.json();
        setSearchHits(data.results ?? []);
      } catch {}
    }, 220);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search]);

  const addChip = (p: Phenotype) => {
    if (chips.some((c) => c.id === p.id)) return;
    setChips([...chips, p]);
    setSearch(""); setSearchHits([]);
  };
  const removeChip = (id: string) => setChips(chips.filter((c) => c.id !== id));

  const loadCase = (s: typeof SAMPLE_CASES[0]) => {
    setDescription(s.description);
    setConsanguinity(s.consanguinity);
    setChips([]);
  };

  const diagnose = async () => {
    if (loading) return;
    if (!description.trim() && chips.length === 0) {
      setError("Provide either a clinical description or selected phenotypes.");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/rare/diagnose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: description.trim() || null,
          phenotypes: chips.map((c) => c.id),
          age: age ? parseInt(age) : null,
          sex,
          state,
          consanguinity,
          family_history: familyHistory || null,
          max_diagnoses: 8,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? `Error ${res.status}`); return; }
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "40px 24px" }}>

        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
            <span className="badge" style={{ color: "var(--red)", background: "var(--red-dim)", borderColor: "rgba(244,63,94,0.4)" }}>
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--red)", display: "inline-block", animation: "pulse-glow 1.5s infinite" }} />
              SOLUTION 1 · Rare Disease Diagnostic Accelerator
            </span>
            <span style={{ color: "var(--text-3)", fontSize: 12 }}>Phenotype → Differential → Gene panel · India-calibrated</span>
          </div>
          <h1 style={{ fontSize: 36, fontWeight: 900, letterSpacing: "-0.03em", marginBottom: 10 }}>
            Rare Disease{" "}
            <span style={{ color: "var(--red)" }}>Diagnostic Accelerator</span>
          </h1>
          <p style={{ color: "var(--text-2)", fontSize: 15, maxWidth: 760, lineHeight: 1.7 }}>
            70 million Indians are affected by rare diseases. Diagnostic delay averages 4.7+ years — and longer in non-metro India. This tool lets a district-hospital paediatrician or GP convert a clinical phenotype into a ranked differential and a sequencing panel, calibrated to Indian population genetics.
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(360px, 420px) 1fr", gap: 20 }}>

          {/* LEFT — input */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

            <div className="card" style={{ padding: 20 }}>
              <label className="section-label" style={{ display: "block", marginBottom: 10 }}>Clinical description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={5}
                placeholder="e.g. 5-year-old boy with short stature, recurrent seizures, intellectual disability, dysmorphic facial features. Parents first cousins."
                className="input-bio"
                style={{ width: "100%", padding: "11px 14px", fontSize: 13, resize: "vertical" }}
              />
              <div style={{ marginTop: 8 }}>
                <p className="section-label" style={{ marginBottom: 6 }}>Sample cases</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  {SAMPLE_CASES.map((s) => (
                    <button key={s.label} onClick={() => loadCase(s)} style={{
                      padding: "6px 10px", textAlign: "left", fontSize: 11,
                      background: "var(--surface-2)", border: "1px solid var(--border)",
                      borderRadius: 7, color: "var(--text-3)", cursor: "pointer",
                    }}>
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="card" style={{ padding: 20 }}>
              <label className="section-label" style={{ display: "block", marginBottom: 10 }}>Specific HPO phenotypes (optional)</label>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Type to search HPO terms (e.g. 'short stature', 'seizure', 'microcephaly')"
                className="input-bio"
                style={{ width: "100%", padding: "9px 14px", fontSize: 13, marginBottom: 8 }}
              />
              {searchHits.length > 0 && (
                <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, maxHeight: 220, overflowY: "auto", marginBottom: 8 }}>
                  {searchHits.map((h) => (
                    <button key={h.id} onClick={() => addChip(h)} style={{
                      width: "100%", padding: "8px 12px", textAlign: "left",
                      background: "transparent", border: "none", borderBottom: "1px solid var(--border)",
                      color: "var(--text-2)", fontSize: 12, cursor: "pointer",
                    }}>
                      {h.name} <span style={{ color: "var(--text-3)", marginLeft: 6 }}>HP:{h.id}</span>
                    </button>
                  ))}
                </div>
              )}
              {chips.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {chips.map((c) => (
                    <span key={c.id} style={{
                      fontSize: 11, padding: "4px 10px", borderRadius: 99,
                      background: "var(--red-dim)", color: "var(--red)",
                      border: "1px solid rgba(244,63,94,0.3)", display: "inline-flex", alignItems: "center", gap: 6,
                    }}>
                      {c.name}
                      <button onClick={() => removeChip(c.id)} style={{
                        background: "none", border: "none", color: "var(--red)",
                        cursor: "pointer", padding: 0, fontSize: 14, lineHeight: 1,
                      }}>×</button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="card" style={{ padding: 20 }}>
              <label className="section-label" style={{ display: "block", marginBottom: 10 }}>Patient context</label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                <input
                  type="number" value={age} onChange={(e) => setAge(e.target.value)} placeholder="Age (years)"
                  className="input-bio" style={{ padding: "8px 12px", fontSize: 13 }}
                />
                <select value={sex} onChange={(e) => setSex(e.target.value as any)} style={{
                  padding: "8px 12px", fontSize: 13, background: "var(--surface-2)",
                  border: "1px solid var(--border)", borderRadius: 10, color: "var(--text-1)", outline: "none",
                }}>
                  <option>M</option><option>F</option><option>Other</option>
                </select>
              </div>
              <select value={state} onChange={(e) => setState(e.target.value)} style={{
                width: "100%", padding: "8px 12px", fontSize: 13, marginBottom: 8,
                background: "var(--surface-2)", border: "1px solid var(--border)",
                borderRadius: 10, color: "var(--text-1)", outline: "none",
              }}>
                {INDIA_STATES.map((s) => <option key={s}>{s}</option>)}
              </select>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-2)", cursor: "pointer" }}>
                <input type="checkbox" checked={consanguinity} onChange={(e) => setConsanguinity(e.target.checked)} />
                Consanguineous parents (autosomal recessive priors)
              </label>
              <textarea
                value={familyHistory} onChange={(e) => setFamilyHistory(e.target.value)}
                rows={2} placeholder="Family history (optional, e.g. 'sister died age 6 with similar presentation')"
                className="input-bio" style={{ width: "100%", padding: "9px 12px", fontSize: 13, resize: "vertical", marginTop: 8 }}
              />
            </div>

            <button onClick={diagnose} disabled={loading} className="btn-primary"
              style={{ padding: "12px 24px", fontSize: 14, background: loading ? "var(--surface-3)" : "var(--red)", color: loading ? "var(--text-3)" : "#fff", border: "none", borderRadius: 10, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer" }}
            >
              {loading ? "Generating differential…" : "Generate differential →"}
            </button>
          </div>

          {/* RIGHT — output */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

            {error && (
              <div style={{ background: "var(--red-dim)", border: "1px solid rgba(244,63,94,0.3)", borderRadius: 12, padding: "14px 18px" }}>
                <p style={{ color: "#fca5a5", fontSize: 14 }}>⚠ {error}</p>
              </div>
            )}

            {!result && !loading && !error && (
              <div className="card" style={{ padding: "64px 32px", textAlign: "center" }}>
                <div style={{ fontSize: 44, marginBottom: 16 }}>🧬</div>
                <p style={{ color: "var(--text-2)", fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
                  Build a phenotype profile and click <em>Generate differential</em>
                </p>
                <p style={{ color: "var(--text-3)", fontSize: 13, maxWidth: 480, margin: "0 auto", lineHeight: 1.6 }}>
                  We&apos;ll search 11,783 disease nodes against 6,465 phenotype nodes and 72,506 disease-phenotype edges in the BioReason knowledge graph, calibrated against IndiGen + Genome India variant frequencies.
                </p>
              </div>
            )}

            {loading && (
              <div className="card" style={{ padding: "48px 24px", textAlign: "center" }}>
                <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
                  <svg width="48" height="48" viewBox="0 0 48 48" style={{ animation: "rotate-slow 2s linear infinite" }}>
                    <circle cx="24" cy="24" r="22" stroke="var(--border)" strokeWidth="2" fill="none" />
                    <path d="M14 10 C20 16 28 16 34 10" stroke="var(--red)" strokeWidth="2.5" fill="none" strokeLinecap="round" />
                    <path d="M14 22 C20 28 28 28 34 22" stroke="var(--red)" strokeWidth="2.5" fill="none" strokeLinecap="round" opacity="0.7" />
                    <path d="M14 34 C20 40 28 40 34 34" stroke="var(--red)" strokeWidth="2.5" fill="none" strokeLinecap="round" opacity="0.4" />
                  </svg>
                </div>
                <p style={{ color: "var(--text-2)", fontSize: 14, fontWeight: 600 }}>Extracting phenotypes → matching diseases → scoring panel…</p>
              </div>
            )}

            {result && !loading && (
              <>
                {/* Matched phenotypes summary */}
                <div className="card" style={{ padding: 20 }}>
                  <p className="section-label" style={{ marginBottom: 10 }}>Matched phenotypes ({result.matched_phenotypes.length})</p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {result.matched_phenotypes.map((p) => (
                      <span key={p.id} className="badge" style={{ fontSize: 11, color: "var(--red)", background: "var(--red-dim)", borderColor: "rgba(244,63,94,0.3)" }}>
                        {p.name}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Differential */}
                <div className="card" style={{ padding: 20 }}>
                  <p className="section-label" style={{ marginBottom: 14 }}>Differential diagnosis ({result.differential.length})</p>
                  {result.differential.length === 0 ? (
                    <p style={{ color: "var(--text-3)", fontSize: 13 }}>No matching diseases found in the knowledge graph for this phenotype profile.</p>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      {result.differential.map((d, i) => {
                        const cColor = d.confidence === "HIGH" ? "var(--green)" : d.confidence === "MEDIUM" ? "var(--amber)" : "var(--text-3)";
                        return (
                          <div key={d.disease_id} style={{
                            border: `1px solid ${cColor}40`,
                            background: `${cColor}08`,
                            borderRadius: 10, padding: 14,
                          }}>
                            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 8 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                <span style={{ fontSize: 11, color: "var(--text-3)", fontFamily: "monospace" }}>#{i + 1}</span>
                                <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-1)" }}>{d.disease_name}</span>
                              </div>
                              <span style={{
                                fontSize: 10, fontWeight: 800, padding: "2px 10px", borderRadius: 99,
                                background: `${cColor}20`, color: cColor, border: `1px solid ${cColor}40`,
                              }}>
                                {d.confidence}
                              </span>
                            </div>
                            <p style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 8 }}>{d.rationale}</p>
                            {d.matched_phenotypes.length > 0 && (
                              <div style={{ marginBottom: 8 }}>
                                <span style={{ fontSize: 10, color: "var(--text-3)", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 700 }}>Matched: </span>
                                <span style={{ fontSize: 11, color: "var(--text-2)" }}>
                                  {d.matched_phenotypes.slice(0, 6).join(" · ")}
                                </span>
                              </div>
                            )}
                            {d.associated_genes.length > 0 && (
                              <div>
                                <span style={{ fontSize: 10, color: "var(--text-3)", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 700 }}>Genes: </span>
                                {d.associated_genes.slice(0, 6).map((g) => (
                                  <span key={g} style={{ fontSize: 11, fontFamily: "monospace", color: "var(--blue)", marginRight: 8, fontWeight: 600 }}>{g}</span>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Recommended gene panel */}
                {result.recommended_gene_panel.length > 0 && (
                  <div className="card" style={{ padding: 20 }}>
                    <p className="section-label" style={{ marginBottom: 12 }}>Recommended gene panel ({result.recommended_gene_panel.length} genes)</p>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {result.recommended_gene_panel.map((g) => (
                        <span key={g} className="badge badge-blue" style={{ fontSize: 11, fontFamily: "monospace" }}>{g}</span>
                      ))}
                    </div>
                    <p style={{ fontSize: 11, color: "var(--text-3)", marginTop: 10, lineHeight: 1.5 }}>
                      Order this panel via your nearest accredited genetic-testing lab. WES is recommended if panel is inconclusive.
                    </p>
                  </div>
                )}

                {/* Indian-specific notes */}
                {result.indian_specific_notes.length > 0 && (
                  <div className="card" style={{ padding: 20, background: "var(--amber-dim)", border: "1px solid rgba(245,158,11,0.3)" }}>
                    <p className="section-label" style={{ marginBottom: 10, color: "var(--amber)" }}>India-specific interpretation notes</p>
                    {result.indian_specific_notes.map((n, i) => (
                      <p key={i} style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.6, marginBottom: i < result.indian_specific_notes.length - 1 ? 8 : 0 }}>• {n}</p>
                    ))}
                  </div>
                )}

                {/* Next steps */}
                {result.next_steps.length > 0 && (
                  <div className="card" style={{ padding: 20 }}>
                    <p className="section-label" style={{ marginBottom: 10 }}>Next steps</p>
                    {result.next_steps.map((s, i) => (
                      <p key={i} style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.6, marginBottom: i < result.next_steps.length - 1 ? 6 : 0 }}>{i + 1}. {s}</p>
                    ))}
                  </div>
                )}

                {/* Referrals */}
                <div className="card" style={{ padding: 20 }}>
                  <p className="section-label" style={{ marginBottom: 10 }}>Specialist referral options</p>
                  {result.referral_hints.map((r) => (
                    <p key={r} style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 4 }}>→ {r}</p>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
