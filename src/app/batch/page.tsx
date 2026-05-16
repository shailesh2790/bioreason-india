"use client";

import { useState, useRef } from "react";
import { exportReportPdf } from "@/lib/exportPdf";
import { useAuth } from "@/lib/auth";

type Mode = "compounds" | "diseases";
type Status = "pending" | "running" | "done" | "error";

interface BatchItem {
  id: number;
  name: string;
  status: Status;
  answer: string;
  paths: any[];
  cypher_steps: any[];
  error?: string;
}

const SAMPLE_COMPOUNDS = "Curcumin\nQuercetin\nBerberine\nPiperine\nWithaferin A";
const SAMPLE_DISEASES = "tuberculosis\ndiabetes mellitus\nalzheimer\nmalaria\nleishmaniasis";

export default function BatchPage() {
  const { fetchWithAuth } = useAuth();
  const [mode, setMode] = useState<Mode>("compounds");
  const [input, setInput] = useState("");
  const [items, setItems] = useState<BatchItem[]>([]);
  const [running, setRunning] = useState(false);
  const abortRef = useRef(false);

  const buildQuestion = (name: string) =>
    mode === "compounds"
      ? `Validate the mechanistic basis for ${name} as a therapeutic compound. Find protein targets, associated pathways, and disease connections. What diseases does the graph evidence support for this compound?`
      : `Which drugs could be repurposed for ${name}? Find drugs that target genes associated with this disease. Include any IMPPAT phytochemicals with overlapping targets.`;

  const run = async () => {
    const names = input
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 20);
    if (!names.length) return;

    abortRef.current = false;
    setRunning(true);
    const initial: BatchItem[] = names.map((name, i) => ({
      id: i, name, status: "pending", answer: "", paths: [], cypher_steps: [],
    }));
    setItems(initial);

    for (let i = 0; i < names.length; i++) {
      if (abortRef.current) break;
      setItems((prev) => prev.map((it) => it.id === i ? { ...it, status: "running" } : it));
      try {
        const res = await fetchWithAuth("/api/reason", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: buildQuestion(names[i]), max_hops: 3, india_context: true }),
        });
        const data = await res.json();
        setItems((prev) => prev.map((it) =>
          it.id === i ? {
            ...it, status: data.error ? "error" : "done",
            answer: data.answer ?? "", paths: data.paths ?? [],
            cypher_steps: data.cypher_steps ?? [], error: data.error,
          } : it
        ));
      } catch (e) {
        setItems((prev) => prev.map((it) =>
          it.id === i ? { ...it, status: "error", error: String(e) } : it
        ));
      }
    }
    setRunning(false);
  };

  const stop = () => { abortRef.current = true; };

  const doneItems = items.filter((it) => it.status === "done");
  const pending = items.filter((it) => it.status === "pending").length;
  const running_ = items.filter((it) => it.status === "running").length;

  const statusBorder = (s: Status) =>
    s === "running" ? "rgba(16,185,129,0.4)" :
    s === "done"    ? "var(--border)" :
    s === "error"   ? "rgba(244,63,94,0.3)" : "var(--border)";

  const statusDot = (s: Status) =>
    s === "running" ? "var(--green)" :
    s === "done"    ? "var(--green)" :
    s === "error"   ? "var(--red)" : "var(--surface-3)";

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <div style={{ maxWidth: 1000, margin: "0 auto", padding: "40px 24px" }}>

        <div style={{ marginBottom: 32 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <span className="badge badge-green">Batch Analysis</span>
            <span style={{ color: "var(--text-3)", fontSize: 12 }}>Up to 20 queries · Sequential · Export all PDFs</span>
          </div>
          <h1 style={{ fontSize: 36, fontWeight: 900, letterSpacing: "-0.03em", marginBottom: 10 }}>
            Batch{" "}
            <span style={{ color: "var(--green)" }}>Analysis</span>
          </h1>
          <p style={{ color: "var(--text-2)", fontSize: 15, lineHeight: 1.6 }}>
            Analyse up to 20 compounds or diseases at once. Each runs a full graph-reasoning query —
            export all results as individual PDFs.
          </p>
        </div>

        {/* Config */}
        <div className="card" style={{ padding: 24, marginBottom: 24 }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
            {(["compounds", "diseases"] as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                style={{
                  padding: "8px 20px", borderRadius: 9, fontSize: 13, fontWeight: 700,
                  cursor: "pointer", transition: "all 0.15s", textTransform: "capitalize",
                  background: mode === m ? "var(--green-dim)" : "var(--surface-2)",
                  color: mode === m ? "var(--green)" : "var(--text-3)",
                  border: mode === m ? "1px solid rgba(16,185,129,0.4)" : "1px solid var(--border)",
                }}
              >
                {m}
              </button>
            ))}
          </div>

          <label className="section-label" style={{ display: "block", marginBottom: 10 }}>
            {mode === "compounds" ? "Compound names" : "Disease keywords"} — one per line (max 20)
          </label>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={6}
            placeholder={mode === "compounds" ? SAMPLE_COMPOUNDS : SAMPLE_DISEASES}
            className="input-bio"
            style={{ width: "100%", padding: "12px 14px", fontSize: 13, fontFamily: "monospace", resize: "none", marginBottom: 16 }}
          />

          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button
              onClick={run}
              disabled={running || !input.trim()}
              className="btn-primary"
              style={{ padding: "10px 24px", fontSize: 14 }}
            >
              {running ? `Running… (${running_} active, ${pending} queued)` : "Run Batch →"}
            </button>
            {running && (
              <button
                onClick={stop}
                style={{
                  padding: "10px 20px",
                  background: "var(--red-dim)",
                  color: "var(--red)",
                  border: "1px solid rgba(244,63,94,0.3)",
                  borderRadius: 10,
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Stop
              </button>
            )}
            <button
              onClick={() => setInput(mode === "compounds" ? SAMPLE_COMPOUNDS : SAMPLE_DISEASES)}
              style={{ fontSize: 12, color: "var(--text-3)", background: "none", border: "none", cursor: "pointer" }}
            >
              Load example
            </button>
          </div>
        </div>

        {/* Progress */}
        {items.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: "var(--text-3)" }}>
                {doneItems.length}/{items.length} complete
                {items.filter(it => it.status === "error").length > 0 &&
                  ` · ${items.filter(it => it.status === "error").length} errors`}
              </span>
              {doneItems.length > 0 && (
                <button
                  onClick={() => doneItems.forEach((it) =>
                    exportReportPdf({
                      title: mode === "compounds" ? "Traditional Medicine Validation" : "Drug Repurposing Scanner",
                      subtitle: "Batch Analysis Report",
                      query: buildQuestion(it.name),
                      answer: it.answer,
                      paths: it.paths,
                      cypher_steps: it.cypher_steps,
                      module: mode === "compounds" ? "validate" : "repurpose",
                      subject: it.name,
                    })
                  )}
                  style={{
                    fontSize: 12, padding: "5px 14px",
                    background: "var(--green-dim)", border: "1px solid rgba(16,185,129,0.4)",
                    color: "var(--green)", borderRadius: 8, fontWeight: 700, cursor: "pointer",
                  }}
                >
                  ↓ Export All PDFs ({doneItems.length})
                </button>
              )}
            </div>
            <div style={{ height: 4, background: "var(--surface-3)", borderRadius: 99, overflow: "hidden" }}>
              <div style={{
                height: "100%",
                width: `${items.length ? (doneItems.length / items.length) * 100 : 0}%`,
                background: "linear-gradient(90deg, var(--green), #34D399)",
                borderRadius: 99,
                transition: "width 0.5s ease",
              }} />
            </div>
          </div>
        )}

        {/* Results list */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {items.map((item) => (
            <div
              key={item.id}
              style={{
                background: "var(--surface)",
                border: `1px solid ${statusBorder(item.status)}`,
                borderRadius: 12,
                padding: 18,
                transition: "all 0.2s",
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                  <div style={{
                    width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                    background: statusDot(item.status),
                    boxShadow: item.status === "running" ? `0 0 6px ${statusDot(item.status)}` : "none",
                    animation: item.status === "running" ? "pulse-glow 1.5s infinite" : "none",
                  }} />
                  <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.name}</span>
                  <span style={{ fontSize: 11, color: "var(--text-3)", flexShrink: 0 }}>
                    {item.status === "done" && `${item.paths.length} paths`}
                    {item.status === "running" && "analysing…"}
                    {item.status === "error" && "error"}
                    {item.status === "pending" && "queued"}
                  </span>
                </div>
                {item.status === "done" && (
                  <button
                    onClick={() => exportReportPdf({
                      title: mode === "compounds" ? "Traditional Medicine Validation" : "Drug Repurposing Scanner",
                      subtitle: "Batch Analysis Report",
                      query: buildQuestion(item.name),
                      answer: item.answer,
                      paths: item.paths,
                      cypher_steps: item.cypher_steps,
                      module: mode === "compounds" ? "validate" : "repurpose",
                      subject: item.name,
                    })}
                    className="btn-ghost"
                    style={{ padding: "4px 12px", fontSize: 11, flexShrink: 0 }}
                  >
                    ↓ PDF
                  </button>
                )}
              </div>

              {item.status === "done" && item.answer && (
                <div style={{ marginTop: 10, fontSize: 12, color: "var(--text-3)", lineHeight: 1.6 }}>
                  {item.answer.slice(0, 320)}{item.answer.length > 320 ? "…" : ""}
                </div>
              )}
              {item.status === "error" && (
                <p style={{ marginTop: 8, fontSize: 12, color: "var(--red)" }}>{item.error}</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
