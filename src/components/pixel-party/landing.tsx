"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sparkles, LogIn, Heart } from "lucide-react";
import { Logo } from "@/components/pixel-party/logo";
import { generateRoomCode, normalizeRoomCode } from "@/lib/pixel-party/constants";
import { cn } from "@/lib/utils";

interface LandingProps {
  onCreate: (code: string) => void;
  onJoin: (code: string) => void;
}

export function Landing({ onCreate, onJoin }: LandingProps) {
  const [joinCode, setJoinCode] = useState("");

  const handleCreate = () => {
    onCreate(generateRoomCode());
  };

  const handleJoin = () => {
    const clean = normalizeRoomCode(joinCode);
    if (clean.length >= 4) onJoin(clean);
  };

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm space-y-8">
          {/* Logo + tagline */}
          <div className="flex flex-col items-center text-center">
            <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-border bg-card shadow-sm">
              <Logo className="scale-[1.6]" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight">
              Pixel<span className="text-emerald-500">Party</span>
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Draw pixel art together, in real time. Create a room, share the
              link, and make something.
            </p>
          </div>

          {/* Create */}
          <div className="space-y-3">
            <Button
              size="lg"
              onClick={handleCreate}
              className="w-full bg-emerald-500 text-white hover:bg-emerald-600 h-11"
            >
              <Sparkles className="mr-2 h-4 w-4" />
              Create a room
            </Button>

            {/* Join */}
            <div className="space-y-2">
              <p className="text-center text-xs text-muted-foreground">
                or join an existing room
              </p>
              <div className="flex gap-2">
                <Input
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleJoin();
                  }}
                  placeholder="ABC123"
                  maxLength={6}
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  className={cn(
                    "flex-1 text-center font-mono text-lg tracking-[0.3em] uppercase",
                    "h-11"
                  )}
                />
                <Button
                  variant="outline"
                  size="lg"
                  onClick={handleJoin}
                  disabled={normalizeRoomCode(joinCode).length < 4}
                  className="h-11 px-4"
                >
                  <LogIn className="h-4 w-4" />
                  <span className="sr-only">Join room</span>
                </Button>
              </div>
            </div>
          </div>

          {/* Trust */}
          <p className="text-center text-xs text-muted-foreground">
            No sign-up · No install · Free forever
          </p>
        </div>
      </main>

      <footer className="mt-auto flex h-12 items-center justify-center gap-3 border-t border-border px-4 text-xs text-muted-foreground">
        <span>V1 · Jeffrey Hamilton</span>
        <span className="text-border">·</span>
        <a
          href="https://buymeacoffee.com/jeffreyscof"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-rose-500 hover:text-rose-400"
        >
          <Heart className="h-3 w-3" /> Donate
        </a>
      </footer>
    </div>
  );
}
