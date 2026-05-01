"use client";

interface ClientLogParams {
  context: string;
  error: unknown;
  metadata?: Record<string, unknown>;
}

/**
 * Client-side error logger. POSTs to /api/log. Fire-and-forget.
 * Never throws. Always logs to console as backup.
 */
export function logClientError(params: ClientLogParams): void {
  const { context, error, metadata } = params;

  let message: string;
  let stack: string | undefined;

  if (error instanceof Error) {
    message = error.message;
    stack = error.stack;
  } else if (typeof error === "string") {
    message = error;
  } else {
    try { message = JSON.stringify(error); } catch { message = String(error); }
  }

  console.error(`[${context}]`, message, metadata ?? "");

  try {
    fetch("/api/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ context, message, stack, metadata }),
    }).catch(() => { /* swallow - already logged to console */ });
  } catch {
    /* swallow - already logged to console */
  }
}
