import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { fetchAllRows } from "@/lib/supabase-helpers";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export async function GET() {
  const cookieStore = await cookies();
  const athleteId = cookieStore.get("athlete_id")?.value;

  if (!athleteId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const activities = await fetchAllRows(
    "activities",
    "start_date_local, distance, total_elevation_gain, moving_time, type, suffer_score, average_heartrate, has_heartrate",
    [{ column: "athlete_id", value: parseInt(athleteId) }],
    { column: "start_date_local", ascending: true }
  );

  const byYear: Record<string, { dayOfYear: number; month: number; distance: number; elevation: number; time: number }[]> = {};
  const years: string[] = [];

  for (const a of activities || []) {
    const date = new Date(a.start_date_local);
    const year = date.getFullYear().toString();
    const startOfYear = new Date(date.getFullYear(), 0, 0);
    const dayOfYear = Math.floor((date.getTime() - startOfYear.getTime()) / 86400000);
    const month = date.getMonth();

    if (!byYear[year]) {
      byYear[year] = [];
      years.push(year);
    }

    byYear[year].push({ dayOfYear, month, distance: a.distance || 0, elevation: a.total_elevation_gain || 0, time: a.moving_time || 0 });
  }

  years.sort();

  const cumulative: Record<string, { distance: number; elevation: number; time: number }[]> = {};

  for (const year of years) {
    const entries = byYear[year].sort((a, b) => a.dayOfYear - b.dayOfYear);
    const daily: { distance: number; elevation: number; time: number }[] = new Array(366).fill(null).map(() => ({ distance: 0, elevation: 0, time: 0 }));

    for (const e of entries) {
      const idx = Math.min(e.dayOfYear - 1, 365);
      daily[idx].distance += e.distance;
      daily[idx].elevation += e.elevation;
      daily[idx].time += e.time;
    }

    let cd = 0, ce = 0, ct = 0;
    cumulative[year] = daily.map(d => {
      cd += d.distance;
      ce += d.elevation;
      ct += d.time;
      return {
        distance: Math.round(cd / 1609.34 * 10) / 10,
        elevation: Math.round(ce * 3.28084),
        time: Math.round(ct / 3600 * 10) / 10,
      };
    });
  }

  const cumulativeChart: Record<string, unknown>[] = [];
  for (let d = 0; d < 366; d += 3) {
    const row: Record<string, unknown> = { day: d + 1 };
    for (const year of years) {
      row[`${year}_distance`] = cumulative[year]?.[d]?.distance || 0;
      row[`${year}_elevation`] = cumulative[year]?.[d]?.elevation || 0;
      row[`${year}_time`] = cumulative[year]?.[d]?.time || 0;
    }
    cumulativeChart.push(row);
  }

  const monthlyChart: Record<string, unknown>[] = MONTHS.map((name, i) => {
    const row: Record<string, unknown> = { month: name };
    for (const year of years) {
      const me = byYear[year].filter(e => e.month === i);
      row[`${year}_distance`] = Math.round(me.reduce((s, e) => s + e.distance, 0) / 1609.34 * 10) / 10;
      row[`${year}_elevation`] = Math.round(me.reduce((s, e) => s + e.elevation, 0) * 3.28084);
      row[`${year}_time`] = Math.round(me.reduce((s, e) => s + e.time, 0) / 3600 * 10) / 10;
      row[`${year}_count`] = me.length;
    }
    return row;
  });

  const yearTotals: Record<string, { distance: number; elevation: number; time: number; count: number }> = {};
  for (const year of years) {
    const e = byYear[year];
    yearTotals[year] = {
      distance: Math.round(e.reduce((s, x) => s + x.distance, 0) / 1609.34),
      elevation: Math.round(e.reduce((s, x) => s + x.elevation, 0) * 3.28084),
      time: Math.round(e.reduce((s, x) => s + x.time, 0) / 3600),
      count: e.length,
    };
  }

  return NextResponse.json({ years, cumulativeChart, monthlyChart, yearTotals });
}
