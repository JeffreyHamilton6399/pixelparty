"use client";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Pencil,
  PaintBucket,
  Eraser,
  Pipette,
  Slash,
  Square,
  Undo2,
  Redo2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Tool } from "./pixel-canvas";

interface ToolBarProps {
  tool: Tool;
  onChange: (tool: Tool) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  /** When true (viewer mode), drawing tools are disabled. */
  drawingDisabled?: boolean;
  orientation?: "vertical" | "horizontal";
}

const TOOLS: { id: Tool; icon: typeof Pencil; label: string }[] = [
  { id: "pencil", icon: Pencil, label: "Pencil" },
  { id: "line", icon: Slash, label: "Line" },
  { id: "rectangle", icon: Square, label: "Rectangle" },
  { id: "fill", icon: PaintBucket, label: "Fill" },
  { id: "eraser", icon: Eraser, label: "Eraser" },
  { id: "eyedropper", icon: Pipette, label: "Eyedropper" },
];

export function ToolBar({
  tool,
  onChange,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  drawingDisabled = false,
  orientation = "vertical",
}: ToolBarProps) {
  const vertical = orientation === "vertical";
  return (
    <TooltipProvider delayDuration={300}>
      <div className={cn("flex gap-1.5", vertical ? "flex-col" : "flex-row")}>
        {/* Undo / Redo (always available) */}
        <div className="flex gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={onUndo}
                disabled={!canUndo}
                aria-label="Undo"
                className="h-8 w-8 shrink-0 rounded-md text-muted-foreground hover:text-foreground disabled:opacity-30"
              >
                <Undo2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side={vertical ? "right" : "top"}>Undo</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={onRedo}
                disabled={!canRedo}
                aria-label="Redo"
                className="h-8 w-8 shrink-0 rounded-md text-muted-foreground hover:text-foreground disabled:opacity-30"
              >
                <Redo2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side={vertical ? "right" : "top"}>Redo</TooltipContent>
          </Tooltip>
        </div>

        {/* Tools */}
        {TOOLS.map(({ id, icon: Icon, label }) => {
          const active = tool === id;
          return (
            <Tooltip key={id}>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onChange(id)}
                  disabled={drawingDisabled}
                  aria-label={label}
                  aria-pressed={active}
                  className={cn(
                    "h-8 w-8 shrink-0 rounded-md",
                    active
                      ? "bg-emerald-500/15 text-emerald-500"
                      : "text-muted-foreground hover:text-foreground",
                    drawingDisabled && "opacity-40"
                  )}
                >
                  <Icon className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side={vertical ? "right" : "top"}>
                {label}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
