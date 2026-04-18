"use client";

import { useState } from "react";
import FloorPlanViewer from "@/components/viewer2d/FloorPlanViewer";
import { useQuery } from "@tanstack/react-query";
import { fetchSpatialModel } from "@/services/api";
import { Loader2, Play, Square, Navigation, MapPin } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { motion, AnimatePresence } from "framer-motion";

export default function NavigationFlowPage() {
  const [navigating, setNavigating] = useState(false);
  const [source, setSource] = useState("");
  const [destination, setDestination] = useState("Marketing Office");
  
  const { data: spatialModel, isLoading } = useQuery({
    queryKey: ['spatialModel', 'demo'],
    queryFn: () => fetchSpatialModel('demo'),
  });

  if (isLoading) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary opacity-50 mb-4" />
        <p className="text-muted-foreground">Loading Navigation Graph...</p>
      </div>
    );
  }

  // Mock directions
  const directions = [
    { text: "Start in Lobby", type: "start", distance: "0m" },
    { text: "Head north towards main corridor", type: "straight", distance: "12m" },
    { text: "Turn right at the junction", type: "right", distance: "5m" },
    { text: "Arrive at Marketing Office", type: "end", distance: "0m" },
  ];

  return (
    <div className="absolute inset-0 flex flex-col p-6 gap-4">
      {/* Top action bar */}
      <div className="flex items-center justify-between z-10">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Navigation & Routing</h1>
          <p className="text-sm text-muted-foreground mt-1">Simulate multi-floor pathfinding algorithms.</p>
        </div>
      </div>

      <div className="flex-1 relative flex gap-6 z-10">
        {/* Navigation Sidebar Panel */}
        <div className="w-80 bg-background/70 backdrop-blur-md rounded-xl border border-white/10 flex flex-col shadow-2xl overflow-hidden relative">
          
          <div className="p-5 space-y-4 relative z-10">
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">Source</label>
              <div className="relative">
                <MapPin className="absolute left-3 top-3 h-4 w-4 text-emerald-500" />
                <Input 
                  placeholder="Current Location..." 
                  value={source} 
                  onChange={(e) => setSource(e.target.value)} 
                  className="pl-9 bg-background/50 border-white/10 placeholder:text-muted-foreground/60"
                />
              </div>
            </div>

            <div className="relative flex justify-center py-1">
              <div className="absolute left-4 top-0 bottom-0 w-[1px] bg-white/10 dashed z-0" />
              <div className="w-6 h-6 rounded-full bg-white/5 border border-white/10 flex items-center justify-center z-10 cursor-pointer hover:bg-white/10">
                <Navigation className="h-3 w-3 text-slate-400 rotate-180" />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">Destination</label>
              <div className="relative">
                <MapPin className="absolute left-3 top-3 h-4 w-4 text-rose-500" />
                <Input 
                  placeholder="Search rooms..." 
                  value={destination} 
                  onChange={(e) => setDestination(e.target.value)} 
                  className="pl-9 bg-background/50 border-white/10 placeholder:text-muted-foreground/60"
                />
              </div>
            </div>

            <Button 
              className={`w-full mt-2 font-medium shadow-xl transition-all ${navigating ? 'bg-red-500 hover:bg-red-600 text-white shadow-red-500/20' : 'bg-primary hover:bg-primary/90 text-primary-foreground shadow-primary/20'}`}
              onClick={() => setNavigating(!navigating)}
            >
              {navigating ? (
                <>
                  <Square className="w-4 h-4 mr-2" /> Stop Navigation
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-2" /> Start Navigation
                </>
              )}
            </Button>
          </div>

          <Separator className="bg-white/5" />

          {/* Turn by turn directions */}
          <ScrollArea className="flex-1 p-5 relative">
            <AnimatePresence>
              {navigating && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-6 relative"
                >
                  <div className="absolute left-2.5 top-2 bottom-2 w-[2px] bg-gradient-to-b from-emerald-500 via-primary to-rose-500 rounded-full opacity-30" />
                  
                  {directions.map((dir, idx) => (
                    <motion.div 
                      key={idx}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.1 }}
                      className="flex gap-4 relative"
                    >
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 z-10 border-4 border-background ${
                        dir.type === 'start' ? 'bg-emerald-500' :
                        dir.type === 'end' ? 'bg-rose-500' :
                        'bg-primary'
                      }`}>
                        <div className="w-1.5 h-1.5 bg-background rounded-full" />
                      </div>
                      <div className="-mt-1">
                        <p className="text-sm font-medium text-slate-200">{dir.text}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{dir.distance}</p>
                      </div>
                    </motion.div>
                  ))}
                </motion.div>
              )}
              {!navigating && (
                <div className="flex flex-col items-center justify-center h-full text-center mt-12 opacity-50">
                  <Navigation className="w-10 h-10 mb-3 text-slate-500" />
                  <p className="text-sm font-medium">Ready to navigate</p>
                  <p className="text-xs text-slate-500 mt-1">Enter a destination to calculate path</p>
                </div>
              )}
            </AnimatePresence>
          </ScrollArea>
        </div>

        {/* Viewport Map Area */}
        <div className="flex-1 relative rounded-xl overflow-hidden shadow-2xl border border-white/10 bg-slate-950/80">
          <FloorPlanViewer spatialModel={spatialModel} width={1200} height={800} />
          {/* Note: In a real implementation, we would overlay a Canvas layer plotting the A* navigation path */}
        </div>
      </div>
    </div>
  );
}
