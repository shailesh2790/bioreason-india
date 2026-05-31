import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
const FASTAPI_URL = process.env.FASTAPI_URL ?? "http://localhost:8000";

export async function GET(_req: NextRequest) {
  try {
    const upstream = await fetch(`${FASTAPI_URL}/epionco/signatures`, { cache: "no-store" });
    return NextResponse.json(await upstream.json(), { status: upstream.status });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown" }, { status: 503 });
  }
}
