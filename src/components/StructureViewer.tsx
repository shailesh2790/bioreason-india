"use client";

import { useEffect, useRef, useState } from "react";

interface StructureData {
  gene: string;
  pdb_id: string;
  title: string;
  pocket_residues: number[];
  pdb_data: string;
  source: string;
  source_url: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare global { interface Window { $3Dmol?: any } }

const CDN_URL = "https://3Dmol.csb.pitt.edu/build/3Dmol-min.js";
let cdnPromise: Promise<void> | null = null;

function loadCdn(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.$3Dmol) return Promise.resolve();
  if (cdnPromise) return cdnPromise;
  cdnPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = CDN_URL;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Could not load 3Dmol.js from CDN"));
    document.head.appendChild(s);
  });
  return cdnPromise;
}

export default function StructureViewer({
  gene,
  height = 360,
  showLegend = true,
}: { gene: string; height?: number; showLegend?: boolean }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<StructureData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);
    fetch(`/api/structure/${encodeURIComponent(gene)}`)
      .then((r) => r.json())
      .then((d: StructureData & { error?: string }) => {
        if (cancelled) return;
        if (d.error) setError(d.error);
        else setData(d);
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Fetch failed"))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [gene]);

  useEffect(() => {
    if (!data || !wrapRef.current) return;
    let viewer: { clear: () => void } | null = null;
    loadCdn().then(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const $3Dmol = (window as any).$3Dmol;
      if (!$3Dmol || !wrapRef.current) return;
      wrapRef.current.innerHTML = "";
      const v = $3Dmol.createViewer(wrapRef.current, { backgroundColor: "white" });
      v.addModel(data.pdb_data, "pdb");
      // Base cartoon — color by secondary structure
      v.setStyle({}, { cartoon: { color: "spectrum", opacity: 0.85 } });
      // Highlight active-site pocket residues
      if (data.pocket_residues?.length) {
        v.setStyle(
          { resi: data.pocket_residues.map(String) },
          { stick: { colorscheme: "orangeCarbon", radius: 0.25 }, cartoon: { color: "#F59E0B" } }
        );
        // Surface around pocket residues
        v.addSurface($3Dmol.SurfaceType.SAS, {
          opacity: 0.45,
          color: "#F59E0B",
        }, { resi: data.pocket_residues.map(String) });
      }
      // Heme ligand if present
      v.setStyle({ resn: "HEM" }, { stick: { colorscheme: "redCarbon", radius: 0.18 } });
      // Any bound ligands (HETATM that aren't water/heme)
      v.setStyle({ hetflag: true, resn: "HOH", invert: true }, { stick: { colorscheme: "greenCarbon" } });

      v.zoomTo({ resi: data.pocket_residues.map(String) });
      v.zoom(0.85);
      v.render();
      viewer = v;
    }).catch((e) => setError(e.message));
    return () => { if (viewer) try { viewer.clear(); } catch {} };
  }, [data]);

  return (
    <div style={{ position: "relative" }}>
      <div
        ref={wrapRef}
        style={{
          width: "100%",
          height,
          background: "linear-gradient(135deg, #FFFFFF, #FBF7F0)",
          borderRadius: 10,
          border: "1px solid var(--border)",
          overflow: "hidden",
          position: "relative",
        }}
      />
      {loading && (
        <div style={{
          position: "absolute", inset: 0, display: "grid", placeItems: "center",
          color: "var(--text-3)", fontSize: 12,
        }}>Loading {gene} structure…</div>
      )}
      {error && !loading && (
        <div style={{
          position: "absolute", inset: 0, display: "grid", placeItems: "center",
          color: "var(--red)", fontSize: 12, padding: 16, textAlign: "center",
        }}>⚠ {error}</div>
      )}
      {data && !loading && !error && showLegend && (
        <div style={{
          position: "absolute", bottom: 8, left: 8, right: 8,
          fontSize: 10, color: "var(--text-3)",
          display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8,
        }}>
          <span><strong style={{ color: "var(--text-1)" }}>{data.gene}</strong> · {data.title}</span>
          <a href={data.source_url} target="_blank" rel="noreferrer"
             style={{ color: "var(--amber)", textDecoration: "none" }}>
            PDB {data.pdb_id} ↗
          </a>
        </div>
      )}
    </div>
  );
}
