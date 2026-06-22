"use client";

import { useEffect, useRef, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Crown, Send, UserX, Eye, Pencil, ChevronDown, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Player, ChatMessage } from "@/lib/pixel-party/constants";

interface ChatPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  players: Player[];
  myId: string | null;
  myRole: string | null;
  hostId: string | null;
  chat: ChatMessage[];
  onSendChat: (text: string) => void;
  onKick: (id: string) => void;
  onSetRole: (id: string, role: "drawer" | "viewer") => void;
}

/**
 * Messaging-app-style chat panel (slides in from the right).
 * - Player list is a collapsible header section (collapsed by default).
 * - Messages flow as bubbles: mine right-aligned (emerald), others left
 *   (muted, colored name), system messages centered as pills.
 * - Single small role-toggle button per player (host only).
 */
export function ChatPanel({
  open,
  onOpenChange,
  players,
  myId,
  myRole,
  hostId,
  chat,
  onSendChat,
  onKick,
  onSetRole,
}: ChatPanelProps) {
  const [text, setText] = useState("");
  const [playersOpen, setPlayersOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chat, open]);

  const isHost = myRole === "host";

  const send = () => {
    if (text.trim()) {
      onSendChat(text);
      setText("");
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-sm"
      >
        {/* Header: title + players toggle */}
        <SheetHeader className="shrink-0 border-b border-border p-3 pb-2">
          <SheetTitle className="flex items-center gap-2 text-sm">
            <span>Chat</span>
            <button
              onClick={() => setPlayersOpen((p) => !p)}
              className="ml-auto flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-muted/50"
              aria-expanded={playersOpen}
              aria-label="Toggle players"
            >
              <Users className="h-3 w-3" />
              {players.length}
              <ChevronDown
                className={cn(
                  "h-3 w-3 transition-transform",
                  playersOpen && "rotate-180"
                )}
              />
            </button>
          </SheetTitle>

          {/* Collapsible player list */}
          {playersOpen && (
            <div className="mt-2 space-y-0.5">
              {players.map((p) => {
                const isMe = p.id === myId;
                const isPlayerHost = p.id === hostId;
                return (
                  <div
                    key={p.id}
                    className="flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-muted/40"
                  >
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: p.color }}
                    />
                    <span className="truncate text-xs">
                      {p.name}
                      {isMe && (
                        <span className="ml-1 text-muted-foreground">(you)</span>
                      )}
                    </span>
                    {isPlayerHost ? (
                      <Crown className="ml-auto h-3 w-3 shrink-0 text-emerald-500" />
                    ) : (
                      <span className="ml-auto flex items-center gap-0.5">
                        {p.role === "viewer" ? (
                          <Eye className="h-3 w-3 shrink-0 text-muted-foreground" />
                        ) : (
                          <Pencil className="h-3 w-3 shrink-0 text-muted-foreground" />
                        )}
                        {/* Single small role-toggle button (host only) */}
                        {isHost && !isMe && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5 text-muted-foreground hover:text-foreground"
                            onClick={() =>
                              onSetRole(
                                p.id,
                                p.role === "viewer" ? "drawer" : "viewer"
                              )
                            }
                            aria-label={
                              p.role === "viewer"
                                ? "Allow drawing"
                                : "Make viewer"
                            }
                          >
                            {p.role === "viewer" ? (
                              <Pencil className="h-2.5 w-2.5" />
                            ) : (
                              <Eye className="h-2.5 w-2.5" />
                            )}
                          </Button>
                        )}
                        {isHost && !isMe && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5 text-muted-foreground hover:text-rose-500"
                            onClick={() => onKick(p.id)}
                            aria-label={`Kick ${p.name}`}
                          >
                            <UserX className="h-2.5 w-2.5" />
                          </Button>
                        )}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </SheetHeader>

        {/* Messages */}
        <ScrollArea className="min-h-0 flex-1" ref={scrollRef as never}>
          <div className="space-y-1.5 p-3">
            {chat.length === 0 ? (
              <p className="py-8 text-center text-xs text-muted-foreground">
                No messages yet. Say hi!
              </p>
            ) : (
              chat.map((m) => {
                if (m.system) {
                  return (
                    <div key={m.id} className="flex justify-center py-0.5">
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                        {m.text}
                      </span>
                    </div>
                  );
                }
                const mine = m.playerId === myId;
                return (
                  <div
                    key={m.id}
                    className={cn(
                      "flex flex-col gap-0.5",
                      mine ? "items-end" : "items-start"
                    )}
                  >
                    {!mine && (
                      <span
                        className="px-1 text-[11px] font-medium"
                        style={{ color: m.color }}
                      >
                        {m.playerName}
                      </span>
                    )}
                    <div
                      className={cn(
                        "max-w-[80%] rounded-2xl px-2.5 py-1.5 text-sm",
                        mine
                          ? "rounded-br-sm bg-emerald-500 text-white"
                          : "rounded-bl-sm bg-muted text-foreground"
                      )}
                    >
                      {m.text}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>

        {/* Input */}
        <div className="flex shrink-0 items-center gap-1.5 border-t border-border p-2">
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") send();
            }}
            placeholder="Message…"
            maxLength={280}
            className="h-8 text-sm"
          />
          <Button
            size="icon"
            className="h-8 w-8 shrink-0 bg-emerald-500 text-white hover:bg-emerald-600"
            onClick={send}
          >
            <Send className="h-3.5 w-3.5" />
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
