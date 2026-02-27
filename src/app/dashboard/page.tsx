"use client";

import { useState, useEffect } from "react";

/* ─── Types ──────────────────────────────────────── */

type Model = "openai" | "gemini" | "claude";

interface GenerateResponse {
  id: string;
  openai: string;
  gemini: string;
  claude: string;
}

interface CanvaDesign {
  id: string;
  title: string;
  thumbnail?: { url: string; width: number; height: number };
}

const MODEL_LABELS: Record<Model, { name: string; color: string; accent: string }> = {
  openai: { name: "GPT-OSS 120B", color: "border-emerald-500", accent: "bg-emerald-50 text-emerald-700" },
  gemini: { name: "Gemma 3 27B", color: "border-blue-500", accent: "bg-blue-50 text-blue-700" },
  claude: { name: "GLM 4.5 Air", color: "border-amber-500", accent: "bg-amber-50 text-amber-700" },
};

const STEPS = ["Generate", "Select Model", "Add Design", "Preview & Publish"];

/* ─── Main Component ─────────────────────────────── */

export default function DashboardPage() {
  const [step, setStep] = useState(0);
  const [prompt, setPrompt] = useState("");
  const [outputs, setOutputs] = useState<GenerateResponse | null>(null);
  const [selected, setSelected] = useState<Model | null>(null);
  const [generating, setGenerating] = useState(false);
  const [publishing, setPublishing] = useState(false);
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

  /* ── Canva status check on mount ─────────────── */
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

  /* ── Handle query-string messages from Canva callback ── */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("canva_connected") === "true") {
      setCanvaConnected(true);
      setStatus({ type: "success", message: "Canva account connected!" });
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
    setStep(0);
    setStatus({ type: "info", message: "Generating from 3 models in parallel…" });

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
      setStatus({ type: "success", message: "All 3 models responded. Select your preferred version." });
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
      setStatus({ type: "success", message: "Design ready! Review your post preview." });
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
    setStatus({ type: "info", message: "Text-only post. Review your preview below." });
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
    setStatus(null);
  }

  const selectedText = outputs && selected ? outputs[selected] : "";

  /* ─── Render ─────────────────────────────────── */
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur sticky top-0 z-10 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              LinkedIn AI Engine
            </h1>
            <p className="text-sm text-slate-500">Multi-model publishing dashboard</p>
          </div>
          <div className="flex items-center gap-3">
            {!canvaChecking && (
              <span
                className={`text-xs px-3 py-1 rounded-full font-medium border ${
                  canvaConnected
                    ? "bg-purple-50 text-purple-700 border-purple-200"
                    : "bg-slate-50 text-slate-500 border-slate-200"
                }`}
              >
                {canvaConnected ? "Canva Connected" : "Canva Not Connected"}
              </span>
            )}
            <span className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 px-3 py-1 rounded-full font-medium">
              System Online
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* Step Indicator */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2">
          {STEPS.map((label, i) => (
            <div key={label} className="flex items-center gap-2">
              {i > 0 && (
                <div
                  className={`w-8 h-px ${
                    i <= step ? "bg-blue-400" : "bg-slate-200"
                  }`}
                />
              )}
              <div
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                  i === step
                    ? "bg-blue-600 text-white"
                    : i < step
                    ? "bg-blue-100 text-blue-700"
                    : "bg-slate-100 text-slate-400"
                }`}
              >
                <span
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                    i === step
                      ? "bg-white text-blue-600"
                      : i < step
                      ? "bg-blue-600 text-white"
                      : "bg-slate-300 text-white"
                  }`}
                >
                  {i < step ? "✓" : i + 1}
                </span>
                {label}
              </div>
            </div>
          ))}
        </div>

        {/* Status Banner */}
        {status && (
          <div
            className={`rounded-lg px-4 py-3 text-sm font-medium ${
              status.type === "success"
                ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                : status.type === "error"
                ? "bg-red-50 text-red-800 border border-red-200"
                : "bg-blue-50 text-blue-800 border border-blue-200"
            }`}
          >
            {status.message}
          </div>
        )}

        {/* ── Step 1: Prompt ──────────────────────── */}
        <section className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
          <label className="block text-sm font-semibold text-slate-700 mb-2">
            Step 1 — Content Prompt
          </label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g. Write a thought-leadership post about AI transforming supply chain management…"
            rows={4}
            className="w-full bg-slate-50 border border-slate-300 rounded-lg px-4 py-3 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            disabled={generating}
          />
          <div className="flex items-center justify-between mt-4">
            <span className="text-xs text-slate-500">{prompt.length} / 2000 characters</span>
            <button
              onClick={handleGenerate}
              disabled={generating || !prompt.trim()}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-semibold rounded-lg transition-colors flex items-center gap-2 shadow-sm"
            >
              {generating ? (
                <>
                  <Spinner /> Generating…
                </>
              ) : (
                "Generate from 3 Models"
              )}
            </button>
          </div>
        </section>

        {/* ── Step 2: Select Model ────────────────── */}
        {outputs && step >= 1 && (
          <section className="space-y-4">
            <h2 className="text-sm font-semibold text-slate-700">
              Step 2 — Select Model Output
            </h2>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {(Object.keys(MODEL_LABELS) as Model[]).map((model) => {
                const text = outputs[model];
                const isError = text.startsWith("[");
                const isSelected = selected === model;
                const { name, color } = MODEL_LABELS[model];
                return (
                  <button
                    key={model}
                    onClick={() => !isError && handleModelSelect(model)}
                    disabled={isError}
                    className={`text-left rounded-xl border-2 p-5 transition-all ${
                      isSelected
                        ? `${color} bg-blue-50 shadow-lg shadow-blue-100`
                        : isError
                        ? "border-red-200 bg-red-50/50 opacity-60 cursor-not-allowed"
                        : "border-slate-200 bg-white hover:border-slate-400 shadow-sm"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-semibold text-sm text-slate-800">{name}</span>
                      {isSelected && (
                        <span className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded-full">
                          Selected
                        </span>
                      )}
                      {isError && (
                        <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                          Error
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-slate-600 whitespace-pre-wrap leading-relaxed max-h-80 overflow-y-auto">
                      {text}
                    </div>
                    <div className="mt-3 text-xs text-slate-400">{text.length} characters</div>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* ── Step 3: Canva Design ────────────────── */}
        {step >= 2 && (
          <section className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-700">
                Step 3 — Attach a Canva Design{" "}
                <span className="text-slate-400 font-normal">(optional)</span>
              </h2>
              <button
                onClick={handleSkipDesign}
                className="text-sm text-blue-600 hover:text-blue-800 font-medium"
              >
                Skip → Text Only
              </button>
            </div>

            {!canvaConnected ? (
              /* ── Connect Canva CTA ── */
              <div className="flex flex-col items-center gap-4 py-10 bg-slate-50 rounded-lg border border-dashed border-slate-300">
                <div className="w-14 h-14 rounded-full bg-purple-100 flex items-center justify-center">
                  <svg className="w-7 h-7 text-purple-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="3" width="18" height="18" rx="3" />
                    <path d="M9 3v18M3 9h18" />
                  </svg>
                </div>
                <p className="text-sm text-slate-600 text-center max-w-sm">
                  Connect your Canva account to browse and attach designs to your LinkedIn posts.
                </p>
                <a
                  href="/api/canva/auth"
                  className="px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg shadow-sm transition-colors"
                >
                  Connect Canva
                </a>
              </div>
            ) : (
              /* ── Design Grid ── */
              <div className="space-y-4">
                {exporting && (
                  <div className="flex items-center gap-2 text-sm text-blue-700 bg-blue-50 px-4 py-2 rounded-lg">
                    <Spinner /> Exporting design from Canva…
                  </div>
                )}

                {designs.length === 0 && !loadingDesigns ? (
                  <div className="text-center py-8 text-sm text-slate-500">
                    <button
                      onClick={() => loadDesigns()}
                      className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-lg shadow-sm"
                    >
                      Load My Designs
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                      {designs.map((d) => (
                        <button
                          key={d.id}
                          onClick={() => handleDesignSelect(d)}
                          disabled={exporting}
                          className={`group relative rounded-lg overflow-hidden border-2 transition-all ${
                            selectedDesign?.id === d.id
                              ? "border-purple-500 shadow-lg shadow-purple-100"
                              : "border-slate-200 hover:border-purple-300"
                          }`}
                        >
                          <div className="aspect-square bg-slate-100 flex items-center justify-center overflow-hidden">
                            {d.thumbnail?.url ? (
                              /* eslint-disable-next-line @next/next/no-img-element */
                              <img
                                src={d.thumbnail.url}
                                alt={d.title}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <span className="text-xs text-slate-400">No preview</span>
                            )}
                          </div>
                          <div className="px-2 py-2 bg-white">
                            <p className="text-xs font-medium text-slate-700 truncate">
                              {d.title || "Untitled"}
                            </p>
                          </div>
                          {selectedDesign?.id === d.id && (
                            <div className="absolute top-2 right-2 w-6 h-6 bg-purple-600 rounded-full flex items-center justify-center">
                              <span className="text-white text-xs font-bold">✓</span>
                            </div>
                          )}
                        </button>
                      ))}
                    </div>

                    {/* Load more / loading */}
                    <div className="flex justify-center">
                      {loadingDesigns ? (
                        <div className="flex items-center gap-2 text-sm text-slate-500">
                          <Spinner /> Loading designs…
                        </div>
                      ) : continuation ? (
                        <button
                          onClick={() => loadDesigns(continuation)}
                          className="text-sm text-purple-600 hover:text-purple-800 font-medium"
                        >
                          Load More Designs
                        </button>
                      ) : null}
                    </div>
                  </>
                )}
              </div>
            )}
          </section>
        )}

        {/* ── Step 4: Preview & Publish ───────────── */}
        {step >= 3 && (
          <section className="space-y-6">
            <h2 className="text-sm font-semibold text-slate-700">
              Step 4 — Preview & Publish
            </h2>

            {/* LinkedIn Post Preview Card */}
            <div className="max-w-2xl mx-auto bg-white border border-slate-200 rounded-xl shadow-md overflow-hidden">
              {/* Post header */}
              <div className="flex items-center gap-3 p-4 pb-3">
                <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-lg">
                  A
                </div>
                <div>
                  <p className="font-semibold text-sm text-slate-900">Amisha Sharma</p>
                  <p className="text-xs text-slate-500">Just now • 🌐</p>
                </div>
              </div>

              {/* Post text */}
              <div className="px-4 pb-3">
                <p className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">
                  {selectedText}
                </p>
              </div>

              {/* Post image */}
              {exportedImageUrl && (
                <div className="border-t border-slate-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={exportedImageUrl}
                    alt="Canva design preview"
                    className="w-full object-contain max-h-[480px] bg-slate-50"
                  />
                </div>
              )}

              {/* Reaction bar (decorative) */}
              <div className="border-t border-slate-100 px-4 py-2 flex items-center gap-6 text-xs text-slate-500">
                <span className="flex items-center gap-1">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z" />
                    <path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
                  </svg>
                  Like
                </span>
                <span className="flex items-center gap-1">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                  Comment
                </span>
                <span className="flex items-center gap-1">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                    <polyline points="16 6 12 2 8 6" />
                    <line x1="12" y1="2" x2="12" y2="15" />
                  </svg>
                  Share
                </span>
              </div>
            </div>

            {/* Post info */}
            <div className="max-w-2xl mx-auto flex items-center justify-between text-xs text-slate-500 px-1">
              <span>
                Model:{" "}
                <span className="font-semibold text-slate-700">
                  {selected ? MODEL_LABELS[selected].name : "—"}
                </span>
                {selectedDesign && (
                  <>
                    {" · "}Design:{" "}
                    <span className="font-semibold text-slate-700">
                      {selectedDesign.title || "Untitled"}
                    </span>
                  </>
                )}
              </span>
              <span>{selectedText.length} characters</span>
            </div>

            {/* Action buttons */}
            <div className="max-w-2xl mx-auto flex items-center justify-between">
              <button
                onClick={handleStartOver}
                className="text-sm text-slate-500 hover:text-slate-800 font-medium"
              >
                ← Start Over
              </button>
              <button
                onClick={handlePublish}
                disabled={publishing}
                className="px-8 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold rounded-lg transition-colors flex items-center gap-2 text-lg shadow-sm"
              >
                {publishing ? (
                  <>
                    <Spinner /> Publishing…
                  </>
                ) : (
                  "🚀 Publish to LinkedIn"
                )}
              </button>
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
    <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}
