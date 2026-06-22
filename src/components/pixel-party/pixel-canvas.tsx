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
  | "ellipse"
  | "fill"
  | "eraser"
  | "eyedropper"
  | "dither"
  | "spray"
  | "move"
  | "text";

/** Brush size in pixels (1-8). 1 = single pixel. */
export type BrushSize = number;

export type MirrorMode = "none" | "horizontal" | "vertical" | "quad";

export interface PixelCanvasHandle {
  exportPng: () => void;
  snapshot: () => { size: CanvasSize; pixels: PixelColor[] };
  /** Flip the whole canvas horizontally (mirror left-right). */
  flipH: (onPlace: (pixels: PixelUpdate[]) => void) => void;
  /** Flip the whole canvas vertically (mirror top-bottom). */
  flipV: (onPlace: (pixels: PixelUpdate[]) => void) => void;
  /** Invert all pixel colors on the canvas. */
  invert: (onPlace: (pixels: PixelUpdate[]) => void) => void;
}

interface PixelCanvasProps {
  size: CanvasSize;
  tool: Tool;
  color: string;
  brushSize: BrushSize;
  filled: boolean;
  mirror: MirrorMode;
  showGrid: boolean;
  /** Text to stamp when the text tool is active. */
  text: string;
  pixelsRef: React.MutableRefObject<PixelColor[]>;
  dirtyRef: React.MutableRefObject<Set<number> | "all">;
  myId: string | null;
  onPlace: (pixels: PixelUpdate[]) => void;
  onPickColor: (hex: string) => void;
  /** Eyedropper hover color (null when not hovering a pixel). */
  onHoverColor?: (hex: string | null) => void;
}

const SPRAY_RADIUS = 3;

/**
 * Grid-based pixel canvas. Renders to an HTML canvas imperatively via a
 * requestAnimationFrame loop that only redraws dirty cells.
 *
 * Tools: pencil, line, rectangle, ellipse, fill, eraser, eyedropper, dither,
 * spray, move. Supports filled shapes, mirror mode (h/v/quad), grid toggle,
 * and an eyedropper hover preview.
 */
export const PixelCanvas = forwardRef<PixelCanvasHandle, PixelCanvasProps>(
  function PixelCanvas(props, ref) {
    const {
      size,
      tool,
      color,
      brushSize,
      filled,
      mirror,
      showGrid,
      text,
      pixelsRef,
      dirtyRef,
      myId,
      onPlace,
      onPickColor,
      onHoverColor,
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
    // For spray/move which use a different drag model.
    const sprayMoveDraggingRef = useRef(false);

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

    /** Apply mirror transforms to a cell, returning all mirrored positions. */
    const mirrorCells = (x: number, y: number): { x: number; y: number }[] => {
      const out = [{ x, y }];
      if (mirror === "horizontal" || mirror === "quad") {
        out.push({ x: size - 1 - x, y });
      }
      if (mirror === "vertical" || mirror === "quad") {
        out.push({ x, y: size - 1 - y });
      }
      if (mirror === "quad") {
        out.push({ x: size - 1 - x, y: size - 1 - y });
      }
      return out;
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

    /** Expand a set of cells with their mirror counterparts. */
    const withMirror = (cells: { x: number; y: number }[]): { x: number; y: number }[] => {
      if (mirror === "none") return cells;
      const seen = new Set<number>();
      const out: { x: number; y: number }[] = [];
      for (const c of cells) {
        for (const m of mirrorCells(c.x, c.y)) {
          if (m.x < 0 || m.x >= size || m.y < 0 || m.y >= size) continue;
          const idx = m.y * size + m.x;
          if (seen.has(idx)) continue;
          seen.add(idx);
          out.push(m);
        }
      }
      return out;
    };

    /** Build PixelUpdate[] from cells + a color, skipping no-ops. */
    const toUpdates = (
      cells: { x: number; y: number }[],
      newColor: PixelColor
    ): PixelUpdate[] => {
      const out: PixelUpdate[] = [];
      for (const c of cells) {
        if (pixelsRef.current[c.y * size + c.x] !== newColor) {
          out.push({ x: c.x, y: c.y, color: newColor });
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
      if (tool === "text") {
        // Stamp the current text string as pixels, starting at (x, y).
        const cells = textToCells(text, size, x, y);
        const mirrored = withMirror(cells);
        const updates = toUpdates(mirrored, color);
        if (updates.length) onPlace(updates);
        return;
      }
      if (tool === "fill") {
        // Fill doesn't mirror — it floods the connected region.
        const updates = floodFill(pixelsRef.current, size, x, y, color);
        if (updates.length) onPlace(updates);
        return;
      }
      if (tool === "dither") {
        // Checkerboard 2x2 pattern based on brush center parity.
        const cells = brushCells(x, y).filter(
          (c) => (c.x + c.y) % 2 === 0
        );
        const mirrored = withMirror(cells);
        const updates = toUpdates(mirrored, color);
        if (updates.length) onPlace(updates);
        return;
      }
      if (tool === "spray") {
        // Scatter random pixels in a radius around the center.
        const cells: { x: number; y: number }[] = [];
        const r = Math.max(1, brushSize);
        for (let i = 0; i < r * 2; i++) {
          const ang = Math.random() * Math.PI * 2;
          const dist = Math.random() * SPRAY_RADIUS * r;
          const sx = Math.round(x + Math.cos(ang) * dist);
          const sy = Math.round(y + Math.sin(ang) * dist);
          if (sx >= 0 && sx < size && sy >= 0 && sy < size) {
            cells.push({ x: sx, y: sy });
          }
        }
        const mirrored = withMirror(cells);
        const updates = toUpdates(mirrored, color);
        if (updates.length) onPlace(updates);
        return;
      }
      // pencil / eraser — apply brush size + mirror.
      const newColor = tool === "eraser" ? null : color;
      const cells = withMirror(brushCells(x, y));
      const updates = toUpdates(cells, newColor);
      if (updates.length) onPlace(updates);
    };

    const placeLine = (from: { x: number; y: number }, to: { x: number; y: number }) => {
      if (tool !== "pencil" && tool !== "eraser" && tool !== "dither") return;
      const newColor = tool === "eraser" ? null : color;
      const linePath = lineCells(from.x, from.y, to.x, to.y);
      let cells: { x: number; y: number }[] = [];
      for (const p of linePath) {
        cells = cells.concat(brushCells(p.x, p.y));
      }
      if (tool === "dither") {
        cells = cells.filter((c) => (c.x + c.y) % 2 === 0);
      }
      const mirrored = withMirror(cells);
      const updates = toUpdates(mirrored, newColor);
      if (updates.length) onPlace(updates);
    };

    /** Spray/move continuous drag — called on every move while dragging. */
    const dragPaint = (x: number, y: number) => {
      if (tool === "spray") {
        placeAt(x, y);
        return;
      }
      if (tool === "move") {
        // Move handled via pointer-down direction on commit; continuous noop.
        return;
      }
    };

    /* ----- Shape preview (line / rectangle / ellipse) on the preview canvas ----- */

    const shapeCells = (
      start: { x: number; y: number },
      end: { x: number; y: number }
    ): { x: number; y: number }[] => {
      if (tool === "line") return lineCells(start.x, start.y, end.x, end.y);
      if (tool === "rectangle") {
        return filled
          ? rectFilledCells(start.x, start.y, end.x, end.y)
          : rectCells(start.x, start.y, end.x, end.y);
      }
      if (tool === "ellipse") {
        return filled
          ? ellipseFilledCells(size, start.x, start.y, end.x, end.y)
          : ellipseCells(size, start.x, start.y, end.x, end.y);
      }
      return [];
    };

    const drawPreview = (start: { x: number; y: number }, end: { x: number; y: number }) => {
      const pc = previewCanvasRef.current;
      if (!pc) return;
      const pctx = pc.getContext("2d");
      if (!pctx) return;
      const cp = cellPxRef.current;
      pctx.clearRect(0, 0, pc.width, pc.height);
      let cells = shapeCells(start, end);
      if (mirror !== "none") cells = withMirror(cells);
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
      let cells = shapeCells(start, end);
      if (mirror !== "none") cells = withMirror(cells);
      if (cells.length) {
        onPlace(cells.map((c) => ({ x: c.x, y: c.y, color })));
      }
      clearPreview();
    };

    /* ----- Move/shift tool: shift all pixels in the drag direction ----- */
    const commitMove = (start: { x: number; y: number }, end: { x: number; y: number }) => {
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      if (dx === 0 && dy === 0) return;
      // Only cardinal shifts make sense for pixel art; snap to dominant axis.
      let shiftX = 0;
      let shiftY = 0;
      if (Math.abs(dx) >= Math.abs(dy)) {
        shiftX = Math.sign(dx);
      } else {
        shiftY = Math.sign(dy);
      }
      const cur = pixelsRef.current;
      const next: PixelColor[] = new Array(size * size).fill(null);
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const nx = x + shiftX;
          const ny = y + shiftY;
          if (nx >= 0 && nx < size && ny >= 0 && ny < size) {
            next[ny * size + nx] = cur[y * size + x];
          }
        }
      }
      // Build updates for every changed cell.
      const updates: PixelUpdate[] = [];
      for (let i = 0; i < next.length; i++) {
        if (next[i] !== cur[i]) {
          updates.push({ x: i % size, y: Math.floor(i / size), color: next[i] });
        }
      }
      if (updates.length) onPlace(updates);
    };

    /* ----------------------------- Pointer handlers ----------------------------- */

    const handlePointerDown = (e: React.PointerEvent) => {
      const cell = pointerToCell(e.clientX, e.clientY);
      if (!cell) return;
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);

      if (tool === "line" || tool === "rectangle" || tool === "ellipse" || tool === "move") {
        previewingRef.current = true;
        previewStartRef.current = cell;
        lastShapeEndRef.current = cell;
        if (tool !== "move") drawPreview(cell, cell);
        return;
      }
      if (tool === "spray") {
        sprayMoveDraggingRef.current = true;
        placeAt(cell.x, cell.y);
        return;
      }
      drawingRef.current = true;
      lastCellRef.current = cell;
      placeAt(cell.x, cell.y);
    };

    const handlePointerMove = (e: React.PointerEvent) => {
      const cell = pointerToCell(e.clientX, e.clientY);

      // Eyedropper hover preview.
      if (tool === "eyedropper" && onHoverColor) {
        if (cell) {
          const px = pixelsRef.current[cell.y * size + cell.x];
          onHoverColor(px);
        } else {
          onHoverColor(null);
        }
      }

      if (previewingRef.current) {
        const start = previewStartRef.current;
        if (start && cell) {
          lastShapeEndRef.current = cell;
          if (tool !== "move") drawPreview(start, cell);
        }
        return;
      }
      if (sprayMoveDraggingRef.current && cell) {
        dragPaint(cell.x, cell.y);
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
        if (start && end) {
          if (tool === "move") commitMove(start, end);
          else commitShape(start, end);
        }
        previewingRef.current = false;
        previewStartRef.current = null;
        lastShapeEndRef.current = null;
        return;
      }
      sprayMoveDraggingRef.current = false;
      drawingRef.current = false;
      lastCellRef.current = null;
    };

    const handlePointerLeave = () => {
      if (onHoverColor) onHoverColor(null);
      handlePointerUp();
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
        flipH: (onPlace) => {
          const s = size;
          const cur = pixelsRef.current;
          const next = new Array(s * s).fill(null) as PixelColor[];
          for (let y = 0; y < s; y++) {
            for (let x = 0; x < s; x++) {
              next[y * s + (s - 1 - x)] = cur[y * s + x];
            }
          }
          const updates: PixelUpdate[] = [];
          for (let i = 0; i < next.length; i++) {
            if (next[i] !== cur[i]) {
              updates.push({ x: i % s, y: Math.floor(i / s), color: next[i] });
            }
          }
          if (updates.length) onPlace(updates);
        },
        flipV: (onPlace) => {
          const s = size;
          const cur = pixelsRef.current;
          const next = new Array(s * s).fill(null) as PixelColor[];
          for (let y = 0; y < s; y++) {
            for (let x = 0; x < s; x++) {
              next[(s - 1 - y) * s + x] = cur[y * s + x];
            }
          }
          const updates: PixelUpdate[] = [];
          for (let i = 0; i < next.length; i++) {
            if (next[i] !== cur[i]) {
              updates.push({ x: i % s, y: Math.floor(i / s), color: next[i] });
            }
          }
          if (updates.length) onPlace(updates);
        },
        invert: (onPlace) => {
          const s = size;
          const cur = pixelsRef.current;
          const updates: PixelUpdate[] = [];
          for (let i = 0; i < cur.length; i++) {
            const px = cur[i];
            if (!px) continue;
            const inv = invertHex(px);
            if (inv !== px) {
              updates.push({ x: i % s, y: Math.floor(i / s), color: inv });
            }
          }
          if (updates.length) onPlace(updates);
        },
      }),
      [size]
    );

    const gridVisible = showGrid && cellPx >= 8;

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
            onPointerLeave={handlePointerLeave}
            onPointerCancel={handlePointerUp}
            className="absolute inset-0 rounded-sm bg-background [touch-action:none] cursor-crosshair border border-border"
            style={{ imageRendering: "pixelated" }}
          />
          {gridVisible && (
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                backgroundImage:
                  "linear-gradient(to right, var(--pixel-grid-line) 1px, transparent 1px), linear-gradient(to bottom, var(--pixel-grid-line) 1px, transparent 1px)",
                backgroundSize: `${cellPx}px ${cellPx}px`,
              }}
            />
          )}
          {/* Mirror axis guides */}
          {mirror !== "none" && (
            <div className="pointer-events-none absolute inset-0">
              {(mirror === "horizontal" || mirror === "quad") && (
                <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-emerald-500/30" />
              )}
              {(mirror === "vertical" || mirror === "quad") && (
                <div className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-emerald-500/30" />
              )}
            </div>
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

/** Rectangle filled cells. */
function rectFilledCells(x0: number, y0: number, x1: number, y1: number): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  const xa = Math.min(x0, x1);
  const xb = Math.max(x0, x1);
  const ya = Math.min(y0, y1);
  const yb = Math.max(y0, y1);
  for (let y = ya; y <= yb; y++) {
    for (let x = xa; x <= xb; x++) {
      out.push({ x, y });
    }
  }
  return out;
}

/** Ellipse outline cells (midpoint algorithm). */
function ellipseCells(
  size: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number
): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  const cx = Math.round((x0 + x1) / 2);
  const cy = Math.round((y0 + y1) / 2);
  const rx = Math.max(0, Math.floor(Math.abs(x1 - x0) / 2));
  const ry = Math.max(0, Math.floor(Math.abs(y1 - y0) / 2));
  if (rx === 0 && ry === 0) return [{ x: cx, y: cy }];
  const seen = new Set<number>();
  const push = (x: number, y: number) => {
    if (x < 0 || x >= size || y < 0 || y >= size) return;
    const idx = y * size + x;
    if (seen.has(idx)) return;
    seen.add(idx);
    out.push({ x, y });
  };
  if (rx === 0) {
    for (let y = cy - ry; y <= cy + ry; y++) push(cx, y);
    return out;
  }
  if (ry === 0) {
    for (let x = cx - rx; x <= cx + rx; x++) push(x, cy);
    return out;
  }
  // Midpoint ellipse, two regions.
  let x = 0;
  let y = ry;
  let d1 = ry * ry - rx * rx * ry + (rx * rx) / 4;
  let dx = 2 * ry * ry * x;
  let dy = 2 * rx * rx * y;
  while (dx < dy) {
    push(cx + x, cy + y);
    push(cx - x, cy + y);
    push(cx + x, cy - y);
    push(cx - x, cy - y);
    if (d1 < 0) {
      x++;
      dx += 2 * ry * ry;
      d1 += dx + ry * ry;
    } else {
      x++;
      y--;
      dx += 2 * ry * ry;
      dy -= 2 * rx * rx;
      d1 += dx - dy + ry * ry;
    }
  }
  let d2 =
    ry * ry * (x + 0.5) * (x + 0.5) +
    rx * rx * (y - 1) * (y - 1) -
    rx * rx * ry * ry;
  while (y >= 0) {
    push(cx + x, cy + y);
    push(cx - x, cy + y);
    push(cx + x, cy - y);
    push(cx - x, cy - y);
    if (d2 > 0) {
      y--;
      dy -= 2 * rx * rx;
      d2 += rx * rx - dy;
    } else {
      y--;
      x++;
      dx += 2 * ry * ry;
      dy -= 2 * rx * rx;
      d2 += dx - dy + rx * rx;
    }
  }
  return out;
}

/** Ellipse filled (scanline). */
function ellipseFilledCells(
  size: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number
): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  const cx = Math.round((x0 + x1) / 2);
  const cy = Math.round((y0 + y1) / 2);
  const rx = Math.max(0, Math.floor(Math.abs(x1 - x0) / 2));
  const ry = Math.max(0, Math.floor(Math.abs(y1 - y0) / 2));
  if (rx === 0 && ry === 0) return [{ x: cx, y: cy }];
  const seen = new Set<number>();
  const push = (x: number, y: number) => {
    if (x < 0 || x >= size || y < 0 || y >= size) return;
    const idx = y * size + x;
    if (seen.has(idx)) return;
    seen.add(idx);
    out.push({ x, y });
  };
  // For each y in the ellipse's vertical span, compute x span.
  for (let y = -ry; y <= ry; y++) {
    const yr = y / ry;
    const xspan = Math.round(rx * Math.sqrt(Math.max(0, 1 - yr * yr)));
    for (let x = -xspan; x <= xspan; x++) {
      push(cx + x, cy + y);
    }
  }
  return out;
}

/** Invert a hex color (#rrggbb → #rrggbb with each channel = 255 - original). */
function invertHex(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const r = 255 - ((n >> 16) & 0xff);
  const g = 255 - ((n >> 8) & 0xff);
  const b = 255 - (n & 0xff);
  return "#" + ((r << 16) | (g << 8) | b).toString(16).padStart(6, "0");
}

/**
 * Render text to pixel cells using a tiny offscreen canvas. The text is drawn
 * at a small font size (one pixel per grid cell), then sampled: any pixel with
 * alpha > 128 becomes a placed cell. Returns cells relative to (startX, startY).
 */
function textToCells(
  text: string,
  size: number,
  startX: number,
  startY: number
): { x: number; y: number }[] {
  const trimmed = text.slice(0, 32);
  if (!trimmed) return [];
  const fontSize = 8;
  const c = document.createElement("canvas");
  c.width = Math.max(1, trimmed.length * (fontSize - 1));
  c.height = fontSize + 2;
  const ctx = c.getContext("2d");
  if (!ctx) return [];
  ctx.fillStyle = "#000";
  ctx.font = `bold ${fontSize}px monospace`;
  ctx.textBaseline = "top";
  ctx.fillText(trimmed, 0, 1);
  const data = ctx.getImageData(0, 0, c.width, c.height).data;
  const out: { x: number; y: number }[] = [];
  for (let py = 0; py < c.height; py++) {
    for (let px = 0; px < c.width; px++) {
      const alpha = data[(py * c.width + px) * 4 + 3];
      if (alpha > 128) {
        const gx = startX + px;
        const gy = startY + py;
        if (gx >= 0 && gx < size && gy >= 0 && gy < size) {
          out.push({ x: gx, y: gy });
        }
      }
    }
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
