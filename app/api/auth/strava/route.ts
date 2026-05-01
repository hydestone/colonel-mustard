import { NextResponse } from "next/server";

export async function GET() {
  const clientId = process.env.STRAVA_CLIENT_ID;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const redirectUri = `${appUrl}/api/auth/strava/callback`;

  if (!clientId) {
    return NextResponse.json(
      { error: "Missing STRAVA_CLIENT_ID" },
      { status: 500 }
    );
  }

  const scope = "read,activity:read_all";

  const authUrl = new URL("https://www.strava.com/oauth/authorize");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", scope);
  authUrl.searchParams.set("approval_prompt", "auto");

  return NextResponse.redirect(authUrl.toString());
}