"use client";

import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";

export interface GraphNode {
  id: string;
  name: string;
  label: string;
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
}

export interface GraphEdge {
  source: string | GraphNode;
  target: string | GraphNode;
  type: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

const TYPE_COLOR: Record<string, string> = {
  Drug:              "#4ade80",
  Disease:           "#f87171",
  Gene:              "#60a5fa",
  Pathway:           "#c084fc",
  Phytochemical:     "#fb923c",
  Phenotype:         "#fbbf24",
  Anatomy:           "#34d399",
  BiologicalProcess: "#a78bfa",
  Variant:           "#f472b6",
  MolecularFunction: "#22d3ee",
  default:           "#94a3b8",
};

const NODE_R = 22;

interface Props {
  data: GraphData;
  height?: number;
  onNodeClick?: (node: GraphNode) => void;
}

export default function NetworkGraph({ data, height = 480, onNodeClick }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; node: GraphNode } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    if (!svgRef.current || !data.nodes.length) return;

    const el = svgRef.current;
    const W = el.clientWidth || 800;
    const H = height;

    d3.select(el).selectAll("*").remove();

    const svg = d3.select(el)
      .attr("width", W)
      .attr("height", H);

    // Zoom container
    const g = svg.append("g");
    svg.call(
      d3.zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.2, 4])
        .on("zoom", (event) => g.attr("transform", event.transform))
    );

    // Arrowhead marker
    svg.append("defs").append("marker")
      .attr("id", "arrow")
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", NODE_R + 8)
      .attr("refY", 0)
      .attr("markerWidth", 6)
      .attr("markerHeight", 6)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M0,-5L10,0L0,5")
      .attr("fill", "#374151");

    const nodes: GraphNode[] = data.nodes.map((n) => ({ ...n }));
    const edges: GraphEdge[] = data.edges.map((e) => ({ ...e }));

    const sim = d3.forceSimulation(nodes)
      .force("link", d3.forceLink(edges).id((d: any) => d.id).distance(130).strength(0.6))
      .force("charge", d3.forceManyBody().strength(-400))
      .force("center", d3.forceCenter(W / 2, H / 2))
      .force("collision", d3.forceCollide(NODE_R + 12));

    // Edges
    const link = g.append("g")
      .selectAll("g")
      .data(edges)
      .join("g");

    link.append("line")
      .attr("stroke", "#374151")
      .attr("stroke-width", 1.5)
      .attr("marker-end", "url(#arrow)");

    link.append("text")
      .text((d: any) => d.type.replace(/_/g, " "))
      .attr("text-anchor", "middle")
      .attr("font-size", 8)
      .attr("font-family", "monospace")
      .attr("fill", "#16a34a")
      .attr("dy", -5);

    // Nodes
    const dragBehavior = d3.drag<SVGGElement, GraphNode>()
      .on("start", (event, d) => {
        if (!event.active) sim.alphaTarget(0.3).restart();
        d.fx = d.x; d.fy = d.y;
      })
      .on("drag", (event, d) => { d.fx = event.x; d.fy = event.y; })
      .on("end", (event, d) => {
        if (!event.active) sim.alphaTarget(0);
        d.fx = null; d.fy = null;
      });

    const node = g.append("g")
      .selectAll<SVGGElement, GraphNode>("g")
      .data(nodes)
      .join("g")
      .style("cursor", "pointer")
      .call(dragBehavior as any)
      .on("click", (event, d) => {
        setSelected(d.id);
        setTooltip(null);
        onNodeClick?.(d);
      })
      .on("mouseenter", (event, d) => {
        const rect = el.getBoundingClientRect();
        setTooltip({ x: event.clientX - rect.left, y: event.clientY - rect.top, node: d });
      })
      .on("mouseleave", () => setTooltip(null));

    node.append("circle")
      .attr("r", NODE_R)
      .attr("fill", (d) => `${TYPE_COLOR[d.label] ?? TYPE_COLOR.default}22`)
      .attr("stroke", (d) => TYPE_COLOR[d.label] ?? TYPE_COLOR.default)
      .attr("stroke-width", (d) => d.id === selected ? 3 : 1.5);

    node.append("text")
      .text((d) => d.label.toUpperCase())
      .attr("text-anchor", "middle")
      .attr("dy", -8)
      .attr("font-size", 6.5)
      .attr("font-family", "monospace")
      .attr("letter-spacing", "0.08em")
      .attr("fill", (d) => TYPE_COLOR[d.label] ?? TYPE_COLOR.default);

    node.append("text")
      .text((d) => d.name.length > 12 ? d.name.slice(0, 11) + "…" : d.name)
      .attr("text-anchor", "middle")
      .attr("dy", 5)
      .attr("font-size", 10)
      .attr("font-weight", "500")
      .attr("fill", "#e2e8f0");

    // Tick
    sim.on("tick", () => {
      link.select("line")
        .attr("x1", (d: any) => d.source.x)
        .attr("y1", (d: any) => d.source.y)
        .attr("x2", (d: any) => d.target.x)
        .attr("y2", (d: any) => d.target.y);

      link.select("text")
        .attr("x", (d: any) => (d.source.x + d.target.x) / 2)
        .attr("y", (d: any) => (d.source.y + d.target.y) / 2);

      node.attr("transform", (d: any) => `translate(${d.x},${d.y})`);
    });

    return () => { sim.stop(); };
  }, [data, height, selected]);

  if (!data.nodes.length) return (
    <div className="flex items-center justify-center h-32 text-gray-600 text-sm">
      No graph data
    </div>
  );

  return (
    <div className="relative w-full rounded-xl overflow-hidden bg-gray-950 border border-gray-800">
      <div className="absolute top-2 right-2 z-10 flex gap-1.5">
        <span className="text-xs text-gray-600 bg-gray-900/80 px-2 py-1 rounded">
          {data.nodes.length} nodes · {data.edges.length} edges · scroll to zoom · drag nodes
        </span>
      </div>

      <svg ref={svgRef} className="w-full" style={{ height }} />

      {tooltip && (
        <div
          className="absolute z-20 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 pointer-events-none"
          style={{ left: tooltip.x + 12, top: tooltip.y - 10 }}
        >
          <div className="text-xs font-mono" style={{ color: TYPE_COLOR[tooltip.node.label] ?? "#94a3b8" }}>
            {tooltip.node.label}
          </div>
          <div className="text-sm font-medium text-gray-100">{tooltip.node.name}</div>
          <div className="text-xs text-gray-500 mt-0.5">{tooltip.node.id}</div>
        </div>
      )}

      {/* Legend */}
      <div className="absolute bottom-2 left-2 flex flex-wrap gap-2">
        {Object.entries(TYPE_COLOR).filter(([k]) => k !== "default").map(([label, color]) => (
          <span key={label} className="text-xs flex items-center gap-1 bg-gray-900/70 px-1.5 py-0.5 rounded">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
            <span style={{ color }} className="font-mono">{label}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
