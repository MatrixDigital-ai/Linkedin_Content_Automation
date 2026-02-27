"use client";

import { useState, useEffect, useMemo } from "react";

/* ─── Types ──────────────────────────────────────── */

type Model = "openai" | "gemini" | "claude" | "geminiDirect" | "groq";

interface GenerateResponse {
  id: string;
  openai: string;
  gemini: string;
  claude: string;
  geminiDirect: string;
  groq: string;
}

interface CanvaDesign {
  id: string;
  title: string;
  thumbnail?: { url: string; width: number; height: number };
}

const MODEL_LABELS: Record<
  Model,
  { name: string; tag: string; border: string; bg: string; text: string; dot: string }
> = {
  openai: {
    name: "GPT-OSS 120B",
    tag: "OpenAI",
    border: "border-emerald-400",
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    dot: "bg-emerald-500",
  },
  gemini: {
    name: "Gemma 3 27B",
    tag: "Google",
    border: "border-sky-400",
    bg: "bg-sky-50",
    text: "text-sky-700",
    dot: "bg-sky-500",
  },
  claude: {
    name: "GLM 4.5 Air",
    tag: "Zhipu AI",
    border: "border-amber-400",
    bg: "bg-amber-50",
    text: "text-amber-700",
    dot: "bg-amber-500",
  },
  geminiDirect: {
    name: "Gemini 2.0 Flash",
    tag: "Google",
    border: "border-violet-400",
    bg: "bg-violet-50",
    text: "text-violet-700",
    dot: "bg-violet-500",
  },
  groq: {
    name: "Llama 3.3 70B",
    tag: "Groq",
    border: "border-rose-400",
    bg: "bg-rose-50",
    text: "text-rose-700",
    dot: "bg-rose-500",
  },
};

const STEPS = [
  { label: "Generate", icon: "M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" },
  { label: "Select", icon: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" },
  { label: "Design", icon: "M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" },
  { label: "Publish", icon: "M12 19l9 2-9-18-9 18 9-2zm0 0v-8" },
];

/* ─── Markdown-like text formatter ─────────────── */

function FormatText({ text }: { text: string }) {
  const parts = useMemo(() => {
    if (!text) return [];
    const lines = text.split("\n");
    const elements: React.ReactNode[] = [];

    lines.forEach((line, li) => {
      // Process inline **bold**
      const processInline = (s: string): React.ReactNode[] => {
        const out: React.ReactNode[] = [];
        const re = /\*\*(.+?)\*\*/g;
        let last = 0;
        let m: RegExpExecArray | null;
        while ((m = re.exec(s))) {
          if (m.index > last) out.push(s.slice(last, m.index));
          out.push(
            <strong key={`${li}-${m.index}`} className="font-semibold text-stone-900">
              {m[1]}
            </strong>
          );
          last = m.index + m[0].length;
        }
        if (last < s.length) out.push(s.slice(last));
        return out;
      };

      // Empty line → spacing
      if (line.trim() === "") {
        elements.push(<div key={`sp-${li}`} className="h-2" />);
        return;
      }

      // Bullet: ◆ or • or - or *
      const bulletMatch = line.match(/^\s*[◆•\-\*]\s+(.*)/);
      if (bulletMatch) {
        elements.push(
          <div key={li} className="flex gap-2 pl-1 mb-1">
            <span className="text-stone-400 mt-0.5 shrink-0">•</span>
            <span>{processInline(bulletMatch[1])}</span>
          </div>
        );
        return;
      }

      // Numbered list: 1. or 1)
      const numMatch = line.match(/^\s*(\d+)[.)]\s+(.*)/);
      if (numMatch) {
        elements.push(
          <div key={li} className="flex gap-2.5 pl-1 mb-1.5">
            <span className="text-stone-400 font-medium tabular-nums shrink-0 w-4 text-right">
              {numMatch[1]}.
            </span>
            <span>{processInline(numMatch[2])}</span>
          </div>
        );
        return;
      }

      // Normal paragraph
      elements.push(
        <p key={li} className="mb-1">
          {processInline(line)}
        </p>
      );
    });

    return elements;
  }, [text]);

  return <div className="formatted-text">{parts}</div>;
}

/* ─── Main Component ─────────────────────────────── */

export default function DashboardPage() {
  const [step, setStep] = useState(0);
  const [prompt, setPrompt] = useState("");
  const [outputs, setOutputs] = useState<GenerateResponse | null>(null);
  const [selected, setSelected] = useState<Model | null>(null);
  const [generating, setGenerating] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState(false);
  const [status, setStatus] = useState<{
    type: "success" | "error" | "info";
    message: string;
  } | null>(null);

  // Canva
  const [canvaConnected, setCanvaConnected] = useState(false);
  const [canvaChecking, setCanvaChecking] = useState(true);
  const [designs, setDesigns] = useState<CanvaDesign[]>([]);
  const [continuation, setContinuation] = useState<string | null>(null);
  const [loadingDesigns, setLoadingDesigns] = useState(false);
  const [selectedDesign, setSelectedDesign] = useState<CanvaDesign | null>(null);
  const [exportedImageUrl, setExportedImageUrl] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/canva/status");
        const data = await res.json();
        setCanvaConnected(data.connected);
      } catch {
        setCanvaConnected(false);
      } finally {
        setCanvaChecking(false);
      }
    })();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("canva_connected") === "true") {
      setCanvaConnected(true);
      setStatus({ type: "success", message: "Canva account connected successfully." });
      window.history.replaceState({}, "", "/dashboard");
    }
    const err = params.get("canva_error");
    if (err) {
      setStatus({ type: "error", message: `Canva connection failed: ${err}` });
      window.history.replaceState({}, "", "/dashboard");
    }
  }, []);

  /* ── Handlers ────────────────────────────────── */

  async function handleGenerate() {
    if (!prompt.trim()) return;
    setGenerating(true);
    setOutputs(null);
    setSelected(null);
    setSelectedDesign(null);
    setExportedImageUrl(null);
    setPublished(false);
    setStep(0);
    setStatus({ type: "info", message: "Generating content from 5 AI models in parallel…" });

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      const data: GenerateResponse = await res.json();
      setOutputs(data);
      setStep(1);
      setStatus({ type: "success", message: "All 5 models responded. Choose the version you prefer." });
    } catch (err) {
      setStatus({ type: "error", message: err instanceof Error ? err.message : "Generation failed." });
    } finally {
      setGenerating(false);
    }
  }

  function handleModelSelect(model: Model) {
    setSelected(model);
    setStep(2);
    if (canvaConnected && designs.length === 0) loadDesigns();
  }

  async function loadDesigns(cont?: string) {
    setLoadingDesigns(true);
    try {
      const qs = cont ? `?continuation=${cont}` : "";
      const res = await fetch(`/api/canva/designs${qs}`);
      if (!res.ok) throw new Error("Failed to load designs");
      const data = await res.json();
      setDesigns((prev) => (cont ? [...prev, ...(data.items ?? [])] : data.items ?? []));
      setContinuation(data.continuation ?? null);
    } catch {
      setStatus({ type: "error", message: "Failed to load Canva designs." });
    } finally {
      setLoadingDesigns(false);
    }
  }

  async function handleDesignSelect(design: CanvaDesign) {
    setSelectedDesign(design);
    setExporting(true);
    setStatus({ type: "info", message: "Exporting design from Canva…" });
    try {
      const res = await fetch("/api/canva/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ designId: design.id }),
      });
      if (!res.ok) throw new Error("Export failed");
      const data = await res.json();
      setExportedImageUrl(data.imageUrl);
      setStep(3);
      setStatus({ type: "success", message: "Design exported. Review your post below." });
    } catch {
      setStatus({ type: "error", message: "Failed to export design from Canva." });
      setSelectedDesign(null);
    } finally {
      setExporting(false);
    }
  }

  function handleSkipDesign() {
    setSelectedDesign(null);
    setExportedImageUrl(null);
    setStep(3);
    setStatus(null);
  }

  async function handlePublish() {
    if (!outputs || !selected) return;
    const text = outputs[selected];
    if (!text || text.startsWith("[")) {
      setStatus({ type: "error", message: "Selected model returned an error." });
      return;
    }
    setPublishing(true);
    setStatus({ type: "info", message: "Publishing to LinkedIn…" });
    try {
      const res = await fetch("/api/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draftId: outputs.id,
          selectedModel: selected,
          text,
          imageUrl: exportedImageUrl ?? undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      setPublished(!data.dryRun);
      setStatus({
        type: data.dryRun ? "info" : "success",
        message: data.message ?? "Published successfully!",
      });
    } catch (err) {
      setStatus({ type: "error", message: err instanceof Error ? err.message : "Publish failed." });
    } finally {
      setPublishing(false);
    }
  }

  function handleStartOver() {
    setStep(0);
    setPrompt("");
    setOutputs(null);
    setSelected(null);
    setSelectedDesign(null);
    setExportedImageUrl(null);
    setPublished(false);
    setStatus(null);
  }

  const selectedText = outputs && selected ? outputs[selected] : "";

  /* ─── Render ─────────────────────────────────── */
  return (
    <div className="min-h-screen bg-stone-100/80">
      {/* ── Navbar ── */}
      <header className="sticky top-0 z-50 bg-white/70 backdrop-blur-xl border-b border-stone-200/60">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-stone-900 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </div>
            <span className="text-sm font-semibold tracking-tight text-stone-900">
              LinkedIn AI Engine
            </span>
          </div>
          <div className="flex items-center gap-2">
            {!canvaChecking && (
              <div className={`flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-md ${
                canvaConnected ? "bg-violet-50 text-violet-600" : "bg-stone-50 text-stone-400"
              }`}>
                <div className={`w-1.5 h-1.5 rounded-full ${canvaConnected ? "bg-violet-500" : "bg-stone-300"}`} />
                Canva
              </div>
            )}
            <div className="flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-600">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Online
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-6 space-y-5">
        {/* ── Step Progress ── */}
        <div className="flex items-center justify-between bg-white rounded-xl border border-stone-200/60 px-5 py-3 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
          {STEPS.map((s, i) => (
            <div key={s.label} className="flex items-center gap-3 flex-1">
              {i > 0 && (
                <div className={`flex-1 h-px max-w-16 ${i <= step ? "bg-stone-900" : "bg-stone-200"}`} />
              )}
              <div className="flex items-center gap-2">
                <div
                  className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all ${
                    i === step
                      ? "bg-stone-900 text-white"
                      : i < step
                      ? "bg-stone-900 text-white"
                      : "bg-stone-100 text-stone-400"
                  }`}
                >
                  {i < step ? (
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d={s.icon} />
                    </svg>
                  )}
                </div>
                <span className={`text-xs font-medium hidden sm:block ${
                  i <= step ? "text-stone-900" : "text-stone-400"
                }`}>
                  {s.label}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* ── Status ── */}
        {status && (
          <div
            className={`rounded-lg px-4 py-2.5 text-[13px] font-medium flex items-center gap-2 ${
              status.type === "success"
                ? "bg-emerald-50 text-emerald-700 border border-emerald-200/60"
                : status.type === "error"
                ? "bg-red-50 text-red-700 border border-red-200/60"
                : "bg-sky-50 text-sky-700 border border-sky-200/60"
            }`}
          >
            {status.type === "info" && <Spinner />}
            {status.type === "success" && (
              <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            )}
            {status.message}
          </div>
        )}

        {/* ── Step 1: Prompt ── */}
        <section className="card-surface p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-5 h-5 rounded bg-stone-900 text-white flex items-center justify-center text-[10px] font-bold">1</span>
            <h2 className="text-sm font-semibold text-stone-900">Content Prompt</h2>
          </div>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe the LinkedIn post you want to create…"
            rows={3}
            className="w-full bg-stone-50 border border-stone-200 rounded-lg px-4 py-3 text-[13px] text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-900/10 focus:border-stone-400 resize-none leading-relaxed"
            disabled={generating}
          />
          <div className="flex items-center justify-between mt-3">
            <span className="text-[11px] text-stone-400 tabular-nums">{prompt.length} chars</span>
            <button
              onClick={handleGenerate}
              disabled={generating || !prompt.trim()}
              className="h-9 px-5 bg-stone-900 hover:bg-stone-800 disabled:bg-stone-200 disabled:text-stone-400 text-white text-[13px] font-medium rounded-lg transition-colors flex items-center gap-2"
            >
              {generating ? <><Spinner /> Generating…</> : "Generate"}
            </button>
          </div>
        </section>

        {/* ── Step 2: Model Cards ── */}
        {outputs && step >= 1 && (
          <section>
            <div className="flex items-center gap-2 mb-3 px-1">
              <span className="w-5 h-5 rounded bg-stone-900 text-white flex items-center justify-center text-[10px] font-bold">2</span>
              <h2 className="text-sm font-semibold text-stone-900">Select Output</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {(Object.keys(MODEL_LABELS) as Model[]).map((model) => {
                const text = outputs[model];
                const isError = text.startsWith("[");
                const isSelected = selected === model;
                const m = MODEL_LABELS[model];
                return (
                  <button
                    key={model}
                    onClick={() => !isError && handleModelSelect(model)}
                    disabled={isError}
                    className={`text-left rounded-xl border p-4 transition-all group ${
                      isSelected
                        ? `${m.border} border-2 bg-white shadow-md`
                        : isError
                        ? "border-stone-200 bg-stone-50 opacity-50 cursor-not-allowed"
                        : "border-stone-200 bg-white hover:border-stone-300 hover:shadow-sm"
                    }`}
                  >
                    {/* Card Header */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${m.dot}`} />
                        <span className="text-[13px] font-semibold text-stone-900">{m.name}</span>
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${m.bg} ${m.text}`}>
                          {m.tag}
                        </span>
                      </div>
                      {isSelected && (
                        <div className="w-5 h-5 rounded-full bg-stone-900 flex items-center justify-center">
                          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                      )}
                      {isError && (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-red-50 text-red-600">
                          Failed
                        </span>
                      )}
                    </div>
                    {/* Card Body — formatted */}
                    <div className="text-[12.5px] text-stone-600 leading-relaxed max-h-72 overflow-y-auto pr-1">
                      <FormatText text={text} />
                    </div>
                    <div className="mt-3 pt-2 border-t border-stone-100 text-[11px] text-stone-400 tabular-nums">
                      {text.length} characters
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* ── Step 3: Canva Design ── */}
        {step >= 2 && (
          <section className="card-surface p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded bg-stone-900 text-white flex items-center justify-center text-[10px] font-bold">3</span>
                <h2 className="text-sm font-semibold text-stone-900">Attach Design</h2>
                <span className="text-[11px] text-stone-400 font-normal">Optional</span>
              </div>
              <button
                onClick={handleSkipDesign}
                className="text-[12px] text-stone-500 hover:text-stone-900 font-medium transition-colors"
              >
                Skip — text only →
              </button>
            </div>

            {!canvaConnected ? (
              <div className="flex flex-col items-center gap-3 py-12 bg-stone-50 rounded-lg border border-dashed border-stone-300">
                <div className="w-12 h-12 rounded-xl bg-violet-50 flex items-center justify-center">
                  <svg className="w-6 h-6 text-violet-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <rect x="3" y="3" width="18" height="18" rx="3" />
                    <path d="M9 3v18M3 9h18" />
                  </svg>
                </div>
                <p className="text-[13px] text-stone-500 text-center max-w-xs">
                  Connect Canva to browse your designs and attach them to posts.
                </p>
                <a
                  href="/api/canva/auth"
                  className="h-9 px-5 bg-violet-600 hover:bg-violet-700 text-white text-[13px] font-medium rounded-lg transition-colors inline-flex items-center"
                >
                  Connect Canva
                </a>
              </div>
            ) : (
              <div className="space-y-4">
                {exporting && (
                  <div className="flex items-center gap-2 text-[13px] text-sky-700 bg-sky-50 px-4 py-2 rounded-lg border border-sky-200/60">
                    <Spinner /> Exporting…
                  </div>
                )}

                {designs.length === 0 && !loadingDesigns ? (
                  <div className="text-center py-10">
                    <button
                      onClick={() => loadDesigns()}
                      className="h-9 px-5 bg-violet-600 hover:bg-violet-700 text-white text-[13px] font-medium rounded-lg transition-colors"
                    >
                      Load My Designs
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                      {designs.map((d) => (
                        <button
                          key={d.id}
                          onClick={() => handleDesignSelect(d)}
                          disabled={exporting}
                          className={`group relative rounded-lg overflow-hidden border transition-all ${
                            selectedDesign?.id === d.id
                              ? "border-violet-500 ring-2 ring-violet-200 shadow-sm"
                              : "border-stone-200 hover:border-stone-300 hover:shadow-sm"
                          }`}
                        >
                          <div className="aspect-[4/3] bg-stone-100 flex items-center justify-center overflow-hidden">
                            {d.thumbnail?.url ? (
                              /* eslint-disable-next-line @next/next/no-img-element */
                              <img src={d.thumbnail.url} alt={d.title} className="w-full h-full object-cover" />
                            ) : (
                              <span className="text-[11px] text-stone-400">No preview</span>
                            )}
                          </div>
                          <div className="px-2 py-1.5 bg-white">
                            <p className="text-[11px] font-medium text-stone-700 truncate">{d.title || "Untitled"}</p>
                          </div>
                          {selectedDesign?.id === d.id && (
                            <div className="absolute top-1.5 right-1.5 w-5 h-5 bg-violet-600 rounded-full flex items-center justify-center">
                              <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                    <div className="flex justify-center">
                      {loadingDesigns ? (
                        <div className="flex items-center gap-2 text-[12px] text-stone-400">
                          <Spinner /> Loading…
                        </div>
                      ) : continuation ? (
                        <button
                          onClick={() => loadDesigns(continuation)}
                          className="text-[12px] text-violet-600 hover:text-violet-800 font-medium"
                        >
                          Load more
                        </button>
                      ) : null}
                    </div>
                  </>
                )}
              </div>
            )}
          </section>
        )}

        {/* ── Step 4: Preview & Publish ── */}
        {step >= 3 && (
          <section>
            <div className="flex items-center gap-2 mb-3 px-1">
              <span className="w-5 h-5 rounded bg-stone-900 text-white flex items-center justify-center text-[10px] font-bold">4</span>
              <h2 className="text-sm font-semibold text-stone-900">Preview & Publish</h2>
            </div>

            {/* LinkedIn Preview */}
            <div className="max-w-xl mx-auto">
              <div className="bg-white rounded-xl border border-stone-200/60 shadow-sm overflow-hidden">
                {/* Author */}
                <div className="flex items-center gap-3 px-5 pt-5 pb-3">
                  <div className="w-11 h-11 rounded-full bg-gradient-to-br from-stone-100 to-stone-200 flex items-center justify-center text-stone-600 font-semibold text-sm ring-1 ring-stone-200/60">
                    AS
                  </div>
                  <div>
                    <p className="text-[13px] font-semibold text-stone-900 leading-tight">Amisha Sharma</p>
                    <p className="text-[11px] text-stone-400 leading-tight mt-0.5">Just now · Public</p>
                  </div>
                </div>

                {/* Text Content */}
                <div className="px-5 pb-4">
                  <div className="text-[13px] text-stone-700 leading-[1.65]">
                    <FormatText text={selectedText} />
                  </div>
                </div>

                {/* Image */}
                {exportedImageUrl && (
                  <div className="border-t border-stone-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={exportedImageUrl}
                      alt="Design"
                      className="w-full object-contain max-h-[420px] bg-stone-50"
                    />
                  </div>
                )}

                {/* Engagement bar */}
                <div className="border-t border-stone-100 px-5 py-2.5 flex items-center gap-8">
                  {[
                    { label: "Like", d: "M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3H14z" },
                    { label: "Comment", d: "M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" },
                    { label: "Repost", d: "M17 1l4 4-4 4M3 11V9a4 4 0 014-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 01-4 4H3" },
                    { label: "Send", d: "M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" },
                  ].map((a) => (
                    <span key={a.label} className="flex items-center gap-1.5 text-[11px] text-stone-400 font-medium">
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d={a.d} />
                      </svg>
                      {a.label}
                    </span>
                  ))}
                </div>
              </div>

              {/* Meta info */}
              <div className="flex items-center justify-between text-[11px] text-stone-400 mt-2 px-1">
                <div className="flex items-center gap-3">
                  {selected && (
                    <span className="flex items-center gap-1.5">
                      <div className={`w-1.5 h-1.5 rounded-full ${MODEL_LABELS[selected].dot}`} />
                      {MODEL_LABELS[selected].name}
                    </span>
                  )}
                  {selectedDesign && (
                    <span>Design: {selectedDesign.title || "Untitled"}</span>
                  )}
                </div>
                <span className="tabular-nums">{selectedText.length} chars</span>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between mt-5 mb-8">
                <button
                  onClick={handleStartOver}
                  className="text-[13px] text-stone-400 hover:text-stone-700 font-medium transition-colors"
                >
                  ← New post
                </button>
                <button
                  onClick={handlePublish}
                  disabled={publishing || published}
                  className={`h-11 px-7 text-[14px] font-semibold rounded-xl transition-all flex items-center gap-2 ${
                    published
                      ? "bg-emerald-600 text-white cursor-default"
                      : "bg-stone-900 hover:bg-stone-800 disabled:bg-stone-200 disabled:text-stone-400 text-white shadow-sm"
                  }`}
                >
                  {publishing ? (
                    <><Spinner /> Publishing…</>
                  ) : published ? (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      Published
                    </>
                  ) : (
                    "Publish to LinkedIn"
                  )}
                </button>
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

/* ─── Spinner ────────────────────────────────────── */
function Spinner() {
  return (
    <svg className="animate-spin h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}
