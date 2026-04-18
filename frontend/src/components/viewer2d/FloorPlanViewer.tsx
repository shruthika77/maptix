"use client";

import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { ZoomIn, ZoomOut, Maximize, Loader2, MousePointer2 } from "lucide-react";
import { useState, useCallback } from "react";
import { motion } from "framer-motion";

// Dynamically import CanvasViewer with SSR disabled
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
  width: number;
  height: number;
  onElementSelect?: (element: any) => void;
  editable?: boolean;
}

export default function FloorPlanViewer(props: FloorPlanViewerProps) {
  const [scaleKey, setScaleKey] = useState(0); // Hack to force key re-render for reset

  return (
    <div className="relative w-full h-full bg-slate-950/80 rounded-xl overflow-hidden border border-white/5 shadow-2xl">
      {/* Floating Toolbar */}
      <motion.div 
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5 bg-background/60 backdrop-blur-xl border border-white/10 rounded-full p-1.5 shadow-xl"
      >
        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full hover:bg-white/10">
          <MousePointer2 className="h-4 w-4 text-slate-300" />
        </Button>
        <div className="w-[1px] h-4 bg-white/10 mx-1" />
        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full hover:bg-primary/20 hover:text-primary">
          <ZoomIn className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full hover:bg-primary/20 hover:text-primary">
          <ZoomOut className="h-4 w-4" />
        </Button>
        <div className="w-[1px] h-4 bg-white/10 mx-1" />
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-8 w-8 rounded-full hover:bg-white/10"
          onClick={() => setScaleKey(k => k + 1)}
        >
          <Maximize className="h-4 w-4 text-slate-300" />
        </Button>
      </motion.div>

      <CanvasViewer key={`canvas-viewer-${scaleKey}`} {...props} />
    </div>
  );
}
