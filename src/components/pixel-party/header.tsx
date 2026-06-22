"use client";

import { Button } from "@/components/ui/button";
import { Users, Download, Images, Crown, MessageCircle } from "lucide-react";
import { Logo } from "./logo";
import { RoomCode } from "./room-code";
import { ShareButton } from "./share-button";
import { SettingsDropdown } from "./settings-dropdown";
import { cn } from "@/lib/utils";

interface HeaderProps {
  roomId: string;
  playerCount: number;
  mode: "connecting" | "solo" | "connected";
  isHost: boolean;
  hasUnreadChat: boolean;
  onExport: () => void;
  onOpenGallery: () => void;
  onOpenChat: () => void;
  onLeave: () => void;
  onOpenTerms: () => void;
}

export function Header({
  roomId,
  playerCount,
  mode,
  isHost,
  hasUnreadChat,
  onExport,
  onOpenGallery,
  onOpenChat,
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

      <div className="flex items-center gap-0.5 sm:gap-1">
        <RoomCode code={roomId} className="hidden sm:inline-flex" />

        {/* Player count */}
        <div
          className="flex h-8 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground"
          title={`${playerCount} player${playerCount === 1 ? "" : "s"} online`}
        >
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              mode === "connected"
                ? "bg-emerald-500"
                : mode === "solo"
                ? "bg-amber-500"
                : "bg-rose-500"
            )}
          />
          <Users className="h-3.5 w-3.5" />
          <span className="tabular-nums">{playerCount}</span>
          {isHost && <Crown className="h-3 w-3 text-emerald-500" />}
        </div>

        {/* Chat */}
        <Button
          variant="ghost"
          size="icon"
          onClick={onOpenChat}
          className="relative h-8 w-8 text-muted-foreground hover:text-foreground"
          aria-label="Open chat"
        >
          <MessageCircle className="h-4 w-4" />
          {hasUnreadChat && (
            <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-emerald-500" />
          )}
        </Button>

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
