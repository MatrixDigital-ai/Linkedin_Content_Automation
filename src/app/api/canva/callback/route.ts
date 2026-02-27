import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/canva/callback
 * Handles the OAuth callback from Canva.
 * Exchanges authorization code for access + refresh tokens, stores them in DB.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  const dashboardUrl = (msg: string) =>
    new URL(`/dashboard?${msg}`, req.url);

  if (error) {
    return NextResponse.redirect(
      dashboardUrl(`canva_error=${encodeURIComponent(error)}`)
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(dashboardUrl("canva_error=missing_params"));
  }

  // Verify state matches what we stored
  const savedState = req.cookies.get("canva_oauth_state")?.value;
  if (state !== savedState) {
    return NextResponse.redirect(dashboardUrl("canva_error=invalid_state"));
  }

  const codeVerifier = req.cookies.get("canva_code_verifier")?.value;

  try {
    const clientId = process.env.CANVA_CLIENT_ID!;
    const clientSecret = process.env.CANVA_CLIENT_SECRET!;
    const redirectUri = process.env.CANVA_REDIRECT_URI!;

    // Exchange authorization code for tokens
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      ...(codeVerifier ? { code_verifier: codeVerifier } : {}),
    });

    const tokenRes = await fetch("https://api.canva.com/rest/v1/oauth/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error("[canva/callback] Token exchange failed:", errText);
      return NextResponse.redirect(dashboardUrl("canva_error=token_exchange_failed"));
    }

    const tokenData = await tokenRes.json();

    // Upsert token record (single-user app → singleton row)
    await prisma.canvaToken.upsert({
      where: { id: "singleton" },
      create: {
        id: "singleton",
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token ?? null,
        expiresAt: tokenData.expires_in
          ? new Date(Date.now() + tokenData.expires_in * 1000)
          : null,
      },
      update: {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token ?? null,
        expiresAt: tokenData.expires_in
          ? new Date(Date.now() + tokenData.expires_in * 1000)
          : null,
      },
    });

    const response = NextResponse.redirect(
      dashboardUrl("canva_connected=true")
    );
    response.cookies.delete("canva_code_verifier");
    response.cookies.delete("canva_oauth_state");
    return response;
  } catch (err) {
    console.error("[canva/callback] Error:", err);
    return NextResponse.redirect(dashboardUrl("canva_error=server_error"));
  }
}
