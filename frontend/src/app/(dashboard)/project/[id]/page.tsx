"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import FloorPlanViewer from "@/components/viewer2d/FloorPlanViewer";
import ThreeViewer from "@/components/viewer3d/ThreeViewer";
import { useQuery } from "@tanstack/react-query";
import { fetchSpatialModel } from "@/services/api";
import { Loader2, Layers, MapPin, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function ProjectEditorPage() {
  const [activeTab, setActiveTab] = useState("2d");
  
  // Fetch mock data
  const { data: spatialModel, isLoading } = useQuery({
    queryKey: ['spatialModel', 'demo'],
    queryFn: () => fetchSpatialModel('demo'),
  });

  if (isLoading) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary opacity-50 mb-4" />
        <p className="text-muted-foreground animate-pulse">Loading Spatial Data...</p>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 flex flex-col p-6 gap-4">
      {/* Top action bar per page */}
      <div className="flex items-center justify-between z-10">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">HQ Floor 1</h1>
          <p className="text-sm text-muted-foreground mt-1">Editing primary floor plan features and waypoints.</p>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="relative w-64 hidden md:block">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search rooms, walls, POIs..."
              className="pl-9 bg-background/50 backdrop-blur border-white/10"
            />
          </div>
          
          <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as string)} className="w-[200px]">
            <TabsList className="grid w-full grid-cols-2 bg-background/50 border border-white/10 backdrop-blur rounded-lg h-10">
              <TabsTrigger value="2d" className="data-active:bg-primary/20 data-active:text-primary rounded-md transition-all">
                2D Plan
              </TabsTrigger>
              <TabsTrigger value="3d" className="data-active:bg-primary/20 data-active:text-primary rounded-md transition-all">
                3D Model
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* Main Canvas Area */}
      <div className="flex-1 relative flex gap-6 z-10">
        {/* Context Sidebar — hidden on small screens, visible lg+ */}
        <div className="w-72 bg-background/60 backdrop-blur-md rounded-xl border border-white/10 hidden lg:flex flex-col shadow-2xl">
          <div className="p-4 border-b border-white/5 bg-white/[0.02]">
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <Layers className="h-4 w-4 text-primary" />
              Layer Controls
            </h3>
          </div>
          <div className="flex-1 p-4 space-y-4">
            {/* Layer toggles mock */}
            {['Structural Walls', 'Interior Partitions', 'Doors & Windows', 'Furniture / POIs', 'Navigation Graph'].map(layer => (
              <div key={layer} className="flex items-center justify-between group cursor-pointer">
                <span className="text-sm text-slate-300 group-hover:text-white transition-colors">{layer}</span>
                <div className="w-8 h-4 bg-primary/20 rounded-full relative transition-colors group-hover:bg-primary/30">
                  <div className="absolute right-1 top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-primary rounded-full" />
                </div>
              </div>
            ))}
          </div>

          <div className="p-4 border-t border-white/5 bg-white/[0.02]">
            <Button className="w-full bg-gradient-to-r from-indigo-500 to-primary text-white shadow-lg shadow-primary/20">
              <MapPin className="h-4 w-4 mr-2" />
              Add Waypoint
            </Button>
          </div>
        </div>

        {/* Viewport */}
        <div className="flex-1 relative rounded-xl overflow-hidden shadow-2xl border border-white/10 bg-slate-950/80">
          <div className="absolute inset-0">
            {activeTab === '2d' && <FloorPlanViewer spatialModel={spatialModel} width={1200} height={800} />}
            {activeTab === '3d' && <ThreeViewer spatialModel={spatialModel} />}
          </div>
        </div>
      </div>
    </div>
  );
}
