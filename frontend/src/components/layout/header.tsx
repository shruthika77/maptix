"use client";

import { useUIStore } from "@/stores/uiStore";
import { Button } from "@/components/ui/button";
import { Bell, Zap, Sun, Moon } from "lucide-react";
import { useTheme } from "next-themes";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";

export function Header() {
  const { theme, setTheme } = useTheme();
  const { currentFloor, setFloor } = useUIStore();

  return (
    <header className="h-16 border-b border-white/5 bg-zinc-950/70 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-30 shrink-0">
      {/* Left — context info */}
      <div className="flex items-center gap-3">
        <Badge
          variant="outline"
          className="bg-indigo-500/10 text-indigo-300 border-indigo-500/25 px-3 py-1 gap-1.5 font-semibold text-xs"
        >
          <Zap className="w-3 h-3 fill-indigo-400 text-indigo-400" />
          Maptix Live
        </Badge>
        <span className="text-sm text-white/40 font-medium hidden sm:block">
          Headquarters Building · Phase 1
        </span>
      </div>

      {/* Right — controls */}
      <div className="flex items-center gap-2">
        {/* Floor Selector */}
        <div className="bg-white/5 rounded-lg p-1 flex border border-white/10 mr-1">
          {[1, 2, 3].map((f) => (
            <button
              key={f}
              onClick={() => setFloor(f.toString())}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                currentFloor === f.toString()
                  ? "bg-indigo-500 text-white shadow-sm shadow-indigo-500/30"
                  : "text-white/40 hover:text-white hover:bg-white/10"
              }`}
            >
              L{f}
            </button>
          ))}
        </div>

        {/* Theme toggle */}
        <Button
          variant="ghost"
          size="icon"
          className="text-white/40 hover:text-white rounded-full h-9 w-9"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          title="Toggle theme"
        >
          {theme === "dark" ? (
            <Sun className="h-4 w-4" />
          ) : (
            <Moon className="h-4 w-4" />
          )}
        </Button>

        {/* Notifications */}
        <Button
          variant="ghost"
          size="icon"
          className="text-white/40 hover:text-white rounded-full h-9 w-9 relative"
        >
          <Bell className="h-4 w-4" />
          {/* Notification dot */}
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-indigo-400 rounded-full" />
        </Button>

        {/* User menu */}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                className="rounded-full overflow-hidden border border-white/10 h-9 w-9 p-0"
              />
            }
          >
            <span className="h-full w-full bg-gradient-to-tr from-indigo-500 to-violet-400 flex items-center justify-center text-white text-xs font-bold">
              AC
            </span>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-52 bg-zinc-900/95 backdrop-blur border-white/10"
          >
            <DropdownMenuLabel className="text-white/70">
              <div className="font-semibold text-white">Alex Chen</div>
              <div className="text-xs text-white/40 font-normal">architect@maptix.io</div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-white/10" />
            <DropdownMenuItem className="cursor-pointer">Profile</DropdownMenuItem>
            <DropdownMenuItem className="cursor-pointer">Billing</DropdownMenuItem>
            <DropdownMenuItem className="cursor-pointer">Team</DropdownMenuItem>
            <DropdownMenuSeparator className="bg-white/10" />
            <DropdownMenuItem
              className="cursor-pointer text-red-400 focus:text-red-400"
              onClick={() => {}}
            >
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
