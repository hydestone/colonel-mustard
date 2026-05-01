import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { fetchAllRows } from "@/lib/supabase-helpers";
import { getValidToken } from "@/lib/strava";
import { logError } from "@/lib/log";

const STRAVA_API = "https://www.strava.com/api/v3";

export async function GET() {
  const cookieStore = await cookies();
  const athleteId = cookieStore.get("athlete_id")?.value;
  if (!athleteId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const activities = await fetchAllRows(
    "activities",
    "start_date_local, distance, total_elevation_gain, moving_time, type, sport_type, gear_id",
    [{ column: "athlete_id", value: parseInt(athleteId) }],
    { column: "start_date_local", ascending: true }
  );

  const now = new Date();
  const oneYearAgo = new Date(); oneYearAgo.setFullYear(now.getFullYear() - 1);

  const dailyMap: Record<string, { distance: number; count: number; time: number }> = {};
  for (const a of activities) {
    const dateKey = new Date(a.start_date_local).toISOString().split("T")[0];
    if (!dailyMap[dateKey]) dailyMap[dateKey] = { distance: 0, count: 0, time: 0 };
    dailyMap[dateKey].distance += a.distance || 0;
    dailyMap[dateKey].count += 1;
    dailyMap[dateKey].time += a.moving_time || 0;
  }

  const calendar: { date: string; distance: number; count: number; time: number }[] = [];
  const cur = new Date(oneYearAgo); cur.setDate(cur.getDate() - cur.getDay());
  while (cur <= now) {
    const dk = cur.toISOString().split("T")[0];
    const d = dailyMap[dk];
    calendar.push({ date: dk, distance: d ? Math.round(d.distance / 1609.34 * 10) / 10 : 0, count: d ? d.count : 0, time: d ? Math.round(d.time / 60) : 0 });
    cur.setDate(cur.getDate() + 1);
  }

  const today = new Date();
  const thisWeekStart = new Date(today); thisWeekStart.setDate(today.getDate() - today.getDay()); thisWeekStart.setHours(0,0,0,0);
  const lastWeekStart = new Date(thisWeekStart); lastWeekStart.setDate(lastWeekStart.getDate() - 7);
  const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);

  function summarize(list: typeof activities) {
    return { distance: Math.round(list.reduce((s, a) => s + (a.distance || 0), 0) / 1609.34 * 10) / 10, elevation: Math.round(list.reduce((s, a) => s + (a.total_elevation_gain || 0), 0) * 3.28084), time: Math.round(list.reduce((s, a) => s + (a.moving_time || 0), 0) / 3600 * 10) / 10, count: list.length };
  }
  function inRange(a: any, start: Date, end: Date) { const d = new Date(a.start_date_local); return d >= start && d <= end; }

  const summary = {
    thisWeek: summarize(activities.filter(a => inRange(a, thisWeekStart, today))),
    lastWeek: summarize(activities.filter(a => inRange(a, lastWeekStart, new Date(thisWeekStart.getTime() - 1)))),
    thisMonth: summarize(activities.filter(a => inRange(a, thisMonthStart, today))),
    lastMonth: summarize(activities.filter(a => inRange(a, lastMonthStart, lastMonthEnd))),
    allTime: summarize(activities),
    thisYear: summarize(activities.filter(a => new Date(a.start_date_local).getFullYear() === today.getFullYear())),
  };

  const typeCounts: Record<string, { count: number; distance: number; time: number }> = {};
  for (const a of activities) {
    const t = a.type || "Other";
    if (!typeCounts[t]) typeCounts[t] = { count: 0, distance: 0, time: 0 };
    typeCounts[t].count += 1; typeCounts[t].distance += a.distance || 0; typeCounts[t].time += a.moving_time || 0;
  }
  const typeBreakdown = Object.entries(typeCounts).map(([type, data]) => ({
    type, count: data.count, distance: Math.round(data.distance / 1609.34), time: Math.round(data.time / 3600),
  })).sort((a, b) => b.count - a.count);

  const gearTotals: Record<string, { distance: number; time: number; count: number; lastUsed: string }> = {};
  for (const a of activities) {
    const gid = a.gear_id || "none"; if (gid === "none") continue;
    if (!gearTotals[gid]) gearTotals[gid] = { distance: 0, time: 0, count: 0, lastUsed: "" };
    gearTotals[gid].distance += a.distance || 0; gearTotals[gid].time += a.moving_time || 0; gearTotals[gid].count += 1;
    if (a.start_date_local > gearTotals[gid].lastUsed) gearTotals[gid].lastUsed = a.start_date_local;
  }

  let gearList: { id: string; name: string; distance: number; time: number; count: number; lastUsed: string; retired: boolean }[] = [];
  try {
    const token = await getValidToken(parseInt(athleteId));
    const gearIds = Object.keys(gearTotals);
    const gearDetails = await Promise.all(
      gearIds.map(async (gid) => {
        try {
          const res = await fetch(`${STRAVA_API}/gear/${gid}`, { headers: { Authorization: `Bearer ${token}` } });
          if (res.ok) { const data = await res.json(); return { id: gid, name: data.name || gid, retired: data.retired || false }; }
        } catch (e) { logError({ context: "overview:fetch-gear-detail", error: e, athleteId: parseInt(athleteId), metadata: { gearId: gid } }); }
        return { id: gid, name: gid, retired: false };
      })
    );
    gearList = gearDetails.map(g => ({
      id: g.id, name: g.name, retired: g.retired,
      distance: Math.round(gearTotals[g.id].distance / 1609.34),
      time: Math.round(gearTotals[g.id].time / 3600),
      count: gearTotals[g.id].count,
      lastUsed: gearTotals[g.id].lastUsed.split("T")[0],
    })).sort((a, b) => b.distance - a.distance);
  } catch {
    gearList = Object.entries(gearTotals).map(([gid, data]) => ({
      id: gid, name: gid, retired: false,
      distance: Math.round(data.distance / 1609.34),
      time: Math.round(data.time / 3600),
      count: data.count, lastUsed: data.lastUsed.split("T")[0],
    })).sort((a, b) => b.distance - a.distance);
  }

  return NextResponse.json({ calendar, summary, typeBreakdown, gearList });
}
