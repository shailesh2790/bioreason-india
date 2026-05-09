import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// ── Dossier shape (mirrors FastAPI DossierResponse) ────────────────────────
export interface DossierResponse {
  compound: string;
  applicant_firm?: string | null;
  claimed_indication?: string | null;
  dose?: string | null;
  generated_at_iso: string;
  identity: {
    compound_name: string;
    sanskrit_name?: string | null;
    botanical_source?: string | null;
    family?: string | null;
    plant_part?: string | null;
    marker_compound?: string | null;
    cas_number?: string | null;
    molecular_formula?: string | null;
    molecular_weight?: string | null;
    imppat_id?: string | null;
  };
  molecular_targets: Array<{
    gene_symbol: string;
    source: string;
    evidence_level: string;
    associated_diseases: string[];
  }>;
  pathways: Array<{ name: string; source: string; related_genes: string[] }>;
  disease_associations: Array<{
    disease: string;
    mechanism_path: string;
    evidence_strength: string;
  }>;
  traditional_use_alignment: Array<{
    traditional_use: string;
    modern_indication: string;
    match_strength: string;
  }>;
  pk_metabolism: Array<{ enzyme: string; role: string; source: string }>;
  drug_interactions: Array<{ drug: string; note: string }>;
  safety_signals: Array<{ finding: string; source: string }>;
  data_gaps: Array<{ section: string; description: string }>;
  cdsco_summary: {
    overall_evidence_strength: string;
    targets_with_curated_evidence: number;
    diseases_with_mechanism: number;
    pk_signals: number;
    ddi_signals: number;
    safety_findings: number;
    ready_for_submission: boolean;
    recommended_section_4_text: string;
  };
  cypher_steps: Array<{ step: string; cypher: string }>;
}

// ── Brand colors (light bg PDF) ────────────────────────────────────────────
const C_GREEN: [number, number, number] = [16, 185, 129];
const C_AMBER: [number, number, number] = [245, 158, 11];
const C_DARK: [number, number, number] = [31, 26, 20];
const C_GREY: [number, number, number] = [107, 95, 79];
const C_LIGHT: [number, number, number] = [244, 238, 226];
const C_RED: [number, number, number] = [190, 18, 60];

// ── Helpers ────────────────────────────────────────────────────────────────
function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-IN", {
      day: "2-digit", month: "long", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}

function ensureSpace(doc: jsPDF, needed: number, marginTop = 18): number {
  const pageH = doc.internal.pageSize.getHeight();
  // typeof lastAutoTable narrowed via any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lat = (doc as any).lastAutoTable;
  const cursor = (lat?.finalY ?? marginTop) + 6;
  if (cursor + needed > pageH - 14) {
    doc.addPage();
    return marginTop;
  }
  return cursor;
}

function sectionHeader(doc: jsPDF, num: string, title: string) {
  const y = ensureSpace(doc, 18);
  doc.setFillColor(...C_GREEN);
  doc.rect(14, y - 4, 4, 8, "F");
  doc.setTextColor(...C_DARK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(`Section ${num}`, 22, y);
  doc.setFontSize(13);
  doc.text(title, 22, y + 6);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (doc as any).lastAutoTable = { finalY: y + 8 };
}

function paragraph(doc: jsPDF, text: string, marginX = 14) {
  const W = doc.internal.pageSize.getWidth();
  const wrap = doc.splitTextToSize(text, W - 2 * marginX) as string[];
  const needed = wrap.length * 5.2 + 4;
  const y = ensureSpace(doc, needed);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...C_DARK);
  doc.text(wrap, marginX, y);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (doc as any).lastAutoTable = { finalY: y + wrap.length * 5.2 };
}

function pageFooter(doc: jsPDF) {
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.setDrawColor(...C_LIGHT);
    doc.line(14, H - 12, W - 14, H - 12);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...C_GREY);
    doc.text(
      "PetriDish · Phytopharmaceutical Dossier · CDSCO Form 44 · GSR 918E aligned",
      14,
      H - 6,
    );
    doc.text(`Page ${p} of ${total}`, W - 14, H - 6, { align: "right" });
  }
}

// ── Cover page ─────────────────────────────────────────────────────────────
function coverPage(doc: jsPDF, d: DossierResponse) {
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();

  // Header band
  doc.setFillColor(...C_DARK);
  doc.rect(0, 0, W, 28, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("PetriDish", 14, 18);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(180, 200, 195);
  doc.text("India's Biomedical Intelligence Platform", 14, 24);

  // Document title
  doc.setTextColor(...C_DARK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text("Phytopharmaceutical", 14, 60);
  doc.text("Drug Submission Dossier", 14, 70);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(...C_GREY);
  doc.text("CDSCO Form 44 (modified for phytopharma) · GSR 918E aligned", 14, 78);

  // Compound block
  const compoundY = 100;
  doc.setDrawColor(...C_GREEN);
  doc.setLineWidth(0.6);
  doc.line(14, compoundY - 6, W - 14, compoundY - 6);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(28);
  doc.setTextColor(...C_DARK);
  doc.text(d.compound, 14, compoundY + 6);

  if (d.identity.sanskrit_name) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(13);
    doc.setTextColor(...C_AMBER);
    doc.text(`Sanskrit: ${d.identity.sanskrit_name}`, 14, compoundY + 14);
  }

  if (d.identity.botanical_source) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(...C_GREY);
    doc.text(
      `Botanical: ${d.identity.botanical_source}${d.identity.family ? "  ·  " + d.identity.family : ""}`,
      14,
      compoundY + 22,
    );
  }

  // Submission metadata table
  const metaRows: string[][] = [];
  if (d.applicant_firm) metaRows.push(["Applicant Firm", d.applicant_firm]);
  if (d.claimed_indication) metaRows.push(["Claimed Indication", d.claimed_indication]);
  if (d.dose) metaRows.push(["Dose / Regimen", d.dose]);
  metaRows.push(["Compound Identity", d.compound + (d.identity.imppat_id ? `  (${d.identity.imppat_id})` : "")]);
  metaRows.push(["Generated", fmtDate(d.generated_at_iso)]);

  autoTable(doc, {
    startY: compoundY + 36,
    head: [["Submission Metadata", ""]],
    body: metaRows,
    theme: "plain",
    styles: { fontSize: 10, cellPadding: 4, textColor: [...C_DARK] },
    headStyles: { fillColor: [...C_LIGHT], textColor: [...C_DARK], fontStyle: "bold" },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 55, textColor: [...C_GREY] }, 1: { cellWidth: "auto" } },
  });

  // CDSCO summary callout
  const summaryY = H - 90;
  doc.setFillColor(...C_LIGHT);
  doc.roundedRect(14, summaryY, W - 28, 56, 3, 3, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...C_DARK);
  doc.text("Computational Evidence Summary", 20, summaryY + 8);

  const cs = d.cdsco_summary;
  const strengthColor: [number, number, number] =
    cs.overall_evidence_strength === "HIGH" ? C_GREEN
    : cs.overall_evidence_strength === "MODERATE" ? C_AMBER
    : C_RED;
  doc.setFontSize(9);
  doc.setTextColor(...C_GREY);
  doc.text("Overall Evidence", 20, summaryY + 18);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(...strengthColor);
  doc.text(cs.overall_evidence_strength, 20, summaryY + 26);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...C_GREY);
  const stat = (label: string, n: number, x: number) => {
    doc.text(label, x, summaryY + 18);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(...C_DARK);
    doc.text(String(n), x, summaryY + 26);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...C_GREY);
  };
  stat("Curated Targets", cs.targets_with_curated_evidence, 65);
  stat("Disease Links", cs.diseases_with_mechanism, 100);
  stat("PK Signals", cs.pk_signals, 130);
  stat("DDI Flags", cs.ddi_signals, 155);
  stat("Safety Findings", cs.safety_findings, 180);

  doc.setFont("helvetica", "italic");
  doc.setFontSize(8.5);
  doc.setTextColor(...C_GREY);
  doc.text(
    cs.ready_for_submission
      ? "✓ Ready for inclusion in CDSCO submission. Pharmacy QC + clinical efficacy data must accompany."
      : "⚠ Below regulatory threshold. Expand curated mechanism evidence before submission.",
    20,
    summaryY + 44,
  );
  doc.text(
    "Per-edge provenance and Cypher audit queries appended at the end of this document.",
    20,
    summaryY + 50,
  );
}

// ── Section renderers ──────────────────────────────────────────────────────
function s1Identity(doc: jsPDF, d: DossierResponse) {
  doc.addPage();
  sectionHeader(doc, "1", "Identity & Botanical Source");
  const i = d.identity;
  const rows: string[][] = [
    ["Compound name", i.compound_name],
    ["Sanskrit name", i.sanskrit_name ?? "—"],
    ["Botanical source", i.botanical_source ?? "—"],
    ["Family", i.family ?? "—"],
    ["Plant part used", i.plant_part ?? "—"],
    ["Marker compound", i.marker_compound ?? "—"],
    ["CAS number", i.cas_number ?? "—"],
    ["Molecular formula", i.molecular_formula ?? "—"],
    ["Molecular weight (g/mol)", i.molecular_weight ?? "—"],
    ["IMPPAT identifier", i.imppat_id ?? "—"],
  ];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const startY = ((doc as any).lastAutoTable?.finalY ?? 30) + 4;
  autoTable(doc, {
    startY,
    body: rows,
    theme: "grid",
    styles: { fontSize: 10, cellPadding: 3.5, textColor: [...C_DARK] },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 60, textColor: [...C_GREY] } },
  });
}

function s2QC(doc: jsPDF) {
  sectionHeader(doc, "2", "Quality Control & Standardisation");
  paragraph(
    doc,
    "Pharmacy quality-control data — HPLC/HPTLC fingerprint, marker assay, heavy-metals (Pb, As, Hg, Cd) per IP/USP limits, microbial limits, residual solvents, and stability data — are out of scope of this computational evidence dossier and must be supplied by the applicant pharmacy per CDSCO Schedule Y modified for phytopharmaceuticals (GSR 918E, 2015).",
  );
}

function s3Targets(doc: jsPDF, d: DossierResponse) {
  sectionHeader(doc, "3", "Molecular Targets");
  if (d.molecular_targets.length === 0) {
    paragraph(doc, "No curated molecular target edges available for this compound.");
    return;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const startY = ((doc as any).lastAutoTable?.finalY ?? 30) + 4;
  autoTable(doc, {
    startY,
    head: [["Gene Symbol", "Source", "Evidence", "Associated Diseases (graph-derived)"]],
    body: d.molecular_targets.map((t) => [
      t.gene_symbol,
      t.source,
      t.evidence_level,
      t.associated_diseases.slice(0, 3).join("; ") || "—",
    ]),
    theme: "striped",
    styles: { fontSize: 9, cellPadding: 3, textColor: [...C_DARK] },
    headStyles: { fillColor: [...C_DARK], textColor: [255, 255, 255], fontStyle: "bold" },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 26 }, 1: { cellWidth: 30 }, 2: { cellWidth: 36 } },
  });
}

function s4Mechanism(doc: jsPDF, d: DossierResponse) {
  sectionHeader(doc, "4", "Mechanism of Action — Recommended Form 44 Text");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cursor = ((doc as any).lastAutoTable?.finalY ?? 30) + 4;
  const W = doc.internal.pageSize.getWidth();

  // Quote block
  doc.setFillColor(248, 244, 234);
  const text = d.cdsco_summary.recommended_section_4_text;
  const wrap = doc.splitTextToSize(text, W - 36) as string[];
  const blockH = wrap.length * 5.2 + 10;
  doc.roundedRect(14, cursor, W - 28, blockH, 2, 2, "F");
  doc.setDrawColor(...C_AMBER);
  doc.setLineWidth(1.2);
  doc.line(16, cursor + 2, 16, cursor + blockH - 2);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...C_DARK);
  doc.text(wrap, 22, cursor + 7);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (doc as any).lastAutoTable = { finalY: cursor + blockH };

  if (d.pathways.length > 0) {
    paragraph(doc, "Biological pathways enriched among the named targets:");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pwY = ((doc as any).lastAutoTable?.finalY ?? 30) + 2;
    autoTable(doc, {
      startY: pwY,
      head: [["Pathway", "Source", "Related Genes (in graph)"]],
      body: d.pathways.map((p) => [p.name, p.source, p.related_genes.slice(0, 5).join(", ") || "—"]),
      theme: "grid",
      styles: { fontSize: 9, cellPadding: 3, textColor: [...C_DARK] },
      headStyles: { fillColor: [...C_LIGHT], textColor: [...C_DARK], fontStyle: "bold" },
    });
  }
}

function s5Diseases(doc: jsPDF, d: DossierResponse) {
  sectionHeader(doc, "5", "Disease Associations");
  if (d.disease_associations.length === 0) {
    paragraph(doc, "No graph-validated disease associations found for this compound.");
    return;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const startY = ((doc as any).lastAutoTable?.finalY ?? 30) + 4;
  autoTable(doc, {
    startY,
    head: [["Disease", "Mechanism Path", "Strength"]],
    body: d.disease_associations.map((da) => [da.disease, da.mechanism_path, da.evidence_strength]),
    theme: "striped",
    styles: { fontSize: 9, cellPadding: 3, textColor: [...C_DARK] },
    headStyles: { fillColor: [...C_DARK], textColor: [255, 255, 255], fontStyle: "bold" },
    columnStyles: { 2: { cellWidth: 24, halign: "center", fontStyle: "bold" } },
  });
}

function s6Traditional(doc: jsPDF, d: DossierResponse) {
  sectionHeader(doc, "6", "Traditional Use ↔ Modern Indication Cross-Reference");
  if (d.traditional_use_alignment.length === 0) {
    paragraph(doc, "No traditional-use alignment recorded.");
    return;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const startY = ((doc as any).lastAutoTable?.finalY ?? 30) + 4;
  autoTable(doc, {
    startY,
    head: [["Traditional Use (IMPPAT)", "Modern Indication", "Match"]],
    body: d.traditional_use_alignment.map((t) => [t.traditional_use, t.modern_indication, t.match_strength]),
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 3, textColor: [...C_DARK] },
    headStyles: { fillColor: [...C_LIGHT], textColor: [...C_DARK], fontStyle: "bold" },
    columnStyles: { 2: { cellWidth: 22, halign: "center", fontStyle: "bold" } },
  });
}

function s7PK(doc: jsPDF, d: DossierResponse) {
  sectionHeader(doc, "7", "Pharmacokinetics — CYP / Drug-Metabolism");
  if (d.pk_metabolism.length === 0) {
    paragraph(
      doc,
      "No CYP-mediated metabolism edges curated. Applicant must supply human PK or in-vitro hepatocyte study data.",
    );
    return;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const startY = ((doc as any).lastAutoTable?.finalY ?? 30) + 4;
  autoTable(doc, {
    startY,
    head: [["Enzyme", "Role", "Source"]],
    body: d.pk_metabolism.map((pk) => [pk.enzyme, pk.role, pk.source]),
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 3, textColor: [...C_DARK] },
    headStyles: { fillColor: [...C_LIGHT], textColor: [...C_DARK], fontStyle: "bold" },
  });
}

function s8DDI(doc: jsPDF, d: DossierResponse) {
  sectionHeader(doc, "8", "Drug-Drug Interactions");
  if (d.drug_interactions.length === 0) {
    paragraph(doc, "No drug-drug interaction signals curated.");
    return;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const startY = ((doc as any).lastAutoTable?.finalY ?? 30) + 4;
  autoTable(doc, {
    startY,
    head: [["Concomitant Drug", "Clinical Note"]],
    body: d.drug_interactions.map((d) => [d.drug, d.note]),
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 3, textColor: [...C_DARK] },
    headStyles: { fillColor: [...C_LIGHT], textColor: [...C_DARK], fontStyle: "bold" },
    columnStyles: { 0: { cellWidth: 45, fontStyle: "bold" } },
  });
}

function s9Safety(doc: jsPDF, d: DossierResponse) {
  sectionHeader(doc, "9", "Safety Signals");
  if (d.safety_signals.length === 0) {
    paragraph(doc, "No curated safety signals.");
    return;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const startY = ((doc as any).lastAutoTable?.finalY ?? 30) + 4;
  autoTable(doc, {
    startY,
    head: [["Finding", "Source"]],
    body: d.safety_signals.map((s) => [s.finding, s.source]),
    theme: "striped",
    styles: { fontSize: 9, cellPadding: 3, textColor: [...C_DARK] },
    headStyles: { fillColor: [...C_RED], textColor: [255, 255, 255], fontStyle: "bold" },
  });
}

function s10Gaps(doc: jsPDF, d: DossierResponse) {
  sectionHeader(doc, "10", "Data Gaps — Applicant Must Supply");
  if (d.data_gaps.length === 0) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const startY = ((doc as any).lastAutoTable?.finalY ?? 30) + 4;
  autoTable(doc, {
    startY,
    head: [["Section", "What's missing"]],
    body: d.data_gaps.map((g) => [g.section, g.description]),
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 3.5, textColor: [...C_DARK] },
    headStyles: { fillColor: [...C_AMBER], textColor: [...C_DARK], fontStyle: "bold" },
    columnStyles: { 0: { cellWidth: 45, fontStyle: "bold", textColor: [...C_DARK] } },
  });
}

function appendix(doc: jsPDF, d: DossierResponse) {
  doc.addPage();
  sectionHeader(doc, "A", "Appendix — Cypher Audit Trail");
  paragraph(
    doc,
    "Each evidence query above is reproducible against PetriDish's PrimeKG + IMPPAT + IndiGen Neo4j knowledge graph. The exact queries used to populate this dossier follow.",
  );
  d.cypher_steps.forEach((step, i) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cursor = ((doc as any).lastAutoTable?.finalY ?? 30) + 6;
    const W = doc.internal.pageSize.getWidth();
    const y = ensureSpace(doc, 30);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...C_DARK);
    doc.text(`A.${i + 1}  ${step.step}`, 14, y);
    const wrap = doc.splitTextToSize(step.cypher, W - 36) as string[];
    const blockH = wrap.length * 4.2 + 6;
    doc.setFillColor(245, 245, 240);
    doc.rect(14, y + 3, W - 28, blockH, "F");
    doc.setFont("courier", "normal");
    doc.setFontSize(8);
    doc.setTextColor(60, 60, 60);
    doc.text(wrap, 18, y + 8);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (doc as any).lastAutoTable = { finalY: y + 3 + blockH };
    void cursor;
  });
}

// ── Public API ─────────────────────────────────────────────────────────────
export async function exportDossierPdf(d: DossierResponse) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  coverPage(doc, d);
  s1Identity(doc, d);
  s2QC(doc);
  s3Targets(doc, d);
  s4Mechanism(doc, d);
  s5Diseases(doc, d);
  s6Traditional(doc, d);
  s7PK(doc, d);
  s8DDI(doc, d);
  s9Safety(doc, d);
  s10Gaps(doc, d);
  appendix(doc, d);
  pageFooter(doc);

  const safe = d.compound.replace(/\s+/g, "_").slice(0, 30);
  const stamp = Date.now();
  doc.save(`petridish_dossier_${safe}_${stamp}.pdf`);
}
