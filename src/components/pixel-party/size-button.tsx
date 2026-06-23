"use client";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Grid2x2 } from "lucide-react";
import { CANVAS_SIZES, type CanvasSize } from "@/lib/pixel-party/constants";
import { cn } from "@/lib/utils";

interface SizeButtonProps {
  size: CanvasSize;
  onChange: (s: CanvasSize) => void;
  disabled?: boolean;
}

/** One button showing the current size; opens a popover to pick 16/32/64. */
export function SizeButton({ size, onChange, disabled }: SizeButtonProps) {
  return (
    <TooltipProvider delayDuration={300}>
      <Popover>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                disabled={disabled}
                className="h-8 gap-1.5 px-2 text-xs tabular-nums"
                aria-label={`Canvas size ${size}, click to change`}
              >
                <Grid2x2 className="h-3.5 w-3.5" />
                {size}
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="top">Canvas size</TooltipContent>
        </Tooltip>
        <PopoverContent className="w-auto p-2" align="start">
          <div className="flex flex-col gap-1">
            {CANVAS_SIZES.map((s) => (
              <Button
                key={s}
                variant="ghost"
                size="sm"
                onClick={() => onChange(s)}
                className={cn(
                  "h-8 justify-start px-3 text-sm tabular-nums",
                  s === size && "bg-emerald-500/15 text-emerald-500"
                )}
              >
                {s} × {s}
              </Button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </TooltipProvider>
  );
}
