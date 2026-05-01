import { getSupabaseAdmin } from "./supabase";

const STRAVA_API = "https://www.strava.com/api/v3";
const STRAVA_TOKEN_URL = "https://www.strava.com/oauth/token";

interface StravaTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

export async function getValidToken(athleteId: number): Promise<string> {
  const supabase = getSupabaseAdmin();

  const { data: tokenRow, error } = await supabase
    .from("strava_tokens")
    .select("access_token, refresh_token, expires_at")
    .eq("athlete_id", athleteId)
    .single();

  if (error || !tokenRow) {
    throw new Error(`No tokens found for athlete ${athleteId}`);
  }

  const now = Math.floor(Date.now() / 1000);

  if (tokenRow.expires_at > now + 300) {
    return tokenRow.access_token;
  }

  const refreshed = await refreshToken(tokenRow.refresh_token);

  await supabase
    .from("strava_tokens")
    .update({
      access_token: refreshed.access_token,
      refresh_token: refreshed.refresh_token,
      expires_at: refreshed.expires_at,
    })
    .eq("athlete_id", athleteId);

  return refreshed.access_token;
}

async function refreshToken(refreshToken: string): Promise<StravaTokens> {
  const res = await fetch(STRAVA_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token refresh failed: ${text}`);
  }

  return res.json();
}

interface StravaActivity {
  id: number;
  name: string;
  type: string;
  sport_type: string;
  distance: number;
  moving_time: number;
  elapsed_time: number;
  total_elevation_gain: number;
  start_date: string;
  start_date_local: string;
  timezone: string;
  start_latlng: number[];
  end_latlng: number[];
  map: { summary_polyline: string };
  average_speed: number;
  max_speed: number;
  average_heartrate?: number;
  max_heartrate?: number;
  suffer_score?: number;
  average_watts?: number;
  kilojoules?: number;
  gear_id?: string;
  has_heartrate: boolean;
  [key: string]: unknown;
}

export async function fetchActivities(
  accessToken: string,
  page: number = 1,
  perPage: number = 200,
  after?: number
): Promise<StravaActivity[]> {
  const params = new URLSearchParams({
    page: page.toString(),
    per_page: perPage.toString(),
  });

  if (after) {
    params.set("after", after.toString());
  }

  const res = await fetch(`${STRAVA_API}/athlete/activities?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Strava API error: ${res.status} ${text}`);
  }

  return res.json();
}

export async function fetchAllActivities(
  accessToken: string,
  after?: number
): Promise<StravaActivity[]> {
  const allActivities: StravaActivity[] = [];
  let page = 1;

  while (true) {
    const batch = await fetchActivities(accessToken, page, 200, after);
    if (batch.length === 0) break;
    allActivities.push(...batch);
    page++;

    if (page > 20) {
      console.warn("Hit 20 page limit, stopping pagination");
      break;
    }
  }

  return allActivities;
}

export function mapActivityToRow(activity: StravaActivity, athleteId: number) {
  return {
    id: activity.id,
    athlete_id: athleteId,
    name: activity.name,
    type: activity.type,
    sport_type: activity.sport_type,
    distance: activity.distance,
    moving_time: activity.moving_time,
    elapsed_time: activity.elapsed_time,
    total_elevation_gain: activity.total_elevation_gain,
    start_date: activity.start_date,
    start_date_local: activity.start_date_local,
    timezone: activity.timezone,
    start_latlng: activity.start_latlng,
    end_latlng: activity.end_latlng,
    summary_polyline: activity.map?.summary_polyline || null,
    average_speed: activity.average_speed,
    max_speed: activity.max_speed,
    average_heartrate: activity.average_heartrate || null,
    max_heartrate: activity.max_heartrate || null,
    suffer_score: activity.suffer_score || null,
    average_watts: activity.average_watts || null,
    kilojoules: activity.kilojoules || null,
    gear_id: activity.gear_id || null,
    has_heartrate: activity.has_heartrate,
    raw_data: activity,
  };
}