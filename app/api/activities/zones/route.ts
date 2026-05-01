import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { fetchAllRows } from "@/lib/supabase-helpers";

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const athleteId = cookieStore.get("athlete_id")?.value;
  if (!athleteId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const range = searchParams.get("range") || "3m";
  const type = searchParams.get("type") || "all";

  const activities = await fetchAllRows(
    "activities",
    "start_date_local, moving_time, type, average_heartrate, max_heartrate, has_heartrate, raw_data",
    [{ column: "athlete_id", value: parseInt(athleteId) }],
    { column: "start_date_local", ascending: true }
  );

  // Calculate date range
  const now = new Date();
  let cutoff = new Date();
  if (range === "7d") cutoff.setDate(now.getDate() - 7);
  else if (range === "1m") cutoff.setMonth(now.getMonth() - 1);
  else if (range === "3m") cutoff.setMonth(now.getMonth() - 3);
  else if (range === "6m") cutoff.setMonth(now.getMonth() - 6);
  else if (range === "1y") cutoff.setFullYear(now.getFullYear() - 1);
  else cutoff = new Date(0);

  let filtered = activities.filter((a: any) => new Date(a.start_date_local) >= cutoff);
  if (type !== "all") filtered = filtered.filter((a: any) => a.type === type);

  // Find max HR across all activities for zone calculation
  const allMaxHR = filtered.filter((a: any) => a.max_heartrate).map((a: any) => a.max_heartrate);
  const estimatedMaxHR = allMaxHR.length > 0 ? Math.max(...allMaxHR) : 190;

  // Standard 5-zone model based on max HR
  const zones = [
    { zone: "Z1", label: "Recovery", min: 0, max: Math.round(estimatedMaxHR * 0.6), color: "#94a3b8", time: 0 },
    { zone: "Z2", label: "Endurance", min: Math.round(estimatedMaxHR * 0.6), max: Math.round(estimatedMaxHR * 0.7), color: "#3b82f6", time: 0 },
    { zone: "Z3", label: "Tempo", min: Math.round(estimatedMaxHR * 0.7), max: Math.round(estimatedMaxHR * 0.8), color: "#22c55e", time: 0 },
    { zone: "Z4", label: "Threshold", min: Math.round(estimatedMaxHR * 0.8), max: Math.round(estimatedMaxHR * 0.9), color: "#eab308", time: 0 },
    { zone: "Z5", label: "VO2 Max", min: Math.round(estimatedMaxHR * 0.9), max: estimatedMaxHR + 10, color: "#ef4444", time: 0 },
  ];

  // Estimate time in each zone based on average HR
  for (const a of filtered) {
    if (!a.average_heartrate || !a.moving_time) continue;
    const avgHR = a.average_heartrate;
    const time = a.moving_time;

    // Simple assignment: put all time in the zone matching avg HR
    // In reality you'd need stream data for accurate zone distribution
    for (let i = zones.length - 1; i >= 0; i--) {
      if (avgHR >= zones[i].min) {
        zones[i].time += time;
        break;
      }
    }
  }

  const totalTime = zones.reduce((s, z) => s + z.time, 0);
  const zonesWithPct = zones.map(z => ({
    ...z,
    timeFormatted: fmtDur(z.time),
    pct: totalTime > 0 ? Math.round(z.time / totalTime * 100) : 0,
    range: `${z.min} - ${z.max} bpm`,
  }));

  // Weekly zone distribution for stacked chart
  const weeklyZones: { week: string; z1: number; z2: number; z3: number; z4: number; z5: number }[] = [];
  const weekMap: Record<string, number[]> = {};

  for (const a of filtered) {
    if (!a.average_heartrate || !a.moving_time) continue;
    const d = new Date(a.start_date_local);
    const weekStart = new Date(d); weekStart.setDate(d.getDate() - d.getDay()); weekStart.setHours(0,0,0,0);
    const wk = weekStart.toISOString().split("T")[0];
    if (!weekMap[wk]) weekMap[wk] = [0,0,0,0,0];

    const avgHR = a.average_heartrate;
    for (let i = zones.length - 1; i >= 0; i--) {
      if (avgHR >= zones[i].min) { weekMap[wk][i] += a.moving_time / 3600; break; }
    }
  }

  const sortedWeeks = Object.keys(weekMap).sort();
  for (const wk of sortedWeeks) {
    const d = new Date(wk);
    weeklyZones.push({
      week: `${d.getMonth()+1}/${d.getDate()}`,
      z1: Math.round(weekMap[wk][0] * 10) / 10,
      z2: Math.round(weekMap[wk][1] * 10) / 10,
      z3: Math.round(weekMap[wk][2] * 10) / 10,
      z4: Math.round(weekMap[wk][3] * 10) / 10,
      z5: Math.round(weekMap[wk][4] * 10) / 10,
    });
  }

  // Get activity types for filter
  const activityTypes = [...new Set(filtered.map((a: any) => a.type))].sort();

  return NextResponse.json({
    zones: zonesWithPct,
    weeklyZones,
    estimatedMaxHR,
    totalTime: fmtDur(totalTime),
    activityCount: filtered.length,
    activityTypes,
  });
}

function fmtDur(s: number): string {
  const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
