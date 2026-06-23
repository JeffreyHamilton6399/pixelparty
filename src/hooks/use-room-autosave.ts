"use client";

import { useCallback, useEffect, useRef } from "react";
import type { CanvasSize, PixelColor } from "@/lib/pixel-party/constants";

const PREFIX = "pixelparty:room:";
const SAVE_DEBOUNCE_MS = 500;

/**
 * Auto-save the current canvas to localStorage, scoped to the room ID.
 *
 * Saves 500ms after the last change (every pixel placement, undo, redo, clear,
 * size change) — so the user's work is never lost. Also saves on page hide /
 * visibility change. On room join, restores if the server canvas is empty
 * (survives the 24h server GC).
 *
 * Per-room persistence — separate from the gallery. No accounts.
 */
export function useRoomAutosave(
  roomId: string,
  size: CanvasSize,
  pixelsRef: React.MutableRefObject<PixelColor[]>,
  mode: "connecting" | "solo" | "connected"
) {
  const dirtyRef = useRef<boolean>(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saveNow = useCallback(() => {
    try {
      const pixels = pixelsRef.current;
      localStorage.setItem(
        PREFIX + roomId,
        JSON.stringify({ size, pixels, ts: Date.now() })
      );
      dirtyRef.current = false;
    } catch {
      /* storage full or unavailable */
    }
  }, [roomId, size, pixelsRef]);

  /** Mark dirty + schedule a debounced save (fires after last action). */
  const markDirty = useCallback(() => {
    dirtyRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(saveNow, SAVE_DEBOUNCE_MS);
  }, [saveNow]);

  // Restore on room join (when server canvas is empty).
  useEffect(() => {
    if (mode === "connecting") return;
    try {
      const raw = localStorage.getItem(PREFIX + roomId);
      if (!raw) return;
      const saved = JSON.parse(raw) as {
        size: CanvasSize;
        pixels: PixelColor[];
        ts: number;
      };
      const cur = pixelsRef.current;
      const isEmpty = cur.every((p) => p === null);
      if (isEmpty && saved.pixels.length === cur.length) {
        pixelsRef.current = saved.pixels.slice();
        (window as unknown as { __ppRestore?: boolean }).__ppRestore = true;
      }
    } catch {
      /* ignore */
    }
  }, [roomId, mode, pixelsRef]);

  // Mark dirty when size changes (canvas reset).
  useEffect(() => {
    markDirty();
  }, [size, markDirty]);

  // Save on page hide / visibility change (don't lose the last action).
  useEffect(() => {
    const onHide = () => {
      if (dirtyRef.current) saveNow();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onHide);
    };
  }, [saveNow]);

  // Cleanup pending timer on unmount + flush save.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (dirtyRef.current) saveNow();
    };
  }, [saveNow]);

  return { markDirty, saveNow };
}
