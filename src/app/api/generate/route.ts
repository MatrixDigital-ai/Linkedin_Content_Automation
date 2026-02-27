import axios from "axios";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

const bodySchema = z.object({
  prompt: z.string().min(1).max(2000),
});

/** All 3 models use OpenRouter's OpenAI-compatible response format */
function parseResponse(data: Record<string, unknown>): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = data as any;
  return d?.choices?.[0]?.message?.content ?? "[No response]";
}

/** Make an OpenRouter chat completion call */
function callOpenRouter(apiKey: string, model: string, messages: { role: string; content: string }[]) {
  return axios.post(
    OPENROUTER_URL,
    {
      model,
      messages,
      max_tokens: 800,
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://linkedin-ai-engine.vercel.app",
        "X-Title": "LinkedIn AI Engine",
      },
      timeout: 60_000,
    }
  );
}

export async function POST(req: Request) {
  try {
    /* ── Rate limiting ─────────────────────────────── */
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const { allowed } = rateLimit(ip);
    if (!allowed) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Try again in 1 minute." },
        { status: 429 }
      );
    }

    /* ── Validate body ─────────────────────────────── */
    const body = await req.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid prompt", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const { prompt } = parsed.data;

    const systemPrompt =
      "You are a LinkedIn content strategist. Write a compelling, professional LinkedIn post based on the following topic. Keep it under 3000 characters. Use line breaks for readability. Do not use hashtags unless specifically asked.";

    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: prompt },
    ];

    /* ── Parallel LLM calls via OpenRouter ──────────── */
    const model1Call = callOpenRouter(
      process.env.OPENROUTER_KEY_MODEL1!,
      process.env.MODEL1_ID ?? "openai/gpt-oss-120b",
      messages
    );

    const model2Call = callOpenRouter(
      process.env.OPENROUTER_KEY_MODEL2!,
      process.env.MODEL2_ID ?? "google/gemma-3-27b-it:free",
      messages
    );

    const model3Call = callOpenRouter(
      process.env.OPENROUTER_KEY_MODEL3!,
      process.env.MODEL3_ID ?? "zhipu-ai/glm-4.5-air:free",
      messages
    );

    /* ── Settle all — don't fail if one provider errors ─ */
    const [oResult, gResult, cResult] = await Promise.allSettled([
      model1Call,
      model2Call,
      model3Call,
    ]);

    const openaiText =
      oResult.status === "fulfilled"
        ? parseResponse(oResult.value.data)
        : `[GPT-OSS error: ${oResult.reason?.response?.data?.error?.message ?? oResult.reason?.message ?? "unknown"}]`;

    const geminiText =
      gResult.status === "fulfilled"
        ? parseResponse(gResult.value.data)
        : `[Gemma error: ${gResult.reason?.response?.data?.error?.message ?? gResult.reason?.message ?? "unknown"}]`;

    const claudeText =
      cResult.status === "fulfilled"
        ? parseResponse(cResult.value.data)
        : `[GLM error: ${cResult.reason?.response?.data?.error?.message ?? cResult.reason?.message ?? "unknown"}]`;

    /* ── Persist draft ─────────────────────────────── */
    const draft = await prisma.draft.create({
      data: { prompt, openaiText, geminiText, claudeText },
    });

    return NextResponse.json({
      id: draft.id,
      openai: openaiText,
      gemini: geminiText,
      claude: claudeText,
    });
  } catch (err) {
    console.error("[generate] Unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
