import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const FASTAPI_URL = process.env.FASTAPI_URL ?? "http://localhost:8000";

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  try {
    const auth = request.headers.get("authorization");
    const upstream = await fetch(`${FASTAPI_URL}/validate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "bypass-tunnel-reminder": "true",
        ...(auth ? { Authorization: auth } : {}),
      },
      body: JSON.stringify(body),
    });

    const text = await upstream.text();
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      return NextResponse.json(
        { error: `Backend returned non-JSON: ${text.slice(0, 200)}` },
        { status: 503 }
      );
    }

    if (!upstream.ok) {
      const detail = (data as { detail?: string } | undefined)?.detail;
      return NextResponse.json(
        { error: detail ?? `Upstream error ${upstream.status}` },
        { status: upstream.status }
      );
    }

    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Could not reach PetriDish API at ${FASTAPI_URL}. (${message})` },
      { status: 503 }
    );
  }
}
