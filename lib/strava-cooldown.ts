import { getSupabaseAdmin } from "./supabase";
import { logError } from "./log";

const COOLDOWN_KEY = "strava_cooldown";
const COOLDOWN_MINUTES = 16; // Strava rate limit window is 15 min; pad by 1

export async function isStravaInCooldown(): Promise<{ inCooldown: boolean; until?: Date }> {
  try {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from("api_cache")
      .select("expires_at")
      .eq("cache_key", COOLDOWN_KEY)
      .single();
    if (data && new Date(data.expires_at) > new Date()) {
      return { inCooldown: true, until: new Date(data.expires_at) };
    }
  } catch (e: any) {
    if (e?.code !== "PGRST116") {
      logError({ context: "strava-cooldown:check", error: e });
    }
  }
  return { inCooldown: false };
}

export async function setStravaCooldown(): Promise<void> {
  try {
    const supabase = getSupabaseAdmin();
    const expires = new Date();
    expires.setMinutes(expires.getMinutes() + COOLDOWN_MINUTES);
    await supabase.from("api_cache").upsert(
      { cache_key: COOLDOWN_KEY, data: { reason: "rate-limit-429" }, expires_at: expires.toISOString() },
      { onConflict: "cache_key" }
    );
    logError({
      context: "strava-cooldown:engaged",
      error: `Strava 429 detected, cooling down until ${expires.toISOString()}`,
    });
  } catch (e) {
    logError({ context: "strava-cooldown:set", error: e });
  }
}

/**
 * Wrapper for fetch() that respects Strava rate limit cooldown.
 * Returns null if in cooldown. Otherwise returns Response.
 * Auto-engages cooldown on 429.
 */
export async function stravaFetch(
  url: string,
  init: RequestInit
): Promise<Response | null> {
  const cooldown = await isStravaInCooldown();
  if (cooldown.inCooldown) return null;

  const res = await fetch(url, init);
  if (res.status === 429) {
    await setStravaCooldown();
  }
  return res;
}
