"use client";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { FlipHorizontal, FlipVertical } from "lucide-react";

interface FlipButtonProps {
  onFlipH: () => void;
  onFlipV: () => void;
  disabled?: boolean;
}

/** One button → popover with Horizontal / Vertical options. */
export function FlipButton({ onFlipH, onFlipV, disabled }: FlipButtonProps) {
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
                className="h-8 w-8 text-muted-foreground hover:text-foreground disabled:opacity-30"
                aria-label="Flip canvas"
              >
                <FlipHorizontal className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="top">Flip canvas</TooltipContent>
        </Tooltip>
        <PopoverContent className="w-auto p-1" align="center">
          <div className="flex flex-col gap-0.5">
            <Button
              variant="ghost"
              size="sm"
              onClick={onFlipH}
              className="h-8 justify-start px-3 text-xs"
            >
              <FlipHorizontal className="mr-2 h-3.5 w-3.5" /> Horizontal
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onFlipV}
              className="h-8 justify-start px-3 text-xs"
            >
              <FlipVertical className="mr-2 h-3.5 w-3.5" /> Vertical
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </TooltipProvider>
  );
}
