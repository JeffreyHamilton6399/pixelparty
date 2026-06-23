"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Users, Crown, MoreVertical, Download, Images } from "lucide-react";
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
  onExport: () => void;
  onOpenGallery: () => void;
  onLeave: () => void;
  onOpenTerms: () => void;
}

export function Header({
  roomId,
  playerCount,
  mode,
  isHost,
  onExport,
  onOpenGallery,
  onLeave,
  onOpenTerms,
}: HeaderProps) {
  return (
    <header className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-border bg-background px-2 sm:px-3">
      {/* Left: logo + room code */}
      <div className="flex min-w-0 items-center gap-2">
        <button
          onClick={onLeave}
          className="rounded-md transition-opacity hover:opacity-80"
          aria-label="Back to home"
        >
          <Logo withText />
        </button>
        <RoomCode code={roomId} className="hidden sm:inline-flex" />
      </div>

      {/* Right: primary actions + more menu */}
      <div className="flex items-center gap-1">
        {/* Player count (display only) */}
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
          {isHost && <Crown className="ml-0.5 h-3 w-3 text-emerald-500" />}
        </div>

        {/* Share (primary) */}
        <ShareButton roomId={roomId} />

        {/* More: secondary actions grouped */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              aria-label="More actions"
            >
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onClick={onExport}>
              <Download className="mr-2 h-4 w-4" /> Export PNG
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onOpenGallery}>
              <Images className="mr-2 h-4 w-4" /> My gallery
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <SettingsDropdown
              onOpenTerms={onOpenTerms}
              asMenuItem
            />
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
