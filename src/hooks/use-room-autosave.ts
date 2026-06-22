"use client";

import { useEffect, useRef } from "react";
import type { CanvasSize, PixelColor } from "@/lib/pixel-party/constants";

const PREFIX = "pixelparty:room:";

/**
 * Auto-save the current canvas to localStorage, scoped to the room ID.
 * Saves ~3s after the last change. On room join, restores if the server
 * canvas is empty (so your local art survives even after the 24h server GC).
 *
 * This is per-room persistence — separate from the gallery. No accounts.
 */
export function useRoomAutosave(
  roomId: string,
  size: CanvasSize,
  pixelsRef: React.MutableRefObject<PixelColor[]>,
  mode: "connecting" | "solo" | "connected"
) {
  const lastSaveRef = useRef<number>(0);
  const dirtySinceRef = useRef<boolean>(false);

  // Restore on room join (when server canvas is empty).
  useEffect(() => {
    if (mode === "connecting") return;
    try {
      const raw = localStorage.getItem(PREFIX + roomId);
      if (!raw) return;
      const saved = JSON.parse(raw) as { size: CanvasSize; pixels: PixelColor[]; ts: number };
      // Only restore if the current canvas is empty AND the saved size matches.
      const cur = pixelsRef.current;
      const isEmpty = cur.every((p) => p === null);
      if (isEmpty && saved.pixels.length === cur.length) {
        pixelsRef.current = saved.pixels.slice();
        // Mark dirty so the canvas redraws.
        // We can't access dirtyRef here, but the caller can check after.
        (window as unknown as { __ppRestore?: boolean }).__ppRestore = true;
      }
    } catch {
      /* ignore */
    }
  }, [roomId, mode]);

  // Auto-save on a 3s debounce.
  useEffect(() => {
    const id = setInterval(() => {
      if (!dirtySinceRef.current) return;
      try {
        const pixels = pixelsRef.current;
        localStorage.setItem(
          PREFIX + roomId,
          JSON.stringify({ size, pixels, ts: Date.now() })
        );
        lastSaveRef.current = Date.now();
        dirtySinceRef.current = false;
      } catch {
        /* storage full or unavailable */
      }
    }, 3000);
    return () => clearInterval(id);
  }, [roomId, size, pixelsRef]);

  // Mark dirty when size changes (canvas reset).
  useEffect(() => {
    dirtySinceRef.current = true;
  }, [size]);

  // Expose a way for the canvas to signal changes.
  // We poll pixelsRef length changes as a proxy — but really, any place event
  // sets dirtySince. Simplest: a global flag the canvas can set.
  useEffect(() => {
    const id = setInterval(() => {
      // If there's a restore pending, mark dirty to redraw.
      const w = window as unknown as { __ppRestore?: boolean };
      if (w.__ppRestore) {
        w.__ppRestore = false;
        dirtySinceRef.current = true;
      }
    }, 500);
    return () => clearInterval(id);
  }, []);

  return {
    /** Call when pixels change (from place handler) to flag for autosave. */
    markDirty: () => {
      dirtySinceRef.current = true;
    },
  };
}
