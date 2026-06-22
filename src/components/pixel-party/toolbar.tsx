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
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Tool } from "./pixel-canvas";

interface ToolBarProps {
  tool: Tool;
  onChange: (tool: Tool) => void;
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

export function ToolBar({ tool, onChange, orientation = "vertical" }: ToolBarProps) {
  return (
    <TooltipProvider delayDuration={300}>
      <div
        className={cn(
          "flex gap-1.5",
          orientation === "vertical" ? "flex-col" : "flex-row"
        )}
      >
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
                    "h-9 w-9 shrink-0 rounded-md border",
                    active
                      ? "border-emerald-500 bg-emerald-500/10 text-emerald-500"
                      : "border-border text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Icon className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent
                side={orientation === "vertical" ? "right" : "top"}
              >
                {label}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
