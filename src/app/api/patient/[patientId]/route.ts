import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const FASTAPI_URL = process.env.FASTAPI_URL ?? "http://localhost:8000";
const HEADERS = { "Content-Type": "application/json", "bypass-tunnel-reminder": "true" };

async function safeJson(res: Response): Promise<{ data: any; status: number }> {
  const text = await res.text();
  try {
    return { data: JSON.parse(text), status: res.status };
  } catch {
    return {
      data: { error: `Backend returned non-JSON: ${text.slice(0, 80)}` },
      status: 503,
    };
  }
}

export async function GET(_: NextRequest, { params }: { params: { patientId: string } }) {
  const upstream = await fetch(`${FASTAPI_URL}/patient/${params.patientId}`, {
    cache: "no-store",
    headers: HEADERS,
  });
  const { data, status } = await safeJson(upstream);
  return NextResponse.json(data, { status });
}

export async function DELETE(_: NextRequest, { params }: { params: { patientId: string } }) {
  const upstream = await fetch(`${FASTAPI_URL}/patient/${params.patientId}`, {
    method: "DELETE",
    headers: HEADERS,
  });
  const { data, status } = await safeJson(upstream);
  return NextResponse.json(data, { status });
}
