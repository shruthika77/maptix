"use client";

import { useCreateStore } from "@/stores/createStore";
import { motion } from "framer-motion";
import {
  Loader2,
  CheckCircle2,
  XCircle,
  FileSearch,
  Cpu,
  Box,
  Map,
  Cuboid,
  Brain,
} from "lucide-react";

const STAGE_ICONS: Record<string, typeof Loader2> = {
  parsing: FileSearch,
  ai_analysis: Brain,
  extraction: Cpu,
  spatial: Box,
  map2d: Map,
  model3d: Cuboid,
};

export default function ProcessingView() {
  const { processingProgress, processingStages } = useCreateStore();

  return (
    <div className="flex flex-col items-center justify-center min-h-[500px] py-12">
      {/* Central progress ring */}
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="relative mb-10"
      >
        <svg width="160" height="160" viewBox="0 0 160 160" className="transform -rotate-90">
          <circle
            cx="80"
            cy="80"
            r="70"
            fill="none"
            stroke="rgba(255,255,255,0.05)"
            strokeWidth="8"
          />
          <motion.circle
            cx="80"
            cy="80"
            r="70"
            fill="none"
            stroke="url(#progress-gradient)"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={2 * Math.PI * 70}
            strokeDashoffset={2 * Math.PI * 70 * (1 - processingProgress / 100)}
            initial={{ strokeDashoffset: 2 * Math.PI * 70 }}
            animate={{
              strokeDashoffset: 2 * Math.PI * 70 * (1 - processingProgress / 100),
            }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          />
          <defs>
            <linearGradient id="progress-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#6366f1" />
              <stop offset="100%" stopColor="#a855f7" />
            </linearGradient>
          </defs>
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-bold tabular-nums">
            {Math.round(processingProgress)}%
          </span>
          <span className="text-xs text-muted-foreground mt-1">
            Processing
          </span>
        </div>
      </motion.div>

      {/* Pipeline stages */}
      <div className="w-full max-w-md space-y-3">
        {processingStages.map((stage, i) => {
          const Icon = STAGE_ICONS[stage.name] || Cpu;
          const isActive = stage.status === "active";
          const isCompleted = stage.status === "completed";
          const isFailed = stage.status === "failed";

          return (
            <motion.div
              key={stage.name}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.1 }}
              className={`flex items-center gap-4 px-4 py-3 rounded-xl border transition-all ${
                isActive
                  ? "bg-indigo-500/10 border-indigo-500/20"
                  : isCompleted
                  ? "bg-emerald-500/5 border-emerald-500/10"
                  : isFailed
                  ? "bg-red-500/5 border-red-500/10"
                  : "bg-white/[0.01] border-white/5"
              }`}
            >
              {/* Status icon */}
              <div
                className={`p-2 rounded-lg ${
                  isActive
                    ? "bg-indigo-500/20"
                    : isCompleted
                    ? "bg-emerald-500/15"
                    : isFailed
                    ? "bg-red-500/15"
                    : "bg-white/5"
                }`}
              >
                {isActive ? (
                  <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />
                ) : isCompleted ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                ) : isFailed ? (
                  <XCircle className="w-4 h-4 text-red-400" />
                ) : (
                  <Icon className="w-4 h-4 text-white/20" />
                )}
              </div>

              {/* Label */}
              <div className="flex-1 min-w-0">
                <p
                  className={`text-sm font-medium ${
                    isActive
                      ? "text-white"
                      : isCompleted
                      ? "text-emerald-300/80"
                      : isFailed
                      ? "text-red-300/80"
                      : "text-white/30"
                  }`}
                >
                  {stage.label}
                </p>
              </div>

              {/* Progress indicator for active stage */}
              {isActive && (
                <div className="flex items-center gap-1.5">
                  <div className="w-16 h-1 bg-white/10 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full"
                      initial={{ width: "0%" }}
                      animate={{ width: `${stage.progress}%` }}
                      transition={{ duration: 0.3 }}
                    />
                  </div>
                </div>
              )}
              {isCompleted && (
                <span className="text-xs text-emerald-400/60">Done</span>
              )}
            </motion.div>
          );
        })}
      </div>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="text-sm text-muted-foreground mt-8 text-center"
      >
        Analyzing your input and generating spatial models...
      </motion.p>
    </div>
  );
}
