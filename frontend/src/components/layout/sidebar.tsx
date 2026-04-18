"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Map, MapPinned, Compass, Settings, Layers, BoxSelect, UploadCloud } from "lucide-react";
import { motion } from "framer-motion";

const sidebarLinks = [
  { href: "/project/demo", icon: Map, label: "Map Editor" },
  { href: "/project/demo/navigation", icon: Compass, label: "Navigation Flow" },
  { href: "/project/demo/upload", icon: UploadCloud, label: "Upload Plans" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-64 border-r border-white/10 bg-background/50 backdrop-blur-xl flex flex-col shadow-2xl">
      <div className="flex h-16 items-center flex-shrink-0 px-6 border-b border-white/5">
        <MapPinned className="h-6 w-6 text-primary" />
        <span className="ml-3 font-semibold text-lg tracking-tight bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent">SpatialForge</span>
      </div>

      <div className="flex-1 overflow-y-auto py-6 px-4 space-y-1">
        <div className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground px-2">
          Project Workspace
        </div>
        {sidebarLinks.map((link) => {
          const isActive = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                isActive
                  ? "text-primary-foreground"
                  : "text-muted-foreground hover:bg-white/5 hover:text-white"
              )}
            >
              {isActive && (
                <motion.div
                  layoutId="sidebar-active"
                  className="absolute inset-0 rounded-lg bg-primary/20 border border-primary/30"
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                />
              )}
              <link.icon className={cn("h-4 w-4 relative z-10", isActive ? "text-primary" : "opacity-70 group-hover:opacity-100")} />
              <span className="relative z-10">{link.label}</span>
            </Link>
          );
        })}
      </div>

      <div className="mt-auto px-4 py-6 border-t border-white/5">
        <Link
          href="/settings"
          className="group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-white/5 hover:text-white transition-colors"
        >
          <Settings className="h-4 w-4 opacity-70 group-hover:opacity-100" />
          <span>Global Settings</span>
        </Link>
      </div>
    </aside>
  );
}
