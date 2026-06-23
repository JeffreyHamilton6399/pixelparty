"use client";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { RotateCw, RotateCcw } from "lucide-react";

interface RotateButtonProps {
  onRotateCW: () => void;
  onRotateCCW: () => void;
  disabled?: boolean;
}

/** One button → popover with CW / CCW options. */
export function RotateButton({ onRotateCW, onRotateCCW, disabled }: RotateButtonProps) {
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
                aria-label="Rotate canvas"
              >
                <RotateCw className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="top">Rotate canvas</TooltipContent>
        </Tooltip>
        <PopoverContent className="w-auto p-1" align="center">
          <div className="flex flex-col gap-0.5">
            <Button
              variant="ghost"
              size="sm"
              onClick={onRotateCW}
              className="h-8 justify-start px-3 text-xs"
            >
              <RotateCw className="mr-2 h-3.5 w-3.5" /> 90° clockwise
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onRotateCCW}
              className="h-8 justify-start px-3 text-xs"
            >
              <RotateCcw className="mr-2 h-3.5 w-3.5" /> 90° counter-CW
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </TooltipProvider>
  );
}
