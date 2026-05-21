import QueryInterface from "@/components/QueryInterface";
import LiveStats from "@/components/LiveStats";

export default function Home() {
  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "48px 24px" }}>

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{ marginBottom: 16 }}>
            <span className="badge badge-green fade-up">
              <span className="live-dot" style={{ width: 6, height: 6 }} />
              Live · India KG · 4.3M+ Edges
            </span>
          </div>
          <h1 className="fade-up-1" style={{ fontSize: 52, fontWeight: 900, letterSpacing: "-0.03em", marginBottom: 16, lineHeight: 1.1 }}>
            Bio<span style={{ color: "var(--green)" }}>Reason</span>
          </h1>
          <p className="fade-up-2" style={{ fontSize: 17, color: "var(--text-2)", maxWidth: 580, margin: "0 auto", lineHeight: 1.7 }}>
            Multi-hop reasoning over{" "}
            <span style={{ color: "var(--text-1)", fontWeight: 600 }}>4.3 million biomedical relationships</span>
            {" "}— extended with{" "}
            <span style={{ color: "var(--green)" }}>a curated Ayurvedic phytochemistry layer</span>,{" "}
            <span style={{ color: "var(--amber)" }}>Indian PGx variants</span>, and{" "}
            <span style={{ color: "var(--cyan)" }}>180+ clinical trials</span>.
          </p>
        </div>

        {/* Live graph stats */}
        <div className="fade-up-3">
          <LiveStats />
        </div>

        {/* Query interface */}
        <div className="fade-up-4">
          <QueryInterface />
        </div>

        {/* Footer */}
        <div style={{ marginTop: 64, textAlign: "center", borderTop: "1px solid var(--border)", paddingTop: 24 }}>
          <p style={{ color: "var(--text-3)", fontSize: 12, marginBottom: 4 }}>
            PrimeKG · ROBOKOP · IMPPAT 2.0 · IndiGen · GenomeIndia · PharmGKB · Reactome · ClinicalTrials.gov
          </p>
          <p style={{ color: "var(--text-3)", fontSize: 12 }}>
            Powered by Groq LLaMA 3.3 · Neo4j Community · Next.js
          </p>
        </div>

      </div>
    </main>
  );
}
