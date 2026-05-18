import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export interface BlastProfilerResponse {
  patient_id: string | null;
  blast_subtype: {
    label: string;
    subtype: string | null;
    confidence: number;
    differential: Record<string, number>;
  };
  disease_state: {
    label: string;
    mrd_risk_score: number;
    relapse_similarity: number;
    drivers_of_risk: string[];
  };
  drug_sensitivity: Array<{
    drug: string; prediction: string; confidence: number; rationale: string;
  }>;
  pgx_alerts: Array<{
    gene: string; variant: string | null; status: string;
    action: string; drug_affected: string; population_risk: string;
  }>;
  knowledge_graph: {
    hops: number;
    path: string[];
    indian_trials: Array<{ ctri_id?: string; title?: string; status?: string; phase?: string; drug?: string }>;
  };
  evidence_citations: string[];
  confidence: number;
  classifier_version: string;
  generated_at_iso: string;
}

const C_DARK: [number, number, number] = [31, 26, 20];
const C_GREY: [number, number, number] = [107, 95, 79];
const C_LIGHT:[number, number, number] = [244, 238, 226];
const C_GREEN:[number, number, number] = [16, 185, 129];
const C_AMBER:[number, number, number] = [245, 158, 11];
const C_RED:  [number, number, number] = [190, 18, 60];
const C_CYAN: [number, number, number] = [6, 182, 212];
const C_PURPLE:[number, number, number] = [109, 40, 217];

const SEN_COLOR: Record<string, [number, number, number]> = {
  Sensitive: C_GREEN, Intermediate: C_AMBER, Resistant: C_RED, "Not indicated": C_GREY,
};
const PGX_COLOR: Record<string, [number, number, number]> = {
  poor_metabolizer: C_RED, intermediate_metabolizer: C_AMBER,
  reduced_activity: C_AMBER, non_expressor: C_AMBER, unknown: C_AMBER, normal_metabolizer: C_GREEN,
};

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-IN", {
      day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}

export interface BlastProfilerPdfMeta {
  patient_label?: string;
  clinician?: string;
  institution?: string;
  timepoint?: string;
  age_years?: number;
  drivers?: string[];
  markers_summary?: string;
}

export async function exportBlastProfilerPdf(d: BlastProfilerResponse, meta: BlastProfilerPdfMeta) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();

  // Header band
  doc.setFillColor(...C_DARK);
  doc.rect(0, 0, W, 28, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("PetriDish · BlastProfiler", 14, 17);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(180, 200, 195);
  doc.text("Pediatric Leukemia Clinical Report · subtype + MRD + drug sensitivity + Indian PGx", 14, 23);

  // Title
  doc.setTextColor(...C_DARK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text(d.blast_subtype.label, 14, 44);
  if (d.blast_subtype.subtype) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);
    doc.setTextColor(...C_PURPLE);
    doc.text(d.blast_subtype.subtype, 14, 52);
  }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(...C_GREY);
  doc.text(`Confidence: ${(d.blast_subtype.confidence * 100).toFixed(0)}% · ${fmtDate(d.generated_at_iso)}`, 14, 59);

  // Submission metadata
  const metaRows: string[][] = [];
  if (meta.patient_label) metaRows.push(["Patient label", meta.patient_label]);
  if (meta.age_years) metaRows.push(["Age", `${meta.age_years} years`]);
  if (meta.timepoint) metaRows.push(["Timepoint", meta.timepoint]);
  if (meta.markers_summary) metaRows.push(["Markers", meta.markers_summary]);
  if (meta.drivers?.length) metaRows.push(["Driver mutations", meta.drivers.join(", ")]);
  if (meta.clinician) metaRows.push(["Clinician", meta.clinician]);
  if (meta.institution) metaRows.push(["Institution", meta.institution]);

  autoTable(doc, {
    startY: 66,
    head: [["Submission metadata", ""]],
    body: metaRows,
    theme: "plain",
    styles: { fontSize: 9.5, cellPadding: 3, textColor: [...C_DARK] },
    headStyles: { fillColor: [...C_LIGHT], textColor: [...C_DARK], fontStyle: "bold" },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 45, textColor: [...C_GREY] } },
  });

  // Differential block
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let cursor = ((doc as any).lastAutoTable?.finalY ?? 80) + 4;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...C_DARK);
  doc.text("Subtype Differential", 14, cursor);
  cursor += 4;
  const diffRows = Object.entries(d.blast_subtype.differential).map(([k, v]) =>
    [k, `${(v * 100).toFixed(1)}%`, k === d.blast_subtype.label ? "← top" : ""]
  );
  autoTable(doc, {
    startY: cursor,
    head: [["Subtype", "Probability", ""]],
    body: diffRows,
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 2.5, textColor: [...C_DARK] },
    headStyles: { fillColor: [...C_LIGHT], textColor: [...C_DARK], fontStyle: "bold" },
    columnStyles: { 1: { halign: "right", cellWidth: 30 }, 2: { cellWidth: 20, textColor: [...C_PURPLE] } },
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  cursor = ((doc as any).lastAutoTable?.finalY ?? cursor) + 6;

  // MRD risk callout
  const mrd = d.disease_state.mrd_risk_score;
  const mrdColor = mrd >= 0.6 ? C_RED : mrd >= 0.3 ? C_AMBER : C_GREEN;
  doc.setFillColor(...mrdColor);
  doc.roundedRect(14, cursor, W - 28, 22, 3, 3, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(`Disease state: ${d.disease_state.label}`, 20, cursor + 8);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`MRD risk: ${(mrd * 100).toFixed(0)}%  ·  relapse-similarity: ${(d.disease_state.relapse_similarity * 100).toFixed(0)}%`, 20, cursor + 16);
  cursor += 28;

  if (d.disease_state.drivers_of_risk.length) {
    doc.setTextColor(...C_GREY);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(9);
    doc.text(`Risk drivers: ${d.disease_state.drivers_of_risk.join(" · ")}`, 14, cursor);
    cursor += 8;
  }

  // Drug sensitivity table
  if (d.drug_sensitivity.length) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...C_DARK);
    doc.text("Drug Sensitivity Profile", 14, cursor);
    cursor += 4;
    autoTable(doc, {
      startY: cursor,
      head: [["Drug", "Prediction", "Conf", "Rationale"]],
      body: d.drug_sensitivity.map(ds => [
        ds.drug, ds.prediction, `${Math.round(ds.confidence * 100)}%`, ds.rationale,
      ]),
      theme: "striped",
      styles: { fontSize: 8.5, cellPadding: 2.5, textColor: [...C_DARK] },
      headStyles: { fillColor: [...C_DARK], textColor: [255, 255, 255], fontStyle: "bold" },
      columnStyles: { 0: { fontStyle: "bold", cellWidth: 38 }, 1: { cellWidth: 25 }, 2: { cellWidth: 14, halign: "center" } },
      didParseCell: (data) => {
        if (data.section === "body" && data.column.index === 1) {
          const c = SEN_COLOR[(data.cell.raw as string)] || C_GREY;
          data.cell.styles.textColor = c;
          data.cell.styles.fontStyle = "bold";
        }
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    cursor = ((doc as any).lastAutoTable?.finalY ?? cursor) + 6;
  }

  // PGx alerts
  if (d.pgx_alerts.length) {
    if (cursor > H - 60) { doc.addPage(); cursor = 18; }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...C_DARK);
    doc.text("Pharmacogenomic Alerts (India-calibrated)", 14, cursor);
    cursor += 4;
    for (const a of d.pgx_alerts) {
      if (cursor > H - 30) { doc.addPage(); cursor = 18; }
      const ac = PGX_COLOR[a.status] || C_AMBER;
      doc.setFillColor(...ac);
      doc.rect(14, cursor, 2, 24, "F");
      doc.setTextColor(...C_DARK);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text(`${a.gene}${a.variant ? "  " + a.variant : ""}`, 20, cursor + 6);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(...ac);
      doc.text(a.status.toUpperCase().replace(/_/g, " "), W - 20, cursor + 6, { align: "right" });
      doc.setTextColor(...C_DARK);
      doc.text(`Drug: ${a.drug_affected}`, 20, cursor + 12);
      doc.setTextColor(...C_GREY);
      const aWrap = doc.splitTextToSize(a.action, W - 40) as string[];
      doc.text(aWrap.slice(0, 2), 20, cursor + 18);
      doc.setFont("helvetica", "italic");
      doc.setFontSize(8);
      doc.text(a.population_risk, 20, cursor + 24);
      doc.setFont("helvetica", "normal");
      cursor += 30;
    }
    cursor += 2;
  }

  // KG path
  if (cursor > H - 50) { doc.addPage(); cursor = 18; }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...C_DARK);
  doc.text("Knowledge Graph Multi-hop Path", 14, cursor);
  cursor += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(...C_CYAN);
  doc.text(d.knowledge_graph.path.join("  →  "), 14, cursor);
  cursor += 8;

  // Indian trials
  if (d.knowledge_graph.indian_trials.length) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.setTextColor(...C_DARK);
    doc.text("Active Indian Clinical Trials", 14, cursor);
    cursor += 4;
    autoTable(doc, {
      startY: cursor,
      head: [["NCT/CTRI", "Drug", "Title", "Phase", "Status"]],
      body: d.knowledge_graph.indian_trials.map(t => [
        t.ctri_id ?? "—", t.drug ?? "—",
        (t.title || "").slice(0, 70), t.phase ?? "—", t.status ?? "—",
      ]),
      theme: "grid",
      styles: { fontSize: 8, cellPadding: 2, textColor: [...C_DARK] },
      headStyles: { fillColor: [...C_LIGHT], textColor: [...C_DARK], fontStyle: "bold" },
      columnStyles: { 0: { cellWidth: 30, fontStyle: "bold" }, 2: { cellWidth: 70 } },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    cursor = ((doc as any).lastAutoTable?.finalY ?? cursor) + 4;
  }

  // Citations
  if (cursor > H - 40) { doc.addPage(); cursor = 18; }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...C_DARK);
  doc.text("Evidence Citations", 14, cursor);
  cursor += 4;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...C_GREY);
  for (const cit of d.evidence_citations) {
    const wrap = doc.splitTextToSize(`• ${cit}`, W - 28) as string[];
    doc.text(wrap, 14, cursor);
    cursor += wrap.length * 4 + 1;
  }

  // Disclaimer + classifier version footer
  doc.setFont("helvetica", "italic");
  doc.setFontSize(8);
  doc.setTextColor(...C_RED);
  const disc =
    "Decision support only. Does not replace clinician judgment. Classifier: " + d.classifier_version + ". " +
    "v1 roadmap: scGPT fine-tuned on PedSCAtlas (Mumme 2025, 540K cells) for direct scRNA-seq classification. " +
    "Always confirm against pathologist diagnosis and institutional protocol before clinical action.";
  const discWrap = doc.splitTextToSize(disc, W - 28) as string[];
  doc.text(discWrap, 14, H - 18);

  // Footer band
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.setDrawColor(...C_LIGHT);
    doc.line(14, H - 10, W - 14, H - 10);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...C_GREY);
    doc.text("PetriDish · BlastProfiler · Pediatric leukemia clinical report", 14, H - 5);
    doc.text(`Page ${p} of ${total}`, W - 14, H - 5, { align: "right" });
  }

  const safe = (d.blast_subtype.subtype ?? d.blast_subtype.label).replace(/[^a-zA-Z0-9]+/g, "_").slice(0, 30);
  doc.save(`petridish_blastprofiler_${safe}_${Date.now()}.pdf`);
}
