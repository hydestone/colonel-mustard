import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { getValidToken } from "@/lib/strava";

const STRAVA_API = "https://www.strava.com/api/v3";

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const athleteId = cookieStore.get("athlete_id")?.value;
  if (!athleteId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const activityId = searchParams.get("id");
  if (!activityId) return NextResponse.json({ error: "Activity ID required" }, { status: 400 });

  const token = await getValidToken(parseInt(athleteId));

  const actRes = await fetch(`${STRAVA_API}/activities/${activityId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!actRes.ok) return NextResponse.json({ error: "Failed to fetch activity" }, { status: 500 });
  const activity = await actRes.json();

  const streamKeys = "time,heartrate,velocity_smooth,altitude,distance,cadence,watts,latlng";
  const streamRes = await fetch(
    `${STRAVA_API}/activities/${activityId}/streams?keys=${streamKeys}&key_type=time`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  let streams: Record<string, any[]> = {};
  if (streamRes.ok) {
    const streamData = await streamRes.json();
    if (Array.isArray(streamData)) {
      for (const s of streamData) {
        streams[s.type] = s.data;
      }
    }
  }

  const chartData: any[] = [];
  const timeArr = streams.time || [];
  const distArr = streams.distance || [];

  for (let i = 0; i < timeArr.length; i++) {
    const point: any = {
      time: timeArr[i],
      distance_mi: distArr[i] ? Math.round(distArr[i] / 1609.34 * 100) / 100 : 0,
    };
    if (streams.heartrate) point.heartrate = streams.heartrate[i];
    if (streams.velocity_smooth) {
      point.speed_mph = Math.round(streams.velocity_smooth[i] * 2.23694 * 10) / 10;
    }
    if (streams.altitude) point.elevation_ft = Math.round(streams.altitude[i] * 3.28084);
    if (streams.cadence) point.cadence = streams.cadence[i];
    if (streams.watts) point.watts = streams.watts[i];
    chartData.push(point);
  }

  const sampled = chartData.length > 500
    ? chartData.filter((_, i) => i % Math.ceil(chartData.length / 500) === 0)
    : chartData;

  const splits = (activity.splits_standard || []).map((s: any, i: number) => ({
    mile: i + 1,
    distance_mi: Math.round(s.distance / 1609.34 * 100) / 100,
    elapsed: formatDur(s.elapsed_time),
    moving: formatDur(s.moving_time),
    pace: s.distance > 0 ? formatPace(s.moving_time, s.distance) : "-",
    elevation_ft: Math.round((s.elevation_difference || 0) * 3.28084),
    avg_hr: s.average_heartrate ? Math.round(s.average_heartrate) : null,
  }));

  const route: [number, number][] = [];
  if (streams.latlng) {
    for (const point of streams.latlng) {
      if (Array.isArray(point) && point.length === 2) {
        route.push([point[0], point[1]]);
      }
    }
  }

  return NextResponse.json({
    activity: {
      id: activity.id,
      name: activity.name,
      type: activity.type,
      sport_type: activity.sport_type,
      distance_mi: Math.round(activity.distance / 1609.34 * 100) / 100,
      moving_time: activity.moving_time,
      elapsed_time: activity.elapsed_time,
      duration: formatDur(activity.moving_time),
      elevation_ft: Math.round((activity.total_elevation_gain || 0) * 3.28084),
      date: new Date(activity.start_date_local).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }),
      avg_hr: activity.average_heartrate ? Math.round(activity.average_heartrate) : null,
      max_hr: activity.max_heartrate ? Math.round(activity.max_heartrate) : null,
      avg_speed_mph: activity.average_speed ? Math.round(activity.average_speed * 2.23694 * 10) / 10 : null,
      avg_pace: activity.average_speed > 0 ? formatPace(activity.moving_time, activity.distance) : null,
      calories: activity.calories || null,
      suffer_score: activity.suffer_score || null,
      avg_watts: activity.average_watts ? Math.round(activity.average_watts) : null,
      description: activity.description || "",
      gear_id: activity.gear_id,
    },
    chartData: sampled,
    splits,
    route,
    hasHeartrate: !!streams.heartrate,
    hasPower: !!streams.watts,
    hasCadence: !!streams.cadence,
  });
}

function formatDur(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatPace(seconds: number, meters: number): string {
  const miles = meters / 1609.34;
  const ps = seconds / miles;
  const min = Math.floor(ps / 60);
  const sec = Math.round(ps % 60);
  return `${min}:${sec.toString().padStart(2, "0")} /mi`;
}
