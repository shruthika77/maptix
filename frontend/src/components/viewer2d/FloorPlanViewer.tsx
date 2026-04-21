"use client";

import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { ZoomIn, ZoomOut, Maximize, Loader2, MousePointer2 } from "lucide-react";
import { useState, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import Konva from "konva";

// Dynamically import CanvasViewer with SSR disabled to avoid canvas hydration errors
const CanvasViewer = dynamic(() => import("./CanvasViewer"), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/50 backdrop-blur-sm">
      <Loader2 className="w-8 h-8 text-primary animate-spin mb-4" />
      <span className="text-sm font-medium text-slate-400">Loading Canvas Engine...</span>
    </div>
  ),
});

interface FloorPlanViewerProps {
  spatialModel: any;
  width?: number;    // now optional — canvas is self-sizing
  height?: number;
  onElementSelect?: (element: any) => void;
  editable?: boolean;
}

export default function FloorPlanViewer(props: FloorPlanViewerProps) {
  // resetKey forces a fresh CanvasViewer mount (resets pan/zoom to fit-view)
  const [resetKey, setResetKey] = useState(0);
  // External zoom ref — allows toolbar buttons to drive the Konva stage
  const stageRef = useRef<Konva.Stage | null>(null);

  const handleZoom = useCallback((factor: number) => {
    const stage = stageRef.current;
    if (!stage) return;
    const center = { x: stage.width() / 2, y: stage.height() / 2 };
    const oldScale = stage.scaleX();
    const newScale = Math.max(0.15, Math.min(20, oldScale * factor));
    const mousePointTo = {
      x: (center.x - stage.x()) / oldScale,
      y: (center.y - stage.y()) / oldScale,
    };
    stage.scale({ x: newScale, y: newScale });
    stage.position({
      x: center.x - mousePointTo.x * newScale,
      y: center.y - mousePointTo.y * newScale,
    });
    stage.batchDraw();
  }, []);

  return (
    <div className="relative w-full h-full bg-slate-950/80 overflow-hidden">
      {/* Floating Toolbar */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5 bg-zinc-900/80 backdrop-blur-xl border border-white/10 rounded-full p-1.5 shadow-xl"
      >
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-full hover:bg-white/10"
          title="Select mode"
        >
          <MousePointer2 className="h-4 w-4 text-slate-300" />
        </Button>
        <div className="w-[1px] h-4 bg-white/10 mx-1" />
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-full hover:bg-primary/20 hover:text-primary"
          title="Zoom in"
          onClick={() => handleZoom(1.25)}
        >
          <ZoomIn className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-full hover:bg-primary/20 hover:text-primary"
          title="Zoom out"
          onClick={() => handleZoom(0.8)}
        >
          <ZoomOut className="h-4 w-4" />
        </Button>
        <div className="w-[1px] h-4 bg-white/10 mx-1" />
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-full hover:bg-white/10"
          title="Reset view"
          onClick={() => setResetKey((k) => k + 1)}
        >
          <Maximize className="h-4 w-4 text-slate-300" />
        </Button>
      </motion.div>

      {/* Canvas — key reset forces full remount / fit-to-view */}
      <CanvasViewer key={`canvas-${resetKey}`} {...props} />
    </div>
  );
}
