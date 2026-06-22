"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sparkles } from "lucide-react";
import { sanitizeName } from "@/lib/pixel-party/constants";

interface UsernameDialogProps {
  open: boolean;
  onConfirm: (name: string) => void;
}

const ADJECTIVES = ["Pixel", "Sketch", "Doodle", "Crayon", "Mosaic", "Ink", "Glyph", "Brush"];
const NOUNS = ["Fox", "Owl", "Otter", "Moth", "Heron", "Lynx", "Newt", "Koala"];

function randomName(): string {
  const a = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const n = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  return `${a}${n}${Math.floor(Math.random() * 90 + 10)}`;
}

/** Shown before entering a room — pick a display name (no account). */
export function UsernameDialog({ open, onConfirm }: UsernameDialogProps) {
  const [name, setName] = useState(randomName);

  const handleConfirm = () => {
    const clean = sanitizeName(name);
    onConfirm(clean);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={() => {
        /* non-dismissable — must pick a name */
      }}
    >
      <DialogContent
        className="max-w-sm gap-0 p-0"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader className="space-y-1 p-4 pb-2">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-emerald-500" />
            Pick a name
          </DialogTitle>
          <DialogDescription>
            This is what others see in the room. No account needed.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 p-4 pt-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleConfirm();
            }}
            maxLength={16}
            placeholder="Your name"
            autoFocus
            className="h-10"
          />
          <Button
            variant="link"
            size="sm"
            onClick={() => setName(randomName())}
            className="h-6 px-0 text-xs text-muted-foreground"
          >
            Randomize
          </Button>
        </div>
        <DialogFooter className="p-4 pt-0">
          <Button
            onClick={handleConfirm}
            className="w-full bg-emerald-500 text-white hover:bg-emerald-600"
          >
            Enter room
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
