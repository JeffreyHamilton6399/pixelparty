"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface RoomCodeProps {
  code: string;
  className?: string;
}

/** Displays the room code; click to copy. */
export function RoomCode({ code, className }: RoomCodeProps) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Fallback for insecure contexts.
      const ta = document.createElement("textarea");
      ta.value = code;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      } catch {
        /* ignore */
      }
      ta.remove();
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={copy}
      className={cn(
        "h-8 gap-1.5 font-mono text-xs font-semibold tracking-widest",
        className
      )}
      aria-label={`Room code ${code}, click to copy`}
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-emerald-500" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
      {code}
    </Button>
  );
}
