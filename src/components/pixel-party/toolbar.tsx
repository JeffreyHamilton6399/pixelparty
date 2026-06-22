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
import type { Tool, BrushSize } from "./pixel-canvas";

interface ToolBarProps {
  tool: Tool;
  onChange: (tool: Tool) => void;
  brushSize: BrushSize;
  onBrushSize: (b: BrushSize) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
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

const BRUSHES: BrushSize[] = [1, 2, 3];

export function ToolBar({
  tool,
  onChange,
  brushSize,
  onBrushSize,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  orientation = "vertical",
}: ToolBarProps) {
  const vertical = orientation === "vertical";
  return (
    <TooltipProvider delayDuration={300}>
      <div className={cn("flex gap-1.5", vertical ? "flex-col" : "flex-row")}>
        {/* Undo / Redo */}
        <div className={cn("flex gap-1", vertical ? "flex-row" : "flex-row")}>
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
                  aria-label={label}
                  aria-pressed={active}
                  className={cn(
                    "h-8 w-8 shrink-0 rounded-md",
                    active
                      ? "bg-emerald-500/15 text-emerald-500"
                      : "text-muted-foreground hover:text-foreground"
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

        {/* Brush size — only relevant to pencil/eraser */}
        {(tool === "pencil" || tool === "eraser") && (
          <div
            className={cn(
              "mt-0.5 gap-1",
              vertical ? "flex flex-col" : "flex flex-row"
            )}
            role="group"
            aria-label="Brush size"
          >
            {BRUSHES.map((b) => {
              const active = brushSize === b;
              return (
                <Tooltip key={b}>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onBrushSize(b)}
                      aria-label={`Brush size ${b}`}
                      aria-pressed={active}
                      className={cn(
                        "h-8 w-8 shrink-0 rounded-md",
                        active
                          ? "bg-emerald-500/15 text-emerald-500"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <span
                        className="rounded-full bg-current"
                        style={{
                          width: b * 3 + 2,
                          height: b * 3 + 2,
                        }}
                      />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side={vertical ? "right" : "top"}>
                    Brush {b}px
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
