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
import { AlertTriangle } from "lucide-react";
import type { ClearVoteState } from "@/hooks/use-pixel-room";

interface ClearVoteDialogProps {
  vote: ClearVoteState | null;
  myId: string | null;
  onVote: (yes: boolean) => void;
}

/** Shown when someone requests a canvas clear. Requester can't vote. */
export function ClearVoteDialog({ vote, myId, onVote }: ClearVoteDialogProps) {
  if (!vote) return null;
  const isRequester = vote.requesterId === myId;

  return (
    <Dialog
      open={!!vote}
      onOpenChange={() => {
        /* non-dismissable until resolved */
      }}
    >
      <DialogContent
        className="max-w-xs gap-0 p-0"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader className="space-y-1 p-4 pb-2">
          <DialogTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Clear the canvas?
          </DialogTitle>
          <DialogDescription>
            {isRequester
              ? `Waiting for votes — ${vote.yes}/${vote.votesNeeded + 1} so far.`
              : "Someone wants to erase everything. Vote to decide."}
          </DialogDescription>
        </DialogHeader>

        {!isRequester && (
          <DialogFooter className="gap-2 p-4 pt-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => onVote(false)}
            >
              Keep it
            </Button>
            <Button
              className="flex-1 bg-rose-500 text-white hover:bg-rose-600"
              onClick={() => onVote(true)}
            >
              Clear it
            </Button>
          </DialogFooter>
        )}
        {isRequester && (
          <div className="px-4 pb-4 text-center text-xs text-muted-foreground">
            You requested this clear. Others are voting…
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
