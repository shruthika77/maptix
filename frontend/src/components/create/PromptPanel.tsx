"use client";

import { useState } from "react";
import { Sparkles, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCreateStore } from "@/stores/createStore";

const BUILDING_TYPES = [
  { value: "residential", label: "🏠 Residential" },
  { value: "hospital", label: "🏥 Hospital / Clinic" },
  { value: "office", label: "🏢 Office / Commercial" },
  { value: "school", label: "🏫 School / College" },
  { value: "warehouse", label: "🏭 Warehouse / Industrial" },
];

const EXAMPLE_PROMPTS = [
  "2BHK apartment with hall, kitchen, 2 bedrooms, 2 bathrooms, balcony",
  "3 bedroom house with living room, dining, kitchen, 2 bathrooms, garage",
  "Hospital floor with 4 private rooms, operation theater, ICU, 3 toilets, nurse station, corridor",
  "Small office with reception, 3 offices, conference room, kitchen, 2 bathrooms",
  "Ground floor: living room, kitchen, bathroom. First floor: 3 bedrooms, bathroom, balcony",
];

export default function PromptPanel() {
  const {
    promptText,
    setPromptText,
    promptBuildingType,
    setPromptBuildingType,
  } = useCreateStore();

  const [showExamples, setShowExamples] = useState(false);

  return (
    <div className="space-y-5">
      {/* Building type selector */}
      <div>
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2.5 block">
          Building Type
        </label>
        <div className="flex flex-wrap gap-2">
          {BUILDING_TYPES.map((type) => (
            <button
              key={type.value}
              onClick={() => setPromptBuildingType(type.value)}
              className={`px-3.5 py-2 rounded-xl text-sm font-medium transition-all border ${
                promptBuildingType === type.value
                  ? "bg-indigo-500/15 border-indigo-500/30 text-indigo-300"
                  : "bg-white/[0.02] border-white/8 text-white/50 hover:bg-white/[0.05] hover:text-white/70"
              }`}
            >
              {type.label}
            </button>
          ))}
        </div>
      </div>

      {/* Prompt textarea */}
      <div>
        <div className="flex items-center justify-between mb-2.5">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Describe Your Layout
          </label>
          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-violet-400/70 bg-violet-500/10 border border-violet-500/20 px-2 py-0.5 rounded-full">
            <Sparkles className="w-3 h-3" />
            Powered by Meta Llama 3
          </span>
        </div>
        <div className="relative">
          <textarea
            value={promptText}
            onChange={(e) => setPromptText(e.target.value)}
            placeholder="Describe any layout in natural language — AI will understand and generate it...\n\ne.g. 3BHK apartment with hall, kitchen, 2 bedrooms, 2 bathrooms, balcony"
            rows={4}
            className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/25 resize-none outline-none focus:border-indigo-500/40 focus:ring-2 focus:ring-indigo-500/20 transition-all"
          />
          <div className="absolute bottom-3 right-3 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-indigo-400/50" />
          </div>
        </div>
      </div>

      {/* Example prompts */}
      <div>
        <button
          onClick={() => setShowExamples(!showExamples)}
          className="flex items-center gap-1.5 text-xs font-medium text-indigo-400/70 hover:text-indigo-300 transition-colors"
        >
          <ChevronDown
            className={`w-3.5 h-3.5 transition-transform ${
              showExamples ? "rotate-180" : ""
            }`}
          />
          {showExamples ? "Hide" : "Show"} example prompts
        </button>

        {showExamples && (
          <div className="mt-3 space-y-2">
            {EXAMPLE_PROMPTS.map((example, i) => (
              <button
                key={i}
                onClick={() => setPromptText(example)}
                className="w-full text-left px-3.5 py-2.5 rounded-lg bg-white/[0.02] border border-white/5 text-xs text-white/50 hover:bg-indigo-500/5 hover:border-indigo-500/20 hover:text-white/70 transition-all"
              >
                <span className="text-indigo-400/60 mr-1.5">→</span>
                {example}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
