"use client";

import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Trash2, Eye, Keyboard } from "lucide-react";
import { usePixelRoom } from "@/hooks/use-pixel-room";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { Header } from "./header";
import { Footer } from "./footer";
import { ToolBar } from "./toolbar";
import { ColorPicker } from "./color-picker";
import { BrushButton } from "./brush-button";
import { SizeButton } from "./size-button";
import { RecentColors } from "./recent-colors";
import {
  PixelCanvas,
  type PixelCanvasHandle,
  type Tool,
  type MirrorMode,
} from "./pixel-canvas";
import { TermsModal } from "./terms-modal";
import { GalleryDialog } from "./gallery-dialog";
import { HostPanel } from "./host-panel";
import { ClearVoteDialog } from "./clear-vote-dialog";
import { ShortcutsDialog } from "./shortcuts-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface RoomProps {
  roomId: string;
  username: string;
  onLeave: () => void;
}

const START_COLOR = "#e94560";
const MIRROR_CYCLE: MirrorMode[] = ["none", "horizontal", "vertical", "quad"];

export function Room({ roomId, username, onLeave }: RoomProps) {
  const api = usePixelRoom(roomId, username);
  const canvasRef = useRef<PixelCanvasHandle>(null);

  const [tool, setTool] = useState<Tool>("pencil");
  const [color, setColor] = useState<string>(START_COLOR);
  const [brushSize, setBrushSize] = useState<number>(1);
  const [filled, setFilled] = useState(false);
  const [mirror, setMirror] = useState<MirrorMode>("none");
  const [showGrid, setShowGrid] = useState(true);
  const [hoverColor, setHoverColor] = useState<string | null>(null);
  const [termsOpen, setTermsOpen] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [roomOpen, setRoomOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  const isViewer = api.myRole === "viewer";
  const drawingDisabled = isViewer;

  const cycleMirror = useCallback(() => {
    setMirror((m) => MIRROR_CYCLE[(MIRROR_CYCLE.indexOf(m) + 1) % MIRROR_CYCLE.length]);
  }, []);
  const toggleGrid = useCallback(() => setShowGrid((g) => !g), []);
  const toggleFilled = useCallback(() => setFilled((f) => !f), []);
  const incBrush = useCallback(() => setBrushSize((b) => Math.min(8, b + 1)), []);
  const decBrush = useCallback(() => setBrushSize((b) => Math.max(1, b - 1)), []);
  const exportPng = useCallback(() => canvasRef.current?.exportPng(), []);
  const saveGallery = useCallback(() => setGalleryOpen(true), []);

  useKeyboardShortcuts({
    setTool,
    undo: api.undo,
    redo: api.redo,
    cycleMirror,
    toggleGrid,
    toggleFilled,
    incBrush,
    decBrush,
    exportPng,
    saveGallery,
  });

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      <Header
        roomId={roomId}
        playerCount={api.playerCount}
        mode={api.mode}
        isHost={api.myRole === "host"}
        onExport={exportPng}
        onOpenGallery={() => setGalleryOpen(true)}
        onOpenRoom={() => setRoomOpen(true)}
        onLeave={onLeave}
        onOpenTerms={() => setTermsOpen(true)}
      />

      {/* Eyedropper hover indicator */}
      {tool === "eyedropper" && hoverColor && (
        <div className="pointer-events-none absolute left-1/2 top-14 z-20 -translate-x-1/2 rounded-md bg-foreground px-2 py-1 text-xs text-background shadow">
          <span
            className="mr-1.5 inline-block h-3 w-3 rounded-sm align-middle border border-background/30"
            style={{ backgroundColor: hoverColor }}
          />
          {hoverColor}
        </div>
      )}

      {api.mode === "solo" && (
        <div className="flex shrink-0 items-center justify-center gap-2 bg-amber-500/10 px-3 py-1 text-center text-[11px] text-amber-600 dark:text-amber-400">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
          Solo mode — set NEXT_PUBLIC_PARTYKIT_HOST for multiplayer
        </div>
      )}

      {isViewer && (
        <div className="flex shrink-0 items-center justify-center gap-2 bg-muted px-3 py-1 text-center text-[11px] text-muted-foreground">
          <Eye className="h-3 w-3" />
          You&apos;re a viewer — the host made you read-only
        </div>
      )}

      <main className="flex min-h-0 flex-1">
        {/* Desktop sidebar */}
        <aside className="hidden w-[64px] shrink-0 flex-col gap-2 overflow-y-auto border-r border-border p-2 md:flex">
          <ToolBar
            tool={tool}
            onChange={setTool}
            canUndo={api.canUndo}
            canRedo={api.canRedo}
            onUndo={api.undo}
            onRedo={api.redo}
            filled={filled}
            onToggleFilled={toggleFilled}
            mirror={mirror}
            onCycleMirror={cycleMirror}
            showGrid={showGrid}
            onToggleGrid={toggleGrid}
            drawingDisabled={drawingDisabled}
            orientation="vertical"
          />
          <Separator />
          <ColorPicker color={color} onChange={setColor} layout="stacked" />
          <RecentColors color={color} onPick={setColor} layout="grid" />
          <Separator />
          <BrushButton
            size={brushSize}
            onChange={setBrushSize}
            disabled={drawingDisabled || (tool !== "pencil" && tool !== "eraser" && tool !== "dither" && tool !== "spray")}
          />
          <SizeButton size={api.size} onChange={api.setSize} disabled={api.myRole !== "host"} />
          <Separator />
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShortcutsOpen(true)}
                  aria-label="Keyboard shortcuts"
                  className="h-8 w-8 shrink-0 rounded-md text-muted-foreground hover:text-foreground"
                >
                  <Keyboard className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Shortcuts (?)</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={api.clear}
                  aria-label="Clear canvas"
                  className="h-8 w-8 shrink-0 rounded-md text-muted-foreground hover:text-rose-500"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Clear canvas (vote)</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </aside>

        {/* Canvas */}
        <section className="relative flex min-h-0 flex-1 items-center justify-center bg-muted/30 p-2 md:p-3">
          {api.mode === "connecting" && (
            <div className="pointer-events-none absolute left-1/2 top-2 z-10 -translate-x-1/2">
              <span className="rounded-full bg-background/80 px-2.5 py-0.5 text-[11px] text-muted-foreground backdrop-blur">
                Connecting…
              </span>
            </div>
          )}
          <PixelCanvas
            ref={canvasRef}
            size={api.size}
            tool={tool}
            color={color}
            brushSize={brushSize}
            filled={filled}
            mirror={mirror}
            showGrid={showGrid}
            pixelsRef={api.pixelsRef}
            dirtyRef={api.dirtyRef}
            myId={api.myId}
            onPlace={api.place}
            onPickColor={setColor}
            onHoverColor={tool === "eyedropper" ? setHoverColor : undefined}
          />
        </section>
      </main>

      {/* Mobile bottom bar */}
      <div className="flex shrink-0 flex-col gap-1.5 border-t border-border bg-background p-2 md:hidden">
        <div className="flex items-center gap-1.5">
          <ColorPicker color={color} onChange={setColor} layout="inline" />
          <RecentColors color={color} onPick={setColor} layout="row" />
          <Separator orientation="vertical" className="h-8" />
          <BrushButton
            size={brushSize}
            onChange={setBrushSize}
            disabled={drawingDisabled || (tool !== "pencil" && tool !== "eraser" && tool !== "dither" && tool !== "spray")}
          />
          <SizeButton size={api.size} onChange={api.setSize} disabled={api.myRole !== "host"} />
          <div className="flex-1" />
          <Button
            variant="ghost"
            size="icon"
            onClick={api.clear}
            aria-label="Clear canvas"
            className="h-8 w-8 shrink-0 rounded-md text-muted-foreground hover:text-rose-500"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
        <div className="overflow-x-auto">
          <ToolBar
            tool={tool}
            onChange={setTool}
            canUndo={api.canUndo}
            canRedo={api.canRedo}
            onUndo={api.undo}
            onRedo={api.redo}
            filled={filled}
            onToggleFilled={toggleFilled}
            mirror={mirror}
            onCycleMirror={cycleMirror}
            showGrid={showGrid}
            onToggleGrid={toggleGrid}
            drawingDisabled={drawingDisabled}
            orientation="horizontal"
          />
        </div>
      </div>

      <Footer />

      <TermsModal open={termsOpen} mode="view" onClose={() => setTermsOpen(false)} />
      <GalleryDialog
        open={galleryOpen}
        onOpenChange={setGalleryOpen}
        onCapture={() => canvasRef.current?.snapshot() ?? null}
        onLoad={api.loadPixels}
      />
      <HostPanel
        open={roomOpen}
        onOpenChange={setRoomOpen}
        players={api.players}
        myId={api.myId}
        myRole={api.myRole}
        hostId={api.hostId}
        chat={api.chat}
        onSendChat={api.sendChat}
        onKick={api.kick}
        onSetRole={api.setRole}
      />
      <ClearVoteDialog vote={api.clearVote} myId={api.myId} onVote={api.voteClear} />
      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
      {api.errorMessage && (
        <div className="fixed bottom-12 left-1/2 z-50 -translate-x-1/2 rounded-md bg-foreground px-3 py-1.5 text-xs text-background shadow-lg sm:bottom-4">
          {api.errorMessage}
          <button
            onClick={api.dismissError}
            className="ml-2 text-background/60 hover:text-background"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
