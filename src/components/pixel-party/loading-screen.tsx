"use client";

import { Logo } from "./logo";

interface LoadingScreenProps {
  /** Seconds elapsed since connecting started (for the message). */
  elapsed?: number;
}

/**
 * Full-screen loading overlay shown while connecting to the realtime server.
 * On Render's free tier, the server takes ~30s to wake from sleep — this
 * keeps the user informed instead of silently falling back to solo mode.
 */
export function LoadingScreen({ elapsed = 0 }: LoadingScreenProps) {
  const message =
    elapsed > 10
      ? "Still waking up the server… this can take ~30 seconds on the free tier"
      : "Connecting to the room…";

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-background">
      <div className="animate-pulse">
        <Logo className="scale-150" />
      </div>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
        {message}
      </div>
      {elapsed > 20 && (
        <p className="max-w-xs text-center text-xs text-muted-foreground">
          If this takes too long, the server may be unreachable. You can still
          draw solo — your work saves locally.
        </p>
      )}
    </div>
  );
}
