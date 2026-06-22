"use client";

import { Button } from "@/components/ui/button";
import { Users, Download, Wifi, WifiOff } from "lucide-react";
import { Logo } from "./logo";
import { RoomCode } from "./room-code";
import { ShareButton } from "./share-button";
import { SettingsDropdown } from "./settings-dropdown";

interface HeaderProps {
  roomId: string;
  playerCount: number;
  connected: boolean;
  onExport: () => void;
  onLeave: () => void;
  onOpenTerms: () => void;
}

export function Header({
  roomId,
  playerCount,
  connected,
  onExport,
  onLeave,
  onOpenTerms,
}: HeaderProps) {
  return (
    <header className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-border bg-background px-2 sm:px-3">
      <div className="flex items-center gap-2">
        <button
          onClick={onLeave}
          className="rounded-md transition-opacity hover:opacity-80"
          aria-label="Back to home"
        >
          <Logo withText />
        </button>
      </div>

      <div className="flex items-center gap-1.5">
        <RoomCode code={roomId} />

        {/* Player count */}
        <div
          className="flex h-8 items-center gap-1 rounded-md border border-border px-2 text-xs text-muted-foreground"
          title={`${playerCount} player${playerCount === 1 ? "" : "s"} online`}
        >
          {connected ? (
            <Wifi className="h-3.5 w-3.5 text-emerald-500" />
          ) : (
            <WifiOff className="h-3.5 w-3.5 text-rose-500" />
          )}
          <Users className="h-3.5 w-3.5" />
          <span className="tabular-nums">{playerCount}</span>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={onExport}
          className="h-8"
          aria-label="Export PNG"
        >
          <Download className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Export</span>
        </Button>

        <ShareButton roomId={roomId} />

        <SettingsDropdown onOpenTerms={onOpenTerms} />
      </div>
    </header>
  );
}
