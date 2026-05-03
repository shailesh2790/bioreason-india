import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const FASTAPI_URL = process.env.FASTAPI_URL ?? "http://localhost:8000";

const PROXY_HEADERS = {
  "Content-Type": "application/json",
  "bypass-tunnel-reminder": "true",
};

async function safeJson(res: Response): Promise<{ ok: boolean; data: any; status: number }> {
  const text = await res.text();
  try {
    return { ok: res.ok, data: JSON.parse(text), status: res.status };
  } catch {
    return {
      ok: false,
      data: { error: `Backend returned non-JSON (likely tunnel offline): ${text.slice(0, 100)}` },
      status: 503,
    };
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const upstream = await fetch(`${FASTAPI_URL}/patient`, {
      method: "POST",
      headers: PROXY_HEADERS,
      body: JSON.stringify(body),
    });
    const { data, status } = await safeJson(upstream);
    return NextResponse.json(data, { status });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
