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
  type CursorState,
  type FlashState,
} from "@/lib/pixel-party/constants";

export type Tool =
  | "pencil"
  | "line"
  | "rectangle"
  | "fill"
  | "eraser"
  | "eyedropper";

export interface PixelCanvasHandle {
  exportPng: () => void;
}

interface PixelCanvasProps {
  size: CanvasSize;
  tool: Tool;
  color: string;
  pixelsRef: React.MutableRefObject<PixelColor[]>;
  dirtyRef: React.MutableRefObject<Set<number> | "all">;
  cursorsRef: React.MutableRefObject<Map<string, CursorState>>;
  flashesRef: React.MutableRefObject<FlashState[]>;
  myId: string | null;
  onPlace: (pixels: PixelUpdate[]) => void;
  onCursor: (x: number, y: number) => void;
  onPickColor: (hex: string) => void;
}

const FLASH_DURATION_MS = 380;

/**
 * Grid-based pixel canvas. Renders to an HTML canvas imperatively via a
 * requestAnimationFrame loop that only redraws dirty cells. Pointer/touch
 * drawing, line + rectangle shape previews, flood-fill, eyedropper, live
 * remote cursors, and the amber "pixel flash" feedback are all handled here
 * without touching React state on the hot path.
 *
 * The canvas background and grid lines are theme-aware (light mode actually
 * changes the drawing area, not just the chrome).
 */
export const PixelCanvas = forwardRef<PixelCanvasHandle, PixelCanvasProps>(
  function PixelCanvas(props, ref) {
    const {
      size,
      tool,
      color,
      pixelsRef,
      dirtyRef,
      cursorsRef,
      flashesRef,
      myId,
      onPlace,
      onCursor,
      onPickColor,
    } = props;

    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const flashCanvasRef = useRef<HTMLCanvasElement>(null);
    const previewCanvasRef = useRef<HTMLCanvasElement>(null);
    const cursorLayerRef = useRef<HTMLDivElement>(null);

    const cellPxRef = useRef(8);
    const [cellPx, setCellPx] = useState(8);
    const drawingRef = useRef(false);
    const lastCellRef = useRef<{ x: number; y: number } | null>(null);
    // Shape-tool (line/rectangle) drag state.
    const previewingRef = useRef(false);
    const previewStartRef = useRef<{ x: number; y: number } | null>(null);
    const lastShapeEndRef = useRef<{ x: number; y: number } | null>(null);

    /* ------- Single effect: resize + rAF (dirty pixels, flashes, cursors) ------- */
    useEffect(() => {
      const canvas = canvasRef.current;
      const flashCanvas = flashCanvasRef.current;
      const previewCanvas = previewCanvasRef.current;
      const container = containerRef.current;
      if (!canvas || !flashCanvas || !previewCanvas || !container) return;
      const ctx = canvas.getContext("2d");
      const fctx = flashCanvas.getContext("2d");
      if (!ctx || !fctx) return;
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
        for (const c of [canvas, flashCanvas, previewCanvas]) {
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

      // Imperative cursor dot management (no React state).
      const cursorEls = new Map<string, HTMLDivElement>();
      const ensureCursorEl = (id: string, c: string) => {
        let el = cursorEls.get(id);
        if (!el) {
          el = document.createElement("div");
          el.style.position = "absolute";
          el.style.width = "10px";
          el.style.height = "10px";
          el.style.borderRadius = "9999px";
          el.style.border = "1.5px solid white";
          el.style.boxShadow = "0 0 0 1px rgba(0,0,0,0.35)";
          el.style.pointerEvents = "none";
          el.style.willChange = "transform";
          el.style.transform = "translate(-9999px,-9999px)";
          el.style.transition = "transform 60ms linear";
          cursorLayerRef.current?.appendChild(el);
          cursorEls.set(id, el);
        }
        el.style.background = c;
        return el;
      };

      let raf = 0;
      const frame = () => {
        raf = requestAnimationFrame(frame);
        const cp = cellPxRef.current;

        // 1. Dirty pixels.
        const dirty = dirtyRef.current;
        if (dirty === "all") {
          redrawAll(cp);
          dirtyRef.current = new Set();
        } else if (dirty.size > 0) {
          for (const idx of dirty) drawCell(idx, cp);
          dirty.clear();
        }

        // 2. Amber flashes (preview layer is separate; this is flash-only).
        const now = performance.now();
        const flashes = flashesRef.current;
        fctx.clearRect(0, 0, size * cp, size * cp);
        if (flashes.length > 0) {
          let writeIdx = 0;
          for (let i = 0; i < flashes.length; i++) {
            const f = flashes[i];
            const age = now - f.ts;
            if (age < 0 || age > FLASH_DURATION_MS) continue;
            const alpha = 0.85 * (1 - age / FLASH_DURATION_MS);
            fctx.fillStyle = `rgba(251, 191, 36, ${alpha})`;
            fctx.fillRect(f.x * cp, f.y * cp, cp, cp);
            flashes[writeIdx++] = f;
          }
          flashes.length = writeIdx;
        }

        // 3. Cursors.
        const cursors = cursorsRef.current;
        const nowMs = Date.now();
        const seen = new Set<string>();
        cursors.forEach((c, id) => {
          if (id === myId) return;
          if (nowMs - c.lastSeen > 6000) return;
          seen.add(id);
          const el = ensureCursorEl(id, c.color);
          el.style.transform = `translate(${c.x * cp - 5}px, ${c.y * cp - 5}px)`;
        });
        for (const [id, el] of cursorEls) {
          if (!seen.has(id)) {
            el.remove();
            cursorEls.delete(id);
          }
        }
      };
      raf = requestAnimationFrame(frame);

      return () => {
        cancelAnimationFrame(raf);
        ro.disconnect();
        cursorEls.forEach((el) => el.remove());
        cursorEls.clear();
      };
    }, [size, pixelsRef, dirtyRef, flashesRef, cursorsRef, myId]);

    /* ----------------------------- Drawing input ----------------------------- */
    // These handlers are recreated every render, so they close over the latest
    // `tool` and `color` props — no refs needed for those.

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
      const newColor = tool === "eraser" ? null : color;
      if (pixelsRef.current[idx] === newColor) return;
      onPlace([{ x, y, color: newColor }]);
    };

    const placeLine = (from: { x: number; y: number }, to: { x: number; y: number }) => {
      if (tool !== "pencil" && tool !== "eraser") return;
      const newColor = tool === "eraser" ? null : color;
      const cells: PixelUpdate[] = [];
      let x0 = from.x;
      let y0 = from.y;
      const x1 = to.x;
      const y1 = to.y;
      const dx = Math.abs(x1 - x0);
      const dy = Math.abs(y1 - y0);
      const sx = x0 < x1 ? 1 : -1;
      const sy = y0 < y1 ? 1 : -1;
      let err = dx - dy;
      while (true) {
        const idx = y0 * size + x0;
        if (pixelsRef.current[idx] !== newColor) {
          cells.push({ x: x0, y: y0, color: newColor });
        }
        if (x0 === x1 && y0 === y1) break;
        const e2 = 2 * err;
        if (e2 > -dy) {
          err -= dy;
          x0 += sx;
        }
        if (e2 < dx) {
          err += dx;
          y0 += sy;
        }
      }
      if (cells.length) onPlace(cells);
    };

    /* ----- Shape preview (line / rectangle) drawn on the preview canvas ----- */

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
      pctx.globalAlpha = 0.6;
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

    const commitShape = (
      start: { x: number; y: number },
      end: { x: number; y: number }
    ) => {
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
        drawPreview(cell, cell);
        return;
      }
      drawingRef.current = true;
      lastCellRef.current = cell;
      placeAt(cell.x, cell.y);
    };

    const handlePointerMove = (e: React.PointerEvent) => {
      const canvas = canvasRef.current;
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        const cp = cellPxRef.current;
        onCursor((e.clientX - rect.left) / cp, (e.clientY - rect.top) / cp);
      }

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

    /* ----------------------------- Export ----------------------------- */

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
          {/* Pixel layer — theme-aware background so light mode changes the box. */}
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
          {/* Grid overlay — theme-aware line color via CSS var. */}
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
          {/* Amber flash overlay */}
          <canvas
            ref={flashCanvasRef}
            className="pointer-events-none absolute inset-0"
            style={{ imageRendering: "pixelated" }}
          />
          {/* Shape preview overlay (line / rectangle drag) */}
          <canvas
            ref={previewCanvasRef}
            className="pointer-events-none absolute inset-0"
            style={{ imageRendering: "pixelated" }}
          />
          {/* Cursor overlay */}
          <div
            ref={cursorLayerRef}
            className="pointer-events-none absolute inset-0 overflow-visible"
          />
        </div>
      </div>
    );
  }
);

/** Bresenham line cells. */
function lineCells(
  x0: number,
  y0: number,
  x1: number,
  y1: number
): { x: number; y: number }[] {
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

/** Rectangle outline cells (4 edges, no duplicates on degenerate cases). */
function rectCells(
  x0: number,
  y0: number,
  x1: number,
  y1: number
): { x: number; y: number }[] {
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
