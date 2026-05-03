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
    const upstream = await fetch(`${FASTAPI_URL}/reason`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "bypass-tunnel-reminder": "true",
      },
      body: JSON.stringify(body),
    });

    const text = await upstream.text();
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      return NextResponse.json(
        { error: `Backend returned non-JSON (likely tunnel offline): ${text.slice(0, 100)}` },
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
    return NextResponse.json(
      {
        error: `Could not reach BioReason API at ${FASTAPI_URL}. Is the FastAPI server running? (${message})`,
      },
      { status: 503 }
    );
  }
}
