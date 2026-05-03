import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const FASTAPI_URL = process.env.FASTAPI_URL ?? "http://localhost:8000";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim();
  const label = request.nextUrl.searchParams.get("label") ?? "";
  const limit = Math.min(Number(request.nextUrl.searchParams.get("limit") ?? "20"), 50);

  if (!q || q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  const labelFilter = label ? `:${label}` : "";
  const cypher = `
    MATCH (n${labelFilter})
    WHERE toLower(n.name) CONTAINS toLower($term)
    RETURN labels(n)[0] AS label, n.id AS id, n.name AS name, n.source AS source
    ORDER BY
      CASE WHEN toLower(n.name) = toLower($term) THEN 0
           WHEN toLower(n.name) STARTS WITH toLower($term) THEN 1
           ELSE 2 END,
      size(n.name)
    LIMIT ${limit}
  `;

  try {
    const upstream = await fetch(`${FASTAPI_URL}/cypher`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "bypass-tunnel-reminder": "true" },
      body: JSON.stringify({ cypher, params: { term: q } }),
    });

    if (!upstream.ok) {
      return NextResponse.json({ results: [], error: "Search unavailable" });
    }

    const text = await upstream.text();
    try {
      const data = JSON.parse(text);
      return NextResponse.json({ results: data.results ?? [] });
    } catch {
      return NextResponse.json({ results: [], error: "Backend tunnel offline" });
    }
  } catch {
    return NextResponse.json({ results: [], error: "API offline" });
  }
}
