"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Landing } from "@/components/pixel-party/landing";
import { Room } from "@/components/pixel-party/room";
import { TermsModal } from "@/components/pixel-party/terms-modal";
import { normalizeRoomCode } from "@/lib/pixel-party/constants";

const AGREED_KEY = "pixelparty:agreed-v1";

/**
 * Top-level router. Because only the `/` route is user-visible in this
 * sandbox, rooms are addressed via the `?room=ABC123` query param (the
 * shareable URL). Landing vs. Room is decided entirely by that param.
 *
 * A one-time Terms & Privacy agreement gate blocks entry until the user
 * accepts (stored in localStorage).
 */
export function PixelPartyApp() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [agreed, setAgreed] = useState<boolean | null>(null);

  useEffect(() => {
    // localStorage is only available on the client; read once on mount to
    // decide whether to show the Terms gate.
    let val = false;
    try {
      val = localStorage.getItem(AGREED_KEY) === "1";
    } catch {
      val = false;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAgreed(val);
  }, []);

  const accept = useCallback(() => {
    try {
      localStorage.setItem(AGREED_KEY, "1");
    } catch {
      /* storage may be unavailable; allow anyway */
    }
    setAgreed(true);
  }, []);

  const decline = useCallback(() => {
    // Stay gated. Send the user away so they don't sit on a dead page.
    if (typeof window !== "undefined") {
      window.location.href = "https://www.google.com";
    }
  }, []);

  const enterRoom = useCallback(
    (code: string) => {
      const clean = normalizeRoomCode(code);
      if (clean.length < 4) return;
      router.push(`/?room=${clean}`);
    },
    [router]
  );

  const leaveRoom = useCallback(() => {
    router.push("/");
  }, [router]);

  // Still resolving agreement state — render nothing to avoid a flash.
  if (agreed === null) return null;

  const roomParam = searchParams.get("room");
  const roomId = roomParam ? normalizeRoomCode(roomParam) : null;

  if (!agreed) {
    return (
      <>
        <Landing onCreate={enterRoom} onJoin={enterRoom} />
        <TermsModal open mode="gate" onAgree={accept} onDecline={decline} />
      </>
    );
  }

  if (!roomId || roomId.length < 4) {
    return <Landing onCreate={enterRoom} onJoin={enterRoom} />;
  }

  return <Room roomId={roomId} onLeave={leaveRoom} />;
}
