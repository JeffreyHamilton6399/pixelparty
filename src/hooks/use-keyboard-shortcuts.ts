"use client";

import { useEffect } from "react";
import type { Tool, MirrorMode } from "@/components/pixel-party/pixel-canvas";

interface ShortcutHandlers {
  setTool: (t: Tool) => void;
  undo: () => void;
  redo: () => void;
  cycleMirror: () => void;
  toggleGrid: () => void;
  toggleFilled: () => void;
  incBrush: () => void;
  decBrush: () => void;
  exportPng: () => void;
  saveGallery: () => void;
}

const TOOL_KEYS: Record<string, Tool> = {
  b: "pencil",
  l: "line",
  r: "rectangle",
  o: "ellipse",
  f: "fill",
  e: "eraser",
  i: "eyedropper",
  d: "dither",
  s: "spray",
  m: "move",
};

/**
 * Global keyboard shortcuts. Ignores key presses while focused on an input,
 * textarea, or contenteditable (so chat/name/hex fields work normally).
 */
export function useKeyboardShortcuts(handlers: ShortcutHandlers) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        target?.isContentEditable
      ) {
        return;
      }

      const meta = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      if (meta && key === "z" && !e.shiftKey) {
        e.preventDefault();
        handlers.undo();
        return;
      }
      if ((meta && key === "y") || (meta && key === "z" && e.shiftKey)) {
        e.preventDefault();
        handlers.redo();
        return;
      }
      if (meta && key === "s") {
        e.preventDefault();
        handlers.saveGallery();
        return;
      }
      if (meta) return; // other ctrl/cmd combos: let the browser handle

      if (key === "[") {
        handlers.decBrush();
        return;
      }
      if (key === "]") {
        handlers.incBrush();
        return;
      }
      if (key === "g") {
        handlers.toggleGrid();
        return;
      }
      if (key === "h") {
        handlers.cycleMirror();
        return;
      }
      if (key === "x") {
        handlers.toggleFilled();
        return;
      }
      const tool = TOOL_KEYS[key];
      if (tool) {
        handlers.setTool(tool);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handlers]);
}
