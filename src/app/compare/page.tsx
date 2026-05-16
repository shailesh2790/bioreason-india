"use client";

import { useState } from "react";
import PathGraph, { PathData } from "@/components/PathGraph";
import { useAuth } from "@/lib/auth";

interface ReasonResponse {
  answer: string;
  paths: PathData[];
  cypher_steps: { step: string; cypher: string }[];
  error?: string;
}

interface SideResult {
  loading: boolean;
  result: ReasonResponse | null;
  error: string | null;
}

const COMPARE_MODES = [
  { id: "drug-drug",     label: "Drug vs Drug",        placeholder: ["Metformin", "Berberine"] },
  { id: "drug-phyto",   label: "Drug vs Phytochemical", placeholder: ["Metformin", "Curcumin"] },
  { id: "disease-drug", label: "Disease Pathways",     placeholder: ["Type 2 Diabetes", "MDR-Tuberculosis"] },
] as const;

type ModeId = typeof COMPARE_MODES[number]["id"];

async function fetchReason(
  question: string,
  fetcher: (input: RequestInfo, init?: RequestInit) => Promise<Response>,
): Promise<ReasonResponse> {
  const res = await fetcher("/api/reason", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, max_hops: 3, india_context: true }),
  });
  return res.json();
}

export default function ComparePage() {
  const { fetchWithAuth } = useAuth();
  const [mode, setMode] = useState<ModeId>("drug-drug");
  const [left, setLeft] = useState("");
  const [right, setRight] = useState("");
  const [leftRes, setLeftRes] = useState<SideResult>({ loading: false, result: null, error: null });
  const [rightRes, setRightRes] = useState<SideResult>({ loading: false, result: null, error: null });

  const currentMode = COMPARE_MODES.find((m) => m.id === mode)!;

  const run = async () => {
    if (!left.trim() || !right.trim()) return;

    const makeQ = (name: string, other: string) => {
      if (mode === "drug-drug") {
        return `Detailed mechanistic profile for ${name}: which diseases does it treat, which proteins does it target, what pathways does it affect, and are there any IMPPAT phytochemicals with overlapping targets? Compare context: the other drug being examined is ${other}.`;
      }
      if (mode === "drug-phyto") {
        return `Compare ${name} (as a therapeutic agent): which proteins does it target, which diseases does it treat via those proteins, and what is the evidence strength? The other agent being compared is ${other}.`;
      }
      return `For ${name}: what are the key molecular pathways and gene targets involved? What drugs currently treat this? Are there phytochemicals with overlapping targets? Compare against: ${other}.`;
    };

    setLeftRes({ loading: true, result: null, error: null });
    setRightRes({ loading: true, result: null, error: null });

    // Run both queries in parallel
    const [lData, rData] = await Promise.allSettled([
      fetchReason(makeQ(left, right), fetchWithAuth),
      fetchReason(makeQ(right, left), fetchWithAuth),
    ]);

    setLeftRes({
      loading: false,
      result: lData.status === "fulfilled" ? lData.value : null,
      error: lData.status === "rejected" ? String(lData.reason) : (lData.value.error ?? null),
    });
    setRightRes({
      loading: false,
      result: rData.status === "fulfilled" ? rData.value : null,
      error: rData.status === "rejected" ? String(rData.reason) : (rData.value.error ?? null),
    });
  };

  const anyLoading = leftRes.loading || rightRes.loading;

  const sideColor = (c: string) => c === "cyan" ? "var(--cyan)" : "var(--purple)";

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <div style={{ maxWidth: 1400, margin: "0 auto", padding: "40px 24px" }}>

        <div style={{ marginBottom: 32 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <span className="badge badge-cyan">Side-by-Side</span>
            <span style={{ color: "var(--text-3)", fontSize: 12 }}>Parallel graph queries · Comparative analysis</span>
          </div>
          <h1 style={{ fontSize: 36, fontWeight: 900, letterSpacing: "-0.03em", marginBottom: 10 }}>
            Comparative{" "}
            <span style={{ color: "var(--cyan)" }}>Analyser</span>
          </h1>
          <p style={{ color: "var(--text-2)", fontSize: 15, lineHeight: 1.6 }}>
            Compare two drugs, compounds, or diseases — parallel graph queries, rendered side by side.
          </p>
        </div>

        {/* Controls */}
        <div className="card" style={{ padding: 24, marginBottom: 24 }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
            {COMPARE_MODES.map((m) => (
              <button
                key={m.id}
                onClick={() => setMode(m.id)}
                style={{
                  padding: "7px 16px", borderRadius: 9, fontSize: 12, fontWeight: 700,
                  cursor: "pointer", transition: "all 0.15s",
                  background: mode === m.id ? "var(--cyan-dim)" : "var(--surface-2)",
                  color: mode === m.id ? "var(--cyan)" : "var(--text-3)",
                  border: mode === m.id ? "1px solid rgba(6,182,212,0.4)" : "1px solid var(--border)",
                }}
              >
                {m.label}
              </button>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
            <div>
              <label className="section-label" style={{ display: "block", marginBottom: 8 }}>
                Left — {currentMode.placeholder[0]}
              </label>
              <input
                value={left}
                onChange={(e) => setLeft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && run()}
                placeholder={currentMode.placeholder[0]}
                className="input-bio"
                style={{ width: "100%", padding: "11px 16px", fontSize: 14 }}
              />
            </div>
            <div>
              <label className="section-label" style={{ display: "block", marginBottom: 8 }}>
                Right — {currentMode.placeholder[1]}
              </label>
              <input
                value={right}
                onChange={(e) => setRight(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && run()}
                placeholder={currentMode.placeholder[1]}
                className="input-bio"
                style={{ width: "100%", padding: "11px 16px", fontSize: 14 }}
              />
            </div>
          </div>

          <button
            onClick={run}
            disabled={!left.trim() || !right.trim() || anyLoading}
            style={{
              padding: "11px 28px",
              background: left.trim() && right.trim() && !anyLoading ? "var(--cyan)" : "var(--surface-3)",
              color: left.trim() && right.trim() && !anyLoading ? "#030B14" : "var(--text-3)",
              border: "none", borderRadius: 10, fontWeight: 800, fontSize: 14,
              cursor: left.trim() && right.trim() && !anyLoading ? "pointer" : "not-allowed",
              transition: "all 0.2s",
            }}
          >
            {anyLoading ? "Comparing…" : "Compare →"}
          </button>
        </div>

        {/* Side-by-side results */}
        {(leftRes.result || rightRes.result || leftRes.loading || rightRes.loading) && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            {[
              { side: leftRes,  name: left,  color: "cyan" },
              { side: rightRes, name: right, color: "violet" },
            ].map(({ side, name, color }) => (
              <div key={name} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", fontFamily: "monospace", color: sideColor(color) }}>
                  {name || "—"}
                </div>

                {side.loading && (
                  <div className="card" style={{ padding: "32px 24px", textAlign: "center" }}>
                    <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
                      <svg width="32" height="32" viewBox="0 0 48 48" style={{ animation: "rotate-slow 2s linear infinite" }}>
                        <circle cx="24" cy="24" r="22" stroke="var(--border)" strokeWidth="2" fill="none" />
                        <path d="M14 12 C20 18 28 18 34 12" stroke={sideColor(color)} strokeWidth="2.5" fill="none" strokeLinecap="round"/>
                        <path d="M14 24 C20 30 28 30 34 24" stroke={sideColor(color)} strokeWidth="2.5" fill="none" strokeLinecap="round" opacity="0.7"/>
                        <path d="M14 36 C20 42 28 42 34 36" stroke={sideColor(color)} strokeWidth="2.5" fill="none" strokeLinecap="round" opacity="0.4"/>
                      </svg>
                    </div>
                    <p style={{ fontSize: 12, color: "var(--text-3)" }}>Traversing graph…</p>
                  </div>
                )}

                {side.error && !side.loading && (
                  <div style={{ background: "var(--red-dim)", border: "1px solid rgba(244,63,94,0.3)", borderRadius: 12, padding: 14 }}>
                    <p style={{ color: "#fca5a5", fontSize: 12 }}>{side.error}</p>
                  </div>
                )}

                {side.result && !side.loading && (
                  <>
                    <div className="card" style={{ padding: 18 }}>
                      <p className="section-label" style={{ marginBottom: 10 }}>Analysis</p>
                      <div style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.75, whiteSpace: "pre-wrap" }}>
                        {side.result.answer}
                      </div>
                    </div>

                    {side.result.paths.length > 0 && (
                      <div className="card" style={{ padding: 18 }}>
                        <p className="section-label" style={{ marginBottom: 12 }}>
                          Paths ({side.result.paths.length})
                        </p>
                        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                          {side.result.paths.slice(0, 3).map((path, i) => (
                            <div key={i} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 12, background: "var(--surface-2)" }}>
                              <p style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 8 }}>{path.description}</p>
                              <PathGraph path={path} />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
