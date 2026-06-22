"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Trash2 } from "lucide-react";
import { usePixelRoom } from "@/hooks/use-pixel-room";
import { Header } from "./header";
import { Footer } from "./footer";
import { ToolBar } from "./toolbar";
import { ColorPicker } from "./color-picker";
import { SizeSelector } from "./size-selector";
import {
  PixelCanvas,
  type PixelCanvasHandle,
  type Tool,
} from "./pixel-canvas";
import { TermsModal } from "./terms-modal";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface RoomProps {
  roomId: string;
  onLeave: () => void;
}

const START_COLOR = "#e94560";

export function Room({ roomId, onLeave }: RoomProps) {
  const api = usePixelRoom(roomId);
  const canvasRef = useRef<PixelCanvasHandle>(null);

  const [tool, setTool] = useState<Tool>("pencil");
  const [color, setColor] = useState<string>(START_COLOR);
  const [termsOpen, setTermsOpen] = useState(false);

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      <Header
        roomId={roomId}
        playerCount={api.playerCount}
        connected={api.connected}
        onExport={() => canvasRef.current?.exportPng()}
        onLeave={onLeave}
        onOpenTerms={() => setTermsOpen(true)}
      />

      <main className="flex min-h-0 flex-1">
        {/* Desktop sidebar: tools + picker + size + clear */}
        <aside className="hidden w-[84px] shrink-0 flex-col gap-2 border-r border-border p-2 md:flex">
          <ToolBar tool={tool} onChange={setTool} orientation="vertical" />
          <Separator />
          <ColorPicker color={color} onChange={setColor} layout="stacked" />
          <Separator />
          <SizeSelector
            size={api.size}
            onChange={api.setSize}
            orientation="vertical"
          />
          <Separator />
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={api.clear}
                  aria-label="Clear canvas"
                  className="h-9 w-9 shrink-0 rounded-md border border-border text-muted-foreground hover:text-rose-500"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Clear canvas</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </aside>

        {/* Canvas */}
        <section className="relative flex min-h-0 flex-1 items-center justify-center bg-muted/40 p-2 md:p-3">
          {!api.connected && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-start justify-center pt-2">
              <span className="rounded-full bg-background/80 px-3 py-1 text-[11px] text-muted-foreground backdrop-blur">
                Connecting…
              </span>
            </div>
          )}
          <PixelCanvas
            ref={canvasRef}
            size={api.size}
            tool={tool}
            color={color}
            pixelsRef={api.pixelsRef}
            dirtyRef={api.dirtyRef}
            cursorsRef={api.cursorsRef}
            flashesRef={api.flashesRef}
            myId={api.myId}
            onPlace={api.place}
            onCursor={api.setCursor}
            onPickColor={setColor}
          />
        </section>
      </main>

      {/* Mobile bottom bar: row 1 = picker + size + clear, row 2 = tools */}
      <div className="flex shrink-0 flex-col gap-1.5 border-t border-border bg-background p-2 md:hidden">
        <div className="flex items-center gap-2">
          <ColorPicker color={color} onChange={setColor} layout="inline" />
          <Separator orientation="vertical" className="h-8" />
          <SizeSelector
            size={api.size}
            onChange={api.setSize}
            orientation="horizontal"
          />
          <div className="flex-1" />
          <Button
            variant="ghost"
            size="icon"
            onClick={api.clear}
            aria-label="Clear canvas"
            className="h-9 w-9 shrink-0 rounded-md border border-border text-muted-foreground hover:text-rose-500"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
        <div className="overflow-x-auto">
          <ToolBar tool={tool} onChange={setTool} orientation="horizontal" />
        </div>
      </div>

      <Footer />

      <TermsModal
        open={termsOpen}
        mode="view"
        onClose={() => setTermsOpen(false)}
      />
    </div>
  );
}
