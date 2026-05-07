"use client";

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface PathNode { id: string; name: string; labels?: string[] }
interface PathEdge { type: string; source?: string }
interface PathData { nodes: PathNode[]; edges: PathEdge[]; confidence: string; description: string }

interface ReportData {
  title: string;
  subtitle: string;
  query: string;
  answer: string;
  paths: PathData[];
  cypher_steps: { step: string; cypher: string }[];
  module: "repurpose" | "validate" | "pharmacogenomics" | "query";
  subject: string;
}

const ACCENT: Record<string, [number, number, number]> = {
  repurpose:         [59, 130, 246],
  validate:          [249, 115, 22],
  pharmacogenomics:  [168, 85, 247],
  query:             [74, 222, 128],
};

function pageHeader(doc: jsPDF, title: string, subtitle: string, color: [number, number, number]) {
  const W = doc.internal.pageSize.getWidth();

  // Dark header band
  doc.setFillColor(10, 10, 15);
  doc.rect(0, 0, W, 28, "F");

  // Accent bar
  doc.setFillColor(...color);
  doc.rect(0, 28, W, 2.5, "F");

  // Logo
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(255, 255, 255);
  doc.text("Bio", 12, 18);
  doc.setTextColor(...color);
  doc.text("Reason", 26, 18);

  // Title
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(160, 160, 160);
  doc.text(title.toUpperCase(), W - 12, 13, { align: "right" });
  doc.text(subtitle, W - 12, 20, { align: "right" });
}

function sectionLabel(doc: jsPDF, text: string, y: number, color: [number, number, number]) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...color);
  doc.text(text.toUpperCase(), 12, y);
  doc.setDrawColor(...color);
  doc.setLineWidth(0.4);
  doc.line(12, y + 1.5, 200, y + 1.5);
}

export async function exportReportPdf(data: ReportData) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const color = ACCENT[data.module];
  const today = new Date().toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" });

  // ── Page 1 header ──────────────────────────────────────────────
  pageHeader(doc, "Mechanism Report", today, color);

  let y = 38;

  // Subject card
  doc.setFillColor(20, 20, 28);
  doc.roundedRect(12, y, W - 24, 22, 3, 3, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(255, 255, 255);
  doc.text(data.subject, 18, y + 10);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 130);
  doc.text(data.query.length > 110 ? data.query.slice(0, 107) + "…" : data.query, 18, y + 17);
  y += 28;

  // Data sources badge row
  const sources = ["PrimeKG", "IMPPAT 2.0", "IndiGen", "DrugBank", "UniProt", "Reactome", "PharmGKB"];
  doc.setFontSize(7);
  let bx = 12;
  for (const src of sources) {
    const w = doc.getTextWidth(src) + 6;
    doc.setFillColor(30, 30, 40);
    doc.setDrawColor(...color);
    doc.setLineWidth(0.3);
    doc.roundedRect(bx, y, w, 5.5, 1, 1, "FD");
    doc.setTextColor(...color);
    doc.text(src, bx + 3, y + 3.8);
    bx += w + 2;
  }
  y += 11;

  // Analysis section
  sectionLabel(doc, "Analysis", y, color);
  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(50, 50, 60);

  const lines = doc.splitTextToSize(data.answer, W - 24) as string[];
  const maxLines = 38;
  const rendered = lines.slice(0, maxLines);
  doc.text(rendered, 12, y);
  y += rendered.length * 4.2 + 6;

  if (lines.length > maxLines) {
    doc.setFontSize(7.5);
    doc.setTextColor(130, 130, 140);
    doc.text(`[${lines.length - maxLines} more lines — see full analysis in platform]`, 12, y);
    y += 6;
  }

  // ── Paths table ─────────────────────────────────────────────────
  if (data.paths.length > 0) {
    if (y > 220) { doc.addPage(); pageHeader(doc, "Mechanism Report", today, color); y = 38; }

    sectionLabel(doc, `Mechanistic Evidence Paths (${data.paths.length})`, y, color);
    y += 4;

    const rows = data.paths.slice(0, 12).map((path, i) => {
      const chain = path.nodes.map((n, ni) => {
        const edge = path.edges[ni];
        return edge ? `${n.name} →[${edge.type}]→` : n.name;
      }).join(" ");
      return [`${i + 1}`, path.confidence, path.description.slice(0, 80), chain.slice(0, 120)];
    });

    autoTable(doc, {
      startY: y,
      head: [["#", "Conf.", "Step", "Path"]],
      body: rows,
      styles: { fontSize: 7, cellPadding: 2.5 },
      headStyles: { fillColor: color, textColor: 255, fontStyle: "bold", fontSize: 7 },
      columnStyles: { 0: { cellWidth: 8 }, 1: { cellWidth: 14 }, 2: { cellWidth: 55 }, 3: { cellWidth: 110 } },
      alternateRowStyles: { fillColor: [248, 248, 252] },
      margin: { left: 12, right: 12 },
    });

    y = (doc as any).lastAutoTable.finalY + 8;
  }

  // ── Cypher steps table ──────────────────────────────────────────
  if (data.cypher_steps.length > 0) {
    if (y > 230) { doc.addPage(); pageHeader(doc, "Mechanism Report", today, color); y = 38; }

    sectionLabel(doc, `Graph Query Steps (${data.cypher_steps.length})`, y, color);
    y += 4;

    autoTable(doc, {
      startY: y,
      head: [["Step", "Description", "Cypher Query"]],
      body: data.cypher_steps.map((s, i) => [
        `${i + 1}`,
        s.step.slice(0, 60),
        s.cypher.replace(/\s+/g, " ").slice(0, 150),
      ]),
      styles: { fontSize: 6.5, cellPadding: 2, font: "courier" },
      headStyles: { fillColor: [30, 30, 40], textColor: 200, fontSize: 7, font: "helvetica" },
      columnStyles: { 0: { cellWidth: 10 }, 1: { cellWidth: 60 }, 2: { cellWidth: 117 } },
      margin: { left: 12, right: 12 },
    });

    y = (doc as any).lastAutoTable.finalY + 8;
  }

  // ── Footer on all pages ─────────────────────────────────────────
  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    const H = doc.internal.pageSize.getHeight();
    doc.setFillColor(10, 10, 15);
    doc.rect(0, H - 10, W, 10, "F");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(80, 80, 90);
    doc.text("PetriDish · India-extended Biomedical Knowledge Graph · PrimeKG + IMPPAT + IndiGen", 12, H - 4);
    doc.text(`Page ${p} of ${pageCount}`, W - 12, H - 4, { align: "right" });
  }

  const filename = `petridish_${data.module}_${data.subject.replace(/\s+/g, "_").slice(0, 30)}_${Date.now()}.pdf`;
  doc.save(filename);
}
