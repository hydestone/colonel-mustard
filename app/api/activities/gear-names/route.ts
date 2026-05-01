import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getValidToken } from "@/lib/strava";
import { getSupabaseAdmin } from "@/lib/supabase";
import { fetchAllRows } from "@/lib/supabase-helpers";

const STRAVA_API = "https://www.strava.com/api/v3";

export async function GET() {
  const cookieStore = await cookies();
  const athleteId = cookieStore.get("athlete_id")?.value;
  if (!athleteId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  // Check cache first
  const supabase = getSupabaseAdmin();
  try {
    const { data: cached } = await supabase.from("api_cache").select("data, expires_at").eq("cache_key", `gear_names_${athleteId}`).single();
    if (cached && new Date(cached.expires_at) > new Date()) return NextResponse.json(cached.data);
  } catch {}

  // Get all unique gear IDs from activities
  const activities = await fetchAllRows(
    "activities",
    "gear_id",
    [{ column: "athlete_id", value: parseInt(athleteId) }]
  );

  const gearIds = [...new Set((activities || []).map((a: any) => a.gear_id).filter(Boolean))];
  const names: Record<string, string> = {};

  try {
    const token = await getValidToken(parseInt(athleteId));
    for (const gid of gearIds) {
      try {
        const res = await fetch(`${STRAVA_API}/gear/${gid}`, { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) {
          const data = await res.json();
          names[gid] = data.name || gid;
        } else {
          names[gid] = gid;
        }
      } catch {
        names[gid] = gid;
      }
    }
  } catch {
    for (const gid of gearIds) names[gid] = gid;
  }

  // Cache for 24 hours
  try {
    const expires = new Date(); expires.setHours(expires.getHours() + 24);
    await supabase.from("api_cache").upsert({ cache_key: `gear_names_${athleteId}`, data: { names }, expires_at: expires.toISOString() }, { onConflict: "cache_key" });
  } catch {}

  return NextResponse.json({ names });
}
