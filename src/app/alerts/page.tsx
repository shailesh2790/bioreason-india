import PGxAlert from "@/components/PGxAlert";
import Link from "next/link";

export default function AlertsPage() {
  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "40px 24px" }}>

        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <span className="badge badge-red">Patient Safety</span>
            <span className="badge badge-amber">India-specific</span>
            <span style={{ color: "var(--text-3)", fontSize: 12 }}>IndiGen · PharmGKB · CPIC Level A/B</span>
          </div>
          <h1 style={{ fontSize: 36, fontWeight: 900, letterSpacing: "-0.03em", marginBottom: 10 }}>
            India PGx Drug{" "}
            <span style={{ color: "var(--red)" }}>Safety Alerts</span>
          </h1>
          <p style={{ color: "var(--text-2)", fontSize: 15, maxWidth: 620, lineHeight: 1.7 }}>
            Pharmacogenomic variants enriched in Indian populations that require
            dose adjustment or drug substitution. Based on IndiGen allele frequencies
            cross-referenced with CPIC Level A/B clinical guidelines.
          </p>
        </div>

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 28 }}>
          {[
            { value: "7", label: "HIGH/MODERATE alerts active", color: "var(--red)" },
            { value: "23%", label: "CYP2C19*2 in S.Asia vs 15% global", color: "var(--amber)" },
            { value: "38%", label: "CYP2D6*10 in South Asians", color: "var(--amber)" },
          ].map((s) => (
            <div key={s.label} className="metric-card">
              <div style={{ fontSize: 28, fontWeight: 900, color: s.color, letterSpacing: "-0.03em" }}>{s.value}</div>
              <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 4 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Why it matters */}
        <div style={{
          background: "var(--surface)",
          border: "1px solid rgba(244,63,94,0.2)",
          borderRadius: 14,
          padding: 20,
          marginBottom: 28,
        }}>
          <p className="section-label" style={{ marginBottom: 10, color: "var(--red)" }}>
            Why standard dosing fails Indian patients
          </p>
          <p style={{ fontSize: 14, color: "var(--text-2)", lineHeight: 1.8 }}>
            International drug dosing guidelines are calibrated on European genetic data.
            South Asian populations carry loss-of-function alleles at markedly different frequencies —
            CYP2C19*2 (clopidogrel reduced efficacy) is 23% vs 15% globally; G6PD deficiency is
            5–15% in malaria-endemic Indian states vs 4% globally. Without population-specific
            pharmacogenomic context, standard dosing causes measurable harm to 1.4 billion people.
          </p>
        </div>

        {/* All alerts */}
        <div style={{ marginBottom: 28 }}>
          <p className="section-label" style={{ marginBottom: 16 }}>Active alerts</p>
          <PGxAlert />
        </div>

        {/* Data sources */}
        <div className="card" style={{ padding: 20, marginBottom: 24 }}>
          <p className="section-label" style={{ marginBottom: 14 }}>Data Sources</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            {[
              ["IndiGen (IGIB, 2020)", "1,029 Indian genomes — population allele frequencies"],
              ["PharmGKB", "Curated drug-gene clinical annotations"],
              ["CPIC Guidelines", "Clinical Pharmacogenetics Implementation Consortium Level A/B"],
              ["GenomeIndia (DBT)", "10,000-genome Indian population study"],
            ].map(([src, desc]) => (
              <div key={src}>
                <span style={{ fontSize: 13, color: "var(--text-1)", fontWeight: 600 }}>{src}</span>
                <br />
                <span style={{ fontSize: 12, color: "var(--text-3)" }}>{desc}</span>
              </div>
            ))}
          </div>
        </div>

        {/* CTA links */}
        <div style={{ display: "flex", gap: 12 }}>
          <Link
            href="/pharmacogenomics"
            style={{
              fontSize: 13,
              padding: "9px 18px",
              background: "var(--purple-dim)",
              border: "1px solid rgba(139,92,246,0.4)",
              color: "var(--purple)",
              borderRadius: 9,
              textDecoration: "none",
              fontWeight: 600,
              transition: "all 0.15s",
            }}
          >
            Explore PGx by Gene →
          </Link>
          <Link
            href="/repurpose"
            style={{
              fontSize: 13,
              padding: "9px 18px",
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              color: "var(--text-2)",
              borderRadius: 9,
              textDecoration: "none",
              fontWeight: 600,
              transition: "all 0.15s",
            }}
          >
            Drug Repurposing Scanner →
          </Link>
        </div>

      </div>
    </main>
  );
}
