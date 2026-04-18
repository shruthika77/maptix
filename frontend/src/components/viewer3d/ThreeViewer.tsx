"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { CopySlash, Box, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const Canvas3D = dynamic(() => import("./Canvas3D"), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/80 backdrop-blur-sm">
      <Loader2 className="w-8 h-8 text-primary animate-spin mb-3" />
      <span className="text-sm font-medium text-slate-400">Loading 3D Engine...</span>
    </div>
  )
});

interface ThreeViewerProps {
  modelUrl?: string;
  spatialModel?: any;
  onElementClick?: (element: any) => void;
}

export default function ThreeViewer({ spatialModel, onElementClick }: ThreeViewerProps) {
  const [viewMode, setViewMode] = useState<'solid' | 'wireframe'>('solid');

  return (
    <div className="relative w-full h-full min-h-[500px] bg-slate-950/80 rounded-xl overflow-hidden border border-white/5 shadow-2xl">
      {/* Premium Toolbar */}
      <div className="absolute top-4 left-4 z-10 flex gap-2 bg-background/60 backdrop-blur-xl border border-white/10 rounded-full p-1.5 shadow-xl">
        <Button
          variant="ghost"
          size="sm"
          className={`px-4 rounded-full h-8 text-xs font-medium transition-all ${
            viewMode === 'solid'
              ? 'bg-primary text-primary-foreground shadow-lg'
              : 'text-muted-foreground hover:bg-white/10 hover:text-white'
          }`}
          onClick={() => setViewMode('solid')}
        >
          <Box className="w-3.5 h-3.5 mr-2" />
          Solid
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className={`px-4 rounded-full h-8 text-xs font-medium transition-all ${
            viewMode === 'wireframe'
              ? 'bg-primary text-primary-foreground shadow-lg'
              : 'text-muted-foreground hover:bg-white/10 hover:text-white'
          }`}
          onClick={() => setViewMode('wireframe')}
        >
          <CopySlash className="w-3.5 h-3.5 mr-2" />
          Wireframe
        </Button>
      </div>

      <Canvas3D spatialModel={spatialModel} isWireframe={viewMode === 'wireframe'} />
    </div>
  );
}
