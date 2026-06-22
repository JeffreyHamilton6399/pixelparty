"use client";

import { Button } from "@/components/ui/button";
import { Users, Download, Images } from "lucide-react";
import { Logo } from "./logo";
import { RoomCode } from "./room-code";
import { ShareButton } from "./share-button";
import { SettingsDropdown } from "./settings-dropdown";
import { cn } from "@/lib/utils";

interface HeaderProps {
  roomId: string;
  playerCount: number;
  connected: boolean;
  onExport: () => void;
  onOpenGallery: () => void;
  onLeave: () => void;
  onOpenTerms: () => void;
}

export function Header({
  roomId,
  playerCount,
  connected,
  onExport,
  onOpenGallery,
  onLeave,
  onOpenTerms,
}: HeaderProps) {
  return (
    <header className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-border bg-background px-2 sm:px-3">
      <button
        onClick={onLeave}
        className="rounded-md transition-opacity hover:opacity-80"
        aria-label="Back to home"
      >
        <Logo withText />
      </button>

      <div className="flex items-center gap-1 sm:gap-1.5">
        <RoomCode code={roomId} className="hidden sm:inline-flex" />

        {/* Player count — minimal: a dot + number */}
        <div
          className="flex h-8 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground"
          title={`${playerCount} player${playerCount === 1 ? "" : "s"} online`}
        >
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              connected ? "bg-emerald-500" : "bg-rose-500"
            )}
          />
          <Users className="h-3.5 w-3.5" />
          <span className="tabular-nums">{playerCount}</span>
        </div>

        <Button
          variant="ghost"
          size="icon"
          onClick={onExport}
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          aria-label="Export PNG"
        >
          <Download className="h-4 w-4" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          onClick={onOpenGallery}
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          aria-label="My gallery"
        >
          <Images className="h-4 w-4" />
        </Button>

        <ShareButton roomId={roomId} />

        <SettingsDropdown onOpenTerms={onOpenTerms} />
      </div>
    </header>
  );
}
