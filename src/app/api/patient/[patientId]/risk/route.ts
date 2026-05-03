import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const FASTAPI_URL = process.env.FASTAPI_URL ?? "http://localhost:8000";

export async function GET(_: NextRequest, { params }: { params: { patientId: string } }) {
  const upstream = await fetch(`${FASTAPI_URL}/patient/${params.patientId}/risk`, {
    cache: "no-store",
    headers: { "bypass-tunnel-reminder": "true" },
  });
  const text = await upstream.text();
  try {
    return NextResponse.json(JSON.parse(text), { status: upstream.status });
  } catch {
    return NextResponse.json({ error: "Backend offline" }, { status: 503 });
  }
}
