import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET() {
  const cookieStore = await cookies();
  const athleteId = cookieStore.get("athlete_id")?.value;
  if (!athleteId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const supabase = getSupabaseAdmin();

  // Get best efforts at key distances for running
  const runDistances = [
    { label: "1 mi", min: 1500, max: 1700 },
    { label: "5K", min: 4800, max: 5500 },
    { label: "10K", min: 9500, max: 10500 },
    { label: "Half", min: 20500, max: 22000 },
    { label: "Marathon", min: 41000, max: 43500 },
  ];

  const runProfile = await Promise.all(runDistances.map(async (rd) => {
    const { data } = await supabase
      .from("activities").select("id, name, distance, moving_time, average_speed, start_date_local")
      .eq("athlete_id", parseInt(athleteId)).eq("type", "Run")
      .gte("distance", rd.min).lte("distance", rd.max)
      .order("average_speed", { ascending: false }).limit(1);
    const best = data?.[0];
    if (!best) return { label: rd.label, pace: null, time: null, date: null, value: 0 };
    const paceSeconds = best.moving_time / (best.distance / 1609.34);
    const min = Math.floor(paceSeconds / 60); const sec = Math.round(paceSeconds % 60);
    return {
      label: rd.label,
      pace: `${min}:${sec.toString().padStart(2, "0")}`,
      time: fmtDur(best.moving_time),
      date: new Date(best.start_date_local).toLocaleDateString("en-US", { month: "short", year: "numeric" }),
      value: Math.round(best.average_speed * 2.23694 * 100) / 100,
    };
  }));

  // Get best rides by different metrics
  const rideMetrics = [
    { label: "Longest", sort: "distance", unit: "mi" },
    { label: "Most climb", sort: "total_elevation_gain", unit: "ft" },
    { label: "Fastest avg", sort: "average_speed", unit: "mph" },
    { label: "Highest HR", sort: "max_heartrate", unit: "bpm" },
    { label: "Most effort", sort: "suffer_score", unit: "pts" },
  ];

  const rideProfile = await Promise.all(rideMetrics.map(async (rm) => {
    let q = supabase.from("activities").select("id, name, distance, moving_time, total_elevation_gain, average_speed, max_heartrate, suffer_score, start_date_local")
      .eq("athlete_id", parseInt(athleteId)).eq("type", "Ride")
      .order(rm.sort, { ascending: false }).limit(1);
    if (rm.sort === "max_heartrate") q = q.not("max_heartrate", "is", null).gt("max_heartrate", 0);
    if (rm.sort === "suffer_score") q = q.not("suffer_score", "is", null).gt("suffer_score", 0);
    const { data } = await q;
    const best = data?.[0];
    if (!best) return { label: rm.label, value: 0, formatted: "-", date: null, unit: rm.unit };
    let val = 0; let formatted = "-";
    if (rm.sort === "distance") { val = Math.round(best.distance / 1609.34); formatted = `${val} mi`; }
    else if (rm.sort === "total_elevation_gain") { val = Math.round(best.total_elevation_gain * 3.28084); formatted = `${val.toLocaleString()} ft`; }
    else if (rm.sort === "average_speed") { val = Math.round(best.average_speed * 2.23694 * 10) / 10; formatted = `${val} mph`; }
    else if (rm.sort === "max_heartrate") { val = best.max_heartrate; formatted = `${val} bpm`; }
    else if (rm.sort === "suffer_score") { val = best.suffer_score; formatted = `${val} pts`; }
    return { label: rm.label, value: val, formatted, date: new Date(best.start_date_local).toLocaleDateString("en-US", { month: "short", year: "numeric" }), unit: rm.unit };
  }));

  return NextResponse.json({ runProfile, rideProfile });
}

function fmtDur(s: number): string {
  const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); const sec = s % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}
