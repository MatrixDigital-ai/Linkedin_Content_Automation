import axios from "axios";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

const bodySchema = z.object({
  prompt: z.string().min(1).max(2000),
});

/** Parse OpenAI-compatible chat completion response */
function parseOpenAIResponse(data: Record<string, unknown>): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = data as any;
  return d?.choices?.[0]?.message?.content ?? "[No response]";
}

/** Parse Google Gemini REST API response */
function parseGeminiResponse(data: Record<string, unknown>): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = data as any;
  return d?.candidates?.[0]?.content?.parts?.[0]?.text ?? "[No response]";
}

/** Make an OpenRouter chat completion call */
function callOpenRouter(apiKey: string, model: string, messages: { role: string; content: string }[]) {
  return axios.post(
    OPENROUTER_URL,
    { model, messages, max_tokens: 800 },
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

/** Call Google Gemini API directly */
function callGemini(apiKey: string, modelId: string, systemPrompt: string, userPrompt: string) {
  return axios.post(
    `${GEMINI_URL}/${modelId}:generateContent?key=${apiKey}`,
    {
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: { maxOutputTokens: 800 },
    },
    { headers: { "Content-Type": "application/json" }, timeout: 60_000 }
  );
}

/** Call Groq API (OpenAI-compatible) */
function callGroq(apiKey: string, modelId: string, messages: { role: string; content: string }[]) {
  return axios.post(
    GROQ_URL,
    { model: modelId, messages, max_tokens: 800 },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
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
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON in request body" },
        { status: 400 }
      );
    }
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      console.error("[generate] Validation failed:", JSON.stringify(parsed.error.flatten()), "Body received:", JSON.stringify(body));
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

    /* ── Parallel LLM calls — 3 OpenRouter + 1 Gemini + 1 Groq ── */

    // OpenRouter models
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
      process.env.MODEL3_ID ?? "zhipu-ai/glm-z1-air:free",
      messages
    );

    // Gemini direct
    const geminiDirectCall = callGemini(
      process.env.GEMINI_API_KEY!,
      process.env.GEMINI_MODEL_ID ?? "gemini-2.0-flash",
      systemPrompt,
      prompt
    );

    // Groq direct
    const groqCall = callGroq(
      process.env.GROQ_API_KEY!,
      process.env.GROQ_MODEL_ID ?? "llama-3.3-70b-versatile",
      messages
    );

    /* ── Settle all — don't fail if one provider errors ── */
    const [oResult, gResult, cResult, gemDResult, groqResult] =
      await Promise.allSettled([
        model1Call,
        model2Call,
        model3Call,
        geminiDirectCall,
        groqCall,
      ]);

    const openaiText =
      oResult.status === "fulfilled"
        ? parseOpenAIResponse(oResult.value.data)
        : `[GPT-OSS error: ${oResult.reason?.response?.data?.error?.message ?? oResult.reason?.message ?? "unknown"}]`;

    const geminiText =
      gResult.status === "fulfilled"
        ? parseOpenAIResponse(gResult.value.data)
        : `[Gemma error: ${gResult.reason?.response?.data?.error?.message ?? gResult.reason?.message ?? "unknown"}]`;

    const claudeText =
      cResult.status === "fulfilled"
        ? parseOpenAIResponse(cResult.value.data)
        : `[GLM error: ${cResult.reason?.response?.data?.error?.message ?? cResult.reason?.message ?? "unknown"}]`;

    const geminiDirectText =
      gemDResult.status === "fulfilled"
        ? parseGeminiResponse(gemDResult.value.data)
        : `[Gemini error: ${gemDResult.reason?.response?.data?.error?.message ?? gemDResult.reason?.message ?? "unknown"}]`;

    const groqText =
      groqResult.status === "fulfilled"
        ? parseOpenAIResponse(groqResult.value.data)
        : `[Groq error: ${groqResult.reason?.response?.data?.error?.message ?? groqResult.reason?.message ?? "unknown"}]`;

    /* ── Persist draft ─────────────────────────────── */
    const draft = await prisma.draft.create({
      data: { prompt, openaiText, geminiText, claudeText, geminiDirectText, groqText },
    });

    return NextResponse.json({
      id: draft.id,
      openai: openaiText,
      gemini: geminiText,
      claude: claudeText,
      geminiDirect: geminiDirectText,
      groq: groqText,
    });
  } catch (err) {
    console.error("[generate] Unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
