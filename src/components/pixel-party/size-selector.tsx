"use client";

import { Button } from "@/components/ui/button";
import { CANVAS_SIZES, type CanvasSize } from "@/lib/pixel-party/constants";
import { cn } from "@/lib/utils";

interface SizeSelectorProps {
  size: CanvasSize;
  onChange: (s: CanvasSize) => void;
  orientation?: "vertical" | "horizontal";
}

/** Compact 16 / 32 / 64 segmented selector (lives in the toolbar, not settings). */
export function SizeSelector({
  size,
  onChange,
  orientation = "vertical",
}: SizeSelectorProps) {
  return (
    <div
      className={cn(
        "gap-1",
        orientation === "vertical" ? "flex flex-col" : "flex flex-row"
      )}
      role="group"
      aria-label="Canvas size"
    >
      {CANVAS_SIZES.map((s) => {
        const active = s === size;
        return (
          <Button
            key={s}
            variant="ghost"
            size="sm"
            onClick={() => onChange(s)}
            aria-pressed={active}
            aria-label={`${s} by ${s} canvas`}
            className={cn(
              "h-7 shrink-0 px-2 text-xs tabular-nums",
              active
                ? "border border-emerald-500 bg-emerald-500/10 text-emerald-500"
                : "border border-border text-muted-foreground hover:text-foreground"
            )}
          >
            {s}
          </Button>
        );
      })}
    </div>
  );
}
