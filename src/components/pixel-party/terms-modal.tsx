"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Shield } from "lucide-react";

interface TermsModalProps {
  open: boolean;
  /** "gate" = first-visit, must accept to continue. "view" = re-opened from settings. */
  mode: "gate" | "view";
  onAgree?: () => void;
  onDecline?: () => void;
  onClose?: () => void;
}

/**
 * Terms & Privacy modal. In "gate" mode it's non-dismissable except via
 * Accept / Decline (shown on first visit). In "view" mode it has a single
 * Close button (re-opened from the settings menu).
 */
export function TermsModal({ open, mode, onAgree, onDecline, onClose }: TermsModalProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          if (mode === "view") onClose?.();
          // gate mode: ignore outside-click / escape
        }
      }}
    >
      <DialogContent
        className="max-w-md gap-0 p-0"
        onPointerDownOutside={(e) => {
          if (mode === "gate") e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (mode === "gate") e.preventDefault();
        }}
      >
        <DialogHeader className="space-y-1 p-4 pb-2">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Shield className="h-4 w-4 text-emerald-500" />
            Terms &amp; Privacy
          </DialogTitle>
          <DialogDescription>
            Please read this before you start drawing.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[55dvh] border-y border-border px-4">
          <div className="space-y-3 py-3 text-sm leading-relaxed text-muted-foreground">
            <p>
              <strong className="text-foreground">No accounts, no personal data.</strong>{" "}
              PixelParty doesn&apos;t ask for your name, email, or any personal
              information. There is nothing to sign up for.
            </p>
            <p>
              <strong className="text-foreground">No tracking, no analytics.</strong>{" "}
              We don&apos;t use cookies, fingerprints, or analytics scripts. Your
              visit isn&apos;t tracked.
            </p>
            <p>
              <strong className="text-foreground">Rooms are public to anyone with the link.</strong>{" "}
              Anyone who has your room code can view and draw on the same canvas.
              Don&apos;t share the link with people you don&apos;t want in your room.
            </p>
            <p>
              <strong className="text-foreground">Rooms are ephemeral.</strong>{" "}
              Canvas state lives only in server memory. Rooms are deleted after 24
              hours of inactivity. Nothing is stored in a database.
            </p>
            <p>
              <strong className="text-foreground">Acceptable use.</strong>{" "}
              Don&apos;t create or share illegal, harmful, or infringing content.
              You&apos;re responsible for what you draw.
            </p>
            <p>
              <strong className="text-foreground">As-is &amp; free.</strong>{" "}
              PixelParty is provided free, as-is, without warranty. It may change
              or be unavailable at any time.
            </p>
          </div>
        </ScrollArea>

        <DialogFooter className="gap-2 p-4 pt-3">
          {mode === "gate" ? (
            <>
              <Button variant="outline" onClick={onDecline} className="h-9">
                Decline
              </Button>
              <Button
                onClick={onAgree}
                className="h-9 bg-emerald-500 text-white hover:bg-emerald-600"
              >
                I Agree — let&apos;s draw
              </Button>
            </>
          ) : (
            <Button onClick={onClose} className="h-9">
              Close
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
