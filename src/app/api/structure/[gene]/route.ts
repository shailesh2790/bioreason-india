import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const FASTAPI_URL = process.env.FASTAPI_URL ?? "http://localhost:8000";

export async function GET(_req: NextRequest, { params }: { params: { gene: string } }) {
  try {
    const upstream = await fetch(`${FASTAPI_URL}/structure/${encodeURIComponent(params.gene)}`, {
      method: "GET",
    });
    const data = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      return NextResponse.json(
        { error: (data as { detail?: string } | null)?.detail ?? `Upstream ${upstream.status}` },
        { status: upstream.status }
      );
    }
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
