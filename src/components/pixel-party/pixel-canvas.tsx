"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  type CanvasSize,
  type PixelColor,
  type PixelUpdate,
} from "@/lib/pixel-party/constants";

export type Tool =
  | "pencil"
  | "line"
  | "rectangle"
  | "fill"
  | "eraser"
  | "eyedropper";

/** Brush size in pixels (1-8). 1 = single pixel. */
export type BrushSize = number;

export interface PixelCanvasHandle {
  exportPng: () => void;
  /** Snapshot the current pixels (for gallery save). */
  snapshot: () => { size: CanvasSize; pixels: PixelColor[] };
}

interface PixelCanvasProps {
  size: CanvasSize;
  tool: Tool;
  color: string;
  brushSize: BrushSize;
  pixelsRef: React.MutableRefObject<PixelColor[]>;
  dirtyRef: React.MutableRefObject<Set<number> | "all">;
  myId: string | null;
  onPlace: (pixels: PixelUpdate[]) => void;
  onPickColor: (hex: string) => void;
}

/**
 * Grid-based pixel canvas. Renders to an HTML canvas imperatively via a
 * requestAnimationFrame loop that only redraws dirty cells. No cursor dots, no
 * amber flash — just the pixels (minimal, clean VFX). Pointer/touch drawing,
 * line + rectangle shape previews, flood-fill, eyedropper, and brush size are
 * all handled here without touching React state on the hot path.
 *
 * The canvas background + grid lines are theme-aware.
 */
export const PixelCanvas = forwardRef<PixelCanvasHandle, PixelCanvasProps>(
  function PixelCanvas(props, ref) {
    const {
      size,
      tool,
      color,
      brushSize,
      pixelsRef,
      dirtyRef,
      myId,
      onPlace,
      onPickColor,
    } = props;

    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const previewCanvasRef = useRef<HTMLCanvasElement>(null);

    const cellPxRef = useRef(8);
    const [cellPx, setCellPx] = useState(8);
    const drawingRef = useRef(false);
    const lastCellRef = useRef<{ x: number; y: number } | null>(null);
    const previewingRef = useRef(false);
    const previewStartRef = useRef<{ x: number; y: number } | null>(null);
    const lastShapeEndRef = useRef<{ x: number; y: number } | null>(null);

    /* ------- Single effect: resize + rAF (dirty pixels only) ------- */
    useEffect(() => {
      const canvas = canvasRef.current;
      const previewCanvas = previewCanvasRef.current;
      const container = containerRef.current;
      if (!canvas || !previewCanvas || !container) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.imageSmoothingEnabled = false;

      const drawCell = (idx: number, cp: number) => {
        const x = idx % size;
        const y = Math.floor(idx / size);
        const px = pixelsRef.current[idx];
        if (px) {
          ctx.fillStyle = px;
          ctx.fillRect(x * cp, y * cp, cp, cp);
        } else {
          ctx.clearRect(x * cp, y * cp, cp, cp);
        }
      };

      const redrawAll = (cp: number) => {
        const dim = size * cp;
        ctx.clearRect(0, 0, dim, dim);
        for (let i = 0; i < size * size; i++) drawCell(i, cp);
      };

      const resize = () => {
        const rect = container.getBoundingClientRect();
        const avail = Math.max(64, Math.min(rect.width, rect.height));
        const cp = Math.max(1, Math.floor(avail / size));
        if (cp === cellPxRef.current && canvas.width === size * cp) return;
        cellPxRef.current = cp;
        setCellPx(cp);
        const dim = size * cp;
        for (const c of [canvas, previewCanvas]) {
          c.width = dim;
          c.height = dim;
          c.style.width = `${dim}px`;
          c.style.height = `${dim}px`;
        }
        ctx.imageSmoothingEnabled = false;
        redrawAll(cp);
        dirtyRef.current = "all";
      };

      resize();
      const ro = new ResizeObserver(() => resize());
      ro.observe(container);

      let raf = 0;
      const frame = () => {
        raf = requestAnimationFrame(frame);
        const cp = cellPxRef.current;
        const dirty = dirtyRef.current;
        if (dirty === "all") {
          redrawAll(cp);
          dirtyRef.current = new Set();
        } else if (dirty.size > 0) {
          for (const idx of dirty) drawCell(idx, cp);
          dirty.clear();
        }
      };
      raf = requestAnimationFrame(frame);

      return () => {
        cancelAnimationFrame(raf);
        ro.disconnect();
      };
    }, [size, pixelsRef, dirtyRef, myId]);

    /* ----------------------------- Drawing helpers ----------------------------- */

    const pointerToCell = (
      clientX: number,
      clientY: number
    ): { x: number; y: number } | null => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      const cp = cellPxRef.current;
      const x = Math.floor((clientX - rect.left) / cp);
      const y = Math.floor((clientY - rect.top) / cp);
      if (x < 0 || x >= size || y < 0 || y >= size) return null;
      return { x, y };
    };

    /** Cells covered by a brush of the current size centered at (cx,cy). */
    const brushCells = (cx: number, cy: number): { x: number; y: number }[] => {
      const b = Math.max(1, Math.min(8, brushSize));
      if (b === 1) return [{ x: cx, y: cy }];
      const off = Math.floor(b / 2);
      const out: { x: number; y: number }[] = [];
      for (let dy = 0; dy < b; dy++) {
        for (let dx = 0; dx < b; dx++) {
          const x = cx - off + dx;
          const y = cy - off + dy;
          if (x >= 0 && x < size && y >= 0 && y < size) out.push({ x, y });
        }
      }
      return out;
    };

    const placeAt = (x: number, y: number) => {
      const idx = y * size + x;
      if (tool === "eyedropper") {
        const px = pixelsRef.current[idx];
        if (px) onPickColor(px);
        return;
      }
      if (tool === "fill") {
        const updates = floodFill(pixelsRef.current, size, x, y, color);
        if (updates.length) onPlace(updates);
        return;
      }
      // pencil / eraser — apply brush size.
      const newColor = tool === "eraser" ? null : color;
      const cells = brushCells(x, y);
      const updates: PixelUpdate[] = [];
      for (const c of cells) {
        if (pixelsRef.current[c.y * size + c.x] !== newColor) {
          updates.push({ x: c.x, y: c.y, color: newColor });
        }
      }
      if (updates.length) onPlace(updates);
    };

    const placeLine = (from: { x: number; y: number }, to: { x: number; y: number }) => {
      if (tool !== "pencil" && tool !== "eraser") return;
      const newColor = tool === "eraser" ? null : color;
      const linePath = lineCells(from.x, from.y, to.x, to.y);
      const updates: PixelUpdate[] = [];
      const seen = new Set<number>();
      for (const p of linePath) {
        for (const c of brushCells(p.x, p.y)) {
          const idx = c.y * size + c.x;
          if (seen.has(idx)) continue;
          seen.add(idx);
          if (pixelsRef.current[idx] !== newColor) {
            updates.push({ x: c.x, y: c.y, color: newColor });
          }
        }
      }
      if (updates.length) onPlace(updates);
    };

    /* ----- Shape preview (line / rectangle) on the preview canvas ----- */

    const drawPreview = (start: { x: number; y: number }, end: { x: number; y: number }) => {
      const pc = previewCanvasRef.current;
      if (!pc) return;
      const pctx = pc.getContext("2d");
      if (!pctx) return;
      const cp = cellPxRef.current;
      pctx.clearRect(0, 0, pc.width, pc.height);
      const cells =
        tool === "line"
          ? lineCells(start.x, start.y, end.x, end.y)
          : rectCells(start.x, start.y, end.x, end.y);
      pctx.globalAlpha = 0.55;
      pctx.fillStyle = color;
      for (const c of cells) pctx.fillRect(c.x * cp, c.y * cp, cp, cp);
      pctx.globalAlpha = 1;
    };

    const clearPreview = () => {
      const pc = previewCanvasRef.current;
      if (!pc) return;
      const pctx = pc.getContext("2d");
      if (!pctx) return;
      pctx.clearRect(0, 0, pc.width, pc.height);
    };

    const commitShape = (start: { x: number; y: number }, end: { x: number; y: number }) => {
      const cells =
        tool === "line"
          ? lineCells(start.x, start.y, end.x, end.y)
          : rectCells(start.x, start.y, end.x, end.y);
      if (cells.length) {
        onPlace(cells.map((c) => ({ x: c.x, y: c.y, color })));
      }
      clearPreview();
    };

    const handlePointerDown = (e: React.PointerEvent) => {
      const cell = pointerToCell(e.clientX, e.clientY);
      if (!cell) return;
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);

      if (tool === "line" || tool === "rectangle") {
        previewingRef.current = true;
        previewStartRef.current = cell;
        lastShapeEndRef.current = cell;
        drawPreview(cell, cell);
        return;
      }
      drawingRef.current = true;
      lastCellRef.current = cell;
      placeAt(cell.x, cell.y);
    };

    const handlePointerMove = (e: React.PointerEvent) => {
      const cell = pointerToCell(e.clientX, e.clientY);

      if (previewingRef.current) {
        const start = previewStartRef.current;
        if (start && cell) {
          drawPreview(start, cell);
          lastShapeEndRef.current = cell;
        }
        return;
      }
      if (!drawingRef.current || !cell) return;
      const last = lastCellRef.current;
      if (last && (last.x !== cell.x || last.y !== cell.y)) {
        placeLine(last, cell);
        lastCellRef.current = cell;
      }
    };

    const handlePointerUp = () => {
      if (previewingRef.current) {
        const start = previewStartRef.current;
        const end = lastShapeEndRef.current ?? start;
        if (start && end) commitShape(start, end);
        previewingRef.current = false;
        previewStartRef.current = null;
        lastShapeEndRef.current = null;
        return;
      }
      drawingRef.current = false;
      lastCellRef.current = null;
    };

    /* ----------------------------- Export / snapshot ----------------------------- */

    useImperativeHandle(
      ref,
      (): PixelCanvasHandle => ({
        exportPng: () => {
          const s = size;
          const cp = Math.max(cellPxRef.current, 16);
          const out = document.createElement("canvas");
          out.width = s * cp;
          out.height = s * cp;
          const octx = out.getContext("2d");
          if (!octx) return;
          octx.imageSmoothingEnabled = false;
          for (let i = 0; i < s * s; i++) {
            const px = pixelsRef.current[i];
            if (!px) continue;
            const x = i % s;
            const y = Math.floor(i / s);
            octx.fillStyle = px;
            octx.fillRect(x * cp, y * cp, cp, cp);
          }
          const url = out.toDataURL("image/png");
          const a = document.createElement("a");
          a.href = url;
          a.download = `pixelparty-${s}x${s}.png`;
          document.body.appendChild(a);
          a.click();
          a.remove();
        },
        snapshot: () => ({
          size,
          pixels: pixelsRef.current.slice(),
        }),
      }),
      [size]
    );

    const showGrid = cellPx >= 8;

    return (
      <div
        ref={containerRef}
        className="relative flex h-full w-full items-center justify-center overflow-hidden"
      >
        <div
          className="relative"
          style={{
            width: size * cellPx,
            height: size * cellPx,
            maxWidth: "100%",
            maxHeight: "100%",
          }}
        >
          <canvas
            ref={canvasRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            onPointerCancel={handlePointerUp}
            className="absolute inset-0 rounded-sm bg-background [touch-action:none] cursor-crosshair border border-border"
            style={{ imageRendering: "pixelated" }}
          />
          {showGrid && (
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                backgroundImage:
                  "linear-gradient(to right, var(--pixel-grid-line) 1px, transparent 1px), linear-gradient(to bottom, var(--pixel-grid-line) 1px, transparent 1px)",
                backgroundSize: `${cellPx}px ${cellPx}px`,
              }}
            />
          )}
          <canvas
            ref={previewCanvasRef}
            className="pointer-events-none absolute inset-0"
            style={{ imageRendering: "pixelated" }}
          />
        </div>
      </div>
    );
  }
);

/** Bresenham line cells. */
function lineCells(x0: number, y0: number, x1: number, y1: number): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  let x = x0;
  let y = y0;
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  while (true) {
    out.push({ x, y });
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
  }
  return out;
}

/** Rectangle outline cells. */
function rectCells(x0: number, y0: number, x1: number, y1: number): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  const xa = Math.min(x0, x1);
  const xb = Math.max(x0, x1);
  const ya = Math.min(y0, y1);
  const yb = Math.max(y0, y1);
  for (let x = xa; x <= xb; x++) {
    out.push({ x, y: ya });
    if (yb !== ya) out.push({ x, y: yb });
  }
  for (let y = ya + 1; y < yb; y++) {
    out.push({ x: xa, y });
    if (xb !== xa) out.push({ x: xb, y });
  }
  return out;
}

/** Iterative flood fill. Returns the list of changed cells. */
function floodFill(
  pixels: PixelColor[],
  size: number,
  startX: number,
  startY: number,
  newColor: PixelColor
): PixelUpdate[] {
  const startIdx = startY * size + startX;
  const target = pixels[startIdx];
  if (target === newColor) return [];
  const out: PixelUpdate[] = [];
  const stack: number[] = [startIdx];
  const visited = new Uint8Array(size * size);
  while (stack.length) {
    const idx = stack.pop()!;
    if (visited[idx]) continue;
    visited[idx] = 1;
    if (pixels[idx] !== target) continue;
    pixels[idx] = newColor;
    const x = idx % size;
    const y = Math.floor(idx / size);
    out.push({ x, y, color: newColor });
    if (x > 0) stack.push(idx - 1);
    if (x < size - 1) stack.push(idx + 1);
    if (y > 0) stack.push(idx - size);
    if (y < size - 1) stack.push(idx + size);
  }
  return out;
}
