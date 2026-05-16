"use client";

import { useRef, useState } from "react";
import NetworkGraph, { GraphData } from "@/components/NetworkGraph";
import PGxAlert from "@/components/PGxAlert";
import { useAuth } from "@/lib/auth";

type Modality = "retinal_fundus" | "blood_smear" | "histopathology" | "cytology" | "general";

const MODALITIES: { id: Modality; label: string; desc: string; accent: string; icon: string }[] = [
  { id: "retinal_fundus",  label: "Retinal Fundus",  desc: "Diabetic retinopathy, glaucoma, AMD",  accent: "var(--red)",    icon: "👁" },
  { id: "blood_smear",     label: "Blood Smear",     desc: "Malaria, haematology, sickle cell",    accent: "var(--amber)",  icon: "🔬" },
  { id: "histopathology",  label: "Histopathology",  desc: "Cancer biomarkers, tissue grading",    accent: "var(--purple)", icon: "🧬" },
  { id: "cytology",        label: "Cytology",        desc: "FNA, sputum (TB AFB), BAL",            accent: "var(--blue)",   icon: "🫁" },
  { id: "general",         label: "Auto-detect",     desc: "Any biomedical image",                 accent: "var(--green)",  icon: "⚡" },
];

const SAMPLE_CASES = [
  { label: "DR Grade 3 (Severe NPDR)", hint: "Indian T2D patient, 12-year history, recent visual blurring", modality: "retinal_fundus" as Modality },
  { label: "P. falciparum malaria smear", hint: "Tribal community patient, Odisha, fever 4 days, thick + thin smear", modality: "blood_smear" as Modality },
  { label: "HER2+ breast biopsy", hint: "45-year-old Indian woman, IDC, IHC stained", modality: "histopathology" as Modality },
  { label: "TB sputum smear (AFB)", hint: "Cough 3 months, contact history, ZN stained sputum", modality: "cytology" as Modality },
];

interface VisionResult {
  modality: string;
  vision_analysis: string;
  biomarkers_detected: string[];
  kg_context: { proteins: string[]; diseases: string[]; query_hints: string[] };
  kg_question: string;
  kg_reasoning: {
    answer: string;
    paths: any[];
    cypher_steps: { step: string; cypher: string }[];
    error?: string;
  } | null;
  error?: string;
}

export default function VisionPage() {
  const { fetchWithAuth } = useAuth();
  const [modality, setModality] = useState<Modality>("general");
  const [clinicalContext, setClinicalContext] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<VisionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (f: File) => {
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setResult(null);
    setError(null);
    const name = f.name.toLowerCase();
    if (name.includes("retina") || name.includes("fundus") || name.includes("eye")) setModality("retinal_fundus");
    else if (name.includes("blood") || name.includes("smear") || name.includes("malaria")) setModality("blood_smear");
    else if (name.includes("histo") || name.includes("biopsy") || name.includes("ihc")) setModality("histopathology");
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f && f.type.startsWith("image/")) handleFile(f);
  };

  const analyse = async () => {
    if (!file) return;
    setLoading(true);
    setResult(null);
    setError(null);

    const form = new FormData();
    form.append("image", file);
    form.append("modality", modality);
    form.append("clinical_context", clinicalContext);

    try {
      const res = await fetchWithAuth("/api/vision", { method: "POST", body: form });
      const data = await res.json();
      if (data.error) setError(data.error);
      else setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setLoading(false);
    }
  };

  const graphData: GraphData = { nodes: [], edges: [] };
  if (result?.kg_reasoning?.paths) {
    const nodeMap = new Map<string, any>();
    result.kg_reasoning.paths.forEach((p: any) => {
      p.results?.forEach((r: any) => {
        Object.values(r).forEach((v: any) => {
          if (v?.__neo4j === "node") {
            if (!nodeMap.has(v.id)) nodeMap.set(v.id, { id: v.id, name: v.name, label: v.labels?.[0] ?? "Unknown" });
          }
        });
      });
    });
    graphData.nodes = Array.from(nodeMap.values());
  }

  const activeModality = MODALITIES.find((m) => m.id === modality)!;

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "40px 24px" }}>

        {/* Header */}
        <div style={{ marginBottom: 36 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <span className="badge badge-cyan">Layer 2 · Vision</span>
            <span className="badge badge-purple">Llama 3.2 Vision</span>
            <span style={{ color: "var(--text-3)", fontSize: 12 }}>Image → KG Bridge · India-calibrated</span>
          </div>
          <h1 style={{ fontSize: 36, fontWeight: 900, letterSpacing: "-0.03em", marginBottom: 10 }}>
            PetriDish{" "}
            <span style={{ color: "var(--cyan)" }}>Vision</span>
          </h1>
          <p style={{ color: "var(--text-2)", fontSize: 15, maxWidth: 680, lineHeight: 1.7 }}>
            Upload any biomedical image — retinal fundus, blood smear, histopathology, cytology.
            Vision AI extracts clinical findings → Image-to-KG bridge maps biomarkers to protein nodes →
            multi-hop reasoning finds treatment paths. Calibrated for India-prevalent conditions.
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 24 }}>

          {/* Left column — config */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

            {/* Modality selector */}
            <div className="card" style={{ padding: 20 }}>
              <label className="section-label" style={{ display: "block", marginBottom: 14 }}>Image Modality</label>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {MODALITIES.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setModality(m.id)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "10px 14px",
                      borderRadius: 10,
                      border: modality === m.id ? `1px solid ${m.accent}` : "1px solid var(--border)",
                      background: modality === m.id ? `${m.accent}18` : "transparent",
                      cursor: "pointer",
                      transition: "all 0.15s",
                      textAlign: "left",
                    }}
                  >
                    <span style={{ fontSize: 18 }}>{m.icon}</span>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: modality === m.id ? m.accent : "var(--text-2)" }}>
                        {m.label}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 1 }}>{m.desc}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Clinical context */}
            <div className="card" style={{ padding: 20 }}>
              <label className="section-label" style={{ display: "block", marginBottom: 10 }}>
                Clinical Context
              </label>
              <textarea
                value={clinicalContext}
                onChange={(e) => setClinicalContext(e.target.value)}
                rows={4}
                placeholder="Patient age, sex, symptoms, relevant history, duration…"
                className="input-bio"
                style={{ width: "100%", padding: "10px 12px", fontSize: 13, resize: "none" }}
              />
              <div style={{ marginTop: 10 }}>
                <p className="section-label" style={{ marginBottom: 8 }}>Sample cases</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  {SAMPLE_CASES.map((c) => (
                    <button
                      key={c.label}
                      onClick={() => { setModality(c.modality); setClinicalContext(c.hint); }}
                      style={{
                        padding: "6px 10px",
                        background: "var(--surface-2)",
                        border: "1px solid var(--border)",
                        borderRadius: 7,
                        fontSize: 11,
                        color: "var(--text-3)",
                        cursor: "pointer",
                        textAlign: "left",
                        transition: "all 0.15s",
                      }}
                      className="hover:border-[var(--border-2)] hover:text-[var(--text-2)]"
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

          </div>

          {/* Right column — image upload */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

            {/* Drop zone */}
            <div
              style={{
                borderRadius: 16,
                border: `2px dashed ${preview ? activeModality.accent : "var(--border)"}`,
                background: preview ? `${activeModality.accent}08` : "var(--surface)",
                minHeight: 280,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                transition: "all 0.2s",
                position: "relative",
                overflow: "hidden",
              }}
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => fileRef.current?.click()}
            >
              {/* Scan line on hover/active */}
              {preview && <div className="scan-line" style={{ position: "absolute", inset: 0 }} />}

              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              />

              {preview ? (
                <img src={preview} alt="preview" style={{ maxHeight: 260, maxWidth: "100%", borderRadius: 8, objectFit: "contain" }} />
              ) : (
                <div style={{ textAlign: "center", padding: 48 }}>
                  <div style={{ fontSize: 48, marginBottom: 16 }}>🔬</div>
                  <p style={{ color: "var(--text-2)", fontSize: 15, fontWeight: 600, marginBottom: 6 }}>
                    Drop biomedical image here
                  </p>
                  <p style={{ color: "var(--text-3)", fontSize: 13 }}>
                    Retinal fundus · Blood smear · Histopathology · Cytology
                  </p>
                  <p style={{ color: "var(--text-3)", fontSize: 12, marginTop: 8 }}>JPG, PNG — max 20MB</p>
                </div>
              )}
            </div>

            {/* Analyse button */}
            <button
              onClick={analyse}
              disabled={!file || loading}
              style={{
                width: "100%",
                padding: "14px 24px",
                background: !file || loading ? "var(--surface-3)" : activeModality.accent,
                color: !file || loading ? "var(--text-3)" : "#fff",
                border: "none",
                borderRadius: 12,
                fontWeight: 800,
                fontSize: 15,
                cursor: file && !loading ? "pointer" : "not-allowed",
                transition: "all 0.2s",
                letterSpacing: "-0.01em",
              }}
            >
              {loading ? "Analysing image…" : "Analyse Image →"}
            </button>

            {/* Loading */}
            {loading && (
              <div className="card" style={{ padding: "32px 24px", textAlign: "center" }}>
                <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
                  <svg width="40" height="40" viewBox="0 0 48 48" style={{ animation: "rotate-slow 2s linear infinite" }}>
                    <circle cx="24" cy="24" r="22" stroke="var(--border)" strokeWidth="2" fill="none" />
                    <path d="M14 10 C20 16 28 16 34 10" stroke="var(--cyan)" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
                    <path d="M14 22 C20 28 28 28 34 22" stroke="var(--cyan)" strokeWidth="2.5" fill="none" strokeLinecap="round" opacity="0.7"/>
                    <path d="M14 34 C20 40 28 40 34 34" stroke="var(--purple)" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
                    <line x1="14" y1="10" x2="14" y2="34" stroke="rgba(6,182,212,0.3)" strokeWidth="1.5"/>
                    <line x1="34" y1="10" x2="34" y2="34" stroke="rgba(139,92,246,0.3)" strokeWidth="1.5"/>
                  </svg>
                </div>
                <p style={{ color: "var(--text-2)", fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
                  Vision model extracting biomarkers…
                </p>
                <p style={{ color: "var(--text-3)", fontSize: 12 }}>
                  Mapping to KG nodes → reasoning treatment paths
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Error */}
        {error && !loading && (
          <div style={{
            marginTop: 20,
            background: "var(--red-dim)",
            border: "1px solid rgba(244,63,94,0.3)",
            borderRadius: 12,
            padding: "14px 18px",
          }}>
            <p style={{ color: "#fca5a5", fontSize: 14 }}>⚠ {error}</p>
          </div>
        )}

        {/* Results */}
        {result && !loading && (
          <div style={{ marginTop: 32, display: "flex", flexDirection: "column", gap: 16 }}>

            {/* Vision findings */}
            <div style={{
              background: "var(--surface)",
              border: `1px solid ${activeModality.accent}40`,
              borderRadius: 16,
              padding: 24,
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <p className="section-label">Vision Analysis</p>
                  <span style={{
                    background: `${activeModality.accent}18`,
                    color: activeModality.accent,
                    border: `1px solid ${activeModality.accent}40`,
                    padding: "2px 10px",
                    borderRadius: 99,
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                  }}>
                    {result.modality.replace(/_/g, " ")}
                  </span>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {result.biomarkers_detected.map((b) => (
                    <span key={b} style={{
                      fontSize: 11,
                      padding: "2px 8px",
                      background: `${activeModality.accent}18`,
                      border: `1px solid ${activeModality.accent}40`,
                      color: activeModality.accent,
                      borderRadius: 6,
                      fontFamily: "monospace",
                      fontWeight: 700,
                    }}>
                      {b.replace(/_/g, " ")}
                    </span>
                  ))}
                </div>
              </div>
              <div style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.8, whiteSpace: "pre-wrap", fontFamily: "monospace" }}>
                {result.vision_analysis}
              </div>
            </div>

            {/* KG Bridge */}
            {(result.kg_context.proteins.length > 0 || result.kg_context.diseases.length > 0) && (
              <div className="card" style={{ padding: 20 }}>
                <p className="section-label" style={{ marginBottom: 14 }}>Image-to-KG Bridge</p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                  <div>
                    <p style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 8 }}>Mapped protein nodes</p>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {result.kg_context.proteins.map((p) => (
                        <span key={p} className="badge badge-blue" style={{ fontSize: 10 }}>{p}</span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 8 }}>Mapped disease nodes</p>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {result.kg_context.diseases.map((d) => (
                        <span key={d} className="badge badge-red" style={{ fontSize: 10 }}>{d}</span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* PGx alert if relevant */}
            {(result.kg_reasoning?.answer?.toLowerCase().includes("warfarin") ||
              result.kg_reasoning?.answer?.toLowerCase().includes("clopidogrel")) && (
              <div className="card" style={{ padding: 20 }}>
                <p className="section-label" style={{ marginBottom: 12 }}>India PGx Alert</p>
                <PGxAlert compact />
              </div>
            )}

            {/* KG reasoning */}
            {result.kg_reasoning && !result.kg_reasoning.error && (
              <div className="card" style={{ padding: 24 }}>
                <p className="section-label" style={{ marginBottom: 16 }}>KG Reasoning — Treatment Pathways</p>
                <div className="analysis-text">{result.kg_reasoning.answer}</div>

                {result.kg_reasoning.cypher_steps.length > 0 && (
                  <details style={{ marginTop: 16 }}>
                    <summary style={{ fontSize: 12, color: "var(--text-3)", cursor: "pointer" }}>
                      Graph queries ({result.kg_reasoning.cypher_steps.length})
                    </summary>
                    <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                      {result.kg_reasoning.cypher_steps.map((s, i) => (
                        <div key={i} style={{ border: "1px solid var(--border)", borderRadius: 8 }}>
                          <p style={{ padding: "6px 12px", fontSize: 11, color: "var(--text-2)", borderBottom: "1px solid var(--border)" }}>{s.step}</p>
                          <pre style={{ padding: "8px 12px", fontSize: 11, color: "var(--green)", fontFamily: "monospace", overflowX: "auto", margin: 0 }}>{s.cypher}</pre>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            )}

            {result.kg_reasoning?.error && (
              <div style={{
                background: "var(--amber-dim)",
                border: "1px solid rgba(245,158,11,0.3)",
                borderRadius: 12,
                padding: "12px 16px",
              }}>
                <p style={{ color: "var(--amber)", fontSize: 13 }}>KG reasoning: {result.kg_reasoning.error}</p>
              </div>
            )}

          </div>
        )}
      </div>
    </main>
  );
}
