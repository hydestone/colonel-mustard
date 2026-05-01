import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { fetchAllRows } from "@/lib/supabase-helpers";

/**
 * Estimate Training Stress Score (TSS) for an activity.
 * Uses suffer_score (Strava Relative Effort) when available,
 * otherwise estimates from duration and type.
 */
function estimateTSS(activity: any): number {
  // If Strava provides a suffer score, scale it to TSS range
  if (activity.suffer_score && activity.suffer_score > 0) {
    return activity.suffer_score * 0.85;
  }

  // Fallback: estimate from duration and type
  const hours = (activity.moving_time || 0) / 3600;
  const typeMultiplier: Record<string, number> = {
    Run: 70,
    Ride: 55,
    Swim: 60,
    Walk: 30,
    Hike: 45,
    VirtualRide: 55,
    VirtualRun: 70,
    Workout: 50,
    WeightTraining: 40,
    Yoga: 20,
  };

  const base = typeMultiplier[activity.type] || 45;
  return Math.round(hours * base);
}

export async function GET() {
  const cookieStore = await cookies();
  const athleteId = cookieStore.get("athlete_id")?.value;

  if (!athleteId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const activities = await fetchAllRows(
    "activities",
    "start_date_local, moving_time, type, suffer_score, average_heartrate, has_heartrate",
    [{ column: "athlete_id", value: parseInt(athleteId) }],
    { column: "start_date_local", ascending: true }
  );

  if (!activities || activities.length === 0) {
    return NextResponse.json({ pmc: [] });
  }

  // Build daily TSS map
  const dailyTSS: Record<string, number> = {};
  let minDate = new Date(activities[0].start_date_local);
  let maxDate = new Date(activities[activities.length - 1].start_date_local);

  for (const a of activities) {
    const dateKey = new Date(a.start_date_local).toISOString().split("T")[0];
    const tss = estimateTSS(a);
    dailyTSS[dateKey] = (dailyTSS[dateKey] || 0) + tss;
  }

  // Generate PMC data for every day from first activity to today
  const today = new Date();
  if (maxDate < today) maxDate = today;

  const CTL_DAYS = 42;
  const ATL_DAYS = 7;

  let ctl = 0;
  let atl = 0;
  const pmcData: { date: string; tss: number; ctl: number; atl: number; tsb: number }[] = [];

  const current = new Date(minDate);
  current.setHours(0, 0, 0, 0);

  while (current <= maxDate) {
    const dateKey = current.toISOString().split("T")[0];
    const tss = dailyTSS[dateKey] || 0;

    // Exponential moving averages
    ctl = ctl + (tss - ctl) / CTL_DAYS;
    atl = atl + (tss - atl) / ATL_DAYS;
    const tsb = ctl - atl;

    pmcData.push({
      date: dateKey,
      tss: Math.round(tss),
      ctl: Math.round(ctl * 10) / 10,
      atl: Math.round(atl * 10) / 10,
      tsb: Math.round(tsb * 10) / 10,
    });

    current.setDate(current.getDate() + 1);
  }

  // Return last 365 days by default for performance
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  const oneYearKey = oneYearAgo.toISOString().split("T")[0];

  const recentPMC = pmcData.filter(p => p.date >= oneYearKey);

  return NextResponse.json({
    pmc: recentPMC,
    allTimePMC: pmcData,
    currentCTL: pmcData[pmcData.length - 1]?.ctl || 0,
    currentATL: pmcData[pmcData.length - 1]?.atl || 0,
    currentTSB: pmcData[pmcData.length - 1]?.tsb || 0,
  });
}
