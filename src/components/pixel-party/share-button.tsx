"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Share, Check } from "lucide-react";
import { toast } from "sonner";

interface ShareButtonProps {
  roomId: string;
}

/** Copies the full room URL to the clipboard. */
export function ShareButton({ roomId }: ShareButtonProps) {
  const [copied, setCopied] = useState(false);

  const share = async () => {
    const url = `${window.location.origin}/?room=${roomId}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } catch {
        /* ignore */
      }
      ta.remove();
    }
    setCopied(true);
    toast.success("Room link copied — share it with a friend!");
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <Button
      size="sm"
      onClick={share}
      className="h-8 bg-emerald-500 text-white hover:bg-emerald-600"
    >
      {copied ? (
        <Check className="mr-1.5 h-3.5 w-3.5" />
      ) : (
        <Share className="mr-1.5 h-3.5 w-3.5" />
      )}
      <span className="hidden sm:inline">{copied ? "Copied" : "Share"}</span>
    </Button>
  );
}
