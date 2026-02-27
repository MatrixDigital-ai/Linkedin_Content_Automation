"use client";

import { useState } from "react";

type Model = "openai" | "gemini" | "claude";

interface GenerateResponse {
  id: string;
  openai: string;
  gemini: string;
  claude: string;
}

const MODEL_LABELS: Record<Model, { name: string; color: string }> = {
  openai: { name: "GPT-OSS 120B", color: "border-emerald-500" },
  gemini: { name: "Gemma 3 27B", color: "border-blue-500" },
  claude: { name: "GLM 4.5 Air", color: "border-amber-500" },
};

export default function DashboardPage() {
  const [prompt, setPrompt] = useState("");
  const [outputs, setOutputs] = useState<GenerateResponse | null>(null);
  const [selected, setSelected] = useState<Model | null>(null);
  const [generating, setGenerating] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [status, setStatus] = useState<{
    type: "success" | "error" | "info";
    message: string;
  } | null>(null);

  async function handleGenerate() {
    if (!prompt.trim()) return;
    setGenerating(true);
    setOutputs(null);
    setSelected(null);
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
      setStatus({ type: "success", message: "All 3 models responded. Select your preferred version." });
    } catch (err) {
      setStatus({
        type: "error",
        message: err instanceof Error ? err.message : "Generation failed.",
      });
    } finally {
      setGenerating(false);
    }
  }

  async function handlePublish() {
    if (!outputs || !selected) return;
    const text = outputs[selected];
    if (!text || text.startsWith("[")) {
      setStatus({ type: "error", message: "Selected model returned an error. Choose another." });
      return;
    }
    if (text.length > 3000) {
      setStatus({ type: "error", message: "Post exceeds 3000 character limit." });
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
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }

      const data = await res.json();
      setStatus({
        type: data.dryRun ? "info" : "success",
        message: data.message ?? `Published successfully! Post ID: ${data.linkedinPostId}`,
      });
    } catch (err) {
      setStatus({
        type: "error",
        message: err instanceof Error ? err.message : "Publish failed.",
      });
    } finally {
      setPublishing(false);
    }
  }

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
          <span className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 px-3 py-1 rounded-full font-medium">
            System Online
          </span>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
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

        {/* Prompt Section */}
        <section className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
          <label className="block text-sm font-semibold text-slate-700 mb-2">
            Content Prompt
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
            <span className="text-xs text-slate-500">
              {prompt.length} / 2000 characters
            </span>
            <button
              onClick={handleGenerate}
              disabled={generating || !prompt.trim()}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-semibold rounded-lg transition-colors duration-150 flex items-center gap-2 shadow-sm"
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

        {/* Model Outputs */}
        {outputs && (
          <section className="space-y-6">
            <h2 className="text-lg font-semibold text-slate-800">
              Model Outputs — Select One
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
                    onClick={() => !isError && setSelected(model)}
                    disabled={isError}
                    className={`text-left rounded-xl border-2 p-5 transition-all duration-150 ${
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
                    <div className="mt-3 text-xs text-slate-400">
                      {text.length} characters
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Publish Button */}
            <div className="flex justify-end">
              <button
                onClick={handlePublish}
                disabled={!selected || publishing}
                className="px-8 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold rounded-lg transition-colors duration-150 flex items-center gap-2 text-lg shadow-sm"
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

function Spinner() {
  return (
    <svg
      className="animate-spin h-4 w-4"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}
