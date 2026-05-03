import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const FASTAPI_URL = process.env.FASTAPI_URL ?? "http://localhost:8000";

export async function POST(request: NextRequest, { params }: { params: { patientId: string } }) {
  const body = await request.json();
  const upstream = await fetch(`${FASTAPI_URL}/patient/${params.patientId}/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "bypass-tunnel-reminder": "true" },
    body: JSON.stringify(body),
  });
  const text = await upstream.text();
  try {
    return NextResponse.json(JSON.parse(text), { status: upstream.status });
  } catch {
    return NextResponse.json(
      { error: `Backend returned non-JSON: ${text.slice(0, 100)}` },
      { status: 503 }
    );
  }
}
