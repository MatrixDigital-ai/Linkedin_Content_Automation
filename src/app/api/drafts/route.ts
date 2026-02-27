import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const drafts = await prisma.draft.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return NextResponse.json(drafts);
  } catch (err) {
    console.error("[drafts] Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
