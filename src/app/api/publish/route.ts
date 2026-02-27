import axios from "axios";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const bodySchema = z.object({
  draftId: z.string().min(1),
  selectedModel: z.enum(["openai", "gemini", "claude"]),
  text: z.string().min(1).max(3000),
});

/** Check if LinkedIn credentials are configured */
function isLinkedInConfigured(): boolean {
  return !!(
    process.env.LINKEDIN_ACCESS_TOKEN &&
    process.env.LINKEDIN_AUTHOR_URN &&
    process.env.LINKEDIN_AUTHOR_URN !== "urn:li:person:XXXX"
  );
}

export async function POST(req: Request) {
  try {
    /* ── Kill switch ─────────────────────────────── */
    if (process.env.PUBLISH_ENABLED !== "true") {
      return NextResponse.json(
        { error: "Publishing is currently disabled." },
        { status: 403 }
      );
    }

    /* ── Validate payload ────────────────────────── */
    const body = await req.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid payload", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const { draftId, selectedModel, text } = parsed.data;

    let linkedinPostId = "dry-run-" + Date.now();
    let dryRun = false;

    if (isLinkedInConfigured()) {
      /* ── Post to LinkedIn (LIVE) ────────────────── */
      const linkedinResponse = await axios.post(
        "https://api.linkedin.com/v2/posts",
        {
          author: process.env.LINKEDIN_AUTHOR_URN,
          commentary: text,
          visibility: "PUBLIC",
          distribution: {
            feedDistribution: "MAIN_FEED",
            targetEntities: [],
            thirdPartyDistributionChannels: [],
          },
          lifecycleState: "PUBLISHED",
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.LINKEDIN_ACCESS_TOKEN}`,
            "X-Restli-Protocol-Version": "2.0.0",
            "Content-Type": "application/json",
            "LinkedIn-Version": "202401",
          },
          timeout: 15_000,
        }
      );

      linkedinPostId =
        linkedinResponse.headers["x-restli-id"] ??
        linkedinResponse.data?.id ??
        "unknown";
    } else {
      /* ── Dry-run mode (LinkedIn not configured) ── */
      dryRun = true;
      console.log("[publish] DRY RUN — LinkedIn not configured. Saving draft only.");
    }

    /* ── Update draft record ─────────────────────── */
    await prisma.draft.update({
      where: { id: draftId },
      data: {
        selectedModel,
        finalText: text,
        linkedinPostId: String(linkedinPostId),
        published: !dryRun,
      },
    });

    return NextResponse.json({
      success: true,
      linkedinPostId,
      dryRun,
      message: dryRun
        ? "Draft saved (dry run). LinkedIn not configured yet — add LINKEDIN_ACCESS_TOKEN and LINKEDIN_AUTHOR_URN to go live."
        : "Published to LinkedIn successfully!",
    });
  } catch (err) {
    console.error("[publish] Error:", err);

    // Forward LinkedIn API errors for debugging
    if (axios.isAxiosError(err) && err.response) {
      return NextResponse.json(
        {
          error: "LinkedIn API error",
          status: err.response.status,
          details: err.response.data,
        },
        { status: err.response.status }
      );
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
