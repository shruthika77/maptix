"use client";

import { useState } from "react";
import { useCreateStore } from "@/stores/createStore";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import FloorPlanViewer from "@/components/viewer2d/FloorPlanViewer";
import ThreeViewer from "@/components/viewer3d/ThreeViewer";
import { motion } from "framer-motion";
import {
  Layers,
  Box,
  DoorOpen,
  Grid3X3,
  RotateCcw,
  Download,
  Maximize,
  MapPin,
} from "lucide-react";

export default function ResultView() {
  const { generatedModel, resetAll } = useCreateStore();
  const [viewMode, setViewMode] = useState<"2d" | "3d">("2d");

  if (!generatedModel) return null;

  const metadata = generatedModel.metadata || {};
  const floors = generatedModel.floors || [];
  const totalRooms = floors.reduce(
    (sum: number, f: any) => sum + (f.rooms?.length || 0),
    0
  );
  const totalWalls = floors.reduce(
    (sum: number, f: any) => sum + (f.walls?.length || 0),
    0
  );
  const totalDoors = floors.reduce(
    (sum: number, f: any) => sum + (f.doors?.length || 0),
    0
  );
  const totalWindows = floors.reduce(
    (sum: number, f: any) => sum + (f.windows?.length || 0),
    0
  );
  const totalArea = floors.reduce(
    (sum: number, f: any) =>
      sum +
      (f.rooms?.reduce(
        (rSum: number, r: any) => rSum + (r.area_sqm || 0),
        0
      ) || 0),
    0
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* Stats bar */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3 flex-wrap">
          <Badge
            variant="outline"
            className="bg-emerald-500/10 text-emerald-300 border-emerald-500/25 gap-1.5 py-1"
          >
            ✓ Generated Successfully
          </Badge>
          {(metadata.source === "ai-prompt-generator" || metadata.ai_enhanced) && (
            <Badge
              variant="outline"
              className="bg-violet-500/10 text-violet-300 border-violet-500/25 gap-1.5 py-1"
            >
              🧠 AI-Powered · Meta Llama 3
            </Badge>
          )}
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Layers className="w-3 h-3" />
              {floors.length} floor{floors.length > 1 ? "s" : ""}
            </span>
            <span className="flex items-center gap-1">
              <Box className="w-3 h-3" />
              {totalRooms} rooms
            </span>
            <span className="flex items-center gap-1">
              <Grid3X3 className="w-3 h-3" />
              {totalWalls} walls
            </span>
            <span className="flex items-center gap-1">
              <DoorOpen className="w-3 h-3" />
              {totalDoors} doors
            </span>
            <span className="flex items-center gap-1">
              <Maximize className="w-3 h-3" />
              {totalArea.toFixed(0)} m²
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex bg-white/5 rounded-lg p-1 border border-white/10">
            <button
              onClick={() => setViewMode("2d")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                viewMode === "2d"
                  ? "bg-indigo-500 text-white shadow-sm shadow-indigo-500/30"
                  : "text-white/40 hover:text-white hover:bg-white/10"
              }`}
            >
              2D Plan
            </button>
            <button
              onClick={() => setViewMode("3d")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                viewMode === "3d"
                  ? "bg-indigo-500 text-white shadow-sm shadow-indigo-500/30"
                  : "text-white/40 hover:text-white hover:bg-white/10"
              }`}
            >
              3D Model
            </button>
          </div>

          <Button variant="outline" size="sm" className="gap-1.5">
            <Download className="w-3.5 h-3.5" />
            Export
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={resetAll}
            className="gap-1.5 text-white/40 hover:text-white"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            New
          </Button>
        </div>
      </div>

      {/* Viewer container */}
      <div className="relative rounded-xl overflow-hidden border border-white/10 bg-slate-950/80 shadow-2xl" style={{ height: "65vh" }}>
        {viewMode === "2d" && (
          <FloorPlanViewer spatialModel={generatedModel} />
        )}
        {viewMode === "3d" && (
          <ThreeViewer spatialModel={generatedModel} />
        )}
      </div>

      {/* Room list summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {floors.map((floor: any) =>
          floor.rooms?.map((room: any) => (
            <div
              key={room.id}
              className="flex items-center gap-3 bg-white/[0.02] border border-white/5 rounded-lg px-3 py-2.5"
            >
              <div className="w-2 h-2 rounded-full bg-indigo-500/60" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-slate-300 truncate">
                  {room.label}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {room.area_sqm?.toFixed(1)} m² · {room.type}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </motion.div>
  );
}
