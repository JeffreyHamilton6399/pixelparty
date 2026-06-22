"use client";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Slider } from "@/components/ui/slider";
import { Brush } from "lucide-react";

interface BrushButtonProps {
  size: number;
  onChange: (s: number) => void;
  disabled?: boolean;
}

/** One button showing the current brush size; opens a popover slider (1-8). */
export function BrushButton({ size, onChange, disabled }: BrushButtonProps) {
  return (
    <TooltipProvider delayDuration={300}>
      <Popover>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                disabled={disabled}
                className="h-8 w-8"
                aria-label={`Brush size ${size}, click to adjust`}
              >
                <span
                  className="rounded-full bg-current"
                  style={{
                    width: Math.min(size * 2 + 2, 12),
                    height: Math.min(size * 2 + 2, 12),
                  }}
                />
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="top">Brush size {size}</TooltipContent>
        </Tooltip>
        <PopoverContent className="w-40 p-3" align="center">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Brush</span>
            <span className="text-xs font-medium tabular-nums">{size}px</span>
          </div>
          <Slider
            value={[size]}
            min={1}
            max={8}
            step={1}
            onValueChange={(v) => onChange(v[0])}
            aria-label="Brush size"
          />
          <div className="mt-2 flex items-center justify-center">
            <span
              className="rounded-full bg-foreground"
              style={{
                width: Math.min(size * 3 + 2, 22),
                height: Math.min(size * 3 + 2, 22),
              }}
            />
          </div>
        </PopoverContent>
      </Popover>
    </TooltipProvider>
  );
}
