"use client";

import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
  /** Show the "PixelParty" wordmark next to the mark. */
  withText?: boolean;
}

/**
 * Flat PixelParty logo: a 3x3 pixel grid mark. No gradients, no blobs.
 */
export function Logo({ className, withText = false }: LogoProps) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <svg
        viewBox="0 0 16 16"
        className="h-5 w-5 shrink-0"
        shapeRendering="crispEdges"
        aria-hidden="true"
      >
        <rect width="16" height="16" rx="2" fill="hsl(var(--primary))" />
        <rect x="2" y="2" width="3" height="3" fill="#e94560" />
        <rect x="6.5" y="2" width="3" height="3" fill="#fcbf49" />
        <rect x="11" y="2" width="3" height="3" fill="#2a9d8f" />
        <rect x="2" y="6.5" width="3" height="3" fill="#fcbf49" />
        <rect x="6.5" y="6.5" width="3" height="3" fill="#f4f1de" />
        <rect x="11" y="6.5" width="3" height="3" fill="#e94560" />
        <rect x="2" y="11" width="3" height="3" fill="#2a9d8f" />
        <rect x="6.5" y="11" width="3" height="3" fill="#e94560" />
        <rect x="11" y="11" width="3" height="3" fill="#fcbf49" />
      </svg>
      {withText && (
        <span className="text-sm font-semibold tracking-tight">
          Pixel<span className="text-emerald-500">Party</span>
        </span>
      )}
    </span>
  );
}
