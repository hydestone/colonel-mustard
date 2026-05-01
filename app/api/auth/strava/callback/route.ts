import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  if (error) {
    return NextResponse.redirect(`${appUrl}/?error=access_denied`);
  }

  if (!code) {
    return NextResponse.redirect(`${appUrl}/?error=no_code`);
  }

  try {
    const tokenRes = await fetch("https://www.strava.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: process.env.STRAVA_CLIENT_ID,
        client_secret: process.env.STRAVA_CLIENT_SECRET,
        code,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      console.error("Token exchange failed:", text);
      return NextResponse.redirect(`${appUrl}/?error=token_exchange`);
    }

    const tokenData = await tokenRes.json();
    const supabase = getSupabaseAdmin();

    const { error: dbError } = await supabase
      .from("strava_tokens")
      .upsert(
        {
          athlete_id: tokenData.athlete.id,
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token,
          expires_at: tokenData.expires_at,
          athlete_data: tokenData.athlete,
        },
        { onConflict: "athlete_id" }
      );

    if (dbError) {
      console.error("Database error:", dbError);
      return NextResponse.redirect(`${appUrl}/?error=db_error`);
    }

    const response = NextResponse.redirect(`${appUrl}/`);
    response.cookies.set("athlete_id", String(tokenData.athlete.id), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365,
      path: "/",
    });

    return response;
  } catch (err) {
    console.error("Callback error:", err);
    return NextResponse.redirect(`${appUrl}/?error=unknown`);
  }
}
