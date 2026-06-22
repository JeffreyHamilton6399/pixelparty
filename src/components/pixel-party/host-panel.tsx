"use client";

import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Crown, Send, UserX, Eye, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Player } from "@/lib/pixel-party/constants";

interface HostPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  players: Player[];
  myId: string | null;
  myRole: string | null;
  hostId: string | null;
  chat: { id: string; playerName: string; color: string; text: string; ts: number; system?: boolean }[];
  onSendChat: (text: string) => void;
  onKick: (id: string) => void;
  onSetRole: (id: string, role: "drawer" | "viewer") => void;
}

export function HostPanel({
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
}: HostPanelProps) {
  const [text, setText] = useState("");
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-w-md flex-col gap-0 p-0" style={{ height: "min(80dvh, 560px)" }}>
        <DialogHeader className="shrink-0 border-b border-border p-4 pb-3">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Crown className="h-4 w-4 text-emerald-500" />
            Room
            <span className="ml-auto text-xs font-normal text-muted-foreground">
              {players.length} {players.length === 1 ? "person" : "people"}
            </span>
          </DialogTitle>
        </DialogHeader>

        {/* Players */}
        <div className="shrink-0 border-b border-border p-3">
          <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Players
          </div>
          <div className="space-y-1">
            {players.map((p) => {
              const isMe = p.id === myId;
              const isPlayerHost = p.id === hostId;
              return (
                <div
                  key={p.id}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50"
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: p.color }}
                  />
                  <span className="truncate text-sm">
                    {p.name}
                    {isMe && (
                      <span className="ml-1 text-xs text-muted-foreground">(you)</span>
                    )}
                  </span>
                  {isPlayerHost ? (
                    <span className="ml-auto flex items-center gap-1 text-[10px] font-medium text-emerald-500">
                      <Crown className="h-3 w-3" /> Host
                    </span>
                  ) : p.role === "viewer" ? (
                    <span className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground">
                      <Eye className="h-3 w-3" /> Viewer
                    </span>
                  ) : (
                    <span className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground">
                      <Pencil className="h-3 w-3" /> Drawer
                    </span>
                  )}
                  {isHost && !isPlayerHost && !isMe && (
                    <div className="flex items-center gap-0.5">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-foreground"
                        onClick={() =>
                          onSetRole(p.id, p.role === "viewer" ? "drawer" : "viewer")
                        }
                        aria-label={
                          p.role === "viewer" ? "Allow drawing" : "Make viewer"
                        }
                      >
                        {p.role === "viewer" ? (
                          <Pencil className="h-3 w-3" />
                        ) : (
                          <Eye className="h-3 w-3" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-rose-500"
                        onClick={() => onKick(p.id)}
                        aria-label={`Kick ${p.name}`}
                      >
                        <UserX className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Chat */}
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="px-3 pt-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Chat
          </div>
          <ScrollArea className="min-h-0 flex-1" ref={scrollRef as never}>
            <div className="space-y-1.5 p-3">
              {chat.length === 0 ? (
                <p className="py-4 text-center text-xs text-muted-foreground">
                  No messages yet.
                </p>
              ) : (
                chat.map((m) => (
                  <div key={m.id} className="text-sm">
                    {m.system ? (
                      <span className="text-xs italic text-muted-foreground">
                        {m.text}
                      </span>
                    ) : (
                      <>
                        <span
                          className="font-medium"
                          style={{ color: m.color }}
                        >
                          {m.playerName}:
                        </span>{" "}
                        <span className="text-foreground">{m.text}</span>
                      </>
                    )}
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
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
            <Button size="icon" className="h-8 w-8 shrink-0" onClick={send}>
              <Send className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
