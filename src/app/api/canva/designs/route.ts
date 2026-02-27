import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/canva/designs
 * Lists the authenticated user's Canva designs with thumbnails.
 * Supports cursor-based pagination via ?continuation=xxx
 */
export async function GET(req: NextRequest) {
  try {
    const token = await prisma.canvaToken.findUnique({
      where: { id: "singleton" },
    });

    if (!token) {
      return NextResponse.json(
        { error: "Canva not connected" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const continuation = searchParams.get("continuation");

    const params = new URLSearchParams();
    if (continuation) params.set("continuation", continuation);

    const res = await fetch(
      `https://api.canva.com/rest/v1/designs?${params.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${token.accessToken}`,
        },
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      console.error("[canva/designs] API error:", res.status, errText);

      if (res.status === 401) {
        return NextResponse.json(
          { error: "Canva token expired. Please reconnect." },
          { status: 401 }
        );
      }

      return NextResponse.json(
        { error: "Failed to fetch designs from Canva" },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    console.error("[canva/designs] Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
