"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const NODE_LABELS = ["", "Drug", "Disease", "Gene", "Pathway", "Phytochemical", "Phenotype", "Anatomy", "Variant"];

const LABEL_STYLE: Record<string, { color: string; bg: string; border: string }> = {
  Drug:          { color: "var(--green)",  bg: "rgba(16,185,129,0.1)",  border: "rgba(16,185,129,0.3)" },
  Disease:       { color: "#f87171",       bg: "rgba(248,113,113,0.1)", border: "rgba(248,113,113,0.3)" },
  Gene:          { color: "var(--blue)",   bg: "var(--blue-dim)",       border: "rgba(59,130,246,0.3)" },
  Pathway:       { color: "var(--purple)", bg: "var(--purple-dim)",     border: "rgba(139,92,246,0.3)" },
  Phytochemical: { color: "var(--amber)",  bg: "var(--amber-dim)",      border: "rgba(245,158,11,0.3)" },
  Phenotype:     { color: "#fbbf24",       bg: "rgba(251,191,36,0.1)",  border: "rgba(251,191,36,0.3)" },
  Anatomy:       { color: "#34d399",       bg: "rgba(52,211,153,0.1)",  border: "rgba(52,211,153,0.3)" },
  Variant:       { color: "#f472b6",       bg: "rgba(244,114,182,0.1)", border: "rgba(244,114,182,0.3)" },
};

interface SearchResult {
  label: string;
  id: string;
  name: string;
  source?: string;
}

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [labelFilter, setLabelFilter] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const search = useCallback(async (q: string, label: string) => {
    if (q.length < 2) { setResults([]); setSearched(false); return; }
    setLoading(true);
    try {
      const params = new URLSearchParams({ q, limit: "30" });
      if (label) params.set("label", label);
      const res = await fetch(`/api/search?${params}`);
      const data = await res.json();
      setResults(data.results ?? []);
      setSearched(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(query, labelFilter), 280);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, labelFilter, search]);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const grouped = results.reduce<Record<string, SearchResult[]>>((acc, r) => {
    (acc[r.label] ??= []).push(r);
    return acc;
  }, {});

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "40px 24px" }}>

        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: 36, fontWeight: 900, letterSpacing: "-0.03em", marginBottom: 10 }}>
            Entity{" "}
            <span style={{ color: "var(--green)" }}>Search</span>
          </h1>
          <p style={{ color: "var(--text-2)", fontSize: 15, lineHeight: 1.6 }}>
            Find any node in the PetriDish knowledge graph — drugs, genes, diseases, pathways, phytochemicals.
          </p>
        </div>

        {/* Search bar */}
        <div className="card" style={{ padding: 20, marginBottom: 24 }}>
          <div style={{ display: "flex", gap: 12, marginBottom: 14 }}>
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search drugs, genes, diseases, pathways, phytochemicals…"
              className="input-bio"
              style={{ flex: 1, padding: "11px 16px", fontSize: 14 }}
            />
            <select
              value={labelFilter}
              onChange={(e) => setLabelFilter(e.target.value)}
              style={{
                background: "var(--surface-2)",
                color: "var(--text-2)",
                border: "1px solid var(--border)",
                borderRadius: 10,
                padding: "11px 14px",
                fontSize: 13,
                outline: "none",
                cursor: "pointer",
              }}
            >
              {NODE_LABELS.map((l) => (
                <option key={l} value={l}>{l || "All types"}</option>
              ))}
            </select>
          </div>

          {/* Type filter pills */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {NODE_LABELS.filter(Boolean).map((l) => {
              const s = LABEL_STYLE[l];
              const active = labelFilter === l;
              return (
                <button
                  key={l}
                  onClick={() => setLabelFilter(active ? "" : l)}
                  style={{
                    padding: "3px 10px",
                    borderRadius: 99,
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: "pointer",
                    transition: "all 0.15s",
                    background: active ? (s?.bg ?? "var(--surface-2)") : "transparent",
                    color: active ? (s?.color ?? "var(--text-2)") : "var(--text-3)",
                    border: active ? `1px solid ${s?.border ?? "var(--border)"}` : "1px solid var(--border)",
                  }}
                >
                  {l}
                </button>
              );
            })}
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div style={{ display: "flex", justifyContent: "center", gap: 6, padding: "32px 0" }}>
            {[0, 150, 300].map((d) => (
              <div
                key={d}
                style={{
                  width: 8, height: 8, borderRadius: "50%",
                  background: "var(--green)",
                  animation: "bounce-subtle 1s ease-in-out infinite",
                  animationDelay: `${d}ms`,
                }}
              />
            ))}
          </div>
        )}

        {/* No results */}
        {!loading && searched && results.length === 0 && (
          <div style={{ textAlign: "center", padding: "64px 0" }}>
            <p style={{ color: "var(--text-3)", fontSize: 14, marginBottom: 8 }}>
              No nodes found for &ldquo;{query}&rdquo;{labelFilter ? ` in ${labelFilter}` : ""}
            </p>
            <p style={{ color: "var(--text-3)", fontSize: 12 }}>
              PrimeKG may still be loading — check Graph Stats for progress.
            </p>
          </div>
        )}

        {/* Results */}
        {!loading && results.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <p style={{ fontSize: 12, color: "var(--text-3)" }}>
              {results.length} result{results.length !== 1 ? "s" : ""} for &ldquo;{query}&rdquo;
            </p>

            {Object.entries(grouped).map(([label, items]) => {
              const s = LABEL_STYLE[label];
              return (
                <div key={label}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                    <span style={{
                      fontSize: 11, padding: "2px 10px", borderRadius: 99,
                      fontWeight: 700, fontFamily: "monospace",
                      background: s?.bg ?? "var(--surface-2)",
                      color: s?.color ?? "var(--text-2)",
                      border: `1px solid ${s?.border ?? "var(--border)"}`,
                    }}>
                      {label}
                    </span>
                    <span style={{ fontSize: 11, color: "var(--text-3)" }}>{items.length}</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    {items.map((r) => (
                      <div
                        key={r.id}
                        className="card"
                        style={{ padding: "12px 16px", borderLeft: `3px solid ${s?.color ?? "var(--border)"}` }}
                      >
                        <p style={{ fontSize: 14, color: "var(--text-1)", fontWeight: 600, lineHeight: 1.4 }}>{r.name}</p>
                        <p style={{ fontSize: 11, color: "var(--text-3)", marginTop: 3, fontFamily: "monospace" }}>{r.id}</p>
                        {r.source && (
                          <p style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>{r.source}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Initial prompt */}
        {!searched && !loading && (
          <div style={{ textAlign: "center", padding: "64px 0" }}>
            <p style={{ color: "var(--text-3)", fontSize: 14 }}>
              Type at least 2 characters to search ~27,000 biomedical entities
            </p>
            <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 20 }}>
              {["Metformin", "CYP2C19", "Tuberculosis", "Curcumin"].map((s) => (
                <button
                  key={s}
                  onClick={() => setQuery(s)}
                  style={{
                    fontSize: 12, padding: "5px 14px", borderRadius: 8,
                    background: "var(--surface-2)", border: "1px solid var(--border)",
                    color: "var(--text-3)", cursor: "pointer", transition: "all 0.15s",
                  }}
                  className="hover:border-[var(--border-2)] hover:text-[var(--text-2)]"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
