import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const FASTAPI_URL = process.env.FASTAPI_URL ?? "http://localhost:8000";

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  try {
    const upstream = await fetch(`${FASTAPI_URL}/me/summary`, {
      headers: { ...(auth ? { Authorization: auth } : {}) },
      cache: "no-store",
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
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 503 }
    );
  }
}
