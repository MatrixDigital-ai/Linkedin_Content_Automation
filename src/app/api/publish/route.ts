import axios from "axios";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const bodySchema = z.object({
  draftId: z.string().min(1),
  selectedModel: z.enum(["openai", "gemini", "claude", "geminiDirect", "groq"]),
  text: z.string().min(1).max(3000),
  imageUrl: z.string().url().optional(),
});

/** Check if LinkedIn credentials are configured */
function isLinkedInConfigured(): boolean {
  return !!(
    process.env.LINKEDIN_ACCESS_TOKEN &&
    process.env.LINKEDIN_AUTHOR_URN &&
    process.env.LINKEDIN_AUTHOR_URN !== "urn:li:person:XXXX"
  );
}

/**
 * Strip markdown-style formatting for LinkedIn (plain text only).
 * - **bold** → bold
 * - *italic* → italic
 * - ◆ bullets → •
 * - Remove ## headings markers
 */
function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")   // **bold** → bold
    .replace(/\*(.+?)\*/g, "$1")        // *italic* → italic
    .replace(/^#{1,6}\s+/gm, "")        // ## Heading → Heading
    .replace(/◆/g, "•");                // ◆ → •
}

/**
 * Upload an image to LinkedIn and return its URN.
 * 1. Downloads the image from the given URL (e.g. Canva export).
 * 2. Initializes an upload on LinkedIn.
 * 3. PUTs the binary to the upload URL.
 */
async function uploadImageToLinkedIn(imageUrl: string): Promise<string> {
  const token = process.env.LINKEDIN_ACCESS_TOKEN!;
  const author = process.env.LINKEDIN_AUTHOR_URN!;
  const headers = {
    Authorization: `Bearer ${token}`,
    "LinkedIn-Version": "202401",
    "X-Restli-Protocol-Version": "2.0.0",
    "Content-Type": "application/json",
  };

  // 1. Download image from Canva export URL
  const imageRes = await axios.get(imageUrl, {
    responseType: "arraybuffer",
    timeout: 30_000,
  });
  const imageBuffer = Buffer.from(imageRes.data);

  // 2. Initialize upload on LinkedIn
  const initRes = await axios.post(
    "https://api.linkedin.com/rest/images?action=initializeUpload",
    { initializeUploadRequest: { owner: author } },
    { headers, timeout: 15_000 }
  );

  const uploadUrl = initRes.data?.value?.uploadUrl;
  const imageUrn = initRes.data?.value?.image;

  if (!uploadUrl || !imageUrn) {
    throw new Error("LinkedIn did not return upload URL or image URN");
  }

  // 3. Upload binary
  await axios.put(uploadUrl, imageBuffer, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/octet-stream",
    },
    timeout: 60_000,
  });

  return imageUrn;
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
    const { draftId, selectedModel, text, imageUrl } = parsed.data;
    const cleanText = stripMarkdown(text);

    let linkedinPostId = "dry-run-" + Date.now();
    let dryRun = false;

    if (isLinkedInConfigured()) {
      /* ── Upload image if provided ──────────────── */
      let imageUrn: string | null = null;
      if (imageUrl) {
        try {
          imageUrn = await uploadImageToLinkedIn(imageUrl);
        } catch (imgErr) {
          console.error("[publish] Image upload failed:", imgErr);
          return NextResponse.json(
            {
              error:
                "Failed to upload image to LinkedIn. Post not published.",
            },
            { status: 500 }
          );
        }
      }

      /* ── Build LinkedIn post payload ───────────── */
      const postBody: Record<string, unknown> = {
        author: process.env.LINKEDIN_AUTHOR_URN,
        commentary: cleanText,
        visibility: "PUBLIC",
        distribution: {
          feedDistribution: "MAIN_FEED",
          targetEntities: [],
          thirdPartyDistributionChannels: [],
        },
        lifecycleState: "PUBLISHED",
      };

      if (imageUrn) {
        postBody.content = {
          media: { title: "Design", id: imageUrn },
        };
      }

      /* ── Post to LinkedIn (LIVE) ────────────────── */
      const linkedinResponse = await axios.post(
        "https://api.linkedin.com/v2/posts",
        postBody,
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
      console.log(
        "[publish] DRY RUN — LinkedIn not configured. Saving draft only."
      );
    }

    /* ── Update draft record ─────────────────────── */
    await prisma.draft.update({
      where: { id: draftId },
      data: {
        selectedModel,
        finalText: text,
        imageUrl: imageUrl ?? null,
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
        : imageUrl
        ? "Published to LinkedIn with image successfully!"
        : "Published to LinkedIn successfully!",
    });
  } catch (err) {
    console.error("[publish] Error:", err);

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
