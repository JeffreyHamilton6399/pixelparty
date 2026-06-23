"use client";

import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Sun, Moon, Heart, FileText, Shield } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

interface SettingsDropdownProps {
  onOpenTerms: () => void;
  /** When true, render as bare menu items (to nest inside another DropdownMenu). */
  asMenuItem?: boolean;
}

/**
 * Settings: theme toggle, donate, privacy, terms.
 * Renders as bare DropdownMenuItem children so it can be nested inside the
 * header's "More" dropdown.
 */
export function SettingsDropdown({ onOpenTerms, asMenuItem = false }: SettingsDropdownProps) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  const isDark = theme === "dark";

  if (!asMenuItem) return null;

  return (
    <>
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
    </>
  );
}
