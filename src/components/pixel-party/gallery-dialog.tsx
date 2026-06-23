"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bookmark, Trash2, Plus, Pencil } from "lucide-react";
import { toast } from "sonner";
import {
  type Artwork,
  listArtworks,
  saveArtwork,
  deleteArtwork,
  makeThumbnail,
  newArtworkId,
} from "@/lib/pixel-party/gallery";
import type { CanvasSize, PixelColor } from "@/lib/pixel-party/constants";

interface GalleryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Capture the current canvas (size + pixels) for saving. */
  onCapture: () => { size: CanvasSize; pixels: PixelColor[] } | null;
  /** Load an artwork into the canvas. */
  onLoad: (size: CanvasSize, pixels: PixelColor[]) => void;
}

type Tab = "gallery" | "save";

export function GalleryDialog({
  open,
  onOpenChange,
  onCapture,
  onLoad,
}: GalleryDialogProps) {
  const [tab, setTab] = useState<Tab>("gallery");
  const [items, setItems] = useState<Artwork[]>([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const all = await listArtworks();
      setItems(all);
    } catch {
      setItems([]);
    }
  }, []);

  useEffect(() => {
    if (open) refresh();
  }, [open, refresh]);

  const handleSave = useCallback(async () => {
    const snap = onCapture();
    if (!snap) return;
    setLoading(true);
    try {
      const now = Date.now();
      const art: Artwork = {
        id: newArtworkId(),
        name: name.trim() || `Untitled · ${new Date(now).toLocaleString()}`,
        size: snap.size,
        pixels: snap.pixels,
        thumbnail: makeThumbnail(snap.size, snap.pixels),
        createdAt: now,
        updatedAt: now,
      };
      await saveArtwork(art);
      toast.success("Saved to your gallery");
      setName("");
      setTab("gallery");
      refresh();
    } catch {
      toast.error("Could not save — storage may be full");
    } finally {
      setLoading(false);
    }
  }, [onCapture, name, refresh]);

  const handleLoad = useCallback(
    (art: Artwork) => {
      onLoad(art.size, art.pixels);
      toast.success(`Loaded "${art.name}"`);
      onOpenChange(false);
    },
    [onLoad, onOpenChange]
  );

  const handleDelete = useCallback(
    async (id: string) => {
      await deleteArtwork(id);
      refresh();
    },
    [refresh]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md gap-0 p-0">
        <DialogHeader className="space-y-1 p-4 pb-2">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Bookmark className="h-4 w-4 text-emerald-500" />
            My Gallery
          </DialogTitle>
          <DialogDescription>
            Saved on this device. No account, no tracking.
          </DialogDescription>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex gap-1 px-4 pb-2">
          <Button
            variant={tab === "gallery" ? "default" : "ghost"}
            size="sm"
            onClick={() => setTab("gallery")}
            className="h-8 flex-1"
          >
            Gallery ({items.length})
          </Button>
          <Button
            variant={tab === "save" ? "default" : "ghost"}
            size="sm"
            onClick={() => setTab("save")}
            className="h-8 flex-1"
          >
            <Plus className="mr-1 h-3.5 w-3.5" /> Save current
          </Button>
        </div>

        {tab === "gallery" ? (
          <ScrollArea className="max-h-[55dvh] border-t border-border">
            {items.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-10 text-center text-sm text-muted-foreground">
                <Pencil className="h-6 w-6 opacity-40" />
                <p>Nothing saved yet.</p>
                <p className="text-xs">Draw something, then “Save current”.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3">
                {items.map((art) => (
                  <div
                    key={art.id}
                    className="group relative overflow-hidden rounded-md border border-border bg-muted/30"
                  >
                    <button
                      onClick={() => handleLoad(art)}
                      className="block w-full"
                      title={`Load "${art.name}"`}
                    >
                      {art.thumbnail ? (
                        <img
                          src={art.thumbnail}
                          alt={art.name}
                          className="aspect-square w-full bg-background [image-rendering:pixelated]"
                        />
                      ) : (
                        <div className="aspect-square w-full bg-background" />
                      )}
                    </button>
                    <div className="flex items-center justify-between gap-1 px-1.5 py-1">
                      <span className="truncate text-[11px] text-muted-foreground">
                        {art.name}
                      </span>
                      <button
                        onClick={() => handleDelete(art.id)}
                        aria-label={`Delete ${art.name}`}
                        className="shrink-0 text-muted-foreground hover:text-rose-500"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        ) : (
          <div className="space-y-3 border-t border-border p-4">
            <label className="block text-xs font-medium text-muted-foreground">
              Name
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Untitled masterpiece"
              maxLength={40}
              className="h-9"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSave();
              }}
            />
            <Button
              onClick={handleSave}
              disabled={loading}
              className="w-full bg-emerald-500 text-white hover:bg-emerald-600"
            >
              <Bookmark className="mr-2 h-4 w-4" />
              {loading ? "Saving…" : "Save to gallery"}
            </Button>
            <p className="text-center text-[11px] text-muted-foreground">
              Stored in your browser only · survives reloads
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
