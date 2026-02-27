import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const bodySchema = z.object({
  designId: z.string().min(1),
});

/**
 * POST /api/canva/export
 * Exports a Canva design to PNG and polls until the job completes.
 * Returns { success: true, imageUrl: "https://..." }
 */
export async function POST(req: Request) {
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

    const body = await req.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid payload", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const headers = {
      Authorization: `Bearer ${token.accessToken}`,
      "Content-Type": "application/json",
    };

    // Create export job
    const exportRes = await fetch("https://api.canva.com/rest/v1/exports", {
      method: "POST",
      headers,
      body: JSON.stringify({
        design_id: parsed.data.designId,
        format: { type: "png" },
      }),
    });

    if (!exportRes.ok) {
      const errText = await exportRes.text();
      console.error("[canva/export] Create export failed:", errText);
      return NextResponse.json(
        { error: "Failed to start Canva export" },
        { status: exportRes.status }
      );
    }

    const exportData = await exportRes.json();
    const jobId = exportData.job?.id;

    if (!jobId) {
      return NextResponse.json(
        { error: "No export job ID returned from Canva" },
        { status: 500 }
      );
    }

    // Poll for completion (max ~30 seconds)
    for (let attempt = 0; attempt < 15; attempt++) {
      await new Promise((r) => setTimeout(r, 2000));

      const statusRes = await fetch(
        `https://api.canva.com/rest/v1/exports/${jobId}`,
        { headers: { Authorization: `Bearer ${token.accessToken}` } }
      );

      if (!statusRes.ok) continue;

      const statusData = await statusRes.json();
      const job = statusData.job;

      if (job?.status === "success") {
        // Extract URL from result — handle multiple possible formats
        const imageUrl =
          job.result?.urls?.[0] ??
          job.urls?.[0] ??
          null;

        if (imageUrl) {
          return NextResponse.json({ success: true, imageUrl });
        }
      }

      if (job?.status === "failed") {
        return NextResponse.json(
          { error: "Canva export job failed" },
          { status: 500 }
        );
      }

      // Still in_progress — keep polling
    }

    return NextResponse.json(
      { error: "Export timed out after 30 seconds" },
      { status: 504 }
    );
  } catch (err) {
    console.error("[canva/export] Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
