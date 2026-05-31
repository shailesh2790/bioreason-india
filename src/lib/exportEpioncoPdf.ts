import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export interface TASResponse {
  gene: string | null;
  cancer_type: string;
  population: string;
  tas_global: number;
  tas_india: number;
  delta_tas: number;
  hallmarks_active: string[];
  top_targetable_epifactors: Array<{
    epifactor: string; role: string; mark: string;
    top_drug: string; approved_drugs?: Array<{ drug: string; fda?: string } | string>;
    pmid: string;
  }>;
  immunotherapy_response: string;
  indian_signature_match: {
    signature_id: string;
    pmid: string;
    summary: string;
    key_genes: string[];
    immunotherapy_response: string;
    prognosis: string;
    distinctive_from_tcga: string;
  } | null;
  components: Array<{ layer: string; score: number; weight: number; contributors: string[] }>;
  evidence_citations: string[];
  confidence: number;
  note: string;
  generated_at_iso: string;
}

const C_DARK: [number, number, number] = [31, 26, 20];
const C_GREY: [number, number, number] = [107, 95, 79];
const C_LIGHT:[number, number, number] = [244, 238, 226];
const C_GREEN:[number, number, number] = [16, 185, 129];
const C_AMBER:[number, number, number] = [245, 158, 11];
const C_RED:  [number, number, number] = [190, 18, 60];
const C_PURPLE:[number, number, number] = [109, 40, 217];

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-IN", {
      day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}

export interface EpioncoPdfMeta {
  patient_label?: string; clinician?: string; institution?: string;
}

export async function exportEpioncoPdf(d: TASResponse, meta: EpioncoPdfMeta) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();

  // Header band
  doc.setFillColor(...C_DARK);
  doc.rect(0, 0, W, 28, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("PetriDish · EpiOnco", 14, 17);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(180, 200, 195);
  doc.text("Tumour Ability Brief · Epigenetics + Indian population overlay", 14, 23);

  // Title
  doc.setTextColor(...C_DARK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text(`${d.gene ? d.gene + " · " : ""}${d.cancer_type}`, 14, 44);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(...C_GREY);
  doc.text(`Population: ${d.population} · Confidence: ${(d.confidence * 100).toFixed(0)}% · ${fmtDate(d.generated_at_iso)}`, 14, 51);

  // Submission metadata
  const metaRows: string[][] = [];
  if (meta.patient_label) metaRows.push(["Patient label", meta.patient_label]);
  if (meta.clinician) metaRows.push(["Clinician", meta.clinician]);
  if (meta.institution) metaRows.push(["Institution", meta.institution]);
  if (metaRows.length) {
    autoTable(doc, {
      startY: 58,
      head: [["Submission", ""]],
      body: metaRows,
      theme: "plain",
      styles: { fontSize: 10, cellPadding: 3, textColor: [...C_DARK] },
      headStyles: { fillColor: [...C_LIGHT], textColor: [...C_DARK], fontStyle: "bold" },
      columnStyles: { 0: { fontStyle: "bold", cellWidth: 45, textColor: [...C_GREY] } },
    });
  }

  // TAS callout
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let cursor = ((doc as any).lastAutoTable?.finalY ?? 60) + 4;
  const tasColor = d.delta_tas >= 0.1 ? C_PURPLE : C_AMBER;
  doc.setFillColor(...tasColor);
  doc.roundedRect(14, cursor, W - 28, 30, 3, 3, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Tumour Ability Score (TAS)", 20, cursor + 8);
  doc.setFontSize(22);
  doc.text(`India: ${d.tas_india.toFixed(2)}`, 20, cursor + 20);
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text(`Global (TCGA-trained): ${d.tas_global.toFixed(2)}`, 70, cursor + 20);
  const deltaSign = d.delta_tas >= 0 ? "+" : "";
  doc.setFont("helvetica", "bold");
  doc.text(`Δ India: ${deltaSign}${d.delta_tas.toFixed(2)}`, 140, cursor + 20);
  doc.setFont("helvetica", "italic");
  doc.setFontSize(9);
  doc.text("Delta > 0 = India-specific signature shifts prediction away from global model", 20, cursor + 27);
  cursor += 36;

  // Indian signature callout
  if (d.indian_signature_match) {
    doc.setFillColor(...C_LIGHT);
    doc.roundedRect(14, cursor, W - 28, 32, 2, 2, "F");
    doc.setTextColor(...C_PURPLE);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(`India-specific signature match · ${d.indian_signature_match.signature_id} · PMID:${d.indian_signature_match.pmid}`, 20, cursor + 7);
    doc.setTextColor(...C_DARK);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    const summ = doc.splitTextToSize(d.indian_signature_match.summary, W - 40) as string[];
    doc.text(summ.slice(0, 4), 20, cursor + 13);
    cursor += 38;
  }

  // Components table
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...C_DARK);
  doc.text("Score Components", 14, cursor);
  cursor += 4;
  autoTable(doc, {
    startY: cursor,
    head: [["Layer", "Score", "Weight", "Top contributors"]],
    body: d.components.map(c => [
      c.layer, c.score.toFixed(2), c.weight.toFixed(2), (c.contributors.slice(0, 4).join(", ") || "—"),
    ]),
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 2.5, textColor: [...C_DARK] },
    headStyles: { fillColor: [...C_DARK], textColor: [255, 255, 255], fontStyle: "bold" },
    columnStyles: { 1: { halign: "right", cellWidth: 18 }, 2: { halign: "right", cellWidth: 18 } },
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  cursor = ((doc as any).lastAutoTable?.finalY ?? cursor) + 6;

  // Hallmarks
  if (d.hallmarks_active.length) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(`Hallmarks Active (${d.hallmarks_active.length} of 14)`, 14, cursor);
    cursor += 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(...C_GREY);
    const wrap = doc.splitTextToSize("· " + d.hallmarks_active.join("\n· "), W - 28) as string[];
    doc.text(wrap, 14, cursor);
    cursor += wrap.length * 4.5 + 4;
  }

  // Targetable epifactors
  if (d.top_targetable_epifactors.length) {
    if (cursor > H - 60) { doc.addPage(); cursor = 18; }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...C_DARK);
    doc.text("Druggable Epifactors", 14, cursor);
    cursor += 4;
    autoTable(doc, {
      startY: cursor,
      head: [["Epifactor", "Role", "Mark", "Top drug", "PMID"]],
      body: d.top_targetable_epifactors.map(e => [
        e.epifactor, e.role, e.mark, e.top_drug || "—", e.pmid || "—",
      ]),
      theme: "striped",
      styles: { fontSize: 9, cellPadding: 2.5, textColor: [...C_DARK] },
      headStyles: { fillColor: [...C_LIGHT], textColor: [...C_DARK], fontStyle: "bold" },
      columnStyles: { 0: { fontStyle: "bold" } },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    cursor = ((doc as any).lastAutoTable?.finalY ?? cursor) + 6;
  }

  // Immunotherapy prediction
  if (cursor > H - 60) { doc.addPage(); cursor = 18; }
  const irColor = d.immunotherapy_response.toLowerCase().includes("respons") ? C_GREEN : d.immunotherapy_response.toLowerCase().includes("resistant") ? C_RED : C_AMBER;
  doc.setFillColor(...irColor);
  doc.roundedRect(14, cursor, W - 28, 18, 2, 2, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Predicted immunotherapy response (Indian-population-aware)", 20, cursor + 7);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(d.immunotherapy_response, 20, cursor + 14);
  cursor += 22;

  // Citations
  if (cursor > H - 50) { doc.addPage(); cursor = 18; }
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

  // Disclaimer + footer
  doc.setFont("helvetica", "italic");
  doc.setFontSize(8);
  doc.setTextColor(...C_RED);
  const disc = "Decision support only. Does not replace clinician judgment. EpiOnco v0 — heuristic based on 50 curated epifactors + 3 documented Indian epigenetic studies. " + d.note;
  const discWrap = doc.splitTextToSize(disc, W - 28) as string[];
  doc.text(discWrap, 14, H - 22);

  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.setDrawColor(...C_LIGHT);
    doc.line(14, H - 10, W - 14, H - 10);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...C_GREY);
    doc.text("PetriDish · EpiOnco · Tumour Ability Brief", 14, H - 5);
    doc.text(`Page ${p} of ${total}`, W - 14, H - 5, { align: "right" });
  }

  const safe = (d.gene ? d.gene + "_" : "") + d.cancer_type.replace(/[^a-zA-Z0-9]+/g, "_").slice(0, 25);
  doc.save(`petridish_epionco_${safe}_${Date.now()}.pdf`);
}
