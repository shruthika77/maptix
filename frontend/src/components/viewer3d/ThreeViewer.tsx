"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { Layers, Grid3X3, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

// Dynamically loaded — Three.js cannot run server-side
const Canvas3D = dynamic(() => import("./Canvas3D"), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-950/80 backdrop-blur-sm">
      <Loader2 className="w-8 h-8 text-indigo-400 animate-spin mb-3" />
      <span className="text-sm font-medium text-slate-400">Loading 3D Engine…</span>
      <span className="text-xs text-slate-600 mt-1">Building procedural geometry</span>
    </div>
  ),
});

interface ThreeViewerProps {
  modelUrl?: string;
  spatialModel?: any;
  onElementClick?: (element: any) => void;
}

export default function ThreeViewer({ spatialModel }: ThreeViewerProps) {
  const [viewMode, setViewMode] = useState<'solid' | 'wireframe'>('solid');

  return (
    <div className="relative w-full h-full bg-zinc-950 overflow-hidden">
      {/* View-mode Toolbar */}
      <div className="absolute top-4 left-4 z-10 flex gap-1.5 bg-zinc-900/80 backdrop-blur-xl border border-white/10 rounded-full p-1.5 shadow-xl">
        <Button
          variant="ghost"
          size="sm"
          className={`px-4 rounded-full h-8 text-xs font-semibold transition-all ${
            viewMode === 'solid'
              ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/30'
              : 'text-white/40 hover:bg-white/10 hover:text-white'
          }`}
          onClick={() => setViewMode('solid')}
        >
          <Layers className="w-3.5 h-3.5 mr-1.5" />
          Solid
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className={`px-4 rounded-full h-8 text-xs font-semibold transition-all ${
            viewMode === 'wireframe'
              ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/30'
              : 'text-white/40 hover:bg-white/10 hover:text-white'
          }`}
          onClick={() => setViewMode('wireframe')}
        >
          <Grid3X3 className="w-3.5 h-3.5 mr-1.5" />
          Wireframe
        </Button>
      </div>

      {/* 3D Canvas — fills entire container */}
      <Canvas3D spatialModel={spatialModel} isWireframe={viewMode === 'wireframe'} />
    </div>
  );
}
