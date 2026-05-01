import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET() {
  const cookieStore = await cookies();
  const athleteId = cookieStore.get("athlete_id")?.value;

  if (!athleteId) {
    return NextResponse.json({ authenticated: false });
  }

  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("strava_tokens")
    .select("athlete_data")
    .eq("athlete_id", parseInt(athleteId))
    .single();

  return NextResponse.json({
    authenticated: true,
    athleteId: parseInt(athleteId),
    athlete: data?.athlete_data || null,
  });
}
