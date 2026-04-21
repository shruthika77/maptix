"use client";

import { useCallback } from "react";
import { useCreateStore } from "@/stores/createStore";
import UploadPanel from "@/components/create/UploadPanel";
import PromptPanel from "@/components/create/PromptPanel";
import ManualPanel from "@/components/create/ManualPanel";
import ProcessingView from "@/components/create/ProcessingView";
import ResultView from "@/components/create/ResultView";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { motion, AnimatePresence } from "framer-motion";
import {
  UploadCloud,
  Sparkles,
  ClipboardList,
  ArrowRight,
  Zap,
  MapPinned,
} from "lucide-react";
import { toast } from "sonner";
import { apiGenerateFromPrompt, apiUploadAndProcess } from "@/services/api";
import {
  generateFromPromptClient,
  generateFromUploadClient,
} from "@/services/clientGenerator";

const INPUT_TABS = [
  { key: "upload" as const, label: "Upload Plan", icon: UploadCloud },
  { key: "prompt" as const, label: "AI Prompt", icon: Sparkles },
  { key: "manual" as const, label: "Manual Form", icon: ClipboardList },
];

export default function CreatePage() {
  const {
    inputMode,
    setInputMode,
    stage,
    setStage,
    uploadedFiles,
    promptText,
    promptBuildingType,
    manualForm,
    setProcessing,
    setProcessingProgress,
    setProcessingStages,
    processingStages,
    setGeneratedModel,
    generatedModel,
    resetAll,
  } = useCreateStore();

  // ── Simulate the processing pipeline animation then set result ──
  const simulateProcessing = useCallback(
    (modelToSet: any) => {
      setStage("processing");
      setProcessing(true);
      setProcessingProgress(0);

      const stages = [...processingStages].map((s) => ({
        ...s,
        status: "pending" as const,
        progress: 0,
      }));
      setProcessingStages(stages);

      const totalDuration = 4000;
      const stageCount = stages.length;
      let currentStage = 0;
      let progress = 0;

      const interval = setInterval(() => {
        progress += 2;
        const stageIndex = Math.min(
          Math.floor((progress / 100) * stageCount),
          stageCount - 1
        );

        if (stageIndex > currentStage) {
          const updated = stages.map((s, i) => {
            if (i < stageIndex)
              return { ...s, status: "completed" as const, progress: 100 };
            if (i === stageIndex)
              return { ...s, status: "active" as const, progress: 30 };
            return s;
          });
          setProcessingStages(updated);
          currentStage = stageIndex;
        } else {
          const stageProgress = Math.min(
            ((progress % (100 / stageCount)) / (100 / stageCount)) * 100,
            100
          );
          const updated = stages.map((s, i) => {
            if (i < currentStage)
              return { ...s, status: "completed" as const, progress: 100 };
            if (i === currentStage)
              return {
                ...s,
                status: "active" as const,
                progress: stageProgress,
              };
            return s;
          });
          setProcessingStages(updated);
        }

        setProcessingProgress(Math.min(progress, 100));

        if (progress >= 100) {
          clearInterval(interval);
          const allDone = stages.map((s) => ({
            ...s,
            status: "completed" as const,
            progress: 100,
          }));
          setProcessingStages(allDone);
          setProcessing(false);
          setGeneratedModel(modelToSet);
          setStage("result");
          toast.success("Indoor map generated successfully!");
        }
      }, totalDuration / 50);
    },
    [
      processingStages,
      setProcessing,
      setProcessingProgress,
      setProcessingStages,
      setGeneratedModel,
      setStage,
    ]
  );

  // ── Main generate handler — tries backend, falls back to client ──
  const handleGenerate = useCallback(async () => {
    // ── UPLOAD MODE ──
    if (inputMode === "upload") {
      if (uploadedFiles.length === 0) {
        toast.error("Please upload at least one file");
        return;
      }

      // Try backend first, fallback to client generator silently
      let result: any;
      try {
        result = await apiUploadAndProcess(uploadedFiles[0], "residential");
      } catch {
        // Backend unavailable — use client-side fallback
        result = generateFromUploadClient(
          uploadedFiles[0].name,
          "residential"
        );
      }
      simulateProcessing(result.model_data);
      return;
    }

    // ── PROMPT MODE ──
    if (inputMode === "prompt") {
      if (!promptText.trim()) {
        toast.error("Please enter a description of your layout");
        return;
      }

      const payload = {
        prompt: promptText,
        building_type: promptBuildingType,
      };

      let result: any;
      try {
        result = await apiGenerateFromPrompt(payload);
      } catch {
        // Backend unavailable — use client-side fallback
        result = generateFromPromptClient(payload);
      }
      simulateProcessing(result.model_data);
      return;
    }

    // ── MANUAL MODE ──
    if (inputMode === "manual") {
      const totalRooms = manualForm.floors.reduce(
        (sum, f) => sum + f.rooms.length,
        0
      );
      if (totalRooms === 0) {
        toast.error("Please add at least one room");
        return;
      }

      const floorsSpec = manualForm.floors.map((f) => ({
        level: f.level,
        label: f.label,
        height_m: f.height_m,
        rooms: f.rooms.map((r) => ({
          name: r.name,
          type: r.type,
          width_m: r.width,
          length_m: r.length,
          count: r.count,
        })),
      }));

      const payload = {
        building_type: manualForm.buildingType,
        total_floors: manualForm.totalFloors,
        plot_width_m: manualForm.plotWidth,
        plot_length_m: manualForm.plotLength,
        wall_height_m: manualForm.wallHeight,
        floors: floorsSpec,
      };

      let result: any;
      try {
        result = await apiGenerateFromPrompt(payload);
      } catch {
        // Backend unavailable — use client-side fallback
        result = generateFromPromptClient(payload);
      }
      simulateProcessing(result.model_data);
    }
  }, [
    inputMode,
    uploadedFiles,
    promptText,
    promptBuildingType,
    manualForm,
    simulateProcessing,
  ]);

  const canGenerate =
    (inputMode === "upload" && uploadedFiles.length > 0) ||
    (inputMode === "prompt" && promptText.trim().length > 0) ||
    (inputMode === "manual" &&
      manualForm.floors.some((f) => f.rooms.length > 0));

  return (
    <div className="absolute inset-0 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-6 py-8">
        {stage === "result" && generatedModel && <ResultView />}
        {stage === "processing" && <ProcessingView />}
        {stage === "input" && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <div className="text-center mb-10">
              <div className="inline-flex items-center gap-2 mb-4">
                <div className="relative">
                  <MapPinned className="h-8 w-8 text-indigo-400" />
                  <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-indigo-400 rounded-full animate-pulse" />
                </div>
              </div>
              <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-3">
                <span className="bg-gradient-to-r from-white via-white to-white/50 bg-clip-text text-transparent">
                  Create Indoor Map
                </span>
              </h1>
              <p className="text-muted-foreground text-base max-w-xl mx-auto leading-relaxed">
                Upload a floor plan, describe your layout with AI, or build it
                manually.
                <br />
                <span className="text-white/30 text-sm">
                  We&apos;ll generate 2D maps and 3D models instantly.
                </span>
              </p>
            </div>

            <div className="flex items-center justify-center gap-2 mb-8">
              {INPUT_TABS.map((tab) => {
                const isActive = inputMode === tab.key;
                return (
                  <button
                    key={tab.key}
                    onClick={() => setInputMode(tab.key)}
                    className={`relative flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${
                      isActive
                        ? "text-white"
                        : "text-white/40 hover:text-white/60 hover:bg-white/[0.03]"
                    }`}
                  >
                    {isActive && (
                      <motion.div
                        layoutId="input-tab-bg"
                        className="absolute inset-0 bg-white/[0.06] border border-white/10 rounded-xl"
                        transition={{
                          type: "spring",
                          stiffness: 350,
                          damping: 30,
                        }}
                      />
                    )}
                    <tab.icon
                      className={`w-4 h-4 relative z-10 ${
                        isActive ? "text-indigo-400" : ""
                      }`}
                    />
                    <span className="relative z-10">{tab.label}</span>
                    {tab.key === "prompt" && (
                      <Badge
                        variant="default"
                        className="relative z-10 text-[9px] py-0 px-1.5 bg-indigo-500/80"
                      >
                        AI
                      </Badge>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="bg-white/[0.02] border border-white/8 rounded-2xl p-6 md:p-8 backdrop-blur-sm shadow-2xl shadow-black/20">
              <AnimatePresence mode="wait">
                <motion.div
                  key={inputMode}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.2 }}
                >
                  {inputMode === "upload" && <UploadPanel />}
                  {inputMode === "prompt" && <PromptPanel />}
                  {inputMode === "manual" && <ManualPanel />}
                </motion.div>
              </AnimatePresence>

              <div className="mt-8 pt-6 border-t border-white/5">
                <Button
                  size="lg"
                  disabled={!canGenerate}
                  onClick={handleGenerate}
                  className="w-full h-12 text-base font-semibold bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white shadow-xl shadow-indigo-500/25 transition-all disabled:opacity-30 disabled:shadow-none gap-2"
                >
                  <Zap className="w-4.5 h-4.5" />
                  Generate Indoor Map
                  <ArrowRight className="w-4 h-4" />
                </Button>
                <p className="text-center text-xs text-white/20 mt-3">
                  Powered by Meta Llama 3 AI, OpenCV, and Three.js
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
