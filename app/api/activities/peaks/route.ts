import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET() {
  const cookieStore = await cookies();
  const athleteId = cookieStore.get("athlete_id")?.value;
  if (!athleteId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const supabase = getSupabaseAdmin();
  const aid = parseInt(athleteId);

  async function topBy(type: string | null, orderCol: string, limit: number = 5, excludeNull?: string) {
    let q = supabase
      .from("activities")
      .select("id, name, type, distance, moving_time, total_elevation_gain, average_speed, average_heartrate, max_heartrate, suffer_score, start_date_local")
      .eq("athlete_id", aid)
      .order(orderCol, { ascending: false })
      .limit(limit);
    if (type) q = q.eq("type", type);
    if (excludeNull) q = q.not(excludeNull, "is", null).gt(excludeNull, 0);
    const { data } = await q;
    return (data || []).map((a: any) => ({
      ...a,
      distance_mi: Math.round((a.distance || 0) / 1609.34 * 100) / 100,
      elevation_ft: Math.round((a.total_elevation_gain || 0) * 3.28084),
      duration: fmtDur(a.moving_time || 0),
      pace: a.distance && a.moving_time ? fmtPace(a.moving_time, a.distance) : null,
      speed_mph: a.average_speed ? Math.round(a.average_speed * 2.23694 * 10) / 10 : null,
      date: new Date(a.start_date_local).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
    }));
  }

  async function fastestAtDistance(minMeters: number, maxMeters: number, label: string) {
    const { data } = await supabase
      .from("activities").select("id, name, distance, moving_time, average_heartrate, start_date_local")
      .eq("athlete_id", aid).eq("type", "Run")
      .gte("distance", minMeters).lte("distance", maxMeters)
      .order("average_speed", { ascending: false }).limit(5);
    return (data || []).map((a: any) => ({
      ...a, label,
      distance_mi: Math.round(a.distance / 1609.34 * 100) / 100,
      duration: fmtDur(a.moving_time),
      pace: fmtPace(a.moving_time, a.distance),
      avg_hr: a.average_heartrate ? Math.round(a.average_heartrate) : null,
      date: new Date(a.start_date_local).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
    }));
  }

  const [longestRides, mostElevRides, fastestRides, longestRuns, fastestRuns,
    highestHR, highestEffort,
    pr5k, pr10k, prHalf, prMarathon] = await Promise.all([
    topBy("Ride", "distance"),
    topBy("Ride", "total_elevation_gain"),
    topBy("Ride", "average_speed"),
    topBy("Run", "distance"),
    topBy("Run", "average_speed"),
    topBy(null, "max_heartrate", 5, "max_heartrate"),
    topBy(null, "suffer_score", 5, "suffer_score"),
    fastestAtDistance(4800, 5500, "5K"),
    fastestAtDistance(9500, 10500, "10K"),
    fastestAtDistance(20500, 22000, "Half Marathon"),
    fastestAtDistance(41000, 43500, "Marathon"),
  ]);

  return NextResponse.json({
    cycling: { longestRides, mostElevRides, fastestRides },
    running: { longestRuns, fastestRuns, pr5k, pr10k, prHalf, prMarathon },
    overall: { highestHR, highestEffort },
  });
}

function fmtDur(s: number): string {
  const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); const sec = s % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}
function fmtPace(s: number, meters: number): string {
  const miles = meters / 1609.34; const ps = s / miles;
  const min = Math.floor(ps / 60); const sec = Math.round(ps % 60);
  return `${min}:${sec.toString().padStart(2, "0")} /mi`;
}
