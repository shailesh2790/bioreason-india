import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const FASTAPI_URL = process.env.FASTAPI_URL ?? "http://localhost:8000";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const auth = request.headers.get("authorization");

    const upstream = await fetch(`${FASTAPI_URL}/vision/analyse`, {
      method: "POST",
      headers: { "bypass-tunnel-reminder": "true", ...(auth ? { Authorization: auth } : {}) },
      body: formData,
    });

    const text = await upstream.text();
    let data: any;
    try { data = JSON.parse(text); } catch {
      return NextResponse.json(
        { error: `Backend returned non-JSON (tunnel offline): ${text.slice(0, 100)}` },
        { status: 503 }
      );
    }

    if (!upstream.ok) {
      return NextResponse.json(
        { error: data?.detail ?? `Upstream error ${upstream.status}` },
        { status: upstream.status }
      );
    }

    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
