import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  getValidToken,
  fetchAllActivities,
  mapActivityToRow,
} from "@/lib/strava";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { athleteId, fullSync = false } = body;

    if (!athleteId) {
      return NextResponse.json(
        { error: "athleteId is required" },
        { status: 400 }
      );
    }

    const accessToken = await getValidToken(athleteId);
    const supabase = getSupabaseAdmin();

    let after: number | undefined;

    if (!fullSync) {
      const { data: latest } = await supabase
        .from("activities")
        .select("start_date")
        .eq("athlete_id", athleteId)
        .order("start_date", { ascending: false })
        .limit(1)
        .single();

      if (latest?.start_date) {
        after = Math.floor(new Date(latest.start_date).getTime() / 1000) - 86400;
      }
    }

    const activities = await fetchAllActivities(accessToken, after);

    if (activities.length === 0) {
      return NextResponse.json({
        message: "No new activities found",
        count: 0,
      });
    }

    const rows = activities.map((a) => mapActivityToRow(a, athleteId));

    const { error: dbError } = await supabase
      .from("activities")
      .upsert(rows, { onConflict: "id" });

    if (dbError) {
      console.error("Sync database error:", dbError);
      return NextResponse.json(
        { error: "Failed to save activities", details: dbError.message },
        { status: 500 }
      );
    }

    // Q4: Invalidate activity-derived caches.
    // Activities just changed, so any cache computed from activities is stale.
    // Currently only gear-names and segments routes write to api_cache; other
    // endpoints (overview, peaks, pmc, yearly, etc.) compute live from the DB
    // and do not cache. If new caches are added, append their keys here.
    // Important: do NOT match 'strava_cooldown' (no athlete suffix, system row).
    // Non-blocking: cache invalidation failure does not fail the sync, since
    // the activities are already saved successfully.
    try {
      const cacheKeysToInvalidate = [
        `gear_names_${athleteId}`,
        `segments_v2_${athleteId}`,
      ];
      const { error: cacheError, count } = await supabase
        .from("api_cache")
        .delete({ count: "exact" })
        .in("cache_key", cacheKeysToInvalidate);
      if (cacheError) {
        console.error("[sync] Cache invalidation error:", cacheError);
      } else {
        console.log(
          `[sync] Invalidated ${count ?? 0} cache rows for athlete ${athleteId} after upserting ${activities.length} activities`
        );
      }
    } catch (cacheErr) {
      console.error("[sync] Cache invalidation threw:", cacheErr);
    }

    return NextResponse.json({
      message: `Synced ${activities.length} activities`,
      count: activities.length,
      mode: fullSync ? "full" : "incremental",
    });
  } catch (err) {
    console.error("Sync error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Sync failed" },
      { status: 500 }
    );
  }
}
