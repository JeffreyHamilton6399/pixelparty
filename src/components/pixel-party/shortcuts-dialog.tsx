"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ShortcutsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SHORTCUTS: { keys: string; action: string }[] = [
  { keys: "B", action: "Pencil" },
  { keys: "L", action: "Line" },
  { keys: "R", action: "Rectangle" },
  { keys: "O", action: "Ellipse" },
  { keys: "F", action: "Fill" },
  { keys: "E", action: "Eraser" },
  { keys: "I", action: "Eyedropper" },
  { keys: "D", action: "Dither brush" },
  { keys: "S", action: "Spray brush" },
  { keys: "M", action: "Move / shift" },
  { keys: "X", action: "Toggle filled / outline" },
  { keys: "H", action: "Cycle mirror mode" },
  { keys: "G", action: "Toggle grid" },
  { keys: "[ / ]", action: "Brush smaller / bigger" },
  { keys: "Ctrl+Z", action: "Undo" },
  { keys: "Ctrl+Y", action: "Redo" },
  { keys: "Ctrl+S", action: "Save to gallery" },
];

export function ShortcutsDialog({ open, onOpenChange }: ShortcutsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xs gap-0 p-0">
        <DialogHeader className="p-4 pb-2">
          <DialogTitle className="text-base">Keyboard shortcuts</DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[60dvh] border-t border-border">
          <div className="divide-y divide-border">
            {SHORTCUTS.map(({ keys, action }) => (
              <div
                key={keys}
                className="flex items-center justify-between px-4 py-2 text-sm"
              >
                <span className="text-muted-foreground">{action}</span>
                <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs">
                  {keys}
                </kbd>
              </div>
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
