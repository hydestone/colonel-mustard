import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { fetchAllRows } from "@/lib/supabase-helpers";
import { getValidToken } from "@/lib/strava";
import { stravaFetch, isStravaInCooldown } from "@/lib/strava-cooldown";
import { logError } from "@/lib/log";

const STRAVA_API = "https://www.strava.com/api/v3";
const CACHE_DAYS = 7; // Gear names rarely change

interface ActivityGearRow { gear_id: string | null }

export async function GET() {
  const cookieStore = await cookies();
  const athleteIdRaw = cookieStore.get("athlete_id")?.value;
  if (!athleteIdRaw) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const athleteId = parseInt(athleteIdRaw);
  if (!Number.isFinite(athleteId)) return NextResponse.json({ error: "Invalid auth" }, { status: 401 });

  const supabase = getSupabaseAdmin();

  // 1. Check cache
  let existingNames: Record<string, string> = {};
  try {
    const { data: cached } = await supabase
      .from("api_cache")
      .select("data, expires_at")
      .eq("cache_key", `gear_names_${athleteId}`)
      .single();
    if (cached) {
      const cachedNames = (cached.data as { names?: Record<string, string> })?.names ?? {};
      const isCorrupt = Object.entries(cachedNames).some(([id, name]) => id === name);
      if (!isCorrupt) {
        existingNames = cachedNames;
        if (new Date(cached.expires_at) > new Date()) {
          return NextResponse.json({ names: cachedNames });
        }
      }
    }
  } catch (e: any) {
    if (e?.code !== "PGRST116") {
      logError({ context: "gear-names:cache-read", error: e, athleteId });
    }
  }

  // 2. Get gear IDs from activities
  let activities: ActivityGearRow[] = [];
  try {
    const rows = await fetchAllRows("activities", "gear_id", [{ column: "athlete_id", value: athleteId }]);
    activities = rows as ActivityGearRow[];
  } catch (e) {
    logError({ context: "gear-names:fetch-activities", error: e, athleteId });
    return NextResponse.json({ error: "Failed to load activities" }, { status: 500 });
  }

  const gearIds = Array.from(new Set(activities.map((a) => a.gear_id).filter((g): g is string => !!g)));
  if (gearIds.length === 0) return NextResponse.json({ names: {} });

  // 3. Check cooldown before any Strava calls
  const cooldown = await isStravaInCooldown();
  if (cooldown.inCooldown) {
    return NextResponse.json({
      names: existingNames,
      cooldown: true,
      cooldownUntil: cooldown.until?.toISOString(),
      message: "Strava rate limit cooldown active",
    });
  }

  // 4. Get token
  let token: string;
  try {
    token = await getValidToken(athleteId as any);
  } catch (e) {
    logError({ context: "gear-names:get-token", error: e, athleteId });
    return NextResponse.json({ error: "Token unavailable" }, { status: 500 });
  }

  // 5. Fetch from Strava (will halt early on 429 via stravaFetch)
  const names: Record<string, string> = { ...existingNames };
  const failures: string[] = [];
  let cooldownTriggered = false;

  for (const gid of gearIds) {
    if (cooldownTriggered) {
      failures.push(gid);
      continue;
    }
    try {
      const res = await stravaFetch(`${STRAVA_API}/gear/${gid}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res) {
        cooldownTriggered = true;
        failures.push(gid);
        continue;
      }
      if (res.status === 429) {
        cooldownTriggered = true;
        failures.push(gid);
        logError({
          context: "gear-names:rate-limited",
          error: "Hit 429, cooldown engaged",
          athleteId,
          metadata: { gearId: gid },
        });
        continue;
      }
      if (!res.ok) {
        const bodyText = await res.text().catch(() => "(unreadable)");
        logError({
          context: "gear-names:strava-non-ok",
          error: `HTTP ${res.status}: ${bodyText.substring(0, 500)}`,
          athleteId,
          metadata: { gearId: gid, status: res.status },
        });
        failures.push(gid);
        continue;
      }
      const data = await res.json();
      const fetchedName = typeof data.name === "string" && data.name.length > 0 ? data.name : null;
      if (!fetchedName || fetchedName === gid) {
        logError({
          context: "gear-names:invalid-name-from-strava",
          error: `Invalid name for gear ${gid}`,
          athleteId,
          metadata: { gearId: gid, returnedName: fetchedName },
        });
        failures.push(gid);
        continue;
      }
      names[gid] = fetchedName;
    } catch (e) {
      logError({ context: "gear-names:strava-exception", error: e, athleteId, metadata: { gearId: gid } });
      failures.push(gid);
    }
  }

  // 6. Cache whatever valid names we got (merging with existing if any)
  const validCount = Object.keys(names).length;
  if (validCount > 0) {
    try {
      const expires = new Date();
      expires.setDate(expires.getDate() + CACHE_DAYS);
      await supabase.from("api_cache").upsert(
        {
          cache_key: `gear_names_${athleteId}`,
          data: { names },
          expires_at: expires.toISOString(),
        },
        { onConflict: "cache_key" }
      );
    } catch (e) {
      logError({ context: "gear-names:cache-write", error: e, athleteId });
    }
  }

  return NextResponse.json({
    names,
    failures: failures.length > 0 ? failures : undefined,
    cooldown: cooldownTriggered || undefined,
  });
}

/**
 * Manual seed endpoint. POST with { names: { gearId: name, ... } } to manually
 * populate gear names while Strava is rate-limited.
 */
export async function POST(request: Request) {
  const cookieStore = await cookies();
  const athleteIdRaw = cookieStore.get("athlete_id")?.value;
  if (!athleteIdRaw) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const athleteId = parseInt(athleteIdRaw);
  if (!Number.isFinite(athleteId)) return NextResponse.json({ error: "Invalid auth" }, { status: 401 });

  let body: { names?: Record<string, string> };
  try {
    body = await request.json();
  } catch (e) {
    logError({ context: "gear-names:seed-parse", error: e, athleteId });
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.names || typeof body.names !== "object") {
    return NextResponse.json({ error: "Body must contain 'names' object" }, { status: 400 });
  }

  // Validate: no entry where id == name
  const sanitized: Record<string, string> = {};
  for (const [id, name] of Object.entries(body.names)) {
    if (typeof name === "string" && name.length > 0 && name !== id) {
      sanitized[id] = name;
    }
  }

  const supabase = getSupabaseAdmin();
  try {
    const expires = new Date();
    expires.setDate(expires.getDate() + CACHE_DAYS);
    await supabase.from("api_cache").upsert(
      {
        cache_key: `gear_names_${athleteId}`,
        data: { names: sanitized },
        expires_at: expires.toISOString(),
      },
      { onConflict: "cache_key" }
    );
    return NextResponse.json({ ok: true, seeded: Object.keys(sanitized).length });
  } catch (e) {
    logError({ context: "gear-names:seed-write", error: e, athleteId });
    return NextResponse.json({ error: "Failed to seed cache" }, { status: 500 });
  }
}
