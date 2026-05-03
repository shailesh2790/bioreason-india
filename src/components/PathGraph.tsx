"use client";

export interface PathNode {
  id: string;
  name: string;
  labels?: string[];
}

export interface PathEdge {
  type: string;
  source?: string;
}

export interface PathData {
  nodes: PathNode[];
  edges: PathEdge[];
  confidence: string;
  description: string;
}

const TYPE_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  Drug:              { bg: "#4ade8018", border: "#4ade80", text: "#4ade80" },
  Disease:           { bg: "#f8717118", border: "#f87171", text: "#f87171" },
  Gene:              { bg: "#60a5fa18", border: "#60a5fa", text: "#60a5fa" },
  Pathway:           { bg: "#c084fc18", border: "#c084fc", text: "#c084fc" },
  Phytochemical:     { bg: "#fb923c18", border: "#fb923c", text: "#fb923c" },
  Phenotype:         { bg: "#fbbf2418", border: "#fbbf24", text: "#fbbf24" },
  Anatomy:           { bg: "#34d39918", border: "#34d399", text: "#34d399" },
  BiologicalProcess: { bg: "#a78bfa18", border: "#a78bfa", text: "#a78bfa" },
  Variant:           { bg: "#f472b618", border: "#f472b6", text: "#f472b6" },
  MolecularFunction: { bg: "#22d3ee18", border: "#22d3ee", text: "#22d3ee" },
};

const DEFAULT_COLOR = { bg: "#94a3b818", border: "#94a3b8", text: "#94a3b8" };

const CONFIDENCE_DOT: Record<string, string> = {
  HIGH:   "var(--green)",
  MEDIUM: "var(--amber)",
  LOW:    "#fb923c",
};

const NODE_W = 124;
const NODE_H = 56;
const PAD = 12;

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function wrapText(s: string, maxChars: number): [string, string] {
  if (s.length <= maxChars) return [s, ""];
  const idx = s.lastIndexOf(" ", maxChars);
  return idx > 0 ? [s.slice(0, idx), s.slice(idx + 1)] : [s.slice(0, maxChars), s.slice(maxChars)];
}

export default function PathGraph({ path }: { path: PathData }) {
  const { nodes, edges, confidence } = path;
  if (!nodes || nodes.length === 0) return null;

  // Adaptive edge width: shrink for many nodes so graph fits in ~800px
  const maxEdgeW = nodes.length <= 3 ? 88 : nodes.length <= 5 ? 72 : 56;
  const totalW = nodes.length * NODE_W + Math.max(0, nodes.length - 1) * maxEdgeW + PAD * 2;
  const svgH = NODE_H + 52;
  const nodeY = 28;

  return (
    <div className="overflow-x-auto py-1">
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: CONFIDENCE_DOT[confidence] ?? "var(--text-3)", flexShrink: 0, display: "inline-block" }} />
        <span style={{ fontSize: 11, color: "var(--text-3)", fontFamily: "monospace" }}>{confidence} confidence</span>
        <span style={{ fontSize: 11, color: "var(--text-3)" }}>· {nodes.length} nodes · {edges.length} edges</span>
      </div>

      <svg width={totalW} height={svgH} className="overflow-visible">
        <defs>
          <marker id={`arr-${confidence}`} markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M0,0.5 L0,5.5 L6,3 z" fill="#4b5563" />
          </marker>
        </defs>

        {/* Edges (arrows + relation label) */}
        {edges.map((edge, i) => {
          if (i >= nodes.length - 1) return null;
          const x1 = PAD + i * (NODE_W + maxEdgeW) + NODE_W;
          const x2 = PAD + (i + 1) * (NODE_W + maxEdgeW);
          const midX = (x1 + x2) / 2;
          const midY = nodeY + NODE_H / 2;
          const label = edge.type.replace(/_/g, " ");

          return (
            <g key={i}>
              <line
                x1={x1 + 2} y1={midY}
                x2={x2 - 5} y2={midY}
                stroke="#374151" strokeWidth={1.5}
                markerEnd={`url(#arr-${confidence})`}
              />
              <rect
                x={midX - 26} y={midY - 17}
                width={52} height={13}
                rx={3} fill="#111827"
              />
              <text
                x={midX} y={midY - 7}
                textAnchor="middle"
                fill="#16a34a"
                fontSize={8}
                fontFamily="monospace"
              >
                {truncate(label, 14)}
              </text>
            </g>
          );
        })}

        {/* Nodes */}
        {nodes.map((node, i) => {
          const x = PAD + i * (NODE_W + maxEdgeW);
          const label = node.labels?.[0] ?? "Unknown";
          const colors = TYPE_COLORS[label] ?? DEFAULT_COLOR;
          const [line1, line2raw] = wrapText(node.name, 14);
          const line2 = truncate(line2raw, 13);

          return (
            <g key={i} transform={`translate(${x}, ${nodeY})`}>
              <rect
                width={NODE_W} height={NODE_H} rx={8}
                fill={colors.bg} stroke={colors.border} strokeWidth={1.5}
              />
              {/* Type label */}
              <text
                x={NODE_W / 2} y={13}
                textAnchor="middle"
                fill={colors.text}
                fontSize={7.5}
                fontFamily="monospace"
                letterSpacing="0.1em"
              >
                {label.toUpperCase()}
              </text>
              {/* Divider */}
              <line x1={8} y1={18} x2={NODE_W - 8} y2={18} stroke={colors.border} strokeWidth={0.5} opacity={0.3} />
              {/* Name — up to 2 lines */}
              <text
                x={NODE_W / 2} y={line2 ? 32 : 37}
                textAnchor="middle"
                fill="#e2e8f0"
                fontSize={10.5}
                fontWeight="500"
              >
                {line1}
              </text>
              {line2 && (
                <text
                  x={NODE_W / 2} y={45}
                  textAnchor="middle"
                  fill="#cbd5e1"
                  fontSize={10.5}
                  fontWeight="500"
                >
                  {line2}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
