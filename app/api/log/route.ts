import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { logError } from "@/lib/log";

interface ClientErrorPayload {
  context?: unknown;
  message?: unknown;
  stack?: unknown;
  metadata?: unknown;
}

export async function POST(request: NextRequest) {
  try {
    const body: ClientErrorPayload = await request.json();
    const cookieStore = await cookies();
    const athleteIdRaw = cookieStore.get("athlete_id")?.value;
    const athleteId = athleteIdRaw ? parseInt(athleteIdRaw) : undefined;

    const context = typeof body.context === "string" && body.context.length > 0
      ? body.context.substring(0, 200)
      : "client:unknown";
    const message = typeof body.message === "string" ? body.message : "Unknown client error";
    const stack = typeof body.stack === "string" ? body.stack : undefined;
    const metadata = (body.metadata && typeof body.metadata === "object")
      ? body.metadata as Record<string, unknown>
      : undefined;

    await logError({
      context,
      error: stack ? Object.assign(new Error(message), { stack }) : message,
      metadata,
      source: "client",
      athleteId: Number.isFinite(athleteId) ? athleteId : undefined,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    await logError({ context: "api:log:handler", error: err, source: "server" });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
