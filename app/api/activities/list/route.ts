import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

const MAIN_TYPES = ["Ride", "Run", "VirtualRide", "Walk", "Hike"];

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const athleteId = cookieStore.get("athlete_id")?.value;
  if (!athleteId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "50");
  const type = searchParams.get("type") || "";
  const sort = searchParams.get("sort") || "start_date_local";
  const dir = searchParams.get("dir") || "desc";
  const offset = (page - 1) * limit;

  const supabase = getSupabaseAdmin();

  let query = supabase
    .from("activities")
    .select("id, name, type, sport_type, distance, moving_time, elapsed_time, total_elevation_gain, start_date_local, average_speed, average_heartrate, max_heartrate, suffer_score, gear_id, has_heartrate", { count: "exact" })
    .eq("athlete_id", parseInt(athleteId));

  if (type === "other") { for (const mt of MAIN_TYPES) { query = query.neq("type", mt); } }
  else if (type) { query = query.eq("type", type); }

  query = query.order(sort, { ascending: dir === "asc" }).range(offset, offset + limit - 1);
  const { data, count, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const activities = (data || []).map(a => ({
    ...a,
    distance_mi: Math.round((a.distance || 0) / 1609.34 * 100) / 100,
    elevation_ft: Math.round((a.total_elevation_gain || 0) * 3.28084),
    pace: a.distance && a.moving_time ? formatPace(a.moving_time, a.distance) : null,
    duration: formatDuration(a.moving_time || 0),
    date: new Date(a.start_date_local).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
  }));

  return NextResponse.json({ activities, total: count || 0, page, limit });
}

function formatPace(seconds: number, meters: number): string {
  const miles = meters / 1609.34; const paceSeconds = seconds / miles;
  const min = Math.floor(paceSeconds / 60); const sec = Math.round(paceSeconds % 60);
  return `${min}:${sec.toString().padStart(2, "0")}`;
}
function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600); const m = Math.floor((seconds % 3600) / 60); const s = seconds % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
