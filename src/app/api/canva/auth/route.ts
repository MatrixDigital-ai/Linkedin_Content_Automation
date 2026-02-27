import { NextResponse } from "next/server";
import crypto from "crypto";

/**
 * GET /api/canva/auth
 * Starts the Canva OAuth 2.0 + PKCE flow.
 * Redirects the user's browser to Canva's authorization page.
 */
export async function GET() {
  const clientId = process.env.CANVA_CLIENT_ID;
  const redirectUri = process.env.CANVA_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    return NextResponse.json(
      { error: "Canva credentials not configured. Set CANVA_CLIENT_ID and CANVA_REDIRECT_URI." },
      { status: 500 }
    );
  }

  // PKCE: generate code_verifier and code_challenge
  const codeVerifier = crypto.randomBytes(32).toString("base64url");
  const codeChallenge = crypto
    .createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");

  const state = crypto.randomBytes(16).toString("hex");

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: "design:content:read design:meta:read asset:read",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  const authUrl = `https://www.canva.com/api/oauth/authorize?${params.toString()}`;

  const response = NextResponse.redirect(authUrl);

  // Store verifier + state in httpOnly cookies for the callback
  const cookieOpts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: 600, // 10 minutes
    path: "/",
  } as const;

  response.cookies.set("canva_code_verifier", codeVerifier, cookieOpts);
  response.cookies.set("canva_oauth_state", state, cookieOpts);

  return response;
}
