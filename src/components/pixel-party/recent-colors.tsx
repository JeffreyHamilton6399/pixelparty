"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const MAX_RECENT = 8;
const STORAGE_KEY = "pixelparty:recent-colors";

/** Read recent colors from localStorage. */
function loadRecent(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((c) => typeof c === "string").slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

/** Push a color to the front of the recent list (dedup, cap at MAX_RECENT). */
function pushRecent(list: string[], color: string): string[] {
  const filtered = list.filter((c) => c.toLowerCase() !== color.toLowerCase());
  return [color, ...filtered].slice(0, MAX_RECENT);
}

interface RecentColorsProps {
  color: string;
  onPick: (hex: string) => void;
  /** "row" = horizontal scroll (mobile); "grid" = 2-col (desktop sidebar). */
  layout?: "row" | "grid";
}

/**
 * Recently-used colors, persisted in localStorage. Updates whenever the
 * current color changes (via the parent passing `color`).
 */
export function RecentColors({ color, onPick, layout = "grid" }: RecentColorsProps) {
  const [recent, setRecent] = useState<string[]>([]);
  const lastColorRef = useRef<string>("");

  // Load on mount.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRecent(loadRecent());
  }, []);

  // When the current color changes, persist it as most-recent.
  useEffect(() => {
    if (!color || color === lastColorRef.current) return;
    lastColorRef.current = color;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRecent((prev) => {
      const next = pushRecent(prev, color);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, [color]);

  if (recent.length === 0) return null;

  return (
    <div className={cn(layout === "grid" ? "grid grid-cols-4 gap-1" : "flex gap-1 overflow-x-auto")}>
      {recent.map((hex) => {
        const active = color.toLowerCase() === hex.toLowerCase();
        return (
          <button
            key={hex}
            type="button"
            onClick={() => onPick(hex)}
            aria-label={`Recent color ${hex}`}
            aria-pressed={active}
            className={cn(
              "h-5 w-5 shrink-0 rounded-sm border border-black/20 transition-transform hover:scale-110",
              active && "ring-2 ring-emerald-500 ring-offset-1 ring-offset-background"
            )}
            style={{ backgroundColor: hex }}
          />
        );
      })}
    </div>
  );
}
