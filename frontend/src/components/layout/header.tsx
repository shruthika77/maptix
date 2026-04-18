"use client";

import { useUIStore } from "@/stores/uiStore";
import { Button } from "@/components/ui/button";
import { Moon, Sun, Monitor, Bell, Layers, Zap } from "lucide-react";
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
    <header className="h-16 border-b border-white/5 bg-background/50 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-30">
      <div className="flex items-center gap-4">
        {/* Breadcrumb or context could go here */}
        <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 px-3 py-1 gap-1.5 font-medium">
          <Zap className="w-3.5 h-3.5 fill-primary" />
          Live Instance
        </Badge>
        <span className="text-sm text-muted-foreground font-medium">Headquarters Building • Phase 1</span>
      </div>

      <div className="flex items-center gap-3">
        {/* Floor Selector Mock */}
        <div className="bg-white/5 rounded-lg p-1 mr-2 flex border border-white/10">
          {[1, 2, 3].map((f) => (
            <button
              key={f}
              onClick={() => setFloor(f.toString())}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                currentFloor === f.toString()
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-white hover:bg-white/10"
              }`}
            >
              L{f}
            </button>
          ))}
        </div>

        <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-white rounded-full">
          <Bell className="h-4 w-4" />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="rounded-full overflow-hidden border border-white/10">
              <span className="h-full w-full bg-gradient-to-tr from-violet-500 to-orange-300 flex items-center justify-center text-white text-xs font-bold">
                JD
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48 bg-background/95 backdrop-blur border-white/10">
            <DropdownMenuLabel>My Account</DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-white/10" />
            <DropdownMenuItem>Profile</DropdownMenuItem>
            <DropdownMenuItem>Billing</DropdownMenuItem>
            <DropdownMenuItem>Team</DropdownMenuItem>
            <DropdownMenuSeparator className="bg-white/10" />
            <DropdownMenuItem onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
              Toggle Theme
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
