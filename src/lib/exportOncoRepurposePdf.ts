import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export interface OncoCandidate {
  drug: string;
  score: number;
  confidence: string;
  targets: string[];
  via_genes: string[];
  evidence_layers: {
    kg_path: boolean;
    ppi_proximity: boolean;
    mammal_dti: { gene?: string; pkd?: number; rank?: number; percentile?: number } | null;
    cancer_pathway_hits: string[];
    driver_match: string[];
    indian_trial: { nct_id?: string; title?: string; status?: string; phase?: string } | null;
    phytochemical_alternative: string[];
  };
  pgx_verdict: { risk_tier: string; flag?: string; triggering_gene?: string; triggering_diplotype?: string };
  mechanism: string;
  rationale_synthesis?: string | null;
}

export interface OncoRepurposeResponse {
  cancer_indication: string;
  resolved_disease: { canonical?: string; exact_node?: { name?: string } } | null;
  driver_mutation_resolved: string[] | null;
  candidates: OncoCandidate[];
  summary: {
    candidate_count: number;
    highest_confidence: string;
    with_indian_trial: number;
    with_mammal_evidence: number;
    with_driver_match: number;
    pgx_red_flags: number;
    pgx_yellow_flags: number;
  };
  generated_at_iso: string;
}

const C_DARK: [number, number, number] = [31, 26, 20];
const C_GREY: [number, number, number] = [107, 95, 79];
const C_LIGHT:[number, number, number] = [244, 238, 226];
const C_AMBER:[number, number, number] = [245, 158, 11];
const C_GREEN:[number, number, number] = [16, 185, 129];
const C_RED:  [number, number, number] = [190, 18, 60];
const C_PURPLE:[number, number, number] = [109, 40, 217];

const RISK_COLOR: Record<string, [number, number, number]> = {
  GREEN: C_GREEN, YELLOW: C_AMBER, RED: C_RED, UNKNOWN: C_GREY,
};

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-IN", {
      day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}

export interface OncoPdfMeta {
  patient_label?: string;
  clinician?: string;
  institution?: string;
  driver_mutation?: string;
  patient_pgx?: Array<{ gene: string; diplotype: string }>;
}

export async function exportOncoRepurposePdf(d: OncoRepurposeResponse, meta: OncoPdfMeta) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();

  // Header band
  doc.setFillColor(...C_DARK);
  doc.rect(0, 0, W, 28, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("PetriDish · OncoRepurpose", 14, 17);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(180, 200, 195);
  doc.text("Cancer-focused drug repurposing · KG + foundation models + Indian PGx", 14, 23);

  // Title
  doc.setTextColor(...C_DARK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text("Oncology Repurposing Brief", 14, 44);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(...C_GREY);
  doc.text(`${d.cancer_indication} · Generated ${fmtDate(d.generated_at_iso)}`, 14, 51);

  // Submission metadata
  const metaRows: string[][] = [];
  if (meta.patient_label) metaRows.push(["Patient label", meta.patient_label]);
  if (meta.clinician) metaRows.push(["Clinician", meta.clinician]);
  if (meta.institution) metaRows.push(["Institution", meta.institution]);
  metaRows.push(["Indication", d.cancer_indication]);
  if (d.resolved_disease?.exact_node?.name) metaRows.push(["Resolved to", d.resolved_disease.exact_node.name]);
  if (meta.driver_mutation) metaRows.push(["Driver mutation", meta.driver_mutation]);
  if (d.driver_mutation_resolved?.length) metaRows.push(["Driver targets", d.driver_mutation_resolved.join(", ")]);
  if (meta.patient_pgx?.length) {
    metaRows.push(["Patient PGx", meta.patient_pgx.map(g => `${g.gene} ${g.diplotype}`).join(" · ")]);
  }
  autoTable(doc, {
    startY: 58,
    head: [["Submission", ""]],
    body: metaRows,
    theme: "plain",
    styles: { fontSize: 10, cellPadding: 3, textColor: [...C_DARK] },
    headStyles: { fillColor: [...C_LIGHT], textColor: [...C_DARK], fontStyle: "bold" },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 45, textColor: [...C_GREY] } },
  });

  // Summary block
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let cursor = ((doc as any).lastAutoTable?.finalY ?? 90) + 4;
  doc.setFillColor(...C_LIGHT);
  doc.roundedRect(14, cursor, W - 28, 22, 2, 2, "F");
  doc.setTextColor(...C_DARK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Multi-layer evidence summary", 20, cursor + 7);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...C_GREY);
  doc.text(
    `${d.summary.candidate_count} candidates · ${d.summary.with_mammal_evidence} with MAMMAL DTI evidence · ` +
    `${d.summary.with_driver_match} match driver gene · ${d.summary.with_indian_trial} have Indian trial · ` +
    `PGx: ${d.summary.pgx_red_flags} RED · ${d.summary.pgx_yellow_flags} YELLOW`,
    20, cursor + 14,
  );
  cursor += 28;

  // Candidates — each on its own block
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...C_DARK);
  doc.text("Ranked Repurposing Candidates", 14, cursor);
  cursor += 4;

  for (let i = 0; i < d.candidates.length; i++) {
    const c = d.candidates[i];
    if (cursor > H - 70) { doc.addPage(); cursor = 18; }

    const pgxColor = RISK_COLOR[c.pgx_verdict.risk_tier] || C_GREY;

    // Card frame
    doc.setDrawColor(...C_LIGHT);
    doc.setLineWidth(0.4);
    doc.roundedRect(14, cursor, W - 28, 50, 2, 2, "S");
    // PGx side strip
    doc.setFillColor(...pgxColor);
    doc.rect(14, cursor, 2.5, 50, "F");

    // Drug + score
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...C_DARK);
    doc.text(`${i + 1}. ${c.drug}`, 22, cursor + 8);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...C_GREY);
    doc.text(`score ${c.score} · ${c.confidence}`, W - 22, cursor + 8, { align: "right" });

    // PGx verdict line
    if (c.pgx_verdict.risk_tier !== "UNKNOWN") {
      doc.setFontSize(9);
      doc.setTextColor(...pgxColor);
      doc.setFont("helvetica", "bold");
      doc.text(`PGx ${c.pgx_verdict.risk_tier}`, 22, cursor + 14);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...C_GREY);
      if (c.pgx_verdict.flag) {
        const flagWrap = doc.splitTextToSize(c.pgx_verdict.flag, W - 60) as string[];
        doc.text(flagWrap.slice(0, 1), 38, cursor + 14);
      }
    }

    // Mechanism
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...C_DARK);
    const mechWrap = doc.splitTextToSize(c.mechanism, W - 40) as string[];
    doc.text(mechWrap.slice(0, 3), 22, cursor + 21);

    // Rationale synthesis (Llama, grounded)
    if (c.rationale_synthesis) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(8.5);
      doc.setTextColor(...C_PURPLE);
      const r = "AI rationale: " + c.rationale_synthesis;
      const rWrap = doc.splitTextToSize(r, W - 40) as string[];
      doc.text(rWrap.slice(0, 2), 22, cursor + 36);
    }

    // Evidence chips line
    const chips: string[] = [];
    if (c.evidence_layers.kg_path) chips.push("KG direct");
    if (c.evidence_layers.ppi_proximity) chips.push("PPI");
    if (c.evidence_layers.mammal_dti) chips.push(`MAMMAL pKd ${(c.evidence_layers.mammal_dti.pkd ?? 0).toFixed(2)}`);
    if (c.evidence_layers.driver_match.length) chips.push(`driver: ${c.evidence_layers.driver_match.join(",")}`);
    if (c.evidence_layers.indian_trial) chips.push(`trial: ${c.evidence_layers.indian_trial.nct_id ?? "—"}`);
    if (c.evidence_layers.cancer_pathway_hits.length) chips.push(`pathways: ${c.evidence_layers.cancer_pathway_hits.slice(0, 2).join(",")}`);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...C_GREY);
    doc.text(chips.join("  ·  "), 22, cursor + 46);

    cursor += 56;
  }

  // Disclaimer at very bottom (last page)
  if (cursor > H - 30) { doc.addPage(); cursor = 18; }
  doc.setDrawColor(...C_LIGHT);
  doc.line(14, H - 22, W - 14, H - 22);
  doc.setFont("helvetica", "italic");
  doc.setFontSize(8);
  doc.setTextColor(...C_RED);
  const disclaimer =
    "Decision support only. Does not replace clinician judgment. Evidence chain: PrimeKG + IMPPAT + IndiGen + CTRI " +
    "knowledge graph + MAMMAL 458M DTI predictions + CPIC PGx rule engine + grounded LLM synthesis. " +
    "Always confirm any oncology repurposing candidate against current institutional protocol, drug labelling, " +
    "and pharmacy review before clinical use.";
  const disWrap = doc.splitTextToSize(disclaimer, W - 28) as string[];
  doc.text(disWrap, 14, H - 16);

  // Page footer
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...C_GREY);
    doc.text("PetriDish · OncoRepurpose · Cancer drug repurposing brief", 14, H - 6);
    doc.text(`Page ${p} of ${total}`, W - 14, H - 6, { align: "right" });
  }

  const safe = d.cancer_indication.replace(/[^a-zA-Z0-9]+/g, "_").slice(0, 30);
  doc.save(`petridish_oncorepurpose_${safe}_${Date.now()}.pdf`);
}
