"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Settings, Sun, Moon, Heart, FileText, Shield } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

interface SettingsDropdownProps {
  onOpenTerms: () => void;
}

/**
 * Settings menu: theme toggle, Donate, Privacy, Terms.
 * (Canvas size + Clear moved to the toolbar; GitHub removed.)
 */
export function SettingsDropdown({ onOpenTerms }: SettingsDropdownProps) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // next-themes only resolves `theme` on the client; flip mounted once to
    // avoid hydration mismatch on the toggle label.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  const isDark = theme === "dark";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Settings">
          <Settings className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem
          onClick={() => setTheme(isDark ? "light" : "dark")}
        >
          {mounted && isDark ? (
            <Sun className="mr-2 h-4 w-4" />
          ) : (
            <Moon className="mr-2 h-4 w-4" />
          )}
          {mounted ? (isDark ? "Light mode" : "Dark mode") : "Theme"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <a
            href="https://buymeacoffee.com/jeffreyscof"
            target="_blank"
            rel="noopener noreferrer"
            className="text-rose-500 focus:text-rose-500"
          >
            <Heart className="mr-2 h-4 w-4" /> Donate
          </a>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={(e) => { e.preventDefault(); onOpenTerms(); }}>
          <FileText className="mr-2 h-4 w-4" /> Privacy
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={(e) => { e.preventDefault(); onOpenTerms(); }}>
          <Shield className="mr-2 h-4 w-4" /> Terms
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
