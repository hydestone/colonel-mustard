import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getValidToken } from "@/lib/strava";
import { getSupabaseAdmin } from "@/lib/supabase";
import { logError } from "@/lib/log";
import { logError } from "@/lib/log";
import { logError } from "@/lib/log";
import { logError } from "@/lib/log";

const STRAVA_API = "https://www.strava.com/api/v3";
const CACHE_HOURS = 6;

async function getCache(key: string) {
  try {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase.from("api_cache").select("data, expires_at").eq("cache_key", key).single();
    if (data && new Date(data.expires_at) > new Date()) return data.data;
  } catch (e: any) { if (e?.code !== "PGRST116") logError({ context: "segments:cache-read", error: e, metadata: { cacheKey: key } }); }
  return null;
}
async function setCache(key: string, value: any) {
  try {
    const supabase = getSupabaseAdmin();
    const expires = new Date(); expires.setHours(expires.getHours() + CACHE_HOURS);
    await supabase.from("api_cache").upsert({ cache_key: key, data: value, expires_at: expires.toISOString() }, { onConflict: "cache_key" });
  } catch (e) { logError({ context: "segments:cache-write", error: e, metadata: { cacheKey: key } }); }
}

export async function GET() {
  const cookieStore = await cookies();
  const athleteId = cookieStore.get("athlete_id")?.value;
  if (!athleteId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const cacheKey = `segments_v2_${athleteId}`;
  const cached = await getCache(cacheKey);
  if (cached) return NextResponse.json(cached);

  const token = await getValidToken(parseInt(athleteId));

  let allStarred: any[] = [];
  let page = 1;
  while (true) {
    const res = await fetch(`${STRAVA_API}/segments/starred?per_page=200&page=${page}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      if (res.status === 429) return NextResponse.json({ segments: [], filterOptions: { cities: [], actTypes: [], climbCats: [] }, error: "Rate limited - try again in 15 min" });
      break;
    }
    const batch = await res.json();
    if (!Array.isArray(batch) || batch.length === 0) break;
    allStarred = allStarred.concat(batch);
    if (batch.length < 200) break;
    page++;
  }

  const segments = await Promise.all(
    allStarred.map(async (seg: any) => {
      let efforts: any[] = [];
      let prTime: number | null = null;
      let prDate: string | null = null;
      let totalEfforts = 0;
      let rank: number | null = null;
      let totalEntries: number | null = null;

      try {
        const effortRes = await fetch(`${STRAVA_API}/segment_efforts?segment_id=${seg.id}&per_page=200`, { headers: { Authorization: `Bearer ${token}` } });
        if (effortRes.ok) {
          efforts = await effortRes.json();
          totalEfforts = efforts.length;
          if (efforts.length > 0) {
            const best = efforts.reduce((min: any, e: any) => e.elapsed_time < min.elapsed_time ? e : min);
            prTime = best.elapsed_time;
            prDate = new Date(best.start_date_local).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
          }
        }
      } catch (e) { logError({ context: "segments:fetch-efforts", error: e, athleteId: parseInt(athleteId), metadata: { segmentId: seg.id } }); }

      // Fetch leaderboard for rank
      try {
        const lbRes = await fetch(`${STRAVA_API}/segments/${seg.id}/leaderboard?per_page=1`, { headers: { Authorization: `Bearer ${token}` } });
        if (lbRes.ok) {
          const lb = await lbRes.json();
          if (lb.entry_count) totalEntries = lb.entry_count;
          if (lb.athlete_entries && lb.athlete_entries.length > 0) {
            rank = lb.athlete_entries[0].rank;
          }
        }
      } catch (e) { logError({ context: "segments:fetch-leaderboard", error: e, athleteId: parseInt(athleteId), metadata: { segmentId: seg.id } }); }

      return {
        id: seg.id, name: seg.name,
        distance_mi: Math.round(seg.distance / 1609.34 * 100) / 100,
        avg_grade: seg.average_grade, max_grade: seg.maximum_grade,
        elevation_ft: Math.round((seg.total_elevation_gain || 0) * 3.28084),
        city: seg.city || "", state: seg.state || "",
        climb_category: seg.climb_category,
        activity_type: seg.activity_type || "Ride",
        pr: prTime ? fmtDur(prTime) : null, prDate, totalEfforts,
        rank, totalEntries,
        recentEfforts: efforts.slice(0, 5).map((e: any) => ({
          date: new Date(e.start_date_local).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
          time: fmtDur(e.elapsed_time),
          avg_hr: e.average_heartrate ? Math.round(e.average_heartrate) : null,
          avg_watts: e.average_watts ? Math.round(e.average_watts) : null,
        })),
      };
    })
  );

  const cities = [...new Set(segments.filter(s => s.city).map(s => s.city))].sort();
  const actTypes = [...new Set(segments.map(s => s.activity_type))].sort();
  const climbCats = [...new Set(segments.map(s => s.climb_category))].sort((a, b) => b - a);
  const result = { segments, filterOptions: { cities, actTypes, climbCats } };
  await setCache(cacheKey, result);
  return NextResponse.json(result);
}

function fmtDur(s: number): string {
  const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); const sec = s % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}
