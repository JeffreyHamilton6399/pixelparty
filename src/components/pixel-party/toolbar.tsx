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
  Circle,
  Grid3x3,
  Move,
  Sparkles,
  Type,
  Undo2,
  Redo2,
  FlipHorizontal,
  FlipVertical,
  Contrast,
  Paintbrush,
  Droplet,
  Replace,
  RotateCw,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Tool, MirrorMode } from "./pixel-canvas";

interface ToolBarProps {
  tool: Tool;
  onChange: (tool: Tool) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  filled: boolean;
  onToggleFilled: () => void;
  mirror: MirrorMode;
  onCycleMirror: () => void;
  showGrid: boolean;
  onToggleGrid: () => void;
  onFlipH: () => void;
  onFlipV: () => void;
  onInvert: () => void;
  onRotateCW: () => void;
  onRotateCCW: () => void;
  drawingDisabled?: boolean;
  orientation?: "vertical" | "horizontal";
}

/** Tools grouped for the consolidated toolbar. */
const GROUPS: { label: string; tools: { id: Tool; icon: typeof Pencil; label: string; key: string }[] }[] = [
  {
    label: "Draw",
    tools: [
      { id: "pencil", icon: Pencil, label: "Pencil", key: "B" },
      { id: "eraser", icon: Eraser, label: "Eraser", key: "E" },
      { id: "fill", icon: PaintBucket, label: "Fill", key: "F" },
      { id: "eyedropper", icon: Pipette, label: "Eyedropper", key: "I" },
    ],
  },
  {
    label: "Shapes",
    tools: [
      { id: "line", icon: Slash, label: "Line", key: "L" },
      { id: "rectangle", icon: Square, label: "Rectangle", key: "R" },
      { id: "ellipse", icon: Circle, label: "Ellipse", key: "O" },
    ],
  },
  {
    label: "More",
    tools: [
      { id: "dither", icon: Grid3x3, label: "Dither", key: "D" },
      { id: "spray", icon: Sparkles, label: "Spray", key: "S" },
      { id: "text", icon: Type, label: "Text", key: "T" },
      { id: "move", icon: Move, label: "Move", key: "M" },
      { id: "smudge", icon: Droplet, label: "Smudge", key: "N" },
      { id: "replace", icon: Replace, label: "Replace color", key: "A" },
    ],
  },
];

const MIRROR_LABELS: Record<MirrorMode, { icon: typeof FlipHorizontal; label: string }> = {
  none: { icon: FlipHorizontal2, label: "Mirror: off" },
  horizontal: { icon: FlipHorizontal, label: "Mirror: horizontal" },
  vertical: { icon: FlipVertical, label: "Mirror: vertical" },
  quad: { icon: FlipHorizontal2, label: "Mirror: 4-way" },
};

function FlipHorizontal2(props: React.ComponentProps<typeof FlipHorizontal>) {
  return <FlipHorizontal {...props} />;
}

export function ToolBar({
  tool,
  onChange,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  filled,
  onToggleFilled,
  mirror,
  onCycleMirror,
  showGrid,
  onToggleGrid,
  onFlipH,
  onFlipV,
  onInvert,
  onRotateCW,
  onRotateCCW,
  drawingDisabled = false,
  orientation = "vertical",
}: ToolBarProps) {
  const vertical = orientation === "vertical";
  const MirrorIcon = MIRROR_LABELS[mirror].icon;
  return (
    <TooltipProvider delayDuration={300}>
      <div className={cn("flex gap-1.5", vertical ? "flex-col" : "flex-row items-center")}>
        {/* Undo / Redo */}
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
            <TooltipContent side={vertical ? "right" : "top"}>Undo (Ctrl+Z)</TooltipContent>
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
            <TooltipContent side={vertical ? "right" : "top"}>Redo (Ctrl+Y)</TooltipContent>
          </Tooltip>
        </div>

        <Sep vertical={vertical} />

        {/* Tool groups */}
        {GROUPS.map((group, gi) => (
          <div key={group.label} className="flex items-center">
            {gi > 0 && <Sep vertical={vertical} />}
            <div className="flex gap-1">
              {group.tools.map(({ id, icon: Icon, label, key }) => {
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
                      {label} ({key})
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          </div>
        ))}

        <Sep vertical={vertical} />

        {/* Filled toggle (shapes only) */}
        {(tool === "rectangle" || tool === "ellipse") && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={onToggleFilled}
                aria-label={filled ? "Switch to outline" : "Switch to filled"}
                aria-pressed={filled}
                className={cn(
                  "h-8 w-8 shrink-0 rounded-md",
                  filled
                    ? "bg-emerald-500/15 text-emerald-500"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Paintbrush className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side={vertical ? "right" : "top"}>
              {filled ? "Filled" : "Outline"}
            </TooltipContent>
          </Tooltip>
        )}

        {/* Mirror */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={onCycleMirror}
              aria-label={MIRROR_LABELS[mirror].label}
              className={cn(
                "h-8 w-8 shrink-0 rounded-md",
                mirror !== "none"
                  ? "bg-emerald-500/15 text-emerald-500"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <MirrorIcon className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side={vertical ? "right" : "top"}>
            {MIRROR_LABELS[mirror].label}
          </TooltipContent>
        </Tooltip>

        {/* Grid */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={onToggleGrid}
              aria-label="Toggle grid"
              aria-pressed={showGrid}
              className={cn(
                "h-8 w-8 shrink-0 rounded-md",
                showGrid
                  ? "bg-emerald-500/15 text-emerald-500"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Grid3x3 className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side={vertical ? "right" : "top"}>Grid (G)</TooltipContent>
        </Tooltip>

        <Sep vertical={vertical} />

        {/* Canvas actions: flip + invert */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={onFlipH}
              disabled={drawingDisabled}
              aria-label="Flip horizontal"
              className="h-8 w-8 shrink-0 rounded-md text-muted-foreground hover:text-foreground disabled:opacity-30"
            >
              <FlipHorizontal className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side={vertical ? "right" : "top"}>Flip horizontal</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={onFlipV}
              disabled={drawingDisabled}
              aria-label="Flip vertical"
              className="h-8 w-8 shrink-0 rounded-md text-muted-foreground hover:text-foreground disabled:opacity-30"
            >
              <FlipVertical className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side={vertical ? "right" : "top"}>Flip vertical</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={onInvert}
              disabled={drawingDisabled}
              aria-label="Invert colors"
              className="h-8 w-8 shrink-0 rounded-md text-muted-foreground hover:text-foreground disabled:opacity-30"
            >
              <Contrast className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side={vertical ? "right" : "top"}>Invert colors</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={onRotateCW}
              disabled={drawingDisabled}
              aria-label="Rotate 90° clockwise"
              className="h-8 w-8 shrink-0 rounded-md text-muted-foreground hover:text-foreground disabled:opacity-30"
            >
              <RotateCw className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side={vertical ? "right" : "top"}>Rotate 90° CW</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={onRotateCCW}
              disabled={drawingDisabled}
              aria-label="Rotate 90° counter-clockwise"
              className="h-8 w-8 shrink-0 rounded-md text-muted-foreground hover:text-foreground disabled:opacity-30"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side={vertical ? "right" : "top"}>Rotate 90° CCW</TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}

function Sep({ vertical }: { vertical: boolean }) {
  return (
    <span
      className={cn(
        "bg-border",
        vertical ? "my-0.5 h-px w-6" : "mx-0.5 h-6 w-px"
      )}
    />
  );
}
