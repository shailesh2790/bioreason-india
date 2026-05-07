import Link from "next/link";
import MoleculeBackground from "@/components/MoleculeBackground";

const STATS = [
  { value: "4.3M+",  label: "Biomedical relationships", sub: "PrimeKG + IMPPAT + IndiGen" },
  { value: "17,967", label: "Ayurvedic compounds",       sub: "IMPPAT 2.0, ACTREC" },
  { value: "180",    label: "Indian clinical trials",     sub: "ClinicalTrials.gov, CTRI" },
  { value: "1.4B",   label: "People. One platform.",      sub: "India-first by design" },
];

const MODULES = [
  {
    tag: "Module A", tagColor: "#3B82F6",
    icon: "💊",
    title: "Drug Repurposing Scanner",
    desc: "Find FDA-approved drugs with mechanistic connections to any disease — through protein targets, shared pathways, and Indian genetic context. Multi-hop paths, not guesses.",
    href: "/repurpose",
    examples: ["MDR-Tuberculosis", "Diabetic TB", "Kala-azar", "Dengue"],
    gradient: "from-blue-500/10 to-transparent",
  },
  {
    tag: "Module B", tagColor: "#F59E0B",
    icon: "🌿",
    title: "Ayurvedic Validation Engine",
    desc: "Generate computational mechanism certificates for IMPPAT phytochemicals. Protein binding → pathway → disease evidence for CDSCO and EU regulatory submissions.",
    href: "/validate",
    examples: ["Curcumin", "Quercetin", "Berberine", "Withaferin A"],
    gradient: "from-amber-500/10 to-transparent",
  },
  {
    tag: "Module C", tagColor: "#8B5CF6",
    icon: "🧬",
    title: "Indian Pharmacogenomics",
    desc: "CYP2C19*2 is 23% in South Asia vs 15% globally. Standard guidelines are wrong for 300M Indians. Explore how Indian-enriched variants change drug dosing and selection.",
    href: "/pharmacogenomics",
    examples: ["CYP2C19", "G6PD", "TPMT", "CYP2D6"],
    gradient: "from-purple-500/10 to-transparent",
  },
  {
    tag: "Vision", tagColor: "#06B6D4",
    icon: "🔬",
    title: "PetriDish Vision",
    desc: "Upload a retinal fundus, blood smear, or biopsy. AI extracts biomarkers, maps them to the knowledge graph, and returns treatment paths with active Indian trial data.",
    href: "/vision",
    examples: ["Diabetic Retinopathy", "P. falciparum", "HER2+ Cancer", "TB AFB"],
    gradient: "from-cyan-500/10 to-transparent",
    hot: true,
  },
];

const FLOW_STEPS = [
  { n: "01", title: "Ask or Upload",    desc: "Natural language question or biomedical image",  color: "#10B981" },
  { n: "02", title: "LLM generates",    desc: "Llama 3.3 70B writes precise Neo4j Cypher",      color: "#3B82F6" },
  { n: "03", title: "Graph traverses",  desc: "4.3M edges traced — drugs, genes, pathways",     color: "#8B5CF6" },
  { n: "04", title: "India overlay",    desc: "Variant frequencies, Ayurvedic compounds, trials", color: "#F59E0B" },
  { n: "05", title: "Report generated", desc: "Evidence-graded answer + PDF export",             color: "#06B6D4" },
];

export default function HomePage() {
  return (
    <div style={{ background: "var(--bg)", minHeight: "100vh" }}>

      {/* ── Hero ──────────────────────────────────────────────────────── */}
      <section style={{ position: "relative", overflow: "hidden", paddingTop: 80, paddingBottom: 96 }}>
        <MoleculeBackground opacity={0.6} />

        <div style={{
          position: "absolute", inset: 0,
          background: "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(16,185,129,0.06) 0%, transparent 70%)",
          pointerEvents: "none",
        }} />

        <div style={{ position: "relative", maxWidth: 900, margin: "0 auto", padding: "0 24px", textAlign: "center" }}>

          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 99, padding: "6px 14px", marginBottom: 32 }}>
            <span className="live-dot" />
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--green)", letterSpacing: "0.06em" }}>LIVE BETA · GROQ + NEO4J</span>
          </div>

          <h1 style={{ fontSize: "clamp(36px, 6vw, 68px)", fontWeight: 900, lineHeight: 1.05, letterSpacing: "-0.03em", marginBottom: 20, color: "var(--text-1)" }}>
            From cell to cure.<br />
            <span className="gradient-text">Calibrated for India.</span>
          </h1>

          <p style={{ fontSize: "clamp(15px, 2vw, 18px)", color: "var(--text-2)", maxWidth: 620, margin: "0 auto 36px", lineHeight: 1.65 }}>
            The biomedical intelligence platform that connects{" "}
            <strong style={{ color: "var(--text-1)" }}>4.3M relationships</strong>, looks at a cell image,
            reasons over Indian genetics, and tells you what it means for an Indian patient —
            including what to do about it.
          </p>

          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <Link href="/query" className="btn-primary" style={{ padding: "12px 28px", fontSize: 14, borderRadius: 10, textDecoration: "none", display: "inline-block" }}>
              Open Query Interface →
            </Link>
            <Link href="/vision" style={{
              padding: "12px 28px", fontSize: 14, fontWeight: 600, borderRadius: 10, textDecoration: "none",
              background: "var(--cyan-dim)", border: "1px solid rgba(6,182,212,0.3)", color: "var(--cyan)", display: "inline-block",
              transition: "all 0.2s",
            }}>
              🔬 Try Vision Module
            </Link>
          </div>

          <p style={{ marginTop: 24, fontSize: 12, color: "var(--text-3)" }}>
            Powered by Llama 3.3 70B · Neo4j · PrimeKG · IMPPAT · IndiGen · ClinicalTrials.gov
          </p>
        </div>
      </section>

      {/* ── Stats strip ───────────────────────────────────────────────── */}
      <section style={{ borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)", background: "var(--surface)" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 24px", display: "grid", gridTemplateColumns: "repeat(4, 1fr)" }}>
          {STATS.map((s, i) => (
            <div key={s.label} style={{
              padding: "28px 24px", textAlign: "center",
              borderRight: i < 3 ? "1px solid var(--border)" : "none",
            }}>
              <div className="gradient-text" style={{ fontSize: 32, fontWeight: 900, letterSpacing: "-0.02em", marginBottom: 4 }}>
                {s.value}
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)", marginBottom: 3 }}>{s.label}</div>
              <div style={{ fontSize: 11, color: "var(--text-3)" }}>{s.sub}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── The Gap ───────────────────────────────────────────────────── */}
      <section style={{ maxWidth: 1100, margin: "0 auto", padding: "80px 24px" }}>
        <p className="section-label" style={{ textAlign: "center", marginBottom: 16 }}>The problem nobody has solved</p>
        <h2 style={{ fontSize: "clamp(22px, 3.5vw, 36px)", fontWeight: 800, textAlign: "center", color: "var(--text-1)", marginBottom: 40, letterSpacing: "-0.02em" }}>
          Global biomedical AI is built on Western genetics.<br />
          <span style={{ color: "var(--green)" }}>India has different genetics. Different diseases. Different medicines.</span>
        </h2>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
          {[
            {
              icon: "🧬", color: "#8B5CF6",
              title: "Population genetics gap",
              body: "CYP2C19*2 loss-of-function affects 23% of South Asians vs 15% globally. Standard clopidogrel dosing is wrong for 300M Indians. No global KG knows this.",
            },
            {
              icon: "🌿", color: "#F59E0B",
              title: "Traditional medicine gap",
              body: "17,967 Ayurvedic phytochemicals. Zero mechanistic evidence in any global knowledge graph. CDSCO requires computational validation — no tool provides it.",
            },
            {
              icon: "🔬", color: "#06B6D4",
              title: "Image analysis gap",
              body: "India has 3,000 pathologists for 1.4B people. Retinal fundus cameras are everywhere. No tool connects the image to Indian genetic context and treatment pathways.",
            },
          ].map((item) => (
            <div key={item.title} className="card" style={{ padding: 24, background: "var(--surface)" }}>
              <div style={{ fontSize: 28, marginBottom: 12 }}>{item.icon}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: item.color, marginBottom: 8 }}>{item.title}</div>
              <p style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.65 }}>{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Modules ───────────────────────────────────────────────────── */}
      <section style={{ borderTop: "1px solid var(--border)", background: "var(--surface)" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "80px 24px" }}>
          <p className="section-label" style={{ textAlign: "center", marginBottom: 16 }}>Platform modules</p>
          <h2 style={{ fontSize: "clamp(20px, 3vw, 32px)", fontWeight: 800, textAlign: "center", color: "var(--text-1)", marginBottom: 48, letterSpacing: "-0.02em" }}>
            Four specialised engines. One platform.
          </h2>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>
            {MODULES.map((m) => (
              <div key={m.tag} className="card-glow" style={{ padding: 28, background: "var(--surface-2)", border: "1px solid var(--border)" }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 24 }}>{m.icon}</span>
                    <div>
                      <div className="badge" style={{ color: m.tagColor, background: `${m.tagColor}18`, borderColor: `${m.tagColor}40` }}>
                        {m.tag}
                        {m.hot && <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--cyan)", display: "inline-block", animation: "pulse-glow 1.5s infinite" }} />}
                      </div>
                    </div>
                  </div>
                  <Link href={m.href} style={{ fontSize: 12, color: m.tagColor, textDecoration: "none", fontWeight: 600, whiteSpace: "nowrap" }}>
                    Open →
                  </Link>
                </div>
                <h3 style={{ fontSize: 17, fontWeight: 700, color: "var(--text-1)", marginBottom: 10, letterSpacing: "-0.01em" }}>{m.title}</h3>
                <p style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.65, marginBottom: 16 }}>{m.desc}</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {m.examples.map((ex) => (
                    <span key={ex} style={{ fontSize: 11, padding: "3px 8px", background: "var(--surface-3)", border: "1px solid var(--border)", borderRadius: 5, color: "var(--text-3)" }}>
                      {ex}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────────────── */}
      <section style={{ maxWidth: 1100, margin: "0 auto", padding: "80px 24px" }}>
        <p className="section-label" style={{ textAlign: "center", marginBottom: 16 }}>Under the hood</p>
        <h2 style={{ fontSize: "clamp(20px, 3vw, 32px)", fontWeight: 800, textAlign: "center", color: "var(--text-1)", marginBottom: 56, letterSpacing: "-0.02em" }}>
          Image or text in. Evidence-graded intelligence out.
        </h2>

        <div style={{ position: "relative", display: "flex", alignItems: "flex-start", gap: 0 }}>
          <div style={{ position: "absolute", top: 20, left: "calc(10% + 20px)", right: "calc(10% + 20px)", height: 1, background: "linear-gradient(90deg, var(--green), var(--cyan))", opacity: 0.3, zIndex: 0 }} />

          {FLOW_STEPS.map((step) => (
            <div key={step.n} style={{ flex: 1, textAlign: "center", position: "relative", zIndex: 1, padding: "0 8px" }}>
              <div style={{
                width: 40, height: 40, borderRadius: "50%",
                background: `${step.color}18`,
                border: `1px solid ${step.color}50`,
                display: "flex", alignItems: "center", justifyContent: "center",
                margin: "0 auto 12px",
              }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: step.color }}>{step.n}</span>
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-1)", marginBottom: 6 }}>{step.title}</div>
              <div style={{ fontSize: 11.5, color: "var(--text-3)", lineHeight: 1.5 }}>{step.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Vision callout ────────────────────────────────────────────── */}
      <section style={{ borderTop: "1px solid var(--border)", background: "linear-gradient(135deg, rgba(6,182,212,0.04) 0%, var(--surface) 100%)" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "64px 24px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 48, alignItems: "center" }}>
          <div>
            <div className="badge badge-cyan" style={{ marginBottom: 16 }}>
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--cyan)", display: "inline-block", animation: "pulse-glow 1.5s infinite" }} />
              NEW · PetriDish Vision
            </div>
            <h2 style={{ fontSize: 26, fontWeight: 800, color: "var(--text-1)", marginBottom: 14, lineHeight: 1.2, letterSpacing: "-0.02em" }}>
              Upload an image.<br />Get a treatment plan.
            </h2>
            <p style={{ fontSize: 14, color: "var(--text-2)", lineHeight: 1.7, marginBottom: 24 }}>
              Retinal fundus → DR grade + VEGF pathway drugs + CYP2C19 warning.
              Blood smear → P. falciparum vs vivax + G6PD alert + artemisinin protocol.
              Biopsy → HER2 status + active Indian trials. All in under 60 seconds.
            </p>
            <Link href="/vision" style={{
              display: "inline-block", padding: "11px 22px", fontSize: 13, fontWeight: 700,
              background: "var(--cyan)", color: "#030B14", borderRadius: 10, textDecoration: "none",
              transition: "all 0.2s",
            }}>
              Try Vision Module →
            </Link>
          </div>
          <div style={{ position: "relative" }}>
            <div style={{ background: "var(--surface-2)", border: "1px solid rgba(6,182,212,0.3)", borderRadius: 16, padding: 20, position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: "linear-gradient(90deg, var(--cyan), transparent)" }} />
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--cyan)", letterSpacing: "0.08em", marginBottom: 12 }}>VISION ANALYSIS — RETINAL FUNDUS</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
                {[
                  { label: "DR Grade", value: "3 — Severe NPDR", color: "#F59E0B" },
                  { label: "Macular Oedema", value: "Present (centre)", color: "#F43F5E" },
                  { label: "VEGF Signal", value: "Upregulated", color: "#10B981" },
                  { label: "Confidence", value: "94%", color: "#10B981" },
                ].map((item) => (
                  <div key={item.label} style={{ background: "var(--surface-3)", borderRadius: 8, padding: "8px 10px" }}>
                    <div style={{ fontSize: 10, color: "var(--text-3)", marginBottom: 3 }}>{item.label}</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: item.color }}>{item.value}</div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-3)", padding: "8px 10px", background: "rgba(16,185,129,0.06)", borderRadius: 8, border: "1px solid rgba(16,185,129,0.15)" }}>
                <span style={{ color: "var(--green)", fontWeight: 700 }}>→ Ranibizumab</span> (anti-VEGF, 1st line) · <span style={{ color: "#F59E0B" }}>⚠ rs699947 (31% India)</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Data sources ─────────────────────────────────────────────── */}
      <section style={{ borderTop: "1px solid var(--border)", background: "var(--surface)" }}>
        <div style={{ maxWidth: 1000, margin: "0 auto", padding: "56px 24px" }}>
          <p className="section-label" style={{ textAlign: "center", marginBottom: 24 }}>Built on open science</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center" }}>
            {[
              { name: "PrimeKG", sub: "Harvard MIMS", color: "var(--green)" },
              { name: "IMPPAT 2.0", sub: "ACTREC Mumbai", color: "var(--amber)" },
              { name: "IndiGen", sub: "CSIR-IGIB", color: "var(--purple)" },
              { name: "GenomeIndia", sub: "DBT", color: "var(--purple)" },
              { name: "DrugBank", sub: "Wishart Lab", color: "var(--blue)" },
              { name: "UniProt", sub: "Swiss-Prot", color: "var(--blue)" },
              { name: "Reactome", sub: "EMBL-EBI", color: "var(--cyan)" },
              { name: "PharmGKB", sub: "Stanford", color: "var(--red)" },
              { name: "ClinicalTrials.gov", sub: "NLM/NIH", color: "var(--amber)" },
              { name: "CTRI India", sub: "ICMR", color: "var(--green)" },
            ].map((src) => (
              <div key={src.name} style={{
                padding: "8px 14px", background: "var(--surface-2)",
                border: "1px solid var(--border)", borderRadius: 8,
                display: "flex", flexDirection: "column", alignItems: "center",
              }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: src.color }}>{src.name}</span>
                <span style={{ fontSize: 10, color: "var(--text-3)" }}>{src.sub}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────────────── */}
      <section style={{ position: "relative", overflow: "hidden", padding: "80px 24px", textAlign: "center", background: "var(--bg)" }}>
        <MoleculeBackground opacity={0.35} />
        <div style={{ position: "relative" }}>
          <h2 style={{ fontSize: "clamp(22px, 4vw, 44px)", fontWeight: 900, color: "var(--text-1)", marginBottom: 14, letterSpacing: "-0.02em" }}>
            The platform that does not exist yet.<br />
            <span className="gradient-text">Until now.</span>
          </h2>
          <p style={{ fontSize: 15, color: "var(--text-2)", maxWidth: 520, margin: "0 auto 32px" }}>
            No login. No waitlist. Open during beta.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <Link href="/query" className="btn-primary" style={{ padding: "13px 32px", fontSize: 15, textDecoration: "none", display: "inline-block" }}>
              Start Querying →
            </Link>
            <Link href="/batch" style={{
              padding: "13px 32px", fontSize: 15, fontWeight: 600, textDecoration: "none",
              background: "var(--surface)", border: "1px solid var(--border)",
              borderRadius: 10, color: "var(--text-2)", display: "inline-block",
              transition: "all 0.2s",
            }}>
              Batch Analysis (20 compounds)
            </Link>
          </div>
        </div>
      </section>

    </div>
  );
}
