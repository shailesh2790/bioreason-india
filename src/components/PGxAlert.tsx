"use client";

interface Alert {
  drug: string;
  gene: string;
  star: string;
  af_india: number;
  af_global: number;
  effect: string;
  action: string;
  severity: "HIGH" | "MODERATE" | "LOW";
}

const PGX_ALERTS: Alert[] = [
  {
    drug: "Clopidogrel", gene: "CYP2C19", star: "*2",
    af_india: 0.23, af_global: 0.15,
    effect: "Reduced conversion to active metabolite — up to 40% lower antiplatelet effect",
    action: "Consider Prasugrel or Ticagrelor for Indian patients with ACS",
    severity: "HIGH",
  },
  {
    drug: "Warfarin", gene: "CYP2C9", star: "*3",
    af_india: 0.08, af_global: 0.06,
    effect: "Severely impaired metabolism — 3× higher bleeding risk at standard doses",
    action: "Start at 50% standard dose; use VKORC1 + CYP2C9 genotype-guided dosing",
    severity: "HIGH",
  },
  {
    drug: "Primaquine", gene: "G6PD", star: "Mediterranean",
    af_india: 0.09, af_global: 0.04,
    effect: "Haemolytic anaemia — life-threatening in G6PD-deficient patients",
    action: "Screen for G6PD deficiency before prescribing. Critical in malaria-endemic states.",
    severity: "HIGH",
  },
  {
    drug: "Azathioprine / 6-MP", gene: "TPMT", star: "*3C",
    af_india: 0.04, af_global: 0.025,
    effect: "Myelosuppression — 3× higher risk of severe toxicity",
    action: "Test TPMT before starting; reduce dose by 50–90% for intermediate metabolisers",
    severity: "HIGH",
  },
  {
    drug: "Codeine / Tramadol", gene: "CYP2D6", star: "*10",
    af_india: 0.38, af_global: 0.20,
    effect: "Reduced opioid activation — inadequate analgesia in 38% of South Asians",
    action: "Consider alternatives (morphine, oxycodone) or increase dose with monitoring",
    severity: "MODERATE",
  },
  {
    drug: "Simvastatin", gene: "SLCO1B1", star: "*5",
    af_india: 0.12, af_global: 0.15,
    effect: "Impaired hepatic uptake — 4× higher myopathy risk at 80mg dose",
    action: "Limit to 20-40mg or switch to Rosuvastatin/Pravastatin",
    severity: "MODERATE",
  },
  {
    drug: "Irinotecan", gene: "UGT1A1", star: "*28",
    af_india: 0.15, af_global: 0.31,
    effect: "Reduced glucuronidation — higher SN-38 exposure, neutropenia risk",
    action: "Consider dose reduction for UGT1A1*28 homozygotes before chemotherapy",
    severity: "MODERATE",
  },
];

const SEV_COLOR = {
  HIGH:     "var(--red)",
  MODERATE: "var(--amber)",
  LOW:      "var(--blue)",
};

const SEV_BG = {
  HIGH:     "var(--red-dim)",
  MODERATE: "var(--amber-dim)",
  LOW:      "var(--blue-dim)",
};

const SEV_BORDER = {
  HIGH:     "rgba(244,63,94,0.3)",
  MODERATE: "rgba(245,158,11,0.3)",
  LOW:      "rgba(59,130,246,0.3)",
};

interface Props {
  drugName?: string;
  compact?: boolean;
}

export default function PGxAlert({ drugName, compact = false }: Props) {
  const alerts = drugName
    ? PGX_ALERTS.filter((a) => a.drug.toLowerCase().includes(drugName.toLowerCase()))
    : PGX_ALERTS;

  if (!alerts.length) return null;

  if (compact) {
    return (
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {alerts.map((a) => (
          <span
            key={a.drug + a.gene}
            title={a.effect}
            style={{
              fontSize: 11,
              padding: "3px 10px",
              borderRadius: 6,
              fontFamily: "monospace",
              fontWeight: 600,
              background: SEV_BG[a.severity],
              color: SEV_COLOR[a.severity],
              border: `1px solid ${SEV_BORDER[a.severity]}`,
            }}
          >
            ⚠ {a.drug} · {a.gene}{a.star} · {(a.af_india * 100).toFixed(0)}% India
          </span>
        ))}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {alerts.map((a) => (
        <div
          key={a.drug + a.gene}
          style={{
            borderRadius: 12,
            border: `1px solid ${SEV_BORDER[a.severity]}`,
            background: SEV_BG[a.severity],
            padding: 16,
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{
                width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                background: SEV_COLOR[a.severity],
                boxShadow: `0 0 6px ${SEV_COLOR[a.severity]}`,
                display: "inline-block",
              }} />
              <span style={{ fontWeight: 700, fontSize: 14, color: "var(--text-1)" }}>{a.drug}</span>
              <span style={{ fontSize: 12, fontFamily: "monospace", color: SEV_COLOR[a.severity] }}>{a.gene}{a.star}</span>
              <span style={{
                fontSize: 10,
                padding: "2px 7px",
                borderRadius: 99,
                fontWeight: 700,
                letterSpacing: "0.06em",
                background: SEV_BG[a.severity],
                color: SEV_COLOR[a.severity],
                border: `1px solid ${SEV_BORDER[a.severity]}`,
              }}>
                {a.severity}
              </span>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <div style={{ fontSize: 10, color: "var(--text-3)", marginBottom: 2 }}>Indian allele freq.</div>
              <div style={{ fontSize: 15, fontWeight: 800, fontFamily: "monospace", color: SEV_COLOR[a.severity] }}>
                {(a.af_india * 100).toFixed(0)}%
                <span style={{ fontSize: 11, fontWeight: 400, color: "var(--text-3)", marginLeft: 4 }}>
                  (global: {(a.af_global * 100).toFixed(0)}%)
                </span>
              </div>
            </div>
          </div>
          <p style={{ fontSize: 13, color: "var(--text-2)", marginBottom: 6, lineHeight: 1.5 }}>{a.effect}</p>
          <p style={{ fontSize: 12, fontWeight: 600, color: SEV_COLOR[a.severity] }}>→ {a.action}</p>
        </div>
      ))}
    </div>
  );
}
