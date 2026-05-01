import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { fetchAllRows } from "@/lib/supabase-helpers";

export async function GET() {
  const cookieStore = await cookies();
  const athleteId = cookieStore.get("athlete_id")?.value;
  if (!athleteId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const activities = await fetchAllRows(
    "activities",
    "summary_polyline, type, sport_type",
    [{ column: "athlete_id", value: parseInt(athleteId) }]
  );

  const polylines = (activities || [])
    .filter((a: any) => a.summary_polyline)
    .map((a: any) => ({ polyline: a.summary_polyline, type: a.type }));

  return NextResponse.json({ polylines, count: polylines.length });
}
