import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const FASTAPI_URL = process.env.FASTAPI_URL ?? "http://localhost:8000";

const FALLBACK = {
  nodes: [],
  edges: [],
  health: { status: "offline", neo4j: "Backend tunnel unreachable", node_count: 0 },
  error: "Backend offline",
};

async function safeJson(res: Response): Promise<any> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    const [statsRes, healthRes] = await Promise.all([
      fetch(`${FASTAPI_URL}/stats`, { cache: "no-store", headers: { "bypass-tunnel-reminder": "true" } }),
      fetch(`${FASTAPI_URL}/health`, { cache: "no-store", headers: { "bypass-tunnel-reminder": "true" } }),
    ]);

    if (!statsRes.ok || !healthRes.ok) {
      return NextResponse.json({ ...FALLBACK, error: `Backend ${statsRes.status}/${healthRes.status}` });
    }

    const stats = await safeJson(statsRes);
    const health = await safeJson(healthRes);

    if (!stats || !health) {
      return NextResponse.json({ ...FALLBACK, error: "Backend returned non-JSON (tunnel issue)" });
    }

    return NextResponse.json({
      nodes: stats.nodes ?? [],
      edges: stats.edges ?? [],
      health,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ...FALLBACK, error: message });
  }
}
