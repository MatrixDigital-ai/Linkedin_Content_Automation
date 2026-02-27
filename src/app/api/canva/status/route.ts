import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/canva/status
 * Returns whether a valid Canva token exists.
 * Automatically refreshes expired tokens if a refresh_token is available.
 */
export async function GET() {
  try {
    const token = await prisma.canvaToken.findUnique({
      where: { id: "singleton" },
    });

    if (!token) {
      return NextResponse.json({ connected: false });
    }

    // Check expiry
    if (token.expiresAt && token.expiresAt < new Date()) {
      if (token.refreshToken) {
        const refreshed = await refreshCanvaToken(token.refreshToken);
        if (refreshed) {
          return NextResponse.json({ connected: true });
        }
      }
      return NextResponse.json({ connected: false, expired: true });
    }

    return NextResponse.json({ connected: true });
  } catch {
    return NextResponse.json({ connected: false });
  }
}

async function refreshCanvaToken(refreshToken: string): Promise<boolean> {
  try {
    const clientId = process.env.CANVA_CLIENT_ID!;
    const clientSecret = process.env.CANVA_CLIENT_SECRET!;

    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    });

    const res = await fetch("https://api.canva.com/rest/v1/oauth/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    if (!res.ok) return false;

    const data = await res.json();

    await prisma.canvaToken.update({
      where: { id: "singleton" },
      data: {
        accessToken: data.access_token,
        refreshToken: data.refresh_token ?? refreshToken,
        expiresAt: data.expires_in
          ? new Date(Date.now() + data.expires_in * 1000)
          : null,
      },
    });

    return true;
  } catch {
    return false;
  }
}
