import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export interface DoseRecommendation {
  drug: string;
  standard_dose_text: string;
  recommended_dose_mg: number | null;
  recommended_dose_text: string;
  percent_of_standard: number;
  metabolizer_phenotype: string;
  risk_tier: "GREEN" | "YELLOW" | "RED" | string;
  actions: string[];
  cpic_guideline: string;
  alternative_drugs: string[];
  indian_frequency_context: string;
  monitoring_plan: string[];
  triggering_variants: Array<Record<string, unknown>>;
  confidence: number;
}

export interface PedoncoDoseResponse {
  drug: string;
  indication: string;
  bsa_used_m2: number | null;
  standard_dose_mg: number | null;
  recommendation: DoseRecommendation;
  disclaimer: string;
  generated_at_iso: string;
}

const C_DARK: [number, number, number] = [31, 26, 20];
const C_GREY: [number, number, number] = [107, 95, 79];
const C_RED:  [number, number, number] = [190, 18, 60];
const C_AMBER:[number, number, number] = [245, 158, 11];
const C_GREEN:[number, number, number] = [16, 185, 129];
const C_LIGHT:[number, number, number] = [244, 238, 226];

const RISK_COLOR: Record<string, [number, number, number]> = {
  GREEN: C_GREEN, YELLOW: C_AMBER, RED: C_RED,
};

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-IN", {
      day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}

export interface PedoncoPdfMeta {
  patient_label?: string;   // e.g. "Patient: MRN 1234" — clinician fills
  weight_kg?: number;
  age_years?: number;
  clinician?: string;
  institution?: string;
  genotypes_input: Array<{ gene: string; diplotype: string }>;
}

export async function exportPedoncoPdf(d: PedoncoDoseResponse, meta: PedoncoPdfMeta) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();

  // Header band
  doc.setFillColor(...C_DARK);
  doc.rect(0, 0, W, 26, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("PetriDish · PediOncoPGx", 14, 16);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(180, 200, 195);
  doc.text("Pediatric Pharmacogenomic Dosing Decision Support", 14, 22);

  // Title
  doc.setTextColor(...C_DARK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text(d.drug, 14, 44);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(...C_GREY);
  doc.text(`${d.indication} · Generated ${fmtDate(d.generated_at_iso)}`, 14, 51);

  // Patient block
  const patientRows: string[][] = [];
  if (meta.patient_label) patientRows.push(["Patient", meta.patient_label]);
  if (meta.age_years) patientRows.push(["Age", `${meta.age_years} years`]);
  if (meta.weight_kg) patientRows.push(["Weight", `${meta.weight_kg} kg`]);
  if (d.bsa_used_m2) patientRows.push(["BSA used", `${d.bsa_used_m2} m²`]);
  if (meta.clinician) patientRows.push(["Clinician", meta.clinician]);
  if (meta.institution) patientRows.push(["Institution", meta.institution]);

  if (patientRows.length) {
    autoTable(doc, {
      startY: 58,
      head: [["Submission metadata", ""]],
      body: patientRows,
      theme: "plain",
      styles: { fontSize: 10, cellPadding: 3, textColor: [...C_DARK] },
      headStyles: { fillColor: [...C_LIGHT], textColor: [...C_DARK], fontStyle: "bold" },
      columnStyles: { 0: { fontStyle: "bold", cellWidth: 45, textColor: [...C_GREY] } },
    });
  }

  // Risk callout
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let cursor = ((doc as any).lastAutoTable?.finalY ?? 60) + 6;
  const r = d.recommendation;
  const tierColor = RISK_COLOR[r.risk_tier] ?? C_GREY;
  doc.setFillColor(...tierColor);
  doc.roundedRect(14, cursor, W - 28, 24, 3, 3, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(`Risk tier: ${r.risk_tier}  ·  ${r.percent_of_standard}% of standard dose`, 20, cursor + 9);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(r.metabolizer_phenotype, 20, cursor + 16);
  doc.text(`Confidence: ${Math.round(r.confidence * 100)}%`, W - 20, cursor + 16, { align: "right" });
  cursor += 30;

  // Dosing recommendation block
  doc.setTextColor(...C_DARK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("Dosing Recommendation", 14, cursor);
  cursor += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...C_GREY);
  doc.text("Standard:", 14, cursor);
  doc.setTextColor(...C_DARK);
  doc.text(r.standard_dose_text, 36, cursor);
  cursor += 6;
  doc.setTextColor(...C_GREY);
  doc.text("Recommended:", 14, cursor);
  doc.setTextColor(...C_DARK);
  doc.setFont("helvetica", "bold");
  const wrap = doc.splitTextToSize(r.recommended_dose_text, W - 70) as string[];
  doc.text(wrap, 36, cursor);
  cursor += wrap.length * 5 + 4;

  // Actions
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...C_DARK);
  doc.text("Clinical actions", 14, cursor);
  cursor += 5;
  autoTable(doc, {
    startY: cursor,
    body: r.actions.map((a) => [a]),
    theme: "plain",
    styles: { fontSize: 9.5, cellPadding: 2.5, textColor: [...C_DARK] },
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  cursor = ((doc as any).lastAutoTable?.finalY ?? cursor) + 6;

  // Triggering variants
  if (r.triggering_variants?.length) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Triggering variants", 14, cursor);
    cursor += 4;
    autoTable(doc, {
      startY: cursor,
      head: [["Gene", "Diplotype / Variant"]],
      body: r.triggering_variants.map((v) => [
        String(v.gene ?? ""),
        String(v.diplotype ?? v.variant ?? ""),
      ]),
      theme: "grid",
      styles: { fontSize: 9, cellPadding: 2.5, textColor: [...C_DARK] },
      headStyles: { fillColor: [...C_LIGHT], textColor: [...C_DARK], fontStyle: "bold" },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    cursor = ((doc as any).lastAutoTable?.finalY ?? cursor) + 6;
  }

  // Monitoring plan
  if (r.monitoring_plan?.length) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Monitoring plan", 14, cursor);
    cursor += 4;
    autoTable(doc, {
      startY: cursor,
      body: r.monitoring_plan.map((m) => [m]),
      theme: "plain",
      styles: { fontSize: 9.5, cellPadding: 2.5, textColor: [...C_DARK] },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    cursor = ((doc as any).lastAutoTable?.finalY ?? cursor) + 4;
  }

  // Indian context + guideline
  doc.setFillColor(255, 248, 230);
  doc.roundedRect(14, cursor, W - 28, 22, 2, 2, "F");
  doc.setTextColor(...C_AMBER);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("Indian population context", 20, cursor + 6);
  doc.setTextColor(...C_DARK);
  doc.setFont("helvetica", "normal");
  const ctxWrap = doc.splitTextToSize(r.indian_frequency_context, W - 40) as string[];
  doc.text(ctxWrap, 20, cursor + 12);
  cursor += 26;

  doc.setTextColor(...C_GREY);
  doc.setFontSize(9);
  doc.setFont("helvetica", "italic");
  doc.text(`Guideline: ${r.cpic_guideline}`, 14, cursor);
  cursor += 6;

  // Disclaimer at bottom
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...C_RED);
  const disclaimerWrap = doc.splitTextToSize(d.disclaimer, W - 28) as string[];
  doc.text(disclaimerWrap, 14, H - 30);

  // Footer band
  doc.setDrawColor(...C_LIGHT);
  doc.line(14, H - 12, W - 14, H - 12);
  doc.setFontSize(8);
  doc.setTextColor(...C_GREY);
  doc.text("PetriDish · PediOncoPGx · Pediatric Pharmacogenomic Decision Support", 14, H - 6);

  const safe = d.drug.replace(/[^a-zA-Z0-9]+/g, "_").slice(0, 30);
  doc.save(`petridish_pedonco_${safe}_${Date.now()}.pdf`);
}
