import { getSupabaseAdmin } from "./supabase";

export type ErrorSource = "server" | "client";

export interface LogContext {
  context: string;
  error: unknown;
  metadata?: Record<string, unknown>;
  source?: ErrorSource;
  athleteId?: number;
}

/**
 * Logs an error to Supabase. Fire-and-forget - never throws, never blocks.
 * Always returns void. Failure to log is itself logged via console.error.
 */
export async function logError(opts: LogContext): Promise<void> {
  const { context, error, metadata, source = "server", athleteId } = opts;

  let message: string;
  let stack: string | null = null;

  if (error instanceof Error) {
    message = error.message;
    stack = error.stack ?? null;
  } else if (typeof error === "string") {
    message = error;
  } else {
    try { message = JSON.stringify(error); } catch { message = String(error); }
  }

  // Always log to console as backup
  console.error(`[${context}]`, message, metadata ?? "");

  try {
    const supabase = getSupabaseAdmin();
    await supabase.from("errors").insert({
      context,
      message: message.substring(0, 8000),
      stack: stack?.substring(0, 16000) ?? null,
      metadata: metadata ?? null,
      source,
      athlete_id: athleteId ?? null,
    });
  } catch (logErr) {
    console.error("[log:failure]", "Failed to write error to Supabase:", logErr);
  }
}
