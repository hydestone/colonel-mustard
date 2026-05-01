import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { fetchAllRows } from "@/lib/supabase-helpers";
import { getValidToken } from "@/lib/strava";
import { logError } from "@/lib/log";

const STRAVA_API = "https://www.strava.com/api/v3";

interface ActivityGearRow { gear_id: string | null }

export async function GET() {
  const cookieStore = await cookies();
  const athleteIdRaw = cookieStore.get("athlete_id")?.value;
  if (!athleteIdRaw) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const athleteId = parseInt(athleteIdRaw);
  if (!Number.isFinite(athleteId)) return NextResponse.json({ error: "Invalid auth" }, { status: 401 });

  const supabase = getSupabaseAdmin();

  try {
    const { data: cached } = await supabase
      .from("api_cache")
      .select("data, expires_at")
      .eq("cache_key", `gear_names_${athleteId}`)
      .single();

    if (cached && new Date(cached.expires_at) > new Date()) {
      const names = (cached.data as { names?: Record<string, string> })?.names ?? {};
      const isCorrupt = Object.entries(names).some(([id, name]) => id === name);
      if (!isCorrupt && Object.keys(names).length > 0) {
        return NextResponse.json(cached.data);
      }
      logError({
        context: "gear-names:cache-corrupt-detected",
        error: "Cache contains entries where id equals name; refetching",
        athleteId,
        metadata: { entryCount: Object.keys(names).length },
      });
    }
  } catch (e: any) {
    if (e?.code !== "PGRST116") {
      logError({ context: "gear-names:cache-read", error: e, athleteId });
    }
  }

  let activities: ActivityGearRow[] = [];
  try {
    const rows = await fetchAllRows("activities", "gear_id", [{ column: "athlete_id", value: athleteId }]);
    activities = rows as ActivityGearRow[];
  } catch (e) {
    logError({ context: "gear-names:fetch-activities", error: e, athleteId });
    return NextResponse.json({ error: "Failed to load activities" }, { status: 500 });
  }

  const gearIds = Array.from(new Set(activities.map((a) => a.gear_id).filter((g): g is string => !!g)));

  if (gearIds.length === 0) {
    return NextResponse.json({ names: {} });
  }

  let token: string;
  try {
    token = await getValidToken(athleteId as any);
  } catch (e) {
    logError({ context: "gear-names:get-token", error: e, athleteId });
    return NextResponse.json({ error: "Token unavailable" }, { status: 500 });
  }

  const names: Record<string, string> = {};
  const failures: string[] = [];

  for (const gid of gearIds) {
    try {
      const res = await fetch(`${STRAVA_API}/gear/${gid}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
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
          error: `Strava returned invalid name for gear ${gid}`,
          athleteId,
          metadata: { gearId: gid, returnedName: fetchedName },
        });
        failures.push(gid);
        continue;
      }
      names[gid] = fetchedName;
    } catch (e) {
      logError({
        context: "gear-names:strava-exception",
        error: e,
        athleteId,
        metadata: { gearId: gid },
      });
      failures.push(gid);
    }
  }

  if (Object.keys(names).length > 0) {
    try {
      const expires = new Date();
      expires.setHours(expires.getHours() + 24);
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
  } else {
    logError({
      context: "gear-names:no-valid-names",
      error: `All ${gearIds.length} gear lookups failed; not caching`,
      athleteId,
      metadata: { failedGearIds: failures },
    });
  }

  return NextResponse.json({ names, failures: failures.length > 0 ? failures : undefined });
}
