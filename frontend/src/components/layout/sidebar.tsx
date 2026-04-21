"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  Map,
  MapPinned,
  Compass,
  Settings,
  UploadCloud,
  PlusCircle,
  Sparkles,
} from "lucide-react";
import { motion } from "framer-motion";

const primaryLink = {
  href: "/create",
  icon: PlusCircle,
  label: "Create Map",
  accent: true,
};

const sidebarLinks = [
  { href: "/project/demo", icon: Map, label: "Map Editor" },
  { href: "/project/demo/navigation", icon: Compass, label: "Navigation" },
  { href: "/project/demo/upload", icon: UploadCloud, label: "Upload Plans" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-64 border-r border-white/10 bg-zinc-950/90 backdrop-blur-xl flex flex-col shadow-2xl">
      {/* Brand */}
      <div className="flex h-16 items-center flex-shrink-0 px-6 border-b border-white/5">
        <Link href="/create" className="flex items-center gap-2.5">
          <div className="relative">
            <MapPinned className="h-6 w-6 text-indigo-400" />
            <div className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-indigo-400 rounded-full animate-pulse" />
          </div>
          <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-indigo-300 to-violet-300 bg-clip-text text-transparent">
            Maptix
          </span>
        </Link>
      </div>

      {/* Nav Links */}
      <div className="flex-1 overflow-y-auto py-6 px-4 space-y-1">
        {/* Primary CTA — Create Map */}
        <Link
          href={primaryLink.href}
          className={cn(
            "group relative flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold transition-all duration-200 mb-4",
            pathname === primaryLink.href || pathname === "/"
              ? "text-white"
              : "text-indigo-300 hover:text-white"
          )}
        >
          {(pathname === primaryLink.href || pathname === "/") ? (
            <motion.div
              layoutId="sidebar-active"
              className="absolute inset-0 rounded-xl bg-gradient-to-r from-indigo-500/20 to-violet-500/15 border border-indigo-500/30"
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
            />
          ) : (
            <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-indigo-500/10 to-violet-500/5 border border-indigo-500/20 group-hover:from-indigo-500/15 group-hover:to-violet-500/10 transition-all" />
          )}
          <primaryLink.icon className="h-5 w-5 relative z-10 text-indigo-400" />
          <span className="relative z-10">{primaryLink.label}</span>
          <Sparkles className="h-3 w-3 relative z-10 text-indigo-400/50 ml-auto" />
        </Link>

        <div className="mb-4 mt-6 text-xs font-semibold uppercase tracking-wider text-white/30 px-2">
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
                  ? "text-white"
                  : "text-white/50 hover:bg-white/5 hover:text-white"
              )}
            >
              {isActive && (
                <motion.div
                  layoutId="sidebar-active-secondary"
                  className="absolute inset-0 rounded-lg bg-indigo-500/15 border border-indigo-500/30"
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                />
              )}
              <link.icon
                className={cn(
                  "h-4 w-4 relative z-10 transition-colors",
                  isActive
                    ? "text-indigo-400"
                    : "opacity-50 group-hover:opacity-100"
                )}
              />
              <span className="relative z-10">{link.label}</span>
            </Link>
          );
        })}
      </div>

      {/* Footer */}
      <div className="px-4 py-5 border-t border-white/5">
        {/* User badge */}
        <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/5 mb-3">
          <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-indigo-500 to-violet-400 flex items-center justify-center text-white text-xs font-bold shrink-0">
            AC
          </div>
          <div className="overflow-hidden">
            <p className="text-xs font-semibold text-white/80 truncate">
              Alex Chen
            </p>
            <p className="text-[10px] text-white/30 truncate">
              architect@maptix.io
            </p>
          </div>
        </div>
        <Link
          href="/settings"
          className="group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-white/40 hover:bg-white/5 hover:text-white transition-colors"
        >
          <Settings className="h-4 w-4 opacity-70 group-hover:opacity-100" />
          <span>Settings</span>
        </Link>
      </div>
    </aside>
  );
}
